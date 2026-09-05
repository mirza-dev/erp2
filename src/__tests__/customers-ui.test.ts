/**
 * Cariler sayfası — final ürün UI source-regex testleri.
 *
 * Bu tur düzeltmeleri kilitler (route davranışı customer-patch-route.test.ts'te):
 *   1. [toplu silme] handleBulkDelete context deleteCustomer üzerinden geçer
 *      (ham fetch yalnız seçimi temizliyordu, silinen satırlar tabloda kalıyordu).
 *   2. [hover] DOM-mutation antipattern → hoveredId state + koşullu background.
 *   3. [a11y] 3 modal/panel (bulk-delete + add + CustomerDetailPanel) role=dialog/
 *      aria-modal/aria-labelledby + başlık id.
 *   4. [validation yüzeyi] addCustomer ham {"error"} yerine errBody.error parse eder.
 *
 * Kaynak okuma yöntemi (vendors-ui / production-ui aynası): JSX davranışı jsdom
 * render etmeden source-regex ile kilitlenir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";


/**
 * Yorum ayıklama — NEGATİF iddialar için ZORUNLU.
 *
 * 2026-09-05: "elle yazılmış dialog kalmadı" kuralı, taşınma gerekçesini
 * anlatan yorumda `role="dialog"` geçtiği için kırmızı yandı. Depoda bu tuzağa
 * beşinci düşüş; `filter-chips-source.test.ts` aynı çözümü taşıyor. Kural
 * KODU iddia etmeli, kodun anlatısını değil.
 */
const stripCode = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGE_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/customers/CustomersClient.tsx"),
    "utf8",
);
const PANEL_SRC = readFileSync(
    join(process.cwd(), "src/components/customers/CustomerDetailPanel.tsx"),
    "utf8",
);
const CTX_SRC = readFileSync(
    join(process.cwd(), "src/lib/data-context.tsx"),
    "utf8",
);

// ── 1. Toplu silme context üzerinden (bayat satır fix) ────────

describe("Cariler — toplu silme bayat satır bırakmaz", () => {
    it("handleBulkDelete fetch DELETE + local patch yapar, router.refresh beklemez", () => {
        expect(PAGE_SRC).toMatch(/fetch\(`\/api\/customers\/\$\{id\}`, \{ method: "DELETE" \}\)/);
        expect(PAGE_SRC).toContain("applyDeletedCustomers(succeededIds)");
        expect(PAGE_SRC).not.toContain("router.refresh()");
    });

    it("açık panel toplu silmeye dahilse kapatılır (tek-silme paritesi)", () => {
        expect(PAGE_SRC).toMatch(/if \(selectedCustomer && succeededIds\.includes\(selectedCustomer\.id\)\) setSelectedCustomer\(null\)/);
    });
});

// ── 2. Tablo DataTable'a taşındı; hover CSS, satır tıklama panel açar ───

describe("Cariler — DataTable + CSS hover (hoveredId antipattern kaldırıldı)", () => {
    it("liste Card + DataTable kullanır; hoveredId state + DOM-yazımı kaldırıldı", () => {
        // Hover artık globals.css `.erp-data-table tbody tr:hover` ile (rerender yok).
        expect(PAGE_SRC).toContain("<DataTable");
        expect(PAGE_SRC).toContain('minWidth="700px"');
        expect(PAGE_SRC).not.toContain("const [hoveredId, setHoveredId]");
        expect(PAGE_SRC).not.toContain("setHoveredId");
        expect(PAGE_SRC).not.toMatch(/querySelectorAll\("td"\)\.forEach\(td => \(td\.style\.background/);
    });

    it("satır tıklama detay panelini açar (onRowClick → setSelectedCustomer)", () => {
        expect(PAGE_SRC).toContain("onRowClick={c => setSelectedCustomer(c)}");
    });
});

// ── 3. Modal/panel a11y ───────────────────────────────────────

describe("Cariler — modal/panel a11y", () => {
    it("toplu-silme onayı ortak ConfirmModal'ı kullanır", () => {
        // a11y ARTIK ORTAK ÇERÇEVEDE: `role="dialog"` + `aria-modal` +
        // focus tuzağı + Escape `components/ui/Modal.tsx`'te (orada ayrıca
        // kilitli). Burada kilitlenen: bu yüzey çerçeveyi KULLANIYOR ve
        // verdiği `labelledBy` id'sinin karşılığı sayfada VAR.
        expect(PAGE_SRC).toMatch(/from "@\/components\/ui\/Modal"/);
        expect(PAGE_SRC).toMatch(/<ConfirmModal/);
    });

    it("Yeni Müşteri modalı ortak Modal'ı kullanır ve başlık id'si eşleşir", () => {
        expect(PAGE_SRC).toMatch(/labelledBy="add-customer-title"/);
        expect(PAGE_SRC).toMatch(/id="add-customer-title"/);
    });

    it("sayfada elle yazılmış dialog KALMADI (çerçeveye taşındı)", () => {
        expect(stripCode(PAGE_SRC)).not.toMatch(/role="dialog"/);
    });

    it("CustomerDetailPanel ortak Drawer'ı kullanır ve başlık id'si eşleşir", () => {
        // a11y ARTIK ORTAK ÇERÇEVEDE: `role="dialog"` + `aria-modal` + Escape +
        // focus tuzağı + odak dönüşü `components/ui/Drawer.tsx`te (davranışı
        // `dialog-a11y.ts` veriyor; ikisi de kendi yerinde kilitli).
        //
        // Eski iddia bu dosyada `role="dialog"` + `aria-modal` arıyordu ve
        // YEŞİLDİ — ama panel klavyeyle kapatılamıyordu. İşaretlemeyi görüyor,
        // davranışı görmüyordu. Ders bu turun kaydı: bir yüzeyin diyalog İLAN
        // etmesi, diyalog gibi DAVRANDIĞI anlamına gelmez.
        expect(PANEL_SRC).toMatch(/from "@\/components\/ui\/Drawer"/);
        expect(PANEL_SRC).toMatch(/labelledBy="customer-detail-title"/);
        expect(PANEL_SRC).toMatch(/id="customer-detail-title"/);
        expect(stripCode(PANEL_SRC)).not.toMatch(/role="dialog"/);
    });

    it("CustomerDetailPanel aksiyonları premium Button bileşeninden gelir", () => {
        expect(PANEL_SRC).toContain('from "@/components/ui/Button"');
        expect(PANEL_SRC).toMatch(/leftIcon=\{<Plus/);
        expect(PANEL_SRC).toMatch(/leftIcon=\{<Pencil/);
        expect(PANEL_SRC).toMatch(/variant=\{editSaved \? "success" : "primary"\}/);
        expect(PANEL_SRC).not.toMatch(/<button/);
    });

    it("CustomerDetailPanel düzenleme footer standardı İptal sonra Kaydet sırasını korur", () => {
        const footerStart = PANEL_SRC.indexOf("onClick={() => setEditMode(false)}");
        const cancelLabel = PANEL_SRC.indexOf("İptal", footerStart);
        const saveAction = PANEL_SRC.indexOf("onClick={handleSave}", footerStart);
        const saveLabel = PANEL_SRC.indexOf("Kaydet", saveAction);
        expect(footerStart).toBeGreaterThan(0);
        expect(cancelLabel).toBeGreaterThan(footerStart);
        expect(saveAction).toBeGreaterThan(cancelLabel);
        expect(saveLabel).toBeGreaterThan(saveAction);
    });
});

// ── 4. addCustomer hata yüzeyi (ham JSON yerine errBody.error) ─

describe("Cariler — addCustomer hata mesajı parse", () => {
    it("addCustomer !res.ok dalında errBody.error parse eder, res.text() ham JSON atmaz", () => {
        expect(CTX_SRC).toMatch(/const errBody = await res\.json\(\)\.catch\(\(\) => null\);\s*\n\s*throw new Error\(errBody\?\.error \?\? "Müşteri eklenemedi\."\)/);
    });
});
