import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const CUSTOMERS = read("src/app/dashboard/customers/page.tsx");
const PURCHASE_ORDERS = read("src/app/dashboard/purchase/orders/page.tsx");
const PRODUCTS = read("src/app/dashboard/products/page.tsx");
const NOTE_TEMPLATES = read("src/app/dashboard/settings/note-templates/page.tsx");
const QUOTES = read("src/app/dashboard/quotes/page.tsx");
const ORDERS = read("src/app/dashboard/orders/OrdersClient.tsx");

describe("UnderlinedFilterTabs page adoption", () => {
    it("target pages use the shared underlined filter component", () => {
        for (const source of [CUSTOMERS, PURCHASE_ORDERS, PRODUCTS, NOTE_TEMPLATES]) {
            expect(source).toContain("UnderlinedFilterTabs");
        }
    });

    it("reference quote/order pages also use the shared component", () => {
        expect(QUOTES).toContain('ariaLabel="Teklif durumu filtresi"');
        expect(ORDERS).toContain('ariaLabel="Sipariş durumu filtresi"');
    });

    it("customers and note templates render counted tabs", () => {
        expect(CUSTOMERS).toContain('{ key: "all", label: "Tümü", count: mockCustomers.length }');
        expect(CUSTOMERS).toContain('{ key: "active", label: "Aktif", count: activeCount }');
        expect(NOTE_TEMPLATES).toContain('{ key: "all", label: "Tümü", count: templates.length }');
        expect(NOTE_TEMPLATES).toContain("count: kindCounts[kind]");
    });

    it("purchase orders fetch the full list once and filter/count statuses client-side", () => {
        expect(PURCHASE_ORDERS).toContain('fetch("/api/purchase-orders")');
        expect(PURCHASE_ORDERS).toContain("const byStatus = activeTab === \"all\" ? orders : orders.filter((o) => o.status === activeTab)");
        expect(PURCHASE_ORDERS).toContain("const getStatusCount = (key: StatusFilter)");
        expect(PURCHASE_ORDERS).not.toContain("?status=");
    });

    it("products only move the Sinyal filter to underlined tabs and keep category/type controls", () => {
        expect(PRODUCTS).toContain('ariaLabel="Ürün sinyal filtresi"');
        expect(PRODUCTS).toContain("setCategoryDropdownOpen");
        expect(PRODUCTS).toContain("setFilterManufactured");
        expect(PRODUCTS).toContain("setFilterCommercial");
    });

    it("old pill/chip tab styles are removed from the converted pages", () => {
        expect(CUSTOMERS).not.toContain("activeFilter === tab.key ? \"var(--accent-bg)\" : \"transparent\"");
        expect(PURCHASE_ORDERS).not.toContain("background: active ? \"var(--accent-bg)\" : \"transparent\"");
        expect(NOTE_TEMPLATES).not.toContain("tabsStyle");
    });
});
