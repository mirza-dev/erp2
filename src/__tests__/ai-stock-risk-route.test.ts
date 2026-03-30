/**
 * Tests for POST /api/ai/stock-risk route handler.
 * DB queries and AI service are fully mocked.
 * computeStockRiskLevel runs real (not mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

// ─── DB query mock ────────────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...args: unknown[]) => mockDbListProducts(...args),
}));

// ─── AI service mock ──────────────────────────────────────────────────────────

const mockAiAssessStockRisk = vi.fn();
const mockIsAIAvailable = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    aiAssessStockRisk: (...args: unknown[]) => mockAiAssessStockRisk(...args),
    isAIAvailable: () => mockIsAIAvailable(),
}));

import { POST } from "@/app/api/ai/stock-risk/route";
import { ConfigError } from "@/lib/supabase/service";
import { isValidISO } from "./test-helpers";

// Reset all mocks before every test to prevent state leakage between describe blocks
beforeEach(() => {
    mockDbListProducts.mockReset();
    mockAiAssessStockRisk.mockReset();
    mockIsAIAvailable.mockReset();
});

// ─── Factory functions ────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "p-1",
        name: "Test Product",
        sku: "TP-001",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 100,
        reserved: 0,
        available_now: 100,
        min_stock_level: 10,
        is_active: true,
        product_type: "finished",
        warehouse: null,
        reorder_qty: null,
        preferred_vendor: null,
        daily_usage: 5,
        lead_time_days: null,
        product_family: null,
        sub_category: null,
        sector_compatibility: null,
        cost_price: null,
        weight_kg: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

// ─── counts computation ───────────────────────────────────────────────────────

describe("POST /api/ai/stock-risk — counts computation", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
    });

    it("critical: products where available_now <= min_stock_level", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 8, min_stock_level: 10 }),   // critical
            makeProduct({ id: "p-2", available_now: 20, min_stock_level: 10 }),  // healthy
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.counts.critical).toBe(1);
    });

    it("warning: available_now > min && available_now <= ceil(min * 1.5)", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 14, min_stock_level: 10 }),  // warning (14 <= 15)
            makeProduct({ id: "p-2", available_now: 20, min_stock_level: 10 }),  // healthy
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.counts.warning).toBe(1);
    });

    it("total_products equals product array length", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1" }),
            makeProduct({ id: "p-2" }),
            makeProduct({ id: "p-3" }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.counts.total_products).toBe(3);
    });

    it("at_risk count only includes non-critical/warning products with risk", async () => {
        mockDbListProducts.mockResolvedValue([
            // critical — excluded from at_risk
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 10, daily_usage: 5 }),
            // warning — excluded from at_risk
            makeProduct({ id: "p-2", available_now: 14, min_stock_level: 10, daily_usage: 5 }),
            // at-risk: available=20, min=10 → above threshold(15), dailyUsage=3, coverageDays=7, leadTimeDays=14 → coverage_risk
            makeProduct({ id: "p-3", available_now: 20, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
            // healthy: available=200, min=10, coverageDays=40 > 30 → none
            makeProduct({ id: "p-4", available_now: 200, min_stock_level: 10, daily_usage: 5 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.counts.at_risk).toBe(1);
    });
});

// ─── risk items filtering ─────────────────────────────────────────────────────

describe("POST /api/ai/stock-risk — risk items filtering", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
    });

    it("critical products are excluded from items array", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-critical", available_now: 5, min_stock_level: 10, daily_usage: 5 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items.find((i: { productId: string }) => i.productId === "p-critical")).toBeUndefined();
    });

    it("warning products are excluded from items array", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-warning", available_now: 14, min_stock_level: 10, daily_usage: 5 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items.find((i: { productId: string }) => i.productId === "p-warning")).toBeUndefined();
    });

    it("products with null dailyUsage are excluded (no fake certainty)", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-no-usage", available_now: 100, min_stock_level: 10, daily_usage: null }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items.find((i: { productId: string }) => i.productId === "p-no-usage")).toBeUndefined();
    });

    it("at-risk products are included in items array", async () => {
        mockDbListProducts.mockResolvedValue([
            // coverage_risk: available=20, min=10 → above threshold(15), coverageDays=round(20/3)=7, leadTimeDays=14
            makeProduct({ id: "p-risk", available_now: 20, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items.find((i: { productId: string }) => i.productId === "p-risk")).toBeDefined();
    });

    it("each item has deterministicReason populated", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-risk", available_now: 20, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(typeof item.deterministicReason).toBe("string");
        expect(item.deterministicReason.length).toBeGreaterThan(0);
    });
});

// ─── AI unavailable ───────────────────────────────────────────────────────────

describe("POST /api/ai/stock-risk — AI unavailable", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-risk", available_now: 20, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
    });

    it("returns HTTP 200", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("ai_available: false", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.ai_available).toBe(false);
    });

    it("deterministicReason is populated", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].deterministicReason.length).toBeGreaterThan(0);
    });

    it("AI fields are null", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.aiExplanation).toBeNull();
        expect(item.aiRecommendation).toBeNull();
        expect(item.aiConfidence).toBeNull();
    });

    it("mockAiAssessStockRisk NOT called", async () => {
        await POST();
        expect(mockAiAssessStockRisk).not.toHaveBeenCalled();
    });
});

// ─── AI available happy path ──────────────────────────────────────────────────

describe("POST /api/ai/stock-risk — AI available happy path", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-risk", available_now: 20, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
        mockAiAssessStockRisk.mockResolvedValue({
            assessments: [{
                productId: "p-risk",
                explanation: "Stok tükenme süresi tedarik süresinden kısa.",
                recommendation: "Hemen sipariş verin.",
                confidence: 0.85,
            }],
            generatedAt: new Date().toISOString(),
        });
    });

    it("returns HTTP 200", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("ai_available: true", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.ai_available).toBe(true);
    });

    it("aiExplanation is populated", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiExplanation).toBe("Stok tükenme süresi tedarik süresinden kısa.");
    });

    it("aiRecommendation is populated", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiRecommendation).toBe("Hemen sipariş verin.");
    });

    it("aiConfidence is a number", async () => {
        const res = await POST();
        const body = await res.json();
        expect(typeof body.items[0].aiConfidence).toBe("number");
    });

    it("deterministicReason still populated alongside AI fields", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].deterministicReason.length).toBeGreaterThan(0);
    });

    it("generatedAt is valid ISO", async () => {
        const res = await POST();
        const body = await res.json();
        expect(isValidISO(body.generatedAt)).toBe(true);
    });
});

// ─── AI error graceful degradation ───────────────────────────────────────────

describe("POST /api/ai/stock-risk — AI error graceful degradation", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-risk", available_now: 20, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
        mockAiAssessStockRisk.mockRejectedValue(new Error("AI service unavailable"));
    });

    it("returns HTTP 200 (not 500 — AI error doesn't bring down route)", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("deterministicReason still populated", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].deterministicReason.length).toBeGreaterThan(0);
    });

    it("AI fields are null when AI threw", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiExplanation).toBeNull();
        expect(body.items[0].aiRecommendation).toBeNull();
        expect(body.items[0].aiConfidence).toBeNull();
    });
});

// ─── DB error ─────────────────────────────────────────────────────────────────

describe("POST /api/ai/stock-risk — DB error", () => {
    it("generic Error → HTTP 500", async () => {
        mockDbListProducts.mockRejectedValue(new Error("DB connection failed"));
        const res = await POST();
        expect(res.status).toBe(500);
    });

    it("generic Error → response has error field", async () => {
        mockDbListProducts.mockRejectedValue(new Error("DB connection failed"));
        const res = await POST();
        const body = await res.json();
        expect(body.error).toBeDefined();
    });

    it("ConfigError → HTTP 503", async () => {
        mockDbListProducts.mockRejectedValue(new ConfigError("MISSING ENV"));
        const res = await POST();
        expect(res.status).toBe(503);
    });

    it("ConfigError → response has code: 'CONFIG_ERROR'", async () => {
        mockDbListProducts.mockRejectedValue(new ConfigError("MISSING ENV"));
        const res = await POST();
        const body = await res.json();
        expect(body.code).toBe("CONFIG_ERROR");
    });
});

// ─── No at-risk products ──────────────────────────────────────────────────────

describe("POST /api/ai/stock-risk — no at-risk products", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            // healthy: available=200, coverageDays=40 > 30, no leadTimeDays
            makeProduct({ id: "p-healthy", available_now: 200, min_stock_level: 10, daily_usage: 5 }),
        ]);
    });

    it("returns HTTP 200", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("items is empty array", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items).toEqual([]);
    });

    it("at_risk count is 0", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.counts.at_risk).toBe(0);
    });

    it("AI is NOT called when no at-risk products", async () => {
        await POST();
        expect(mockAiAssessStockRisk).not.toHaveBeenCalled();
    });
});
