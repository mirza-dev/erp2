/**
 * Ayarlar sayfası — final ürün UI source-regex testleri.
 *
 * Bu tur düzeltmelerini kilitler (route davranışı settings-*-route.test.ts'te):
 *   1. [a11y] ResetDemoSection onay modalı role=dialog/aria-modal/aria-labelledby + başlık id.
 *   2. [a11y] Sol sekme menüsü tablist/tab/aria-selected + tabpanel/aria-labelledby
 *      (id eşleşmesi) + dirty nokta aria-hidden + dirty durum erişilebilir adda.
 *   3. [render bug] ApiTab "Bağlantı yok" mesajı ham &apos; yerine düz tek tırnak
 *      (JS string literal'de HTML entity decode edilmez); :953 JSX text korunur.
 *   4. [hata paritesi] FirmaTab handleSave !res.ok dalı errBody.error parse eder
 *      (ham res.text() yerine), sunucunun spesifik 400 mesajı kullanıcıya ulaşır.
 *
 * Kaynak okuma yöntemi (vendors-ui / production-ui / customers-ui aynası): JSX davranışı
 * jsdom render etmeden source-regex ile kilitlenir.
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

// ── 1. ResetDemoSection onay modalı a11y ──────────────────────

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

// ── 2. Sekme menüsü tablist a11y + dirty dot ──────────────────

describe("Ayarlar — sekme menüsü tablist a11y", () => {
    it("menü konteyner role=tablist + aria-label taşır", () => {
        expect(PAGE_SRC).toMatch(/role="tablist"/);
        expect(PAGE_SRC).toMatch(/aria-label="Ayarlar bölümleri"/);
    });

    it("her sekme butonu role=tab + aria-selected + id + aria-controls taşır", () => {
        expect(PAGE_SRC).toMatch(/role="tab"/);
        expect(PAGE_SRC).toMatch(/aria-selected=\{activeTab === key\}/);
        expect(PAGE_SRC).toMatch(/id=\{`settings-tab-\$\{key\}`\}/);
        expect(PAGE_SRC).toMatch(/aria-controls="settings-tabpanel"/);
    });

    it("sağ içerik role=tabpanel + id + aria-labelledby aktif sekme id'sine eşlenir", () => {
        expect(PAGE_SRC).toMatch(/role="tabpanel"/);
        expect(PAGE_SRC).toMatch(/id="settings-tabpanel"/);
        expect(PAGE_SRC).toMatch(/aria-labelledby=\{`settings-tab-\$\{activeTab\}`\}/);
    });

    it("dirty nokta aria-hidden + dirty durum butonun erişilebilir adında", () => {
        expect(PAGE_SRC).toMatch(/<span aria-hidden="true"/);
        expect(PAGE_SRC).toMatch(/dirtyTabs\.has\(key\) \? `\$\{label\} \(kaydedilmemiş değişiklikler\)` : undefined/);
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
        expect(PAGE_SRC).toMatch(/const errBody = await res\.json\(\)\.catch\(\(\) => null\);\s*\n\s*throw new Error\(errBody\?\.error \?\? "Kayıt başarısız\. Tekrar deneyin\."\)/);
        // ham res.text() artık FirmaTab kayıt dalında kullanılmaz
        expect(PAGE_SRC).not.toMatch(/if \(!res\.ok\) throw new Error\(await res\.text\(\)\)/);
    });

    it("catch err mesajını yüzeye çıkarır (jenerik metin değil)", () => {
        expect(PAGE_SRC).toMatch(/catch \(err\) \{\s*\n\s*toast\(\{ type: "error", message: err instanceof Error \? err\.message : "Kayıt başarısız\. Tekrar deneyin\." \}\)/);
    });
});
