/**
 * Faz 2b — /dashboard/products/[id] tam ekran detay sayfası testleri.
 *
 * Source-regex tests cover the structural skeleton:
 *   - module loads (default export = function)
 *   - useParams + useRouter + fetch pattern
 *   - 7 tab keys present
 *   - 3 placeholder tabs (Teknik/Ekler/Partiler) wired to Faz 2c/2d/2e
 *   - Save handler PATCH wiring
 *   - Deactivate handler PATCH is_active=false + router.push
 *   - Loading + 404 branches
 *   - Demo guard
 *   - Operational subsections (Bekleyen Teslimatlar + Aktif Teklifler)
 *   - Header (image placeholder + SKU mono + active/inactive badge)
 *
 * Faz 2b Review (P3-003):
 *   - Route enrichment: dbGetQuotedQuantities + dbGetIncomingQuantities called in GET
 *   - handleSave null pattern: clearable fields use || null (not || undefined)
 *   - mapProduct: enriched quoted/incoming/promisable/forecasted mapping
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { mapProduct } from "@/lib/api-mappers";
import type { ProductWithStock } from "@/lib/database.types";

const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/products/[id]/page.tsx"),
    "utf8",
);

describe("Faz 2b — product detail page source", () => {
    it("module loads, default export is function", async () => {
        const mod = await import("@/app/dashboard/products/[id]/page");
        expect(typeof mod.default).toBe("function");
    });

    it("uses useParams + useRouter + fetch", () => {
        expect(SOURCE).toMatch(/useParams\s*\(\s*\)/);
        expect(SOURCE).toMatch(/useRouter\s*\(\s*\)/);
        expect(SOURCE).toMatch(/fetch\(\s*`\/api\/products\/\$\{productId\}`/);
    });

    it("declares all 7 tab keys", () => {
        for (const key of ["genel", "teknik", "stok", "tedarik", "ticari", "ekler", "partiler"]) {
            expect(SOURCE).toContain(`"${key}"`);
        }
    });

    it("locks Partiler with Faz 2e placeholder (Teknik unlocked in Faz 2c, Ekler unlocked in Faz 2d)", () => {
        expect(SOURCE).toMatch(/Faz 2e&apos;de gelecek/);
        expect(SOURCE).toMatch(/locked:\s*true/);
        // Teknik tab is no longer locked — Faz 2c implemented dynamic field rendering
        expect(SOURCE).not.toMatch(/key:\s*"teknik".*locked:\s*true/);
        // Ekler tab is no longer locked — Faz 2d implemented attachments UI
        expect(SOURCE).not.toMatch(/key:\s*"ekler".*locked:\s*true/);
    });

    it("save handler PATCHes /api/products/[id]", () => {
        expect(SOURCE).toMatch(/method:\s*"PATCH"/);
        expect(SOURCE).toMatch(/`\/api\/products\/\$\{product\.id\}`/);
    });

    it("deactivate handler patches is_active=false and routes back to list", () => {
        expect(SOURCE).toMatch(/is_active:\s*false/);
        expect(SOURCE).toMatch(/router\.push\(\s*"\/dashboard\/products"\s*\)/);
    });

    it("renders Loading and 404 fallback states", () => {
        expect(SOURCE).toMatch(/Ürün yükleniyor/);
        expect(SOURCE).toMatch(/Ürün bulunamadı/);
    });

    it("guards mutations with demo mode", () => {
        expect(SOURCE).toMatch(/useIsDemo/);
        expect(SOURCE).toMatch(/DEMO_BLOCK_TOAST/);
        expect(SOURCE).toMatch(/DEMO_DISABLED_TOOLTIP/);
    });

    it("Stok tab includes Bekleyen Teslimatlar; Ticari tab includes Aktif Teklifler", () => {
        expect(SOURCE).toMatch(/Bekleyen Teslimatlar/);
        expect(SOURCE).toMatch(/Aktif Teklifler/);
        expect(SOURCE).toMatch(/purchase-commitments\?product_id=/);
        expect(SOURCE).toMatch(/\/api\/products\/\$\{product\.id\}\/quotes/);
    });

    it("header has image placeholder + SKU mono + active/inactive badge", () => {
        expect(SOURCE).toMatch(/Ana görsel/);
        expect(SOURCE).toMatch(/var\(--font-mono\)/);
        expect(SOURCE).toMatch(/Aktif/);
        expect(SOURCE).toMatch(/Pasif/);
    });

    it("uses tablist + role tab + aria-selected", () => {
        expect(SOURCE).toMatch(/role="tablist"/);
        expect(SOURCE).toMatch(/role="tab"/);
        expect(SOURCE).toMatch(/aria-selected/);
        expect(SOURCE).toMatch(/aria-controls/);
    });
});

// ── Faz 2b Review — P3-003 regression locks ──────────────────────────────

const ROUTE_SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/products/[id]/route.ts"),
    "utf8",
);

describe("Faz 2b Review — GET /api/products/[id] enrichment (P2-001)", () => {
    it("route imports dbGetQuotedQuantities and calls it in GET handler", () => {
        expect(ROUTE_SOURCE).toMatch(/dbGetQuotedQuantities/);
        expect(ROUTE_SOURCE).toMatch(/quotedMap\.get\(id\)/);
    });

    it("route imports dbGetIncomingQuantities and computes incoming/forecasted", () => {
        expect(ROUTE_SOURCE).toMatch(/dbGetIncomingQuantities/);
        expect(ROUTE_SOURCE).toMatch(/incomingMap\.get\(id\)/);
        expect(ROUTE_SOURCE).toMatch(/forecasted:/);
    });
});

describe("Faz 2b Review — handleSave null pattern (P2-002)", () => {
    it("clearable optional fields use || null (not || undefined) in handleSave", () => {
        expect(SOURCE).toMatch(/preferred_vendor:.*\|\| null/);
        expect(SOURCE).toMatch(/product_notes:.*\|\| null/);
        expect(SOURCE).toMatch(/warehouse:.*\|\| null/);
    });

    it("clearable number fields use null fallback in handleSave", () => {
        expect(SOURCE).toMatch(/lead_time_days:.*:\s*null/);
        expect(SOURCE).toMatch(/cost_price:.*:\s*null/);
        expect(SOURCE).toMatch(/daily_usage:.*:\s*null/);
    });
});

describe("Faz 2b Review — mapProduct enriched fields (P3-003)", () => {
    it("mapProduct correctly maps quoted/incoming/promisable/forecasted from enriched response", () => {
        const row = {
            id: "test-id",
            name: "Test",
            sku: "TEST-001",
            category: null,
            unit: "adet",
            price: 100,
            currency: "USD",
            on_hand: 100,
            reserved: 20,
            available_now: 80,
            quoted: 30,
            incoming: 50,
            promisable: 50,
            forecasted: 100,
            min_stock_level: 10,
            is_active: true,
            product_type: "manufactured" as const,
            warehouse: null,
            reorder_qty: null,
            preferred_vendor: null,
            preferred_vendor_id: null,
            daily_usage: null,
            lead_time_days: null,
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
            product_family: null,
            sub_category: null,
            sector_compatibility: null,
            cost_price: null,
            weight_kg: null,
            material_quality: null,
            origin_country: null,
            production_site: null,
            use_cases: null,
            industries: null,
            standards: null,
            certifications: null,
            product_notes: null,
            parasut_product_id: null,
            parasut_synced_at: null,
            parasut_product_creating_until: null,
            parasut_product_creating_owner: null,
            product_type_id: null,
            attributes: {},
        } satisfies ProductWithStock;

        const mapped = mapProduct(row);
        expect(mapped.quoted).toBe(30);
        expect(mapped.incoming).toBe(50);
        expect(mapped.promisable).toBe(50);
        expect(mapped.forecasted).toBe(100);
    });
});
