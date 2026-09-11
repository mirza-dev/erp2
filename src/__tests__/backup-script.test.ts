/**
 * GATE: yedekleme aracının bozulamayacak invaryantları.
 *
 * Arka plan (2026-08-30 doğrulaması): proje Supabase Free planında — otomatik
 * yedek YOK — ve Supabase'in DB yedeği hiçbir planda Storage objelerini
 * kapsamıyor. `scripts/backup.ts` bu iki boşluğu birden kapatan tek araç.
 * Üç şey sessizce bozulursa yedek "çalışıyor gibi görünüp" işe yaramaz olur:
 *
 *  1. `backups/` git'e sızarsa → müşteri listesi, fiyatlar ve
 *     `parasut_oauth_tokens` public repo'ya gider.
 *  2. Script kaynağa yazarsa → "yedek" aracı canlıyı değiştirir.
 *  3. Satır sayısı doğrulaması kalkarsa → yarım yedek exit 0 döner
 *     (yeşil-ama-işlevsiz; RLS gate'inde aynı sınıf hata yaşandı).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const script = readFileSync(join(root, "scripts/backup.ts"), "utf8");
const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
};

describe("GATE — yedekleme aracı", () => {
    it("backups/ .gitignore'da (müşteri verisi + OAuth token repoya girmez)", () => {
        const ignored = gitignore
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#"));
        expect(ignored).toContain("/backups/");
    });

    it("npm run backup mevcut", () => {
        expect(pkg.scripts.backup).toBe("tsx scripts/backup.ts");
    });

    it("kaynağa YAZMAZ — /rest/v1 ve /auth/v1/admin yalnız okunur", () => {
        // /storage/v1/object/list POST'u bir LİSTELEME çağrısıdır (PostgREST değil),
        // bu yüzden hedef yola göre ayrıştırılıyor.
        const writes = [...script.matchAll(/method:\s*"(POST|PUT|PATCH|DELETE)"/g)];
        expect(writes.length).toBeGreaterThan(0); // liste çağrısı var, desen ölmedi

        for (const m of writes) {
            // her yazma-metodunun ait olduğu fetch bloğunun URL'i
            const before = script.slice(0, m.index ?? 0);
            const fetchStart = before.lastIndexOf("fetch(");
            const target = script.slice(fetchStart, (m.index ?? 0) + 200);
            expect(target).toMatch(/storage\/v1\/object\/list/);
        }
        expect(script).not.toMatch(/rest\/v1\/[^`"']*`?,\s*\{\s*method:\s*"(POST|PATCH|DELETE)"/);
        expect(script).not.toMatch(/resolution=merge-duplicates/);
    });

    it("satır sayısı doğrulaması yerinde (yarım yedek exit 0 dönemez)", () => {
        expect(script).toMatch(/Prefer:\s*"count=exact"/);
        expect(script).toMatch(/lines\.length\s*!==\s*expected/);
        expect(script).toMatch(/errors\.length/);
        expect(script).toMatch(/process\.exit\(1\)/);
    });

    it("sayfalama deterministik sırayla yapılıyor (Range sırasız kullanılamaz)", () => {
        // PostgREST'te ORDER BY'sız Range sayfalaması satır kaçırabilir/yineleyebilir.
        expect(script).toMatch(/order=\$\{encodeURIComponent\(pk\)\}\.asc/);
        expect(script).toMatch(/<pk\\\/>/); // birincil anahtar OpenAPI'den okunuyor
    });

    it("parola hash'i sınırı kullanıcıya bildiriliyor", () => {
        expect(script).toMatch(/PAROLA HASH'LER/);
        const runbook = readFileSync(join(root, "docs/backup-restore.md"), "utf8");
        expect(runbook).toMatch(/Parolalar geri gelmez/);
        expect(runbook).toMatch(/restoreOrder/);
    });

    // ── 2026-09-05 PROVASININ AÇTIĞI KURALLAR ───────────────────────────────
    //
    // Yordam 2026-08-30'dan beri yazılıydı ama HİÇ KOŞULMAMIŞTI. İlk prova dört
    // gerçek kusur çıkardı; aşağıdakiler o kusurların geri gelmesini engelliyor.

    it("geri yükleme sırası FK GRAFİĞİNDEN gelir, yaratma sırasından DEĞİL", () => {
        // Eski gerekçe — "bir tabloya FK verebilmek için hedef önce yaratılmalı"
        // — YANLIŞ: FK sonradan ALTER TABLE ile de eklenebilir. Somut vaka:
        // purchase_commitments mig.020'de, purchase_order_lines mig.049'da
        // yaratılıyor, aradaki FK mig.050'de ekleniyor → yaratma sırası ters
        // ve geri yükleme 23503 ile düşüyordu.
        expect(script).toMatch(/function topologicalOrder/);
        expect(script, "manifest sırası topolojik sıralayıcıdan beslenmeli")
            .toMatch(/restoreOrder:\s*order/);
        // Yaratma sırası yalnız eşitlik bozucu olarak kalabilir.
        expect(script).not.toMatch(/restoreOrder:\s*creationOrder\(/);
        // Döngü sessizce yutulmamalı.
        expect(script).toMatch(/restoreOrderCycles/);
    });

    it("obje içerik türü LİSTEDEN okunur (indirme başlığı saklanan türü söylemez)", () => {
        // Supabase Storage, HTML'i stored-XSS'e karşı `text/plain` olarak SERVİS
        // eder; indirme yanıtının başlığı saklanan tür DEĞİLDİR. Prova: manifest
        // `text/plain` kaydedince `quote-pdfs` kovasının yalnız `text/html`
        // kabul eden allowlist'i teklif arşivlerini HTTP 400 ile reddetti.
        expect(script).toMatch(/o\.metadata\?\.mimetype/);
        expect(script, "tür manifest'e yazılmalı").toMatch(/types\[full\]\s*=/);
    });

    it("geri yükleme aracı: kuru çalışma varsayılan, canlı hedef ayrıca izin ister", () => {
        const restore = readFileSync(join(process.cwd(), "scripts/restore.ts"), "utf8");
        // Yazmak açık niyet ister (repair-* scriptlerinin deseni).
        expect(restore).toMatch(/const APPLY = argv\.includes\("--apply"\)/);
        // Canlıya geri yükleme MEŞRU bir kurtarma senaryosu — ama kazara olmamalı.
        expect(restore).toMatch(/isProdTarget\(url\)\s*&&\s*APPLY\s*&&\s*process\.env\.ALLOW_PROD_TARGET/);
        // EKSİK bir yedek geri yüklenemez: yarım veri, veri yokluğundan kötüdür.
        expect(restore).toMatch(/manifest\.errors\?\.length/);
        // Sıra manifest'ten okunur; script kendi sırasını uydurmaz.
        expect(restore).toMatch(/manifest\.restoreOrder/);
    });

    it("`npm run restore` kayıtlı", () => {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
            scripts: Record<string, string>;
        };
        expect(pkg.scripts.restore).toBe("tsx scripts/restore.ts");
    });

    /**
     * 2026-09-11 — dış inceleme #3.
     *
     * `backup.ts` 2026-08-30'dan beri her tablo için SHA-256 yazıyordu ve
     * `restore.ts` bu alanı TİPİNDE tanıyordu — ama hiç OKUMUYORDU. Tek kontrol,
     * işlem bittikten SONRAKİ satır sayısı karşılaştırmasıydı: bozulmuş bir
     * yedek, satır sayısı tuttuğu sürece "başarılı" geri yüklenebiliyordu.
     * Daha incesi, manifestte olup diskte olmayan dosya BOŞ TABLO sayılıyordu
     * (`ndjson()` `[]` dönüyordu) → felaket anında veri "silinmiş" görünür,
     * kimse fark etmezdi.
     */
    describe("yedek bütünlüğü — yazmadan ÖNCE doğrulanır", () => {
        const restore = readFileSync(join(process.cwd(), "scripts/restore.ts"), "utf8");
        const backup = readFileSync(join(process.cwd(), "scripts/backup.ts"), "utf8");
        const code = (s: string) =>
            s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

        it("restore manifest özetlerini GERÇEKTEN karşılaştırıyor", () => {
            const c = code(restore);
            expect(c, "doğrulama fonksiyonu yok").toMatch(/function verifyBackup/);
            expect(c, "özet hesaplanmıyor").toMatch(/sha256\(readFileSync\(/);
            expect(c, "manifest özetiyle karşılaştırma yok").toMatch(/!==\s*stat\.sha256/);
        });

        it("doğrulama hedefe YAZMADAN önce koşuyor ve tümü-ya-hiç", () => {
            const c = code(restore);
            const verifyAt = c.indexOf("verifyBackup(manifest)");
            const firstWrite = c.indexOf('method: "POST"');
            expect(verifyAt, "verifyBackup çağrılmıyor").toBeGreaterThan(-1);
            expect(firstWrite, "ayrıştırıcı bozuk — hiç yazma çağrısı bulunamadı").toBeGreaterThan(-1);
            expect(verifyAt, "doğrulama ilk yazmadan SONRA koşuyor").toBeLessThan(firstWrite);
            // Bir tek özet tutmazsa hiçbir şey yazılmaz.
            expect(c).toMatch(/integrity\.length[\s\S]{0,400}process\.exit\(1\)/);
        });

        it("eksik dosya BOŞ TABLO sayılmıyor", () => {
            // KIRMIZI-KANIT BİR ZAYIFLIK YAKALADI (9. kez "desen komşusuna
            // tutundu"): ilk yazım yalnız `/manifestte var, DİSKTE YOK/` diyordu.
            // Aynı dize STORAGE kolunda da geçtiği için TABLO kolu tamamen
            // silindiğinde kural YEŞİL kalıyordu. İddia artık tablo kolunun
            // kendisine bağlı — `satır kaybı` yalnız orada üretiliyor.
            const c = code(restore);
            expect(c, "eksik TABLO dosyası hata sayılmıyor").toMatch(/satır kaybı/);
            expect(c, "eksik STORAGE objesi hata sayılmıyor")
                .toMatch(/storage\/\$\{bucket\}\/\$\{rel\}: manifestte var, DİSKTE YOK/);
        });

        it("storage objeleri de özetleniyor ve doğrulanıyor", () => {
            expect(code(backup), "obje başına özet üretilmiyor").toMatch(/hashes\[full\] = sha256\(buf\)/);
            expect(code(backup), "özetler manifeste yazılmıyor").toMatch(/sha256: hashes/);
            expect(code(restore), "obje özetleri doğrulanmıyor").toMatch(/stat\.sha256/);
            // Eski yedekler (özetsiz) REDDEDİLMEZ ama rapor edilir.
            expect(code(restore)).toMatch(/2026-09-11 öncesi yedek/);
        });

        it("iki taraf AYNI özet gövdesini kullanıyor (ayrışırsa doğrulama anlamsızlaşır)", () => {
            const body = /createHash\("sha256"\)\.update\(body as never\)\.digest\("hex"\)/;
            expect(code(backup)).toMatch(body);
            expect(code(restore)).toMatch(body);
        });

        it("belge artık satır-sayısı kontrolünün NE YAKALAMADIĞINI da yazıyor", () => {
            // #8: "arada yazma olursa satır sayısı kontrolü bildirir" YANILTICIYDI.
            const doc = readFileSync(join(process.cwd(), "docs/backup-restore.md"), "utf8");
            expect(doc).toMatch(/yakalanmaz:\*\* yedek sırasında yapılan \*\*UPDATE/);
            expect(doc).toMatch(/eşit sayıda \*\*DELETE \+ INSERT/);
            expect(doc, "yanıltıcı eski cümle geri gelmiş")
                .not.toMatch(/arada yazma olursa satır\s*\n?\s*sayısı kontrolü bunu hata olarak bildirir \(tekrar koşun\)\./);
        });
    });
});
