/**
 * Supabase TAM YEDEĞİ — kaynağa karşı SALT-OKUNUR, yalnız yerel diske yazar.
 *
 * Neden var: proje Free planda. Supabase Free'de **otomatik yedek yoktur**
 * (günlük yedekler Pro/Team/Enterprise'a özel), ve Supabase'in kendi belgesi:
 * "Database backups do not include objects you store via the Storage API" —
 * yani ÜCRETLİ plana geçilse bile 6 kovadaki dosyalar yedeğe girmez.
 * Şema `supabase/migrations/` ile sürüm kontrolünde; yedeklenmesi gereken
 * VERİ, HESAPLAR ve DOSYALAR.
 *
 * Kullanım:  npm run backup            → backups/<zaman-damgası>/
 *            npm run backup -- --out /Volumes/yedek/erp2
 *            npm run backup -- --no-storage
 *
 * Çıktı düzeni:
 *   manifest.json            satır/obje sayıları + SHA-256 + geri-yükleme sırası
 *   tables/<tablo>.ndjson    satır başına bir JSON nesnesi
 *   auth/users.ndjson        hesaplar (PAROLA HASH'LERİ HARİÇ — aşağıdaki uyarı)
 *   storage/<kova>/<yol>     dosyaların birebir kopyası
 *
 * Her tablo için satır sayısı `count=exact` ile ölçülüp dosyanın satır sayısıyla
 * KARŞILAŞTIRILIR; tutmazsa exit 1. Sessizce yarım yedek üretmemesi için.
 *
 * Geri yükleme: docs/backup-restore.md
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// .env.local'ı elle yükle (check-migrations.ts deseni — dotenv bağımlılığı yok)
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!rawUrl || !rawKey) {
    console.error("[backup] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
    process.exit(2);
}
const url: string = rawUrl;
const key: string = rawKey;
const H: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}` };

const argv = process.argv.slice(2);
const outFlag = argv.indexOf("--out");
const OUT_ROOT = outFlag >= 0 ? argv[outFlag + 1] : join(process.cwd(), "backups");
const SKIP_STORAGE = argv.includes("--no-storage");
const PAGE = 1000; // PostgREST varsayılan tavanı — üstü sessizce kırpılır

const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "Z");
const dir = join(OUT_ROOT, stamp);

function write(rel: string, body: string | Uint8Array): number {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
    return typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
}
function sha256(body: string | Uint8Array): string {
    return createHash("sha256").update(body as never).digest("hex");
}

/** Migration'ların tablo yaratma SIRASI, geçerli bir geri-yükleme sırasıdır:
 *  bir tabloya FK verebilmek için hedefin ÖNCE var olması gerekir. */
function restoreOrder(): string[] {
    const migDir = join(process.cwd(), "supabase", "migrations");
    if (!existsSync(migDir)) return [];
    const seen: string[] = [];
    for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
        const src = readFileSync(join(migDir, f), "utf8");
        for (const m of src.matchAll(
            /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
        )) {
            const t = m[1].toLowerCase();
            if (!seen.includes(t)) seen.push(t);
        }
    }
    return seen;
}

type TableStat = { rows: number; bytes: number; sha256: string; orderedBy: string | null };
type BucketStat = { objects: number; bytes: number; public: boolean };

async function main() {
    const errors: string[] = [];
    const warnings: string[] = [];
    console.log(`[backup] hedef: ${dir}`);

    // ---- 1) Tablolar --------------------------------------------------------
    const spec = (await (await fetch(`${url}/rest/v1/`, { headers: H })).json()) as {
        definitions?: Record<string, { properties?: Record<string, { description?: string }> }>;
    };
    const defs = spec.definitions ?? {};
    const tables = Object.keys(defs).sort();
    console.log(`[backup] ${tables.length} tablo bulundu`);

    const tableStats: Record<string, TableStat> = {};
    let totalRows = 0;

    for (const table of tables) {
        const props = defs[table]?.properties ?? {};
        // PostgREST OpenAPI birincil anahtarı description'da `<pk/>` ile işaretler.
        // Sayfalama sırası deterministik OLMALI; sırasız Range'de satır kaçar/yinelenir.
        const pk =
            Object.keys(props).find((c) => /<pk\/>/.test(props[c]?.description ?? "")) ??
            (props.id ? "id" : (Object.keys(props)[0] ?? null));

        const head = await fetch(`${url}/rest/v1/${table}?select=*`, {
            method: "HEAD",
            headers: { ...H, Prefer: "count=exact", Range: "0-0" },
        });
        const expected = Number((head.headers.get("content-range") ?? "").split("/")[1]);
        if (!Number.isFinite(expected)) {
            errors.push(`${table}: satır sayısı okunamadı (HTTP ${head.status})`);
            continue;
        }

        const lines: string[] = [];
        for (let from = 0; from === 0 || from < expected; from += PAGE) {
            const order = pk ? `&order=${encodeURIComponent(pk)}.asc` : "";
            const res = await fetch(`${url}/rest/v1/${table}?select=*${order}`, {
                headers: { ...H, "Range-Unit": "items", Range: `${from}-${from + PAGE - 1}` },
            });
            if (!res.ok) {
                errors.push(`${table}: sayfa ${from} okunamadı (HTTP ${res.status})`);
                break;
            }
            const rows = (await res.json()) as unknown[];
            for (const r of rows) lines.push(JSON.stringify(r));
            if (rows.length < PAGE) break;
        }

        const body = lines.length ? lines.join("\n") + "\n" : "";
        const bytes = write(`tables/${table}.ndjson`, body);
        tableStats[table] = { rows: lines.length, bytes, sha256: sha256(body), orderedBy: pk };
        totalRows += lines.length;

        if (lines.length !== expected) {
            errors.push(
                `${table}: ${expected} satır bekleniyordu, ${lines.length} yazıldı ` +
                    `(sayfalama hatası VEYA yedek sırasında yazma oldu — tekrar koş)`,
            );
        }
    }

    // ---- 2) Hesaplar --------------------------------------------------------
    const users: unknown[] = [];
    for (let page = 1; ; page++) {
        const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
        if (!res.ok) {
            errors.push(`auth.users: sayfa ${page} okunamadı (HTTP ${res.status})`);
            break;
        }
        const body = (await res.json()) as { users?: unknown[] };
        const batch = body.users ?? [];
        users.push(...batch);
        if (batch.length < 200) break;
    }
    const authBody = users.map((u) => JSON.stringify(u)).join("\n") + (users.length ? "\n" : "");
    write("auth/users.ndjson", authBody);
    warnings.push(
        "auth/users.ndjson PAROLA HASH'LERİNİ İÇERMEZ — Admin API bunları döndürmez. " +
            "Geri yüklemede kullanıcılar yeniden davet edilmeli veya parola sıfırlamalı. " +
            "Kimlikler (id/e-posta/app_metadata.roles) korunur, yani rol dağılımı kaybolmaz.",
    );

    // ---- 3) Storage — DB yedeğinin ASLA kapsamadığı katman ------------------
    const bucketStats: Record<string, BucketStat> = {};
    let totalObjects = 0;
    let totalBytes = 0;
    if (SKIP_STORAGE) {
        warnings.push("--no-storage verildi: dosyalar yedeklenmedi.");
    } else {
        const buckets = (await (await fetch(`${url}/storage/v1/bucket`, { headers: H })).json()) as {
            id: string;
            public: boolean;
        }[];
        for (const b of buckets) {
            let objects = 0;
            let bytes = 0;
            const walk = async (prefix: string, depth: number): Promise<void> => {
                if (depth > 8) {
                    errors.push(`storage/${b.id}: 8 seviyeden derin klasör atlandı (${prefix})`);
                    return;
                }
                for (let offset = 0; ; offset += PAGE) {
                    const res = await fetch(`${url}/storage/v1/object/list/${b.id}`, {
                        method: "POST",
                        headers: { ...H, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            prefix,
                            limit: PAGE,
                            offset,
                            sortBy: { column: "name", order: "asc" },
                        }),
                    });
                    if (!res.ok) {
                        errors.push(`storage/${b.id}: liste okunamadı (HTTP ${res.status})`);
                        return;
                    }
                    const page = (await res.json()) as { id: string | null; name: string }[];
                    if (!Array.isArray(page) || page.length === 0) return;
                    for (const o of page) {
                        const full = prefix ? `${prefix}/${o.name}` : o.name;
                        if (!o.id) {
                            await walk(full, depth + 1); // klasör girdisi (id === null)
                            continue;
                        }
                        const dl = await fetch(
                            `${url}/storage/v1/object/${b.id}/${full.split("/").map(encodeURIComponent).join("/")}`,
                            { headers: H },
                        );
                        if (!dl.ok) {
                            errors.push(`storage/${b.id}/${full}: indirilemedi (HTTP ${dl.status})`);
                            continue;
                        }
                        const buf = new Uint8Array(await dl.arrayBuffer());
                        bytes += write(`storage/${b.id}/${full}`, buf);
                        objects++;
                    }
                    if (page.length < PAGE) return;
                }
            };
            await walk("", 0);
            bucketStats[b.id] = { objects, bytes, public: b.public };
            totalObjects += objects;
            totalBytes += bytes;
            console.log(`[backup] storage/${b.id}: ${objects} obje · ${(bytes / 1048576).toFixed(2)} MB`);
        }
    }

    // ---- 4) Manifest --------------------------------------------------------
    const manifest = {
        createdAt: new Date().toISOString(),
        supabaseUrl: url,
        projectRef: url.replace("https://", "").split(".")[0],
        totals: {
            tables: Object.keys(tableStats).length,
            rows: totalRows,
            users: users.length,
            objects: totalObjects,
            storageBytes: totalBytes,
        },
        tables: tableStats,
        storage: bucketStats,
        /** FK'leri bozmadan geri yükleme sırası — migration'ların tablo yaratma sırası. */
        restoreOrder: restoreOrder().filter((t) => t in tableStats),
        warnings,
        errors,
    };
    write("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

    // ---- 5) Özet ------------------------------------------------------------
    console.log(
        `\n[backup] ${manifest.totals.tables} tablo · ${totalRows} satır · ` +
            `${users.length} hesap · ${totalObjects} obje (${(totalBytes / 1048576).toFixed(2)} MB)`,
    );
    for (const w of warnings) console.log(`  ⚠️  ${w}`);
    if (errors.length) {
        console.error(`\n[backup] ${errors.length} HATA — bu yedek EKSİK:`);
        for (const e of errors) console.error(`  ❌ ${e}`);
        console.error(`[backup] ${dir}`);
        process.exit(1);
    }
    console.log(`[backup] ✅ tamam → ${dir}`);
    console.log("[backup] Bu klasör müşteri verisi ve OAuth token'ı içerir; repoya girmez (.gitignore) — dış diske/şifreli kasaya kopyalayın.");
}

void main();
