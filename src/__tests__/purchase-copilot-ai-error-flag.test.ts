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
 *
 * Audit 11. tur Fix 1: AI fail sonrası yeniden deneme garantisi — metadata.aiPending
 * flag'i ile diff-merge level aynı olsa bile fresh AI denenir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

const mockAiEnrichPurchaseSuggestions = vi.fn();
const mockUpsertRecommendation = vi.fn().mockResolvedValue({ id: "r", status: "suggested", decided_at: null });
const mockUpdateSuggestedRecommendation = vi.fn().mockResolvedValue({ id: "r", status: "suggested", decided_at: null });
const mockUpdateRecommendationMetadata = vi.fn().mockResolvedValue(undefined);
const mockGetActiveRecommendationsForEntities = vi.fn().mockResolvedValue([]);

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
    dbUpsertRecommendation: (...a: unknown[]) => mockUpsertRecommendation(...a),
    dbExpireSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireAllSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireStaleRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireRecommendationsForMissingEntities: vi.fn().mockResolvedValue(0),
    dbGetActiveRecommendationsForEntities: (...a: unknown[]) => mockGetActiveRecommendationsForEntities(...a),
    dbListRecommendations: vi.fn().mockResolvedValue([]),
    dbUpdateRecommendationMetadata: (...a: unknown[]) => mockUpdateRecommendationMetadata(...a),
    dbUpdateSuggestedRecommendation: (...a: unknown[]) => mockUpdateSuggestedRecommendation(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "u-1" } } }) },
    }),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";

beforeEach(() => {
    mockAiEnrichPurchaseSuggestions.mockReset();
    mockUpsertRecommendation.mockReset().mockResolvedValue({ id: "r", status: "suggested", decided_at: null });
    mockUpdateSuggestedRecommendation.mockReset().mockResolvedValue({ id: "r", status: "suggested", decided_at: null });
    mockUpdateRecommendationMetadata.mockReset().mockResolvedValue(undefined);
    mockGetActiveRecommendationsForEntities.mockReset().mockResolvedValue([]);
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

// ─── Audit 11. tur Fix 1 — aiPending flag senaryoları ──────────────────────
//
// AI fail durumunda metadata.aiPending=true yazılır → bir sonraki cron'da
// diff-merge level aynı olsa bile bu rec'i levelChanged path'ine düşürür.
// AI başarılı olduğunda aiPending=false → JSONB merge eski true'yu siler.

describe("Fix 1 (audit 11) — aiPending flag", () => {
    it("noRecItems + AI fail → upsert metadata.aiPending=true", async () => {
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [],
            generatedAt: new Date().toISOString(),
            hadError: true,
        });
        await POST();
        expect(mockUpsertRecommendation).toHaveBeenCalledTimes(1);
        const arg = mockUpsertRecommendation.mock.calls[0][0] as { metadata: Record<string, unknown> };
        expect(arg.metadata.aiPending).toBe(true);
    });

    it("noRecItems + AI başarılı → upsert metadata.aiPending=false", async () => {
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [{
                productId: "p-1",
                whyNow: "stock low",
                quantityRationale: "buy 10",
                urgencyLevel: "critical",
                confidence: 0.9,
            }],
            generatedAt: new Date().toISOString(),
            hadError: false,
        });
        await POST();
        expect(mockUpsertRecommendation).toHaveBeenCalledTimes(1);
        const arg = mockUpsertRecommendation.mock.calls[0][0] as { metadata: Record<string, unknown> };
        expect(arg.metadata.aiPending).toBe(false);
    });

    it("levelSame + eski meta.aiPending=true → diff-merge levelChanged'a düşürür (dbUpdateSuggestedRecommendation çağrılır)", async () => {
        // Existing rec: aynı urgencyLevel ama aiPending=true → AI tekrar denenmeli
        mockGetActiveRecommendationsForEntities.mockResolvedValue([{
            id: "r-old",
            entity_id: "p-1",
            entity_type: "product",
            recommendation_type: "purchase_suggestion",
            status: "suggested",
            metadata: { urgencyLevel: "critical", aiPending: true },
            confidence: 0.5,
            decided_at: null,
            edited_metadata: null,
        }]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [{
                productId: "p-1",
                whyNow: "fresh",
                quantityRationale: "fresh-q",
                urgencyLevel: "critical",
                confidence: 0.95,
            }],
            generatedAt: new Date().toISOString(),
            hadError: false,
        });
        await POST();
        // levelChanged path → dbUpdateSuggestedRecommendation çağrılmalı
        expect(mockUpdateSuggestedRecommendation).toHaveBeenCalledTimes(1);
        const callArgs = mockUpdateSuggestedRecommendation.mock.calls[0];
        expect(callArgs[0]).toBe("r-old");
        expect((callArgs[1] as { metadata: Record<string, unknown> }).metadata.aiPending).toBe(false);
        // dbUpdateRecommendationMetadata levelSame için çağrılmamalı
        expect(mockUpdateRecommendationMetadata).not.toHaveBeenCalled();
    });

    it("levelSame + eski meta.aiPending=undefined → levelSame davranışı (dbUpdateRecommendationMetadata çağrılır)", async () => {
        mockGetActiveRecommendationsForEntities.mockResolvedValue([{
            id: "r-old",
            entity_id: "p-1",
            entity_type: "product",
            recommendation_type: "purchase_suggestion",
            status: "suggested",
            metadata: { urgencyLevel: "critical" }, // aiPending yok
            confidence: 0.5,
            decided_at: null,
            edited_metadata: null,
        }]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [],
            generatedAt: new Date().toISOString(),
            hadError: false,
        });
        await POST();
        // levelSame: metadata-only refresh
        expect(mockUpdateRecommendationMetadata).toHaveBeenCalledTimes(1);
        // levelChanged için yeni AI çağrılmamalı, dbUpdateSuggestedRecommendation çağrılmamalı
        expect(mockUpdateSuggestedRecommendation).not.toHaveBeenCalled();
    });

    it("levelChanged + AI fail → eski rec dbUpdateSuggestedRecommendation metadata.aiPending=true", async () => {
        // Existing rec: farklı level (moderate); item.urgencyLevel=critical → levelChanged
        mockGetActiveRecommendationsForEntities.mockResolvedValue([{
            id: "r-old",
            entity_id: "p-1",
            entity_type: "product",
            recommendation_type: "purchase_suggestion",
            status: "suggested",
            metadata: {
                urgencyLevel: "moderate",
                aiWhyNow: "old AI text",
                aiQuantityRationale: "old qty",
                aiUrgencyLevel: "moderate",
            },
            confidence: 0.5,
            decided_at: null,
            edited_metadata: null,
        }]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [],
            generatedAt: new Date().toISOString(),
            hadError: true,
        });
        await POST();
        expect(mockUpdateSuggestedRecommendation).toHaveBeenCalledTimes(1);
        const arg = mockUpdateSuggestedRecommendation.mock.calls[0][1] as { metadata: Record<string, unknown> };
        expect(arg.metadata.aiPending).toBe(true);
        // Audit 6. tur Fix 4 davranışı korunur: AI fail eski metni fallback olarak tutar
        expect(arg.metadata.aiWhyNow).toBe("old AI text");
    });
});
