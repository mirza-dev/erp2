/**
 * Supabase GERİ YÜKLEME — `npm run backup` çıktısını bir projeye yazar.
 *
 * Neden var: `docs/backup-restore.md` yordamı 2026-08-30'dan beri **elle**
 * yazılıydı ve hiç koşulmamıştı. Prova edilmemiş bir yedek, yedek değil
 * hipotezdir; bu script o hipotezi çalıştırılabilir hâle getirir.
 *
 * Sıra runbook'un ta kendisi (§1→§3):
 *   1. HESAPLAR — tablolardan ÖNCE. 13 kolon `auth.users(id)`'ye FK verir,
 *      biri `not null … on delete cascade`; kullanıcılar yoksa tablo yüklemesi
 *      FK'den patlar.
 *   2. TABLOLAR — manifest'teki `restoreOrder` sırasıyla, 500'lük gruplar,
 *      `Prefer: resolution=merge-duplicates` (yarıda kalırsa tekrar koşulabilir).
 *   3. DOSYALAR — kovalar manifest'teki `public` bayrağıyla yaratılır. Private
 *      bir kovayı yanlışlıkla public açmak kapatılmış bir güvenlik maddesini
 *      geri açar.
 *
 * Kullanım:
 *   npx tsx scripts/restore.ts --from backups/<damga>            # KURU ÇALIŞMA
 *   npx tsx scripts/restore.ts --from backups/<damga> --apply    # yazar
 *
 * Varsayılan kuru çalışmadır (repair-* scriptlerinin deseni): yazmak açık bir
 * niyet ister. Canlı hedefte ayrıca `ALLOW_PROD_TARGET=1` gerekir.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isProdTarget, projectRefFromUrl, PROD_PROJECT_REF } from "../src/lib/env-target";
import { contentTypeForExt } from "../src/lib/company-files";

const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error("[restore] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
    process.exit(2);
}
const H: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}` };
const JSON_H = { ...H, "Content-Type": "application/json" };

const argv = process.argv.slice(2);
const fromIdx = argv.indexOf("--from");
const APPLY = argv.includes("--apply");
const SKIP_STORAGE = argv.includes("--no-storage");
if (fromIdx < 0 || !argv[fromIdx + 1]) {
    console.error("[restore] --from <yedek-klasörü> zorunlu.");
    process.exit(2);
}
const DIR = argv[fromIdx + 1];

/** Canlıya yazmak MEŞRU bir felaket-kurtarma senaryosudur — ama kazara olmamalı. */
if (isProdTarget(url) && APPLY && process.env.ALLOW_PROD_TARGET !== "1") {
    console.error(
        `[restore] ❌ DURDURULDU — hedef CANLI proje (${PROD_PROJECT_REF}).\n` +
        "  Gerçekten canlıya geri yükleyecekseniz: ALLOW_PROD_TARGET=1 ile tekrar koşun.",
    );
    process.exit(1);
}

type Manifest = {
    totals: { tables: number; rows: number; users: number; objects: number };
    tables: Record<string, { rows: number; sha256: string }>;
    storage: Record<string, { objects: number; public: boolean; types?: Record<string, string> }>;
    restoreOrder: string[];
    restoreOrderCycles?: string[];
    errors: string[];
};

const BATCH = 500;
const errors: string[] = [];
const notes: string[] = [];

function ndjson(rel: string): Record<string, unknown>[] {
    const p = join(DIR, rel);
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function walkFiles(root: string): string[] {
    if (!existsSync(root)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(root)) {
        const full = join(root, entry);
        if (statSync(full).isDirectory()) out.push(...walkFiles(full));
        else out.push(full);
    }
    return out;
}

async function main() {
    const manifestPath = join(DIR, "manifest.json");
    if (!existsSync(manifestPath)) {
        console.error(`[restore] manifest.json bulunamadı: ${manifestPath}`);
        process.exit(2);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

    // EKSİK bir yedek geri yüklenemez: yarım veri, hiç veri yokluğundan kötüdür
    // (eksik satırlar "silinmiş" gibi görünür ve fark edilmez).
    if (manifest.errors?.length) {
        console.error(`[restore] ❌ Bu yedek EKSİK (manifest.errors ${manifest.errors.length} kayıt):`);
        for (const e of manifest.errors) console.error(`  ❌ ${e}`);
        process.exit(1);
    }

    console.log(`[restore] kaynak: ${DIR}`);
    console.log(`[restore] hedef : ${url} (${projectRefFromUrl(url) ?? "yerel"})`);
    console.log(`[restore] mod   : ${APPLY ? "UYGULA (yazar)" : "KURU ÇALIŞMA (hiçbir şey yazılmaz)"}`);

    // ── 1) Hesaplar — tablolardan ÖNCE ───────────────────────────────────────
    const users = ndjson("auth/users.ndjson");
    let usersCreated = 0;
    let usersExisting = 0;
    for (const u of users) {
        const id = String(u.id ?? "");
        const email = String(u.email ?? "");
        if (!id || !email) { errors.push(`auth: id/email eksik kayıt atlandı`); continue; }
        if (!APPLY) continue;

        const head = await fetch(`${url}/auth/v1/admin/users/${id}`, { headers: H });
        if (head.ok) { usersExisting++; continue; }

        const res = await fetch(`${url}/auth/v1/admin/users`, {
            method: "POST",
            headers: JSON_H,
            body: JSON.stringify({
                id,
                email,
                // Doğrulama e-postası GÖNDERİLMEZ: kurtarma anında posta kutusuna
                // bağımlı olmak sistemi ikinci bir arızaya bağlar.
                email_confirm: true,
                // RBAC BURADA yaşıyor. Düşerse tüm rol dağılımı kaybolur ve
                // `preflight:auth` "0 kalıcı admin" (brick) der.
                app_metadata: u.app_metadata ?? {},
                user_metadata: u.user_metadata ?? {},
            }),
        });
        if (!res.ok) errors.push(`auth ${email}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
        else usersCreated++;
    }
    console.log(`[restore] hesaplar: ${users.length} kayıt · ${usersCreated} oluşturuldu · ${usersExisting} zaten vardı`);
    notes.push(
        "PAROLALAR GERİ GELMEZ — yedekte hash yok (Admin API döndürmüyor). " +
        "Kullanıcılar parola sıfırlama ile girer; admin `PATCH /auth/v1/admin/users/<id>` ile de kurabilir.",
    );

    // ── 2) Tablolar — restoreOrder sırasıyla ─────────────────────────────────
    const ordered = manifest.restoreOrder ?? [];
    if (manifest.restoreOrderCycles?.length) {
        notes.push(`FK grafiğinde döngü vardı: ${manifest.restoreOrderCycles.join(", ")} — sıraları el ile doğrulayın.`);
    }
    const extras = Object.keys(manifest.tables).filter((t) => !ordered.includes(t));
    if (extras.length) {
        notes.push(`restoreOrder DIŞINDA ${extras.length} tablo var, en sona alındı: ${extras.join(", ")}`);
    }
    /**
     * Migration'ların KENDİ TOHUMLADIĞI referans satırları.
     *
     * Hedef veritabanı migration'lardan sonra BOŞ DEĞİL: mig.057 ürün tiplerini
     * ve alanlarını, `company_settings` ise tekil firma satırını yaratıyor.
     * PostgREST'in `merge-duplicates`ı çakışmayı BİRİNCİL ANAHTARDAN çözer;
     * bu satırların çakışması ise İKİNCİL bir unique kısıt üzerinden oluyor →
     * 23505 ve tablo hiç yüklenmiyordu (2026-09-05 provası).
     *
     * `on_conflict` ile doğru çakışma hedefi verilir. `company_settings`in
     * kısıtı bir İFADE indeksi (`((true))`) olduğu için kolonla adlandırılamaz;
     * orada tek satır önce SİLİNİR, sonra yedekteki satır yazılır — tekil tablo
     * olduğu için bu güvenli ve niyeti açık.
     */
    const CONFLICT_TARGET: Record<string, string> = {
        product_type_fields: "product_type_id,field_key",
    };
    const REPLACE_ALL: string[] = ["company_settings"];

    let rowsWritten = 0;
    for (const table of [...ordered, ...extras]) {
        const rows = ndjson(`tables/${table}.ndjson`);
        if (rows.length === 0) continue;
        if (!APPLY) { rowsWritten += rows.length; continue; }

        if (REPLACE_ALL.includes(table)) {
            const del = await fetch(`${url}/rest/v1/${table}?id=not.is.null`, {
                method: "DELETE",
                headers: { ...JSON_H, Prefer: "return=minimal" },
            });
            if (!del.ok) errors.push(`${table}: tohum satırı silinemedi (HTTP ${del.status})`);
        }

        const onConflict = CONFLICT_TARGET[table] ? `?on_conflict=${CONFLICT_TARGET[table]}` : "";
        for (let i = 0; i < rows.length; i += BATCH) {
            const chunk = rows.slice(i, i + BATCH);
            const res = await fetch(`${url}/rest/v1/${table}${onConflict}`, {
                method: "POST",
                headers: {
                    ...JSON_H,
                    // Idempotent: yarıda kalan geri yükleme yeniden koşulabilir.
                    Prefer: "resolution=merge-duplicates,return=minimal",
                },
                body: JSON.stringify(chunk),
            });
            if (!res.ok) {
                errors.push(`${table}[${i}..${i + chunk.length - 1}]: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
                break;
            }
            rowsWritten += chunk.length;
        }
    }
    console.log(`[restore] tablolar: ${rowsWritten} satır ${APPLY ? "yazıldı" : "yazılacaktı"}`);

    // ── 3) Dosyalar ──────────────────────────────────────────────────────────
    let objectsWritten = 0;
    if (SKIP_STORAGE) {
        notes.push("--no-storage verildi: dosyalar geri yüklenmedi.");
    } else {
        for (const [bucket, stat] of Object.entries(manifest.storage ?? {})) {
            if (APPLY) {
                const exists = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers: H });
                if (!exists.ok) {
                    // `public` bayrağı manifest'ten gelir. Private bir kovayı public
                    // açmak, kapatılmış 7 numaralı denetim maddesini geri açardı.
                    const mk = await fetch(`${url}/storage/v1/bucket`, {
                        method: "POST",
                        headers: JSON_H,
                        body: JSON.stringify({ id: bucket, name: bucket, public: stat.public }),
                    });
                    if (!mk.ok) errors.push(`kova ${bucket}: yaratılamadı (HTTP ${mk.status})`);
                }
            }
            const root = join(DIR, "storage", bucket);
            for (const file of walkFiles(root)) {
                const rel = relative(root, file).split(sep).join("/");
                if (!APPLY) { objectsWritten++; continue; }
                const ext = rel.split(".").pop()?.toLowerCase() ?? "";
                // Tür ÖNCE manifest'ten (yedek anında kaynaktan okunan gerçek),
                // sonra uzantıdan. 2026-09-05 provası: manifest'te tür yokken
                // `quote-pdfs` arşiv `.html`leri octet-stream'e düşüyor ve kovanın
                // MIME allowlist'i onları HTTP 400 ile reddediyordu — yani teklif
                // arşivleri geri yüklenmiyordu.
                const contentType =
                    stat.types?.[rel] ?? contentTypeForExt(ext) ?? "application/octet-stream";
                const res = await fetch(
                    `${url}/storage/v1/object/${bucket}/${rel.split("/").map(encodeURIComponent).join("/")}`,
                    {
                        method: "POST",
                        headers: {
                            ...H,
                            "Content-Type": contentType,
                            "x-upsert": "true",
                        },
                        body: new Uint8Array(readFileSync(file)),
                    },
                );
                if (!res.ok) errors.push(`storage ${bucket}/${rel}: HTTP ${res.status}`);
                else objectsWritten++;
            }
        }
    }
    console.log(`[restore] dosyalar: ${objectsWritten} obje ${APPLY ? "yüklendi" : "yüklenecekti"}`);

    // ── 4) Doğrulama — satır sayıları manifest ile karşılaştırılır ───────────
    if (APPLY) {
        let mismatched = 0;
        for (const [table, stat] of Object.entries(manifest.tables)) {
            const head = await fetch(`${url}/rest/v1/${table}?select=*`, {
                method: "HEAD",
                headers: { ...H, Prefer: "count=exact", Range: "0-0" },
            });
            const live = Number((head.headers.get("content-range") ?? "").split("/")[1]);
            if (!Number.isFinite(live) || live !== stat.rows) {
                mismatched++;
                errors.push(`${table}: yedekte ${stat.rows}, hedefte ${Number.isFinite(live) ? live : "?"}`);
            }
        }
        console.log(`[restore] doğrulama: ${Object.keys(manifest.tables).length - mismatched}/${Object.keys(manifest.tables).length} tablo satır sayısı birebir`);
    }

    for (const n of notes) console.log(`  ⚠️  ${n}`);
    if (errors.length) {
        console.error(`\n[restore] ${errors.length} HATA:`);
        for (const e of errors.slice(0, 40)) console.error(`  ❌ ${e}`);
        if (errors.length > 40) console.error(`  … ve ${errors.length - 40} tane daha`);
        process.exit(1);
    }
    console.log(`\n[restore] ✅ ${APPLY ? "tamam" : "kuru çalışma temiz"} — sonraki adım: npm run preflight:auth`);
}

void main();
