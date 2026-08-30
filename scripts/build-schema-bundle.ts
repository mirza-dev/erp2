/**
 * ŞEMA PAKETİ — 111 migration'ı yeni bir Supabase projesine basılabilir
 * numaralı SQL parçalarına toplar. Salt-okunur: yalnız repodan okur, diske yazar.
 *
 * Neden var: bu projede migration'lar Studio SQL editor'den ELLE uygulanıyor.
 * Yeni bir proje kurmak (dev ortamı, ikinci müşteri, felaket kurtarma) demek
 * 111 dosyayı tek tek yapıştırmak demekti — çok müşteriye gitmenin önündeki
 * fiili engel buydu. Paket o işi ~7 yapıştırmaya indirir.
 *
 * Birleştirme güvenli (2026-08-31'de doğrulandı): migration'larda açık
 * begin/commit yok, psql meta-komutu (\...) yok, CREATE INDEX CONCURRENTLY yok.
 * Tek eklenti pg_trgm, o da IF NOT EXISTS. 6 storage kovasının TAMAMI
 * migration'larda yaratılıyor → paketten kurulan proje eksiksiz olur.
 *
 * Kullanım:  npm run schema:bundle
 *            npm run schema:bundle -- --out /tmp/paket --max-kb 80
 *
 * Çıktı: supabase/schema-bundle/NN-of-MM.sql + README.md  (.gitignore'da — türetilmiş)
 * Kurulum yordamı: docs/musteri-kurulum.md
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type MigrationFile = { name: string; content: string };
export type Chunk = { files: MigrationFile[]; bytes: number };

/** Varsayılan parça tavanı — Studio SQL editor'e rahat yapıştırılan boyut. */
export const DEFAULT_MAX_BYTES = 120 * 1024;

/**
 * Dosyaları sırayı BOZMADAN ve bir dosyayı İKİYE BÖLMEDEN parçalara toplar.
 *
 * Tavanı tek başına aşan bir dosya kendi parçasında yalnız kalır — bölmek SQL'i
 * geçersiz kılardı. Yani bir parçanın boyutu tavanı aşabilir; bu bilinçli.
 */
export function planChunks(files: MigrationFile[], maxBytes = DEFAULT_MAX_BYTES): Chunk[] {
    const chunks: Chunk[] = [];
    let current: MigrationFile[] = [];
    let bytes = 0;

    for (const f of files) {
        const size = Buffer.byteLength(f.content, "utf8");
        if (current.length > 0 && bytes + size > maxBytes) {
            chunks.push({ files: current, bytes });
            current = [];
            bytes = 0;
        }
        current.push(f);
        bytes += size;
    }
    if (current.length > 0) chunks.push({ files: current, bytes });
    return chunks;
}

/** Migration'ları numara sırasıyla okur (dosya adı sıralaması = uygulama sırası). */
export function readMigrations(dir: string): MigrationFile[] {
    return readdirSync(dir)
        .filter((n) => n.endsWith(".sql"))
        .sort()
        .map((name) => ({ name, content: readFileSync(join(dir, name), "utf8") }));
}

/** Parçanın SQL gövdesi — başlıkta hangi migration'ları taşıdığı yazılı. */
export function renderChunk(chunk: Chunk, index: number, total: number): string {
    const head = [
        "-- ============================================================",
        `-- ŞEMA PAKETİ — PARÇA ${index + 1} / ${total}`,
        "--",
        "-- Studio → SQL Editor'e SIRAYLA yapıştırın. Sıra atlanırsa foreign key",
        "-- ve fonksiyon bağımlılıkları kırılır.",
        "--",
        `-- Bu parçadaki ${chunk.files.length} migration:`,
        ...chunk.files.map((f) => `--   ${f.name}`),
        "-- ============================================================",
        "",
    ].join("\n");

    const body = chunk.files
        .map((f) => `\n-- ─────────── ${f.name} ───────────\n${f.content.replace(/\s*$/, "")}\n`)
        .join("\n");

    return head + body;
}

/** Son parçanın sonuna eklenen doğrulama sorgusu (mig.110 kalıbı). */
export const VERIFY_SQL = `
-- ============================================================
-- KURULUM DOĞRULAMASI — tek sonuç kümesi, hepsi dolu olmalı
-- Beklenen (kaynak proje, 2026-08-31): tablo 64 · RLS'li 64 · kova 6
-- Fonksiyon ve policy sayısını kaynak projede aynı sorguyu koşup karşılaştırın.
-- ============================================================
select
    (select count(*) from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r')                       as tablo,
    (select count(*) from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity)  as rls_acik,
    (select count(*) from pg_policies where schemaname = 'public')            as policy,
    (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public')                                          as fonksiyon,
    (select count(*) from storage.buckets)                                   as kova;
`;

function main(): void {
    const argv = process.argv.slice(2);
    const outFlag = argv.indexOf("--out");
    const kbFlag = argv.indexOf("--max-kb");
    const outDir = outFlag >= 0 ? argv[outFlag + 1] : join(process.cwd(), "supabase", "schema-bundle");
    const maxBytes = kbFlag >= 0 ? Number(argv[kbFlag + 1]) * 1024 : DEFAULT_MAX_BYTES;

    const migDir = join(process.cwd(), "supabase", "migrations");
    if (!existsSync(migDir)) {
        console.error("[bundle] supabase/migrations bulunamadı.");
        process.exit(2);
    }

    const files = readMigrations(migDir);
    const chunks = planChunks(files, maxBytes);

    if (existsSync(outDir)) rmSync(outDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    const total = chunks.length;
    const pad = (n: number) => String(n).padStart(2, "0");
    chunks.forEach((chunk, i) => {
        let sql = renderChunk(chunk, i, total);
        if (i === total - 1) sql += VERIFY_SQL;
        writeFileSync(join(outDir, `${pad(i + 1)}-of-${pad(total)}.sql`), sql);
    });

    const totalBytes = files.reduce((s, f) => s + Buffer.byteLength(f.content, "utf8"), 0);
    writeFileSync(join(outDir, "README.md"), renderReadme(chunks, files.length, totalBytes, pad));

    console.log(`[bundle] ${files.length} migration → ${total} parça (${(totalBytes / 1024).toFixed(0)} KB)`);
    chunks.forEach((c, i) => {
        console.log(`  ${pad(i + 1)}-of-${pad(total)}.sql  ${String(c.files.length).padStart(3)} migration  ${(c.bytes / 1024).toFixed(0)} KB  ${c.files[0].name} → ${c.files[c.files.length - 1].name}`);
    });
    console.log(`[bundle] ✅ ${outDir}`);
    console.log("[bundle] Yapıştırma sırası ve doğrulama: aynı klasördeki README.md");
}

function renderReadme(chunks: Chunk[], fileCount: number, totalBytes: number, pad: (n: number) => string): string {
    const total = chunks.length;
    const rows = chunks
        .map((c, i) => `| ${pad(i + 1)}-of-${pad(total)}.sql | ${c.files.length} | ${(c.bytes / 1024).toFixed(0)} KB | \`${c.files[0].name}\` → \`${c.files[c.files.length - 1].name}\` |`)
        .join("\n");

    return `# Şema Paketi

\`npm run schema:bundle\` ile **üretilmiştir — elle düzenlemeyin.** Kaynak:
\`supabase/migrations/\` (${fileCount} dosya, ${(totalBytes / 1024).toFixed(0)} KB).

Bu paket boş bir Supabase projesini bu ürünün tam şemasına getirir: tablolar, RPC'ler,
RLS politikaları, trigger'lar, indeksler ve **6 storage kovası** dahil.

## Yapıştırma sırası

Studio → SQL Editor. **Sırayı atlamayın** — foreign key ve fonksiyon bağımlılıkları kırılır.
Her parça bittikten sonra hata olmadığını görün, sonra bir sonrakine geçin.

| Parça | Migration | Boyut | Aralık |
|---|---|---|---|
${rows}

## Doğrulama

Son parçanın sonundaki sorgu tek satır döndürür. Beklenen (kaynak proje, 2026-08-31):

| tablo | rls_acik | kova |
|---|---|---|
| 64 | 64 | 6 |

\`policy\` ve \`fonksiyon\` sayıları için aynı sorguyu **kaynak projede** koşup
karşılaştırın — bu iki sayı buraya sabit yazılmadı, çünkü ölçülmedi.

\`tablo\` ile \`rls_acik\` **eşit olmalı.** Eşit değilse RLS'siz bir tablo var demektir
ve o tablo tarayıcıdaki anon anahtarıyla okunabilir. Kurulumu durdurun.

## Sonrası

Kurulum yordamının tamamı (admin açma, env, alt alan adı, ilk yedek):
[\`../../docs/musteri-kurulum.md\`](../../docs/musteri-kurulum.md)
`;
}

// Yalnız doğrudan çağrıldığında koş — testler saf yardımcıları import edebilsin.
if (process.argv[1]?.endsWith("build-schema-bundle.ts")) main();
