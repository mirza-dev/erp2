import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const GLOBALS = read("src/app/globals.css");
const QUOTES_PAGE = read("src/app/dashboard/quotes/page.tsx");
const ORDERS_PAGE = read("src/app/dashboard/orders/page.tsx");
const PRODUCTS_PAGE = read("src/app/dashboard/products/page.tsx");
const IMPORT_PAGE = read("src/app/dashboard/import/page.tsx");

describe("interactive muted text readability", () => {
    it("defines a dedicated readable muted token for dark and light themes", () => {
        const declarations = GLOBALS.match(/--text-interactive-muted:\s*#[0-9a-fA-F]{6};/g) ?? [];

        expect(declarations).toHaveLength(2);
        expect(GLOBALS).toContain("--text-interactive-muted: #96a2b2;");
        expect(GLOBALS).toContain("--text-interactive-muted: #5f6d7c;");
    });

    it("quote and order filter tabs use the interactive muted token with UI weight", () => {
        for (const source of [QUOTES_PAGE, ORDERS_PAGE]) {
            expect(source).toContain('fontWeight: activeTab === tab.id ? 600 : "var(--font-ui-weight)"');
            expect(source).toContain(': "var(--text-interactive-muted)"');
            expect(source).not.toContain("fontWeight: activeTab === tab.id ? 600 : 400");
        }
    });

    it("product and import filter controls inherit the readable muted pattern", () => {
        expect(IMPORT_PAGE).toContain('color: active ? "var(--accent-text)" : "var(--text-interactive-muted)"');
        expect(IMPORT_PAGE).toContain('fontWeight: active ? 600 : "var(--font-ui-weight)"');

        expect(PRODUCTS_PAGE).toContain('color: active ? "var(--text-primary)" : "var(--text-interactive-muted)"');
        expect(PRODUCTS_PAGE).toContain('fontWeight: active ? 600 : "var(--font-ui-weight)"');
        expect(PRODUCTS_PAGE).toContain('if (!active) e.currentTarget.style.color = "var(--text-interactive-muted)"');
    });

    it("non-interactive helper and empty-state copy remains tertiary, not promoted globally", () => {
        expect(QUOTES_PAGE).toContain('Teklifler yükleniyor...');
        expect(QUOTES_PAGE).toContain('color: "var(--text-tertiary)"');
        expect(IMPORT_PAGE).toContain("AI kolon adlarını ERP alanlarına eşleştiriyor");
        expect(IMPORT_PAGE).toContain('color: "var(--text-tertiary)"');
    });
});
