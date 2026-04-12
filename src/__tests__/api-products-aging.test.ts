/**
 * Tests for GET /api/products/aging route.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListProducts              = vi.fn();
const mockDbGetLastSaleDates          = vi.fn();
const mockDbGetLastIncomingDates      = vi.fn();
const mockDbGetLastProductionDates    = vi.fn();
const mockDbGetLastComponentUsageDates = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...args: unknown[]) => mockDbListProducts(...args),
    dbCreateProduct: vi.fn(),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/aging", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/supabase/aging")>();
    return {
        ...actual,  // pickMax, computeAgingCategoryRaw, computeAgingCategoryFinished — real implementations
        dbGetLastSaleDates:             (...args: unknown[]) => mockDbGetLastSaleDates(...args),
        dbGetLastIncomingDates:         (...args: unknown[]) => mockDbGetLastIncomingDates(...args),
        dbGetLastProductionDates:       (...args: unknown[]) => mockDbGetLastProductionDates(...args),
        dbGetLastComponentUsageDates:   (...args: unknown[]) => mockDbGetLastComponentUsageDates(...args),
    };
});

import { GET } from "@/app/api/products/aging/route";

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(type?: string): NextRequest {
    const url = type
        ? `http://localhost/api/products/aging?type=${type}`
        : "http://localhost/api/products/aging";
    return new NextRequest(url, { method: "GET" });
}

function makeProduct(id: string, overrides: Partial<{
    on_hand: number; price: number; currency: string; category: string | null;
    product_type: "raw_material" | "manufactured" | "commercial";
    is_for_sales: boolean; is_for_purchase: boolean;
    cost_price: number | null;
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
        product_type: "manufactured" as const,
        is_for_sales: true,
        is_for_purchase: true,
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
    mockDbGetLastProductionDates.mockResolvedValue(new Map());
    mockDbGetLastComponentUsageDates.mockResolvedValue(new Map());
});

// ── Temel testler ─────────────────────────────────────────────

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

    it("boundCapital = on_hand * price (cost_price yoksa)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { on_hand: 5, price: 200 })]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row.boundCapital).toBe(1000);
    });

    it("boundCapital = on_hand * cost_price (cost_price varsa)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { on_hand: 5, price: 200, cost_price: 80 })]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row.boundCapital).toBe(400); // 5 * 80
        expect(row.costPrice).toBe(80);
    });

    it("no movement → lastMovementDate null, daysWaiting null, agingCategory no_movement", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1")]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row.lastMovementDate).toBeNull();
        expect(row.daysWaiting).toBeNull();
        expect(row.agingCategory).toBe("no_movement");
    });

    it("5 fonksiyon paralel çağrılır (her biri 1 kez)", async () => {
        await GET(makeRequest());
        expect(mockDbListProducts).toHaveBeenCalledTimes(1);
        expect(mockDbGetLastSaleDates).toHaveBeenCalledTimes(1);
        expect(mockDbGetLastIncomingDates).toHaveBeenCalledTimes(1);
        expect(mockDbGetLastProductionDates).toHaveBeenCalledTimes(1);
        expect(mockDbGetLastComponentUsageDates).toHaveBeenCalledTimes(1);
    });

    it("dbListProducts pageSize: 10_000 ile çağrılır (pagination bypass)", async () => {
        await GET(makeRequest());
        expect(mockDbListProducts).toHaveBeenCalledWith(
            expect.objectContaining({ pageSize: 10_000 })
        );
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
        expect(row).toHaveProperty("productType");
        expect(row).toHaveProperty("isForSales");
        expect(row).toHaveProperty("isForPurchase");
        expect(row).toHaveProperty("lastMovementDate");
        expect(row).toHaveProperty("lastSaleDate");
        expect(row).toHaveProperty("lastIncomingDate");
        expect(row).toHaveProperty("lastProductionDate");
        expect(row).toHaveProperty("lastComponentUsageDate");
        expect(row).toHaveProperty("daysWaiting");
        expect(row).toHaveProperty("agingCategory");
        expect(row).toHaveProperty("costPrice");
        expect(row).toHaveProperty("boundCapital");
    });
});

// ── type=raw_material ─────────────────────────────────────────

describe("GET /api/products/aging?type=raw_material", () => {
    it("sadece raw_material ürünleri döner", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct("p1", { product_type: "manufactured",     is_for_sales: true }),
            makeProduct("p2", { product_type: "raw_material", is_for_sales: false }),
            makeProduct("p3", { product_type: "raw_material", is_for_sales: true }),
        ]);
        const data = await (await GET(makeRequest("raw_material"))).json();
        expect(data.every((r: { productType: string }) => r.productType === "raw_material")).toBe(true);
        expect(data).toHaveLength(2);
    });

    it("lastMovement = MAX(incoming, componentUsage) — satış tarihi dahil değil", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { product_type: "raw_material" })]);
        mockDbGetLastSaleDates.mockResolvedValue(new Map([["p1", "2025-01-01T00:00:00Z"]]));         // çok yeni ama kullanılmaz
        mockDbGetLastIncomingDates.mockResolvedValue(new Map([["p1", "2020-03-01T00:00:00Z"]]));
        mockDbGetLastComponentUsageDates.mockResolvedValue(new Map([["p1", "2020-06-01T00:00:00Z"]]));
        const [row] = await (await GET(makeRequest("raw_material"))).json();
        // lastMovement = MAX(incoming "2020-03-01", componentUsage "2020-06-01") = "2020-06-01"
        // NOT "2025-01-01" (saleDate), NOT production_entries (mamul tarihidir)
        expect(row.lastMovementDate).toBe("2020-06-01T00:00:00Z");
    });

    it("computeAgingCategoryRaw eşiklerini kullanır (60 gün → slow)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { product_type: "raw_material" })]);
        const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
        mockDbGetLastIncomingDates.mockResolvedValue(new Map([["p1", sixtyDaysAgo]]));
        const [row] = await (await GET(makeRequest("raw_material"))).json();
        expect(row.agingCategory).toBe("slow");
    });

    it("computeAgingCategoryRaw: 45 gün → active; componentUsage tarihi kullanılır", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { product_type: "raw_material" })]);
        const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000).toISOString();
        mockDbGetLastComponentUsageDates.mockResolvedValue(new Map([["p1", fortyFiveDaysAgo]]));
        const [row] = await (await GET(makeRequest("raw_material"))).json();
        expect(row.agingCategory).toBe("active"); // raw: < 60 = active
    });
});

// ── type=manufactured ─────────────────────────────────────────

describe("GET /api/products/aging?type=manufactured", () => {
    it("sadece manufactured ürünleri döner", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct("p1", { product_type: "manufactured" }),
            makeProduct("p2", { product_type: "commercial" }),
            makeProduct("p3", { product_type: "raw_material" }),
        ]);
        const data = await (await GET(makeRequest("manufactured"))).json();
        expect(data.every((r: { productType: string }) => r.productType === "manufactured")).toBe(true);
        expect(data).toHaveLength(1);
    });

    it("lastMovement = MAX(production, sale) — incoming tarihi dahil değil", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { product_type: "manufactured" })]);
        mockDbGetLastIncomingDates.mockResolvedValue(new Map([["p1", "2025-01-01T00:00:00Z"]])); // çok yeni ama kullanılmaz
        mockDbGetLastSaleDates.mockResolvedValue(new Map([["p1", "2020-03-01T00:00:00Z"]]));
        mockDbGetLastProductionDates.mockResolvedValue(new Map([["p1", "2020-06-01"]]));
        const [row] = await (await GET(makeRequest("manufactured"))).json();
        // lastMovement = MAX(production "2020-06-01", sale "2020-03-01") = "2020-06-01"
        // NOT "2025-01-01" (incomingDate)
        expect(row.lastMovementDate).toBe("2020-06-01");
    });

    it("computeAgingCategoryFinished eşiklerini kullanır (45 gün → slow)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { product_type: "manufactured" })]);
        const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000).toISOString();
        mockDbGetLastSaleDates.mockResolvedValue(new Map([["p1", fortyFiveDaysAgo]]));
        const [row] = await (await GET(makeRequest("manufactured"))).json();
        expect(row.agingCategory).toBe("slow");
    });

    it("recent sale → active (< 45 gün)", async () => {
        const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { product_type: "manufactured" })]);
        mockDbGetLastSaleDates.mockResolvedValue(new Map([["p1", recent]]));
        const [row] = await (await GET(makeRequest("manufactured"))).json();
        expect(row.agingCategory).toBe("active");
    });
});

// ── type=commercial ──────────────────────────────────────────

describe("GET /api/products/aging?type=commercial", () => {
    it("sadece commercial ürünleri döner", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct("p1", { product_type: "commercial" }),
            makeProduct("p2", { product_type: "manufactured" }),
            makeProduct("p3", { product_type: "raw_material" }),
        ]);
        const data = await (await GET(makeRequest("commercial"))).json();
        expect(data.every((r: { productType: string }) => r.productType === "commercial")).toBe(true);
        expect(data).toHaveLength(1);
    });

    it("lastMovement = MAX(incoming, sale) — production tarihi dahil değil", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { product_type: "commercial" })]);
        mockDbGetLastProductionDates.mockResolvedValue(new Map([["p1", "2025-01-01"]])); // çok yeni ama kullanılmaz
        mockDbGetLastIncomingDates.mockResolvedValue(new Map([["p1", "2020-03-01T00:00:00Z"]]));
        mockDbGetLastSaleDates.mockResolvedValue(new Map([["p1", "2020-06-01T00:00:00Z"]]));
        const [row] = await (await GET(makeRequest("commercial"))).json();
        // lastMovement = MAX(incoming "2020-03-01", sale "2020-06-01") = "2020-06-01"
        // NOT "2025-01-01" (productionDate)
        expect(row.lastMovementDate).toBe("2020-06-01T00:00:00Z");
    });

    it("computeAgingCategoryFinished eşiklerini kullanır (45 gün → slow)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("p1", { product_type: "commercial" })]);
        const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000).toISOString();
        mockDbGetLastIncomingDates.mockResolvedValue(new Map([["p1", fortyFiveDaysAgo]]));
        const [row] = await (await GET(makeRequest("commercial"))).json();
        expect(row.agingCategory).toBe("slow");
    });
});

// ── type=all (default) ────────────────────────────────────────

describe("GET /api/products/aging (type=all — default)", () => {
    it("tüm ürünleri döner (raw_material + finished)", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct("p1", { product_type: "manufactured" }),
            makeProduct("p2", { product_type: "raw_material" }),
        ]);
        const data = await (await GET(makeRequest())).json();
        expect(data).toHaveLength(2);
    });
});

// ── Sıralama ──────────────────────────────────────────────────

describe("Sıralama — daysWaiting DESC", () => {
    it("en uzun bekleyen üstte, null en sonda", async () => {
        const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
        const old    = new Date(Date.now() - 200 * 86_400_000).toISOString();
        mockDbListProducts.mockResolvedValue([
            makeProduct("p1"),  // no movement → null
            makeProduct("p2"),
            makeProduct("p3"),
        ]);
        mockDbGetLastSaleDates.mockResolvedValue(new Map([
            ["p2", recent],
            ["p3", old],
        ]));
        const data = await (await GET(makeRequest())).json();
        // p3 (200 gün) > p2 (5 gün) > p1 (null)
        expect(data[0].productId).toBe("p3");
        expect(data[1].productId).toBe("p2");
        expect(data[2].productId).toBe("p1");
    });
});
