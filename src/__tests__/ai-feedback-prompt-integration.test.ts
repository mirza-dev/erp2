/**
 * Faz 8 — purchase-copilot/route.ts ↔ dbGetRecentRejectionsForProducts entegrasyonu.
 *
 * Mocks:
 * - dbGetRecentRejectionsForProducts: controlled rejection map per scenario
 * - aiEnrichPurchaseSuggestions: spy — items'da recentRejections alanı doğrulanır
 * - supabase/products + recommendations: tipik test stub'ları
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

const mockAiEnrichPurchaseSuggestions = vi.fn();
const mockDbGetRecentRejectionsForProducts = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => true,
    aiEnrichPurchaseSuggestions: (...a: unknown[]) => mockAiEnrichPurchaseSuggestions(...a),
}));

vi.mock("@/lib/supabase/ai-feedback", () => ({
    dbGetRecentRejectionsForProducts: (...a: unknown[]) => mockDbGetRecentRejectionsForProducts(...a),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: vi.fn().mockResolvedValue([{
        id: "p-1",
        name: "Test Ürün",
        sku: "T-1",
        category: "V",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 5,
        reserved: 0,
        available_now: 5,
        min_stock_level: 20,
        is_active: true,
        product_type: "commercial",
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
    } as ProductWithStock]),
    dbGetAllActiveProductIds: vi.fn().mockResolvedValue([]),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/recommendations", () => ({
    dbUpsertRecommendation: vi.fn().mockResolvedValue({ id: "r", status: "suggested", decided_at: null }),
    dbExpireSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireAllSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireStaleRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireRecommendationsForMissingEntities: vi.fn().mockResolvedValue(0),
    dbGetActiveRecommendationsForEntities: vi.fn().mockResolvedValue([]),
    dbListRecommendations: vi.fn().mockResolvedValue([]),
    dbUpdateRecommendationMetadata: vi.fn().mockResolvedValue(undefined),
    dbUpdateSuggestedRecommendation: vi.fn().mockResolvedValue({ id: "r", status: "suggested", decided_at: null }),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "u-1" } } }) },
    }),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";

beforeEach(() => {
    mockAiEnrichPurchaseSuggestions.mockReset().mockResolvedValue({
        enrichments: [{
            productId: "p-1",
            whyNow: "stok kritik",
            quantityRationale: "10 adet uygun",
            urgencyLevel: "critical",
            confidence: 0.85,
        }],
        generatedAt: new Date().toISOString(),
        hadError: false,
    });
    mockDbGetRecentRejectionsForProducts.mockReset();
});

describe("Faz 8 — recentRejections route entegrasyonu", () => {
    it("1. 0 rejection → recentRejections alanı items'a yazılmaz (token tasarrufu)", async () => {
        mockDbGetRecentRejectionsForProducts.mockResolvedValue(new Map());
        await POST();

        expect(mockAiEnrichPurchaseSuggestions).toHaveBeenCalledTimes(1);
        const items = mockAiEnrichPurchaseSuggestions.mock.calls[0][0] as Array<Record<string, unknown>>;
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(item.recentRejections).toBeUndefined();
        }
    });

    it("2. 3 rejection → recentRejections alanı dolu, sıralı, sanitize edilmiş şekilde geçer", async () => {
        mockDbGetRecentRejectionsForProducts.mockResolvedValue(
            new Map([["p-1", ["MOQ yüksek", "Fiyat artmış", "Şu an gerek yok"]]]),
        );
        await POST();

        const items = mockAiEnrichPurchaseSuggestions.mock.calls[0][0] as Array<Record<string, unknown>>;
        const target = items.find(i => i.productId === "p-1");
        expect(target).toBeDefined();
        expect(target!.recentRejections).toEqual(["MOQ yüksek", "Fiyat artmış", "Şu an gerek yok"]);
    });

    it("3. dbGetRecentRejectionsForProducts throw → AI çağrısı recentRejections olmadan devam eder (degrade)", async () => {
        mockDbGetRecentRejectionsForProducts.mockRejectedValue(new Error("rpc-fail"));

        const res = await POST();
        expect(res.status).toBe(200);
        expect(mockAiEnrichPurchaseSuggestions).toHaveBeenCalledTimes(1);
        const items = mockAiEnrichPurchaseSuggestions.mock.calls[0][0] as Array<Record<string, unknown>>;
        for (const item of items) {
            expect(item.recentRejections).toBeUndefined();
        }
    });

    it("4. AI output sözleşmesi değişmemiştir (whyNow / quantityRationale / urgencyLevel / confidence)", async () => {
        mockDbGetRecentRejectionsForProducts.mockResolvedValue(new Map([["p-1", ["MOQ yüksek"]]]));
        const res = await POST();
        const body = await res.json() as { items: Array<Record<string, unknown>> };

        const enriched = body.items.find(i => i.productId === "p-1");
        expect(enriched).toBeDefined();
        // AI alanları upstream contract'i ile uyumlu (route camelCase yayınlar)
        expect(typeof enriched!.aiWhyNow).toBe("string");
        expect(typeof enriched!.aiQuantityRationale).toBe("string");
        expect(["critical", "high", "moderate"]).toContain(enriched!.aiUrgencyLevel);
        expect(typeof enriched!.aiConfidence).toBe("number");
    });
});
