/**
 * Tests for quoted/promisable enrichment in GET /api/products.
 *
 * Verifies that the route merges dbGetQuotedQuantities() output into
 * each product, computing quoted and promisable fields correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();
const mockDbGetIncomingQuantities = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts:        (...args: unknown[]) => mockDbListProducts(...args),
    dbCreateProduct:       vi.fn(),
    dbGetQuotedQuantities: (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
}));

vi.mock("@/lib/supabase/purchase-commitments", () => ({
    dbGetIncomingQuantities: (...args: unknown[]) => mockDbGetIncomingQuantities(...args),
    dbListCommitments:       vi.fn(),
    dbCreateCommitment:      vi.fn(),
    dbGetCommitment:         vi.fn(),
    dbReceiveCommitment:     vi.fn(),
    dbCancelCommitment:      vi.fn(),
}));

import { GET } from "@/app/api/products/route";

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(): NextRequest {
    return new NextRequest("http://localhost/api/products", { method: "GET" });
}

function makeProduct(id: string, on_hand: number, reserved: number) {
    return {
        id,
        name: `Product ${id}`,
        sku: `SKU-${id}`,
        category: null,
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand,
        reserved,
        available_now: on_hand - reserved,
        min_stock_level: 5,
        is_active: true,
        product_type: "finished" as const,
        warehouse: null,
        reorder_qty: null,
        preferred_vendor: null,
        daily_usage: null,
        lead_time_days: null,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
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
    };
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListProducts.mockResolvedValue([]);
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbGetIncomingQuantities.mockResolvedValue(new Map());
});

// ── Tests ─────────────────────────────────────────────────────

describe("GET /api/products — quoted/promisable enrichment", () => {
    it("quoted=0 and promisable=available_now when no active quotes", async () => {
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map());

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].quoted).toBe(0);
        expect(data[0].promisable).toBe(40); // available_now = 50 - 10 = 40
    });

    it("quoted reflects active quote quantity for a product", async () => {
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 30]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].quoted).toBe(30);
        expect(data[0].promisable).toBe(10); // 40 available_now - 30 quoted
    });

    it("promisable can go negative when quotes exceed available stock", async () => {
        const product = makeProduct("prod-1", 50, 40); // available_now = 10
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 15]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].quoted).toBe(15);
        expect(data[0].promisable).toBe(-5); // 10 - 15 = -5
    });

    it("products without active quotes get quoted=0", async () => {
        const prod1 = makeProduct("prod-1", 50, 0);
        const prod2 = makeProduct("prod-2", 30, 0);
        mockDbListProducts.mockResolvedValue([prod1, prod2]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 20]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].quoted).toBe(20);
        expect(data[0].promisable).toBe(30);
        expect(data[1].quoted).toBe(0);
        expect(data[1].promisable).toBe(30);
    });

    it("both dbListProducts and dbGetQuotedQuantities are called in parallel", async () => {
        await GET(makeRequest());
        expect(mockDbListProducts).toHaveBeenCalledTimes(1);
        expect(mockDbGetQuotedQuantities).toHaveBeenCalledTimes(1);
    });
});

// forecasted = available_now + incoming - quoted
// (available_now = on_hand - reserved, so reserved is NOT subtracted again)
describe("GET /api/products — forecasted enrichment", () => {
    it("forecasted equals available_now when no incoming and no quoted", async () => {
        // on_hand=50, reserved=10 → available_now=40, incoming=0, quoted=0
        // forecasted = 40 + 0 - 0 = 40
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(40);
    });

    it("forecasted adds incoming on top of available_now", async () => {
        // on_hand=50, reserved=10 → available_now=40, incoming=20, quoted=0
        // forecasted = 40 + 20 - 0 = 60
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetIncomingQuantities.mockResolvedValue(new Map([["prod-1", 20]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(60);
    });

    it("forecasted subtracts quoted from available_now+incoming", async () => {
        // on_hand=50, reserved=10 → available_now=40, incoming=20, quoted=15
        // forecasted = 40 + 20 - 15 = 45
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 15]]));
        mockDbGetIncomingQuantities.mockResolvedValue(new Map([["prod-1", 20]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(45);
    });

    it("reserved is NOT double-counted in forecasted", async () => {
        // on_hand=100, reserved=30 → available_now=70
        // incoming=0, quoted=0
        // Correct:   forecasted = 70 + 0 - 0 = 70
        // Old bug:   forecasted = 70 + 0 - 30 - 0 = 40  (reserved double-counted)
        const product = makeProduct("prod-1", 100, 30);
        mockDbListProducts.mockResolvedValue([product]);

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(70); // not 40
    });

    it("forecasted can go negative when quotes exceed available+incoming", async () => {
        // on_hand=20, reserved=10 → available_now=10, incoming=5, quoted=20
        // forecasted = 10 + 5 - 20 = -5
        const product = makeProduct("prod-1", 20, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 20]]));
        mockDbGetIncomingQuantities.mockResolvedValue(new Map([["prod-1", 5]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(-5);
    });

    it("returns 200 with enriched products", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("prod-1", 20, 5)]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 10]]));

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0]).toHaveProperty("quoted", 10);
        expect(data[0]).toHaveProperty("promisable", 5);
    });
});
