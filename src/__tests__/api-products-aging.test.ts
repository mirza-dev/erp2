/**
 * Tests for GET /api/products/aging route.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListProducts       = vi.fn();
const mockDbGetLastSaleDates   = vi.fn();
const mockDbGetLastIncomingDates = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...args: unknown[]) => mockDbListProducts(...args),
    dbCreateProduct: vi.fn(),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/aging", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/supabase/aging")>();
    return {
        ...actual,  // pickMax, computeAgingCategory — real implementations
        dbGetLastSaleDates:    (...args: unknown[]) => mockDbGetLastSaleDates(...args),
        dbGetLastIncomingDates: (...args: unknown[]) => mockDbGetLastIncomingDates(...args),
    };
});

import { GET } from "@/app/api/products/aging/route";

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(): NextRequest {
    return new NextRequest("http://localhost/api/products/aging", { method: "GET" });
}

function makeProduct(id: string, overrides: Partial<{
    on_hand: number; price: number; currency: string; category: string | null;
}> = {}) {
    return {
        id,
        name: `Product ${id}`,
        sku:  `SKU-${id}`,
        category: null,
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 10,
        reserved: 0,
        available_now: 10,
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
        ...overrides,
    };
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListProducts.mockResolvedValue([]);
    mockDbGetLastSaleDates.mockResolvedValue(new Map());
    mockDbGetLastIncomingDates.mockResolvedValue(new Map());
});

// ── Tests ─────────────────────────────────────────────────────

describe("GET /api/products/aging", () => {
    it("returns 200 with empty array when no products", async () => {
        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([]);
    });

    it("filters out products with on_hand = 0", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct("p1", { on_hand: 10 }),
            makeProduct("p2", { on_hand: 0 }),
        ]);
        const data = await (await GET(makeRequest())).json();
        expect(data).toHaveLength(1);
        expect(data[0].productId).toBe("p1");
    });

    it("boundCapital = on_hand * price", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { on_hand: 5, price: 200 })]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row.boundCapital).toBe(1000);
    });

    it("no movement → lastMovementDate null, daysWaiting null, agingCategory no_movement", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1")]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row.lastMovementDate).toBeNull();
        expect(row.daysWaiting).toBeNull();
        expect(row.agingCategory).toBe("no_movement");
    });

    it("saleDate only → lastMovement = saleDate", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1")]);
        mockDbGetLastSaleDates.mockResolvedValue(new Map([["p1", "2020-01-01T00:00:00Z"]]));
        const [row] = await (await GET(makeRequest())).json();
        expect(row.lastMovementDate).toBe("2020-01-01T00:00:00Z");
        expect(row.agingCategory).toBe("dead"); // > 180 gün önce
    });

    it("incomingDate only → lastMovement = incomingDate", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1")]);
        mockDbGetLastIncomingDates.mockResolvedValue(new Map([["p1", "2020-06-01T00:00:00Z"]]));
        const [row] = await (await GET(makeRequest())).json();
        expect(row.lastMovementDate).toBe("2020-06-01T00:00:00Z");
        expect(row.agingCategory).toBe("dead");
    });

    it("lastMovement = max(saleDate, incomingDate)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1")]);
        mockDbGetLastSaleDates.mockResolvedValue(new Map([["p1", "2020-01-01T00:00:00Z"]]));
        mockDbGetLastIncomingDates.mockResolvedValue(new Map([["p1", "2020-06-01T00:00:00Z"]]));
        const [row] = await (await GET(makeRequest())).json();
        expect(row.lastMovementDate).toBe("2020-06-01T00:00:00Z");
    });

    it("recent movement → active category", async () => {
        const recent = new Date(Date.now() - 5 * 86_400_000).toISOString(); // 5 gün önce
        mockDbListProducts.mockResolvedValue([makeProduct("p1")]);
        mockDbGetLastSaleDates.mockResolvedValue(new Map([["p1", recent]]));
        const [row] = await (await GET(makeRequest())).json();
        expect(row.agingCategory).toBe("active");
        expect(row.daysWaiting).toBeLessThan(30);
    });

    it("3 fonksiyon paralel çağrılır (her biri 1 kez)", async () => {
        await GET(makeRequest());
        expect(mockDbListProducts).toHaveBeenCalledTimes(1);
        expect(mockDbGetLastSaleDates).toHaveBeenCalledTimes(1);
        expect(mockDbGetLastIncomingDates).toHaveBeenCalledTimes(1);
    });

    it("response includes all required fields", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1")]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row).toHaveProperty("productId");
        expect(row).toHaveProperty("productName");
        expect(row).toHaveProperty("sku");
        expect(row).toHaveProperty("onHand");
        expect(row).toHaveProperty("price");
        expect(row).toHaveProperty("currency");
        expect(row).toHaveProperty("lastMovementDate");
        expect(row).toHaveProperty("daysWaiting");
        expect(row).toHaveProperty("agingCategory");
        expect(row).toHaveProperty("boundCapital");
    });
});
