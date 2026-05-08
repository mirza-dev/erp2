/**
 * G11 — diff-merge ve drift detection testleri.
 *
 * Hibrit yaklaşım:
 *   - 'suggested' rec + level aynı → metadata in-place refresh (AI çağrılmaz)
 *   - 'suggested' rec + level değişti → eski rec expire + AI yeniden çağrılır
 *   - decided rec (accepted/edited/rejected) + state değişti → currentDrift döner
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

const mockDbListProducts = vi.fn();
const mockDbGetAllActiveProductIds = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...a: unknown[]) => mockDbListProducts(...a),
    dbGetAllActiveProductIds: (...a: unknown[]) => mockDbGetAllActiveProductIds(...a),
}));

const mockAiEnrichPurchaseSuggestions = vi.fn();
const mockIsAIAvailable = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => mockIsAIAvailable(),
    aiEnrichPurchaseSuggestions: (...a: unknown[]) => mockAiEnrichPurchaseSuggestions(...a),
}));

const mockDbUpsertRecommendation = vi.fn();
const mockDbExpireSuggestedRecommendations = vi.fn();
const mockDbExpireStaleRecommendations = vi.fn();
const mockDbExpireRecommendationsForMissingEntities = vi.fn();
const mockDbExpireEntityRecommendations = vi.fn();
const mockDbGetActiveRecommendationsForEntities = vi.fn();
const mockDbUpdateRecommendationMetadata = vi.fn();

vi.mock("@/lib/supabase/recommendations", () => ({
    dbUpsertRecommendation: (...a: unknown[]) => mockDbUpsertRecommendation(...a),
    dbExpireSuggestedRecommendations: (...a: unknown[]) => mockDbExpireSuggestedRecommendations(...a),
    dbExpireStaleRecommendations: (...a: unknown[]) => mockDbExpireStaleRecommendations(...a),
    dbExpireRecommendationsForMissingEntities: (...a: unknown[]) => mockDbExpireRecommendationsForMissingEntities(...a),
    dbExpireEntityRecommendations: (...a: unknown[]) => mockDbExpireEntityRecommendations(...a),
    dbGetActiveRecommendationsForEntities: (...a: unknown[]) => mockDbGetActiveRecommendationsForEntities(...a),
    dbUpdateRecommendationMetadata: (...a: unknown[]) => mockDbUpdateRecommendationMetadata(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "test-user" } } }) },
    }),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";

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
        ...overrides,
    };
}

beforeEach(() => {
    mockDbListProducts.mockReset();
    mockDbGetAllActiveProductIds.mockReset();
    mockDbGetAllActiveProductIds.mockResolvedValue([]);
    mockAiEnrichPurchaseSuggestions.mockReset();
    mockIsAIAvailable.mockReset();
    mockDbUpsertRecommendation.mockReset();
    mockDbUpsertRecommendation.mockResolvedValue({ id: "rec-new", status: "suggested", decided_at: null });
    mockDbExpireSuggestedRecommendations.mockReset();
    mockDbExpireSuggestedRecommendations.mockResolvedValue(0);
    mockDbExpireStaleRecommendations.mockReset();
    mockDbExpireStaleRecommendations.mockResolvedValue(0);
    mockDbExpireRecommendationsForMissingEntities.mockReset();
    mockDbExpireRecommendationsForMissingEntities.mockResolvedValue(0);
    mockDbExpireEntityRecommendations.mockReset();
    mockDbExpireEntityRecommendations.mockResolvedValue(undefined);
    mockDbGetActiveRecommendationsForEntities.mockReset();
    mockDbGetActiveRecommendationsForEntities.mockResolvedValue([]);
    mockDbUpdateRecommendationMetadata.mockReset();
    mockDbUpdateRecommendationMetadata.mockResolvedValue(undefined);
});

// ─── Suggested rec + level aynı: metadata refresh, AI atlanır ────────────────

describe("G11 diff-merge — suggested rec + level same", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            // available=5, min=20 → urgencyPct = round((1-5/20)*100) = 75 → "high"
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        mockDbGetActiveRecommendationsForEntities.mockResolvedValue([
            {
                id: "rec-1",
                entity_id: "p-1",
                entity_type: "product",
                recommendation_type: "purchase_suggestion",
                status: "suggested",
                metadata: {
                    suggestQty: 50,
                    urgencyPct: 75,
                    urgencyLevel: "high",
                    aiWhyNow: "Önceki AI yorumu",
                    aiQuantityRationale: "Önceki rationale",
                    aiUrgencyLevel: "high",
                },
                confidence: 0.7,
                decided_at: null,
                edited_metadata: null,
                created_at: "2024-01-01T00:00:00Z",
            },
        ]);
    });

    it("dbUpdateRecommendationMetadata çağrılır", async () => {
        await POST();
        expect(mockDbUpdateRecommendationMetadata).toHaveBeenCalledTimes(1);
        const [recId, patch] = mockDbUpdateRecommendationMetadata.mock.calls[0];
        expect(recId).toBe("rec-1");
        expect(patch).toMatchObject({
            urgencyLevel: "high",
            urgencyPct: 75,
        });
        expect(typeof patch.suggestQty).toBe("number");
    });

    it("AI çağrılmaz (level aynı, mevcut metni yeniden kullan)", async () => {
        await POST();
        expect(mockAiEnrichPurchaseSuggestions).not.toHaveBeenCalled();
    });

    it("Eski rec expire EDİLMEZ", async () => {
        await POST();
        expect(mockDbExpireEntityRecommendations).not.toHaveBeenCalled();
    });

    it("response item AI metni mevcut rec metadata'sından gelir", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiWhyNow).toBe("Önceki AI yorumu");
        expect(body.items[0].aiQuantityRationale).toBe("Önceki rationale");
    });

    it("response.recommendations entry'sinde currentDrift null", async () => {
        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-1");
        expect(rec).toBeDefined();
        expect(rec.currentDrift).toBeNull();
    });
});

// ─── Suggested rec + level değişti: expire + AI yeniden çağrılır ─────────────

describe("G11 diff-merge — suggested rec + level changed", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            // available=5, min=20 → urgencyPct = 75 → "high"
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        mockDbGetActiveRecommendationsForEntities.mockResolvedValue([
            {
                id: "rec-old",
                entity_id: "p-1",
                entity_type: "product",
                recommendation_type: "purchase_suggestion",
                status: "suggested",
                // Eski metadata: critical (urgencyPct 90) → şimdi high (75) → level changed
                metadata: { urgencyLevel: "critical", urgencyPct: 90, suggestQty: 80 },
                confidence: 0.9,
                decided_at: null,
                edited_metadata: null,
                created_at: "2024-01-01T00:00:00Z",
            },
        ]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [{
                productId: "p-1",
                whyNow: "Yeni AI yorumu",
                quantityRationale: "Yeni rationale",
                urgencyLevel: "high",
                confidence: 0.8,
            }],
            generatedAt: new Date().toISOString(),
        });
    });

    it("Eski rec dbExpireEntityRecommendations ile expire edilir", async () => {
        await POST();
        expect(mockDbExpireEntityRecommendations).toHaveBeenCalledWith("p-1", "product");
    });

    it("AI yeniden çağrılır (level değişti)", async () => {
        await POST();
        expect(mockAiEnrichPurchaseSuggestions).toHaveBeenCalledTimes(1);
    });

    it("Yeni rec upsert edilir, AI metadata'sı güncel level içerir", async () => {
        await POST();
        const [input] = mockDbUpsertRecommendation.mock.calls[0];
        expect(input.entity_id).toBe("p-1");
        expect(input.metadata.urgencyLevel).toBe("high");
    });

    it("dbUpdateRecommendationMetadata çağrılmaz (level değişti, in-place değil)", async () => {
        await POST();
        expect(mockDbUpdateRecommendationMetadata).not.toHaveBeenCalled();
    });
});

// ─── Suggested rec metadata'da urgencyLevel eksik (eski sürüm rec) ───────────

describe("G11 diff-merge — eski sürüm metadata (urgencyLevel field eksik)", () => {
    it("metadata.urgencyPct'ten level türetilir, eşleşirse refresh", async () => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }), // urgencyPct=75 → high
        ]);
        mockDbGetActiveRecommendationsForEntities.mockResolvedValue([
            {
                id: "rec-old",
                entity_id: "p-1",
                entity_type: "product",
                recommendation_type: "purchase_suggestion",
                status: "suggested",
                metadata: { urgencyPct: 75 }, // urgencyLevel field yok ama urgencyPct → "high"
                confidence: null,
                decided_at: null,
                edited_metadata: null,
                created_at: "2024-01-01T00:00:00Z",
            },
        ]);
        await POST();
        // urgencyPct=75 → derived "high" → matches → refresh path
        expect(mockDbUpdateRecommendationMetadata).toHaveBeenCalledTimes(1);
        expect(mockAiEnrichPurchaseSuggestions).not.toHaveBeenCalled();
    });

    it("metadata tamamen boşsa (eski rec, hiçbir field yok) AI yeniden çağrılır", async () => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        mockDbGetActiveRecommendationsForEntities.mockResolvedValue([
            {
                id: "rec-old",
                entity_id: "p-1",
                entity_type: "product",
                recommendation_type: "purchase_suggestion",
                status: "suggested",
                metadata: {},
                confidence: null,
                decided_at: null,
                edited_metadata: null,
                created_at: "2024-01-01T00:00:00Z",
            },
        ]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({ enrichments: [], generatedAt: new Date().toISOString() });
        await POST();
        // existingLevel null, currentLevel "high" → değişti → expire + AI
        expect(mockDbExpireEntityRecommendations).toHaveBeenCalled();
        expect(mockAiEnrichPurchaseSuggestions).toHaveBeenCalled();
    });
});

// ─── Decided rec drift detection ─────────────────────────────────────────────

describe("G11 drift — decided rec'lerde state karşılaştırması", () => {
    function setupDecided(meta: Record<string, unknown>, productOverrides: Partial<ProductWithStock> = {}) {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20, ...productOverrides }),
        ]);
        mockDbGetActiveRecommendationsForEntities.mockResolvedValue([
            {
                id: "rec-decided",
                entity_id: "p-1",
                entity_type: "product",
                recommendation_type: "purchase_suggestion",
                status: "accepted",
                metadata: meta,
                confidence: 0.7,
                decided_at: "2024-02-01T00:00:00Z",
                edited_metadata: null,
                created_at: "2024-01-01T00:00:00Z",
            },
        ]);
    }

    it("frozen suggestQty/urgencyLevel == current → currentDrift null", async () => {
        // Şu an: available=5,min=20 → urgencyPct=75 → "high", suggestQty (target=62, needed=57, ceil/10=60) = 60
        setupDecided({ suggestQty: 60, urgencyLevel: "high", urgencyPct: 75 });
        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-1");
        expect(rec.currentDrift).toBeNull();
    });

    it("frozen suggestQty değişti → currentDrift döner", async () => {
        setupDecided({ suggestQty: 999, urgencyLevel: "high", urgencyPct: 75 });
        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-1");
        expect(rec.currentDrift).toEqual({ suggestQty: 60, urgencyLevel: "high" });
    });

    it("frozen urgencyLevel değişti → currentDrift döner", async () => {
        setupDecided({ suggestQty: 60, urgencyLevel: "critical", urgencyPct: 90 });
        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-1");
        expect(rec.currentDrift).toEqual({ suggestQty: 60, urgencyLevel: "high" });
    });

    it("Decided rec metadata frozen kalır — dbUpdateRecommendationMetadata çağrılmaz", async () => {
        setupDecided({ suggestQty: 999, urgencyLevel: "critical", urgencyPct: 90 });
        await POST();
        expect(mockDbUpdateRecommendationMetadata).not.toHaveBeenCalled();
        expect(mockDbExpireEntityRecommendations).not.toHaveBeenCalled();
    });

    it("Decided rec için response status 'accepted' olarak gelir", async () => {
        setupDecided({ suggestQty: 60, urgencyLevel: "high", urgencyPct: 75 });
        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-1");
        expect(rec.status).toBe("accepted");
        expect(rec.recommendationId).toBe("rec-decided");
    });
});
