/**
 * G11 audit 3. tur Fix 3 — AI servis hadError flag → route ai_call_failed.
 *
 * Önceki: aiEnrichPurchaseSuggestions throw etmeyip catch içinde graceful
 * degradation yapıyor (boş enrichments dönüyor); route sadece try/catch ile
 * algıladığından gerçek API hatalarında ai_call_failed=false kalıyordu →
 * UI banner gösterilmiyordu.
 *
 * Yeni: servis result.hadError döner; route bunu okuyup ai_call_failed=true
 * set eder; UI banner doğru gösterilir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

const mockAiEnrichPurchaseSuggestions = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => true,
    aiEnrichPurchaseSuggestions: (...a: unknown[]) => mockAiEnrichPurchaseSuggestions(...a),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: vi.fn().mockResolvedValue([{
        id: "p-1",
        name: "Test",
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
    mockAiEnrichPurchaseSuggestions.mockReset();
});

describe("Fix 3 — AI hadError flag → ai_call_failed", () => {
    it("hadError: true → ai_call_failed: true (graceful degradation)", async () => {
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [],
            generatedAt: new Date().toISOString(),
            hadError: true,
        });
        const res = await POST();
        const body = await res.json();
        expect(body.ai_call_failed).toBe(true);
    });

    it("hadError: false → ai_call_failed: false (happy path)", async () => {
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [{
                productId: "p-1",
                whyNow: "x",
                quantityRationale: "y",
                urgencyLevel: "critical",
                confidence: 0.8,
            }],
            generatedAt: new Date().toISOString(),
            hadError: false,
        });
        const res = await POST();
        const body = await res.json();
        expect(body.ai_call_failed).toBe(false);
    });

    it("aiEnrichPurchaseSuggestions throw → ai_call_failed: true (regresyon)", async () => {
        mockAiEnrichPurchaseSuggestions.mockRejectedValue(new Error("network"));
        const res = await POST();
        const body = await res.json();
        expect(body.ai_call_failed).toBe(true);
    });

    it("hadError: true ama enrichments dolu (kısmi başarı) → ai_call_failed: true", async () => {
        // Defansif: hadError flag her zaman ai_call_failed'i belirler
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [{ productId: "p-1", whyNow: "x", quantityRationale: "y", urgencyLevel: "critical", confidence: 0.5 }],
            generatedAt: new Date().toISOString(),
            hadError: true,
        });
        const res = await POST();
        const body = await res.json();
        expect(body.ai_call_failed).toBe(true);
    });
});
