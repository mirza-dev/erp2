/**
 * Tests for POST /api/ai/purchase-copilot route handler.
 * DB queries and AI service are fully mocked.
 * computeTargetStock / computeCoverageDays / computeUrgencyPct run real (not mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── DB query mock ────────────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...args: unknown[]) => mockDbListProducts(...args),
}));

// ─── AI service mock ──────────────────────────────────────────────────────────

const mockAiEnrichPurchaseSuggestions = vi.fn();
const mockIsAIAvailable = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    aiEnrichPurchaseSuggestions: (...args: unknown[]) => mockAiEnrichPurchaseSuggestions(...args),
    isAIAvailable: () => mockIsAIAvailable(),
}));

// ─── Recommendations mock (non-blocking persistence) ─────────────────────────

const mockDbUpsertRecommendation = vi.fn();
const mockDbExpireSuggestedRecommendations = vi.fn();

vi.mock("@/lib/supabase/recommendations", () => ({
    dbUpsertRecommendation: (...args: unknown[]) => mockDbUpsertRecommendation(...args),
    dbExpireSuggestedRecommendations: (...args: unknown[]) => mockDbExpireSuggestedRecommendations(...args),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";
import { ConfigError } from "@/lib/supabase/service";

// Reset all mocks before every test to prevent state leakage
beforeEach(() => {
    mockDbListProducts.mockReset();
    mockAiEnrichPurchaseSuggestions.mockReset();
    // Default: upsert resolves with a mock rec row; expire resolves with 0
    mockDbUpsertRecommendation.mockResolvedValue({ id: "rec-mock", status: "suggested" });
    mockDbExpireSuggestedRecommendations.mockResolvedValue(0);
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
        on_hand: 5,
        reserved: 0,
        available_now: 5,
        min_stock_level: 20,
        is_active: true,
        product_type: "raw_material",
        warehouse: null,
        reorder_qty: 10,
        preferred_vendor: null,
        daily_usage: 3,
        lead_time_days: 14,
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

// ─── Counts computation ───────────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — counts computation", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
    });

    it("needs_purchase: products where available_now <= min_stock_level", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),   // needs purchase
            makeProduct({ id: "p-2", available_now: 25, min_stock_level: 20 }),  // healthy
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(1);
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

    it("raw_material count is correct", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20, product_type: "raw_material" }),
            makeProduct({ id: "p-2", available_now: 5, min_stock_level: 20, product_type: "finished" }),
            makeProduct({ id: "p-3", available_now: 5, min_stock_level: 20, product_type: "raw_material" }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.counts.raw_material).toBe(2);
    });

    it("finished count is correct", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20, product_type: "raw_material" }),
            makeProduct({ id: "p-2", available_now: 5, min_stock_level: 20, product_type: "finished" }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.counts.finished).toBe(1);
    });
});

// ─── Purchase items filtering ─────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — purchase items filtering", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
    });

    it("products above min_stock_level are excluded from items", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-healthy", available_now: 100, min_stock_level: 20 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items.find((i: { productId: string }) => i.productId === "p-healthy")).toBeUndefined();
    });

    it("products at or below min_stock_level are included in items", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-at-min", available_now: 20, min_stock_level: 20 }),
            makeProduct({ id: "p-below-min", available_now: 5, min_stock_level: 20 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items.find((i: { productId: string }) => i.productId === "p-at-min")).toBeDefined();
        expect(body.items.find((i: { productId: string }) => i.productId === "p-below-min")).toBeDefined();
    });

    it("each item has suggestQty", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(typeof body.items[0].suggestQty).toBe("number");
        expect(body.items[0].suggestQty).toBeGreaterThan(0);
    });

    it("each item has formula field", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(["lead_time", "fallback"]).toContain(body.items[0].formula);
    });
});

// ─── AI unavailable ───────────────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — AI unavailable", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
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

    it("deterministic fields are populated", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(typeof item.suggestQty).toBe("number");
        expect(typeof item.formula).toBe("string");
        expect(typeof item.urgencyPct).toBe("number");
    });

    it("AI fields are null", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.aiWhyNow).toBeNull();
        expect(item.aiQuantityRationale).toBeNull();
        expect(item.aiUrgencyLevel).toBeNull();
        expect(item.aiConfidence).toBeNull();
    });

    it("AI NOT called when unavailable", async () => {
        await POST();
        expect(mockAiEnrichPurchaseSuggestions).not.toHaveBeenCalled();
    });
});

// ─── AI available happy path ──────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — AI available happy path", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [{
                productId: "p-1",
                whyNow: "Stok 2 günde tükenecek, tedarik süresi 14 gün.",
                quantityRationale: "50 adet tedarik süresini ve emniyet stoğunu karşılar.",
                urgencyLevel: "critical",
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

    it("aiWhyNow is populated", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiWhyNow).toBe("Stok 2 günde tükenecek, tedarik süresi 14 gün.");
    });

    it("aiQuantityRationale is populated", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiQuantityRationale).toBe("50 adet tedarik süresini ve emniyet stoğunu karşılar.");
    });

    it("aiConfidence is a number", async () => {
        const res = await POST();
        const body = await res.json();
        expect(typeof body.items[0].aiConfidence).toBe("number");
    });

    it("deterministic fields still populated alongside AI fields", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(typeof item.suggestQty).toBe("number");
        expect(typeof item.formula).toBe("string");
    });
});

// ─── AI error graceful degradation ───────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — AI error graceful degradation", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        mockAiEnrichPurchaseSuggestions.mockRejectedValue(new Error("AI service unavailable"));
    });

    it("returns HTTP 200 (AI error doesn't bring down route)", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("deterministic fields still populated", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].suggestQty).toBeGreaterThan(0);
    });

    it("AI fields are null when AI threw", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.aiWhyNow).toBeNull();
        expect(item.aiQuantityRationale).toBeNull();
        expect(item.aiConfidence).toBeNull();
    });
});

// ─── DB error ─────────────────────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — DB error", () => {
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

// ─── No products needing purchase ─────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — no products needing purchase", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-healthy", available_now: 100, min_stock_level: 20 }),
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

    it("needs_purchase count is 0", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(0);
    });

    it("AI NOT called when no products need purchase", async () => {
        await POST();
        expect(mockAiEnrichPurchaseSuggestions).not.toHaveBeenCalled();
    });
});

// ─── Deterministic computation ────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — deterministic computation", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
    });

    it("suggestQty uses MOQ rounding", async () => {
        // available=5, min=20, moq=10, dailyUsage=3, leadTimeDays=14
        // target = 3*14 + 20 = 62, needed = 62-5 = 57, ceil(57/10)*10 = 60
        mockDbListProducts.mockResolvedValue([
            makeProduct({ available_now: 5, min_stock_level: 20, reorder_qty: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].suggestQty).toBe(60);
    });

    it("formula='lead_time' when dailyUsage and leadTimeDays available", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ available_now: 5, min_stock_level: 20, daily_usage: 3, lead_time_days: 14 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].formula).toBe("lead_time");
    });

    it("formula='fallback' when no dailyUsage", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ available_now: 5, min_stock_level: 20, daily_usage: null, lead_time_days: null }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].formula).toBe("fallback");
    });

    it("coverageDays computed correctly from available and dailyUsage", async () => {
        // available=6, dailyUsage=3 → coverageDays = round(6/3) = 2
        mockDbListProducts.mockResolvedValue([
            makeProduct({ available_now: 6, min_stock_level: 20, daily_usage: 3 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].coverageDays).toBe(2);
    });
});

// ─── Block A: Partial AI enrichment (per-item) ────────────────────────────────

describe("POST /api/ai/purchase-copilot — partial AI enrichment (per-item)", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
            makeProduct({ id: "p-2", available_now: 3, min_stock_level: 20 }),
            makeProduct({ id: "p-3", available_now: 1, min_stock_level: 20 }),
        ]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [
                { productId: "p-1", whyNow: "Critical stock", quantityRationale: "Order 50", urgencyLevel: "critical", confidence: 0.9 },
                { productId: "p-3", whyNow: "Low stock", quantityRationale: "Order 30", urgencyLevel: "high", confidence: 0.7 },
            ],
            generatedAt: new Date().toISOString(),
        });
    });

    it("matched products have AI fields populated", async () => {
        const res = await POST();
        const body = await res.json();
        const p1 = body.items.find((i: { productId: string }) => i.productId === "p-1");
        const p3 = body.items.find((i: { productId: string }) => i.productId === "p-3");
        expect(p1.aiWhyNow).not.toBeNull();
        expect(p3.aiWhyNow).not.toBeNull();
    });

    it("unmatched product has null AI fields", async () => {
        const res = await POST();
        const body = await res.json();
        const p2 = body.items.find((i: { productId: string }) => i.productId === "p-2");
        expect(p2.aiWhyNow).toBeNull();
        expect(p2.aiQuantityRationale).toBeNull();
        expect(p2.aiUrgencyLevel).toBeNull();
        expect(p2.aiConfidence).toBeNull();
    });

    it("unmatched product still has deterministic fields", async () => {
        const res = await POST();
        const body = await res.json();
        const p2 = body.items.find((i: { productId: string }) => i.productId === "p-2");
        expect(p2.suggestQty).toBeGreaterThan(0);
        expect(["lead_time", "fallback"]).toContain(p2.formula);
        expect(typeof p2.urgencyPct).toBe("number");
    });

    it("all 3 products appear in items", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items.length).toBe(3);
    });
});

// ─── Block B: Route decoupling ────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — route decoupling", () => {
    it("route.ts does not import purchase-service", () => {
        const routePath = resolve(process.cwd(), "src/app/api/ai/purchase-copilot/route.ts");
        const source = readFileSync(routePath, "utf-8");
        expect(source).not.toContain("purchase-service");
    });
});

// ─── Block C: Domain §11.1 mutation prevention ────────────────────────────────

describe("POST /api/ai/purchase-copilot — §11.1 mutation prevention", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
    });

    it("route calls dbListProducts once", async () => {
        await POST();
        expect(mockDbListProducts).toHaveBeenCalledTimes(1);
    });

    it("response contains expected top-level keys including recommendations", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body).not.toHaveProperty("alertId");
        expect(body).not.toHaveProperty("orderId");
        expect(body).not.toHaveProperty("stockMutation");
        expect(Object.keys(body).sort()).toEqual(["ai_available", "counts", "generatedAt", "items", "recommendations"]);
    });

    it("route does not import alert-service, order-service, or production-service", () => {
        const routePath = resolve(process.cwd(), "src/app/api/ai/purchase-copilot/route.ts");
        const source = readFileSync(routePath, "utf-8");
        expect(source).not.toContain("alert-service");
        expect(source).not.toContain("order-service");
        expect(source).not.toContain("production-service");
    });
});

// ─── Block D: AI returns empty enrichments ────────────────────────────────────

describe("POST /api/ai/purchase-copilot — AI returns empty enrichments", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
            makeProduct({ id: "p-2", available_now: 3, min_stock_level: 20 }),
        ]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [],
            generatedAt: new Date().toISOString(),
        });
    });

    it("all items have null AI fields", async () => {
        const res = await POST();
        const body = await res.json();
        for (const item of body.items) {
            expect(item.aiWhyNow).toBeNull();
            expect(item.aiConfidence).toBeNull();
        }
    });

    it("deterministic fields still populated", async () => {
        const res = await POST();
        const body = await res.json();
        for (const item of body.items) {
            expect(item.suggestQty).toBeGreaterThan(0);
            expect(typeof item.urgencyPct).toBe("number");
        }
    });

    it("returns HTTP 200", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });
});

// ─── Block E: Sort order ──────────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — sort order", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-mid",  available_now: 5, min_stock_level: 20, daily_usage: 1 }),   // coverageDays=5
            makeProduct({ id: "p-high", available_now: 6, min_stock_level: 20, daily_usage: 1 }),   // coverageDays=6
            makeProduct({ id: "p-null", available_now: 5, min_stock_level: 20, daily_usage: null }), // coverageDays=null
            makeProduct({ id: "p-low",  available_now: 1, min_stock_level: 20, daily_usage: 1 }),   // coverageDays=1
        ]);
    });

    it("null coverageDays items appear first", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].productId).toBe("p-null");
    });

    it("items sorted ascending by coverageDays after nulls", async () => {
        const res = await POST();
        const body = await res.json();
        const ids = body.items.map((i: { productId: string }) => i.productId);
        expect(ids).toEqual(["p-null", "p-low", "p-mid", "p-high"]);
    });
});

// ─── Block F: Domain §7.3 — deterministic base alongside AI ──────────────────

describe("POST /api/ai/purchase-copilot — §7.3 deterministic base alongside AI", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20, daily_usage: 3, lead_time_days: 14 }),
        ]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [{
                productId: "p-1",
                whyNow: "Stock critical",
                quantityRationale: "Order to cover lead time",
                urgencyLevel: "critical",
                confidence: 0.9,
            }],
            generatedAt: new Date().toISOString(),
        });
    });

    it("all four deterministic fields present when AI enriches", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.suggestQty).toBeGreaterThan(0);
        expect(["lead_time", "fallback"]).toContain(item.formula);
        expect(item.urgencyPct).toBeGreaterThanOrEqual(0);
        expect(item.urgencyPct).toBeLessThanOrEqual(100);
        expect(typeof item.coverageDays).toBe("number");
    });
});

// ─── Block H: Response item schema contract ───────────────────────────────────

describe("POST /api/ai/purchase-copilot — response item schema contract", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [{
                productId: "p-1",
                whyNow: "Stok kritik.",
                quantityRationale: "50 adet yeterli.",
                urgencyLevel: "critical",
                confidence: 0.9,
            }],
            generatedAt: new Date().toISOString(),
        });
    });

    it("each item has all 21 expected fields", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        const expectedFields = [
            "aiConfidence", "aiQuantityRationale", "aiUrgencyLevel", "aiWhyNow",
            "available", "coverageDays", "dailyUsage", "formula",
            "leadTimeDays", "leadTimeDemand", "min", "moq",
            "preferredVendor", "productId", "productName", "productType",
            "sku", "suggestQty", "targetStock", "unit", "urgencyPct",
        ];
        expect(Object.keys(item).sort()).toEqual(expectedFields);
    });

    it("AI fields match frontend AiEnrichmentItem contract", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(typeof item.productId).toBe("string");
        expect(item.aiWhyNow === null || typeof item.aiWhyNow === "string").toBe(true);
        expect(item.aiQuantityRationale === null || typeof item.aiQuantityRationale === "string").toBe(true);
        expect(item.aiUrgencyLevel === null || ["critical", "high", "moderate"].includes(item.aiUrgencyLevel)).toBe(true);
        expect(item.aiConfidence === null || typeof item.aiConfidence === "number").toBe(true);
    });

    it("aiUrgencyLevel is always null or valid enum", async () => {
        // AI unavailable → null
        mockIsAIAvailable.mockReturnValue(false);
        const resNoAi = await POST();
        const bodyNoAi = await resNoAi.json();
        expect(bodyNoAi.items[0].aiUrgencyLevel).toBeNull();

        // AI available → one of the valid enum values
        mockIsAIAvailable.mockReturnValue(true);
        const resWithAi = await POST();
        const bodyWithAi = await resWithAi.json();
        expect(["critical", "high", "moderate"]).toContain(bodyWithAi.items[0].aiUrgencyLevel);
    });
});

// ─── Block I: AI enrichment mapping robustness ────────────────────────────────

describe("POST /api/ai/purchase-copilot — AI enrichment mapping robustness", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
            makeProduct({ id: "p-2", available_now: 3, min_stock_level: 20 }),
        ]);
    });

    it("AI enrichments in different order → correct mapping", async () => {
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [
                { productId: "p-2", whyNow: "P2 why", quantityRationale: "P2 qty", urgencyLevel: "high", confidence: 0.7 },
                { productId: "p-1", whyNow: "P1 why", quantityRationale: "P1 qty", urgencyLevel: "critical", confidence: 0.9 },
            ],
            generatedAt: new Date().toISOString(),
        });
        const res = await POST();
        const body = await res.json();
        const p1 = body.items.find((i: { productId: string }) => i.productId === "p-1");
        const p2 = body.items.find((i: { productId: string }) => i.productId === "p-2");
        expect(p1.aiWhyNow).toBe("P1 why");
        expect(p1.aiUrgencyLevel).toBe("critical");
        expect(p2.aiWhyNow).toBe("P2 why");
        expect(p2.aiUrgencyLevel).toBe("high");
    });

    it("AI enrichment for unknown productId → silently ignored", async () => {
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [
                { productId: "p-1", whyNow: "P1 why", quantityRationale: "P1 qty", urgencyLevel: "critical", confidence: 0.9 },
                { productId: "p-2", whyNow: "P2 why", quantityRationale: "P2 qty", urgencyLevel: "high", confidence: 0.7 },
                { productId: "p-unknown", whyNow: "Ghost", quantityRationale: "N/A", urgencyLevel: "moderate", confidence: 0.5 },
            ],
            generatedAt: new Date().toISOString(),
        });
        const res = await POST();
        const body = await res.json();
        expect(body.items.length).toBe(2);
        expect(body.items.find((i: { productId: string }) => i.productId === "p-unknown")).toBeUndefined();
        const p1 = body.items.find((i: { productId: string }) => i.productId === "p-1");
        const p2 = body.items.find((i: { productId: string }) => i.productId === "p-2");
        expect(p1.aiWhyNow).toBe("P1 why");
        expect(p2.aiWhyNow).toBe("P2 why");
    });
});

// ─── Block J: Deterministic edge cases ───────────────────────────────────────

describe("POST /api/ai/purchase-copilot — deterministic edge cases", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
    });

    it("daily_usage = 0 → coverageDays null, formula 'fallback'", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ available_now: 5, min_stock_level: 20, daily_usage: 0 }),
        ]);
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.coverageDays).toBeNull();
        expect(item.formula).toBe("fallback");
    });

    it("reorder_qty = null → moq falls back to min_stock_level", async () => {
        // min=20, reorder_qty=null → moq=20
        // available=5, target=20*2=40 (fallback, no dailyUsage), needed=35, ceil(35/20)*20=40
        mockDbListProducts.mockResolvedValue([
            makeProduct({ available_now: 5, min_stock_level: 20, reorder_qty: null, daily_usage: null }),
        ]);
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.moq).toBe(20);
        expect(item.suggestQty % 20).toBe(0);
        expect(item.suggestQty).toBeGreaterThan(0);
    });

    it("available_now = 0 → urgencyPct = 100, suggestQty > 0", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ available_now: 0, min_stock_level: 20 }),
        ]);
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.urgencyPct).toBe(100);
        expect(item.suggestQty).toBeGreaterThan(0);
    });
});
