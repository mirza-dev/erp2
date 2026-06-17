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
    it("A1: handleBulkDelete fetch DELETE + router.refresh (sunucu otoritesi → bayat satır yok)", () => {
        // Eski stale-row sorunu client-liste'den geliyordu; RSC'de router.refresh
        // sunucu listesini yeniden çekince silinen satırlar kaybolur.
        expect(PAGE_SRC).toMatch(/fetch\(`\/api\/customers\/\$\{id\}`, \{ method: "DELETE" \}\)/);
        expect(PAGE_SRC).toContain("router.refresh()");
    });

    it("açık panel toplu silmeye dahilse kapatılır (tek-silme paritesi)", () => {
        expect(PAGE_SRC).toMatch(/if \(selectedCustomer && ids\.includes\(selectedCustomer\.id\)\) setSelectedCustomer\(null\)/);
    });
});

// ── 2. Hover hoveredId state (DOM-mutation antipattern fix) ───

describe("Cariler — hover hoveredId state", () => {
    it("hoveredId state tanımlı + satır background koşullu", () => {
        expect(PAGE_SRC).toMatch(/const \[hoveredId, setHoveredId\] = useState<string \| null>\(null\)/);
        expect(PAGE_SRC).toMatch(/hoveredId === customer\.id \? "var\(--bg-secondary\)" : "transparent"/);
    });

    it("onMouseEnter/Leave setHoveredId çağırır, querySelectorAll DOM-yazımı yok", () => {
        expect(PAGE_SRC).toMatch(/onMouseEnter=\{\(\) => setHoveredId\(customer\.id\)\}/);
        expect(PAGE_SRC).toMatch(/onMouseLeave=\{\(\) => setHoveredId\(null\)\}/);
        expect(PAGE_SRC).not.toMatch(/querySelectorAll\("td"\)\.forEach\(td => \(td\.style\.background/);
    });
});

// ── 3. Modal/panel a11y ───────────────────────────────────────

describe("Cariler — modal/panel a11y", () => {
    it("toplu-silme onay modalı role=dialog + aria-modal + aria-labelledby + id", () => {
        expect(PAGE_SRC).toMatch(/aria-labelledby="bulk-delete-customers-title"/);
        expect(PAGE_SRC).toMatch(/id="bulk-delete-customers-title"/);
    });

    it("Yeni Müşteri modalı role=dialog + aria-modal + aria-labelledby + id", () => {
        expect(PAGE_SRC).toMatch(/aria-labelledby="add-customer-title"/);
        expect(PAGE_SRC).toMatch(/id="add-customer-title"/);
    });

    it("iki sayfa modalı da role=dialog + aria-modal=true taşır", () => {
        const dialogs = PAGE_SRC.match(/role="dialog"/g) ?? [];
        expect(dialogs.length).toBeGreaterThanOrEqual(2);
        const ariaModals = PAGE_SRC.match(/aria-modal="true"/g) ?? [];
        expect(ariaModals.length).toBeGreaterThanOrEqual(2);
    });

    it("CustomerDetailPanel slide-in role=dialog + aria-modal + aria-labelledby + id", () => {
        expect(PANEL_SRC).toMatch(/role="dialog"/);
        expect(PANEL_SRC).toMatch(/aria-modal="true"/);
        expect(PANEL_SRC).toMatch(/aria-labelledby="customer-detail-title"/);
        expect(PANEL_SRC).toMatch(/id="customer-detail-title"/);
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
