/**
 * Faz 1 review — products.attributes + product_type_id write/read kabul kriteri kilidi.
 *
 * Covers:
 *  - dbCreateProduct insert payload'ında product_type_id ve attributes geçer
 *  - default'lar: product_type_id=null, attributes={}
 *  - dbUpdateProduct attributes patch'i kabul eder
 *  - mapProduct row → frontend (productTypeId + attributes)
 *  - Source-regex regression lock (products.ts insert'inde alanlar mevcut)
 *  - CreateProductInput tipinde alanlar (type-level)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase chain mock ─────────────────────────────────────────

const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.insert = (v: unknown) => { mockInsert(v); return chain; };
    chain.update = (v: unknown) => { mockUpdate(v); return chain; };
    chain.select = (v?: unknown) => { mockSelect(v); return chain; };
    chain.eq = (k: unknown, v: unknown) => { mockEq(k, v); return chain; };
    chain.single = () => mockSingle();
    return chain;
};

const mockSupabase = {
    from: (table: string) => { mockFrom(table); return makeChain(); },
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => mockSupabase,
}));

vi.mock("next/cache", () => ({
    unstable_cache: (fn: () => unknown) => fn,
    revalidateTag: vi.fn(),
}));

beforeEach(() => {
    mockFrom.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockSelect.mockReset();
    mockEq.mockReset();
    mockSingle.mockReset();
});

const sampleRow = {
    id: "p-1",
    name: "Test Product",
    sku: "TST-001",
    category: null,
    unit: "adet",
    price: null,
    currency: "USD",
    on_hand: 0,
    reserved: 0,
    min_stock_level: 0,
    is_active: true,
    product_type: "manufactured",
    warehouse: null,
    reorder_qty: null,
    preferred_vendor: null,
    preferred_vendor_id: null,
    daily_usage: null,
    lead_time_days: null,
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
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
};

// ── dbCreateProduct ─────────────────────────────────────────────

describe("dbCreateProduct — attributes/product_type_id write yolu", () => {
    it("product_type_id + attributes verildiğinde insert payload'ına yazılır", async () => {
        const { dbCreateProduct } = await vi.importActual<typeof import("@/lib/supabase/products")>("@/lib/supabase/products");

        mockSingle.mockResolvedValue({
            data: {
                ...sampleRow,
                product_type_id: "00000000-0000-4000-8000-000000000001",
                attributes: { dn: 50, pn_class: "600LB" },
            },
            error: null,
        });

        await dbCreateProduct({
            name: "Globe Valve",
            sku: "GV-001",
            unit: "adet",
            product_type_id: "00000000-0000-4000-8000-000000000001",
            attributes: { dn: 50, pn_class: "600LB" },
        });

        expect(mockInsert).toHaveBeenCalled();
        const payload = mockInsert.mock.calls[0][0];
        expect(payload.product_type_id).toBe("00000000-0000-4000-8000-000000000001");
        expect(payload.attributes).toEqual({ dn: 50, pn_class: "600LB" });
    });

    it("product_type_id/attributes verilmezse insert payload'ında default'lar (null/{}) yazılır", async () => {
        const { dbCreateProduct } = await vi.importActual<typeof import("@/lib/supabase/products")>("@/lib/supabase/products");

        mockSingle.mockResolvedValue({ data: sampleRow, error: null });

        await dbCreateProduct({
            name: "Plain Product",
            sku: "PP-001",
            unit: "adet",
        });

        expect(mockInsert).toHaveBeenCalled();
        const payload = mockInsert.mock.calls[0][0];
        expect(payload.product_type_id).toBeNull();
        expect(payload.attributes).toEqual({});
    });
});

// ── dbUpdateProduct ─────────────────────────────────────────────

describe("dbUpdateProduct — attributes patch yolu", () => {
    it("attributes patch update payload'ında yazılır", async () => {
        const { dbUpdateProduct } = await vi.importActual<typeof import("@/lib/supabase/products")>("@/lib/supabase/products");

        mockSingle.mockResolvedValue({
            data: { ...sampleRow, attributes: { dn: 80 } },
            error: null,
        });

        await dbUpdateProduct("p-1", { attributes: { dn: 80 } });

        expect(mockUpdate).toHaveBeenCalled();
        const payload = mockUpdate.mock.calls[0][0];
        expect(payload).toEqual({ attributes: { dn: 80 } });
    });

    it("product_type_id patch update payload'ında yazılır", async () => {
        const { dbUpdateProduct } = await vi.importActual<typeof import("@/lib/supabase/products")>("@/lib/supabase/products");

        mockSingle.mockResolvedValue({
            data: { ...sampleRow, product_type_id: "type-x" },
            error: null,
        });

        await dbUpdateProduct("p-1", { product_type_id: "type-x" });

        expect(mockUpdate).toHaveBeenCalled();
        const payload = mockUpdate.mock.calls[0][0];
        expect(payload).toEqual({ product_type_id: "type-x" });
    });
});

// ── mapProduct (read tarafı) ────────────────────────────────────

describe("mapProduct — productTypeId ve attributes camelCase mapping", () => {
    it("row.product_type_id + row.attributes → frontend Product alanları", async () => {
        const { mapProduct } = await import("@/lib/api-mappers");
        const product = mapProduct({
            ...sampleRow,
            product_type_id: "type-x",
            attributes: { dn: 50, pn_class: "600LB" },
            available_now: 0,
        });

        expect(product.productTypeId).toBe("type-x");
        expect(product.attributes).toEqual({ dn: 50, pn_class: "600LB" });
    });

    it("row.product_type_id=null + attributes={} → frontend default'lar", async () => {
        const { mapProduct } = await import("@/lib/api-mappers");
        const product = mapProduct({ ...sampleRow, available_now: 0 });

        expect(product.productTypeId).toBeNull();
        expect(product.attributes).toEqual({});
    });
});

// ── Source-regex regression lock ────────────────────────────────

describe("Source-regex regression lock", () => {
    it("products.ts dbCreateProduct insert'inde product_type_id + attributes mevcut", async () => {
        const fs = await import("fs/promises");
        const src = await fs.readFile("src/lib/supabase/products.ts", "utf-8");

        const createStart = src.indexOf("export async function dbCreateProduct");
        const createEnd = src.indexOf("export async function dbUpdateProduct");
        const createBody = src.slice(createStart, createEnd);

        expect(createBody).toContain("product_type_id: input.product_type_id ?? null");
        expect(createBody).toContain("attributes: input.attributes ?? {}");
    });

    it("CreateProductInput tipinde product_type_id ve attributes opsiyonel olarak mevcut", async () => {
        const fs = await import("fs/promises");
        const src = await fs.readFile("src/lib/supabase/products.ts", "utf-8");

        const ifaceStart = src.indexOf("export interface CreateProductInput");
        const ifaceEnd = src.indexOf("export interface ListProductsFilter");
        const ifaceBody = src.slice(ifaceStart, ifaceEnd);

        expect(ifaceBody).toMatch(/product_type_id\?:\s*string\s*\|\s*null/);
        expect(ifaceBody).toMatch(/attributes\?:\s*Record<string,\s*unknown>/);
    });
});
