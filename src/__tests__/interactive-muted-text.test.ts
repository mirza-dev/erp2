import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const GLOBALS = read("src/app/globals.css");
const UNDERLINED_TABS = read("src/components/ui/UnderlinedFilterTabs.tsx");
const QUOTES_PAGE = read("src/app/dashboard/quotes/QuotesClient.tsx");
const ORDERS_PAGE = read("src/app/dashboard/orders/OrdersClient.tsx");
const PRODUCTS_PAGE = read("src/app/dashboard/products/page.tsx");
// 2026-06-10 sadeleştirme: tabBtnStyle + kolon algılama metni Excel sihirbazında
const IMPORT_PAGE = read("src/app/dashboard/import/excel/page.tsx");

describe("interactive muted text readability", () => {
    it("defines a dedicated readable muted token for dark and light themes", () => {
        const declarations = GLOBALS.match(/--text-interactive-muted:\s*#[0-9a-fA-F]{6};/g) ?? [];

        expect(declarations).toHaveLength(2);
        expect(GLOBALS).toContain("--text-interactive-muted: #96a2b2;");
        expect(GLOBALS).toContain("--text-interactive-muted: #5f6d7c;");
    });

    it("quote and order filter tabs use the interactive muted token with UI weight", () => {
        expect(UNDERLINED_TABS).toContain('fontWeight: active ? 600 : "var(--font-ui-weight)"');
        expect(UNDERLINED_TABS).toContain('color: active ? "var(--accent-text)" : "var(--text-interactive-muted)"');

        for (const source of [QUOTES_PAGE, ORDERS_PAGE]) {
            expect(source).toContain("UnderlinedFilterTabs");
            expect(source).not.toContain("fontWeight: activeTab === tab.id ? 600 : 400");
        }
    });

    it("product and import filter controls inherit the readable muted pattern", () => {
        expect(IMPORT_PAGE).toContain('color: active ? "var(--accent-text)" : "var(--text-interactive-muted)"');
        expect(IMPORT_PAGE).toContain('fontWeight: active ? 600 : "var(--font-ui-weight)"');

        expect(PRODUCTS_PAGE).toContain('ariaLabel="Ürün sinyal filtresi"');
        expect(PRODUCTS_PAGE).toContain("UnderlinedFilterTabs");
    });

    it("non-interactive helper and empty-state copy remains tertiary, not promoted globally", () => {
        // A1: yükleniyor metni RSC loading.tsx iskeletine taşındı; QuotesClient
        // tertiary token'ı (chevron/empty-state) hâlâ kullanır.
        expect(QUOTES_PAGE).toContain('color: "var(--text-tertiary)"');
        expect(IMPORT_PAGE).toContain("AI kolon adlarını ERP alanlarına eşleştiriyor");
        expect(IMPORT_PAGE).toContain('color: "var(--text-tertiary)"');
    });
});
