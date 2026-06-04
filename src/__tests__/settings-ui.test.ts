/**
 * Ayarlar sayfası — sağlamlaştırma source-regex testleri (codex redesign sonrası re-apply).
 *
 * Codex settings'i yeniden tasarladı (gruplu <nav>, aria-current). Bu oturumun
 * sağlamlaştırması codex'in YENİ yapısına uyarlanarak re-apply edildi:
 *   1. [a11y] ResetDemoSection onay modalı role=dialog/aria-modal/aria-labelledby (codex korudu).
 *   2. [a11y] Gruplu sekme nav'ı: her sekme butonu `id` + dirty durum erişilebilir adda;
 *      içerik alanı role=region + aria-labelledby aktif sekme id'sine bağlı; dirty nokta
 *      aria-hidden (codex zaten aria-hidden). NOT: codex'in gruplu nav'ı flat tablist'e
 *      uymaz → role=tablist/tab/tabpanel YERİNE nav+aria-current+region (geçerli ARIA).
 *   3. [render bug] ApiTab "Bağlantı yok" mesajı ham &apos; yerine düz tek tırnak
 *      (codex reintroduce etmişti); :1053 JSX text 'Paraşüt'e bağlan' korunur.
 *   4. [hata paritesi] FirmaTab handleSave !res.ok dalı errBody.error parse eder
 *      (codex'in diğer handler'larıyla aynı patern); catch err.message yüzeye çıkarır.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/settings/page.tsx"),
    "utf8",
);
const RESET_SRC = readFileSync(
    join(process.cwd(), "src/components/settings/ResetDemoSection.tsx"),
    "utf8",
);

// ── 1. ResetDemoSection onay modalı a11y (codex korudu) ───────

describe("Ayarlar — ResetDemoSection onay modalı a11y", () => {
    it("onay paneli role=dialog + aria-modal=true + aria-labelledby taşır", () => {
        expect(RESET_SRC).toMatch(/role="dialog"/);
        expect(RESET_SRC).toMatch(/aria-modal="true"/);
        expect(RESET_SRC).toMatch(/aria-labelledby="reset-demo-confirm-title"/);
    });

    it("başlık 'Emin misiniz?' div'i id taşır (aria-labelledby hedefi)", () => {
        expect(RESET_SRC).toMatch(/id="reset-demo-confirm-title"/);
    });
});

// ── 2. Gruplu sekme nav'ı a11y (codex yapısına uyarlanmış) ────

describe("Ayarlar — gruplu sekme nav a11y", () => {
    it("nav konteyner aria-label taşır", () => {
        expect(PAGE_SRC).toMatch(/<nav className="settings-tab-nav" aria-label="Ayarlar sekmeleri">/);
    });

    it("her sekme butonu id + aria-current + dirty durum erişilebilir adda", () => {
        expect(PAGE_SRC).toMatch(/id=\{`settings-tab-\$\{tab\.key\}`\}/);
        expect(PAGE_SRC).toMatch(/aria-current=\{active \? "page" : undefined\}/);
        // Dirty durum yalnız görsel nokta değil — buton erişilebilir adında
        expect(PAGE_SRC).toMatch(/aria-label=\{dirty \? `\$\{tab\.label\} \(kaydedilmemiş değişiklikler\)` : undefined\}/);
    });

    it("içerik alanı role=region + aria-labelledby aktif sekme id'sine bağlı", () => {
        expect(PAGE_SRC).toMatch(/role="region"/);
        expect(PAGE_SRC).toMatch(/aria-labelledby=\{`settings-tab-\$\{activeTab\}`\}/);
    });

    it("dirty nokta aria-hidden (görsel ipucu, SR'da gürültü yapmaz)", () => {
        expect(PAGE_SRC).toMatch(/className="settings-tab-dirty-dot" aria-hidden="true"/);
    });
});

// ── 3. ApiTab &apos; render bug ───────────────────────────────

describe("Ayarlar — ApiTab entity render bug", () => {
    it("'Bağlantı yok' mesajı düz tek tırnak kullanır, ham &apos; YOK", () => {
        expect(PAGE_SRC).toMatch(/Bağlantı yok — 'Bağlan' ile akışı başlatın\./);
        expect(PAGE_SRC).not.toMatch(/Bağlantı yok — &apos;Bağlan&apos;/);
    });

    it("JSX text içindeki 'Paraşüt'e bağlan' &apos; korunur (doğru decode)", () => {
        // JSX text content'te &apos; doğru decode olur — DOKUNULMAMALI.
        expect(PAGE_SRC).toMatch(/Paraşüt&apos;e bağlan/);
    });
});

// ── 4. FirmaTab kayıt hatası paritesi ─────────────────────────

describe("Ayarlar — FirmaTab kayıt hatası paritesi", () => {
    it("handleSave !res.ok dalı errBody.error parse eder, ham res.text() atmaz", () => {
        expect(PAGE_SRC).toMatch(/const errBody = await res\.json\(\)\.catch\(\(\) => \(\{\}\)\);\s*\n\s*throw new Error\(errBody\.error \?\? "Kayıt başarısız\. Tekrar deneyin\."\)/);
        // ham res.text() artık FirmaTab kayıt dalında kullanılmaz
        expect(PAGE_SRC).not.toMatch(/if \(!res\.ok\) throw new Error\(await res\.text\(\)\)/);
    });

    it("catch err mesajını yüzeye çıkarır (jenerik metin değil)", () => {
        expect(PAGE_SRC).toMatch(/catch \(err\) \{\s*\n\s*toast\(\{ type: "error", message: err instanceof Error \? err\.message : "Kayıt başarısız\. Tekrar deneyin\." \}\)/);
    });
});
