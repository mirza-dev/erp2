/**
 * Sprint C bulgular 2. tur — AI banner sinyali: POST /api/ai/purchase-copilot.
 *
 * ai_call_failed flag'ini test eder:
 * - AI enrichment throw → ai_call_failed: true, yine 200 döner
 * - AI enrichment başarılı → ai_call_failed: false
 * - AI kullanılamıyor (isAIAvailable=false) → ai_available: false, ai_call_failed: false
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();
const mockDbGetAllActiveProductIds = vi.fn();
const mockDbExpireStaleRecommendations = vi.fn();
const mockDbExpireRecommendationsForMissingEntities = vi.fn();
const mockDbGetActiveRecommendationsForEntities = vi.fn();
const mockDbExpireSuggestedRecommendations = vi.fn();
const mockDbUpsertRecommendation = vi.fn();
const mockIsAIAvailable = vi.fn();
const mockAiEnrichPurchaseSuggestions = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: (...a: unknown[]) => mockDbListProducts(...a),
    dbGetAllActiveProductIds: (...a: unknown[]) => mockDbGetAllActiveProductIds(...a),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/recommendations", () => ({
    dbExpireStaleRecommendations: (...a: unknown[]) => mockDbExpireStaleRecommendations(...a),
    dbExpireRecommendationsForMissingEntities: (...a: unknown[]) => mockDbExpireRecommendationsForMissingEntities(...a),
    dbExpireEntityRecommendations: vi.fn(() => Promise.resolve(undefined)),
    dbGetActiveRecommendationsForEntities: (...a: unknown[]) => mockDbGetActiveRecommendationsForEntities(...a),
    dbExpireSuggestedRecommendations: (...a: unknown[]) => mockDbExpireSuggestedRecommendations(...a),
    dbExpireAllSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbUpdateRecommendationMetadata: vi.fn(() => Promise.resolve(undefined)),
    dbUpsertRecommendation: (...a: unknown[]) => mockDbUpsertRecommendation(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "test-user" } } }) },
    }),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => mockIsAIAvailable(),
    aiEnrichPurchaseSuggestions: (...a: unknown[]) => mockAiEnrichPurchaseSuggestions(...a),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const belowMinProduct = {
    id: "prod-1", name: "Test Ürün", sku: "SKU-001",
    product_type: "commercial",
    available_now: 5, min_stock_level: 10,
    on_hand: 5, reserved: 0,
    daily_usage: null, lead_time_days: null,
    reorder_qty: null, preferred_vendor: null,
    is_active: true, unit: "adet",
    price: 100, currency: "TRY", cost_price: null,
};

const mockRec = {
    id: "rec-1", entity_type: "product", entity_id: "prod-1",
    recommendation_type: "purchase_suggestion",
    status: "suggested", decided_at: null, edited_metadata: null,
    confidence: null, metadata: null,
    created_at: new Date().toISOString(),
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListProducts.mockResolvedValue([belowMinProduct]);
    mockDbGetAllActiveProductIds.mockResolvedValue(["prod-1"]);
    mockDbExpireStaleRecommendations.mockResolvedValue(0);
    mockDbExpireRecommendationsForMissingEntities.mockResolvedValue(0);
    mockDbGetActiveRecommendationsForEntities.mockResolvedValue([]);
    mockDbExpireSuggestedRecommendations.mockResolvedValue(0);
    mockDbUpsertRecommendation.mockResolvedValue(mockRec);
    mockIsAIAvailable.mockReturnValue(true);
    mockAiEnrichPurchaseSuggestions.mockResolvedValue({
        enrichments: [{
            productId: "prod-1",
            whyNow: "Stok kritik seviyede",
            quantityRationale: "MOQ tabanlı",
            urgencyLevel: "high",
            confidence: 0.85,
        }],
    });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — ai_call_failed flag", () => {
    it("AI enrichment başarılı → ai_call_failed: false, 200", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ai_available).toBe(true);
        expect(body.ai_call_failed).toBe(false);
    });

    it("AI enrichment throw → ai_call_failed: true, yine 200 döner", async () => {
        mockAiEnrichPurchaseSuggestions.mockRejectedValue(new Error("AI servisi çöktü"));
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ai_available).toBe(true);
        expect(body.ai_call_failed).toBe(true);
    });

    it("AI kullanılamıyor → ai_available: false, ai_call_failed: false", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ai_available).toBe(false);
        expect(body.ai_call_failed).toBe(false);
        expect(mockAiEnrichPurchaseSuggestions).not.toHaveBeenCalled();
    });

    it("AI yokken items yine de döner (deterministik fallback)", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        const res = await POST();
        const body = await res.json();
        expect(body.items).toHaveLength(1);
        expect(body.counts.needs_purchase).toBe(1);
    });

    it("response'da generatedAt ve counts bulunur", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.generatedAt).toBeTruthy();
        expect(body.counts).toMatchObject({
            needs_purchase: 1,
            commercial: 1,
            manufactured: 0,
        });
    });
});
