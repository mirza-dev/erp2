/**
 * G11 audit 2. tur Fix 3 — `needsPurchase=[]` durumunda orphan suggested
 * rec'lerin temizlenmesi.
 *
 * Eski davranış: activeProductIds=[] ise dbExpireSuggestedRecommendations
 * `Promise.resolve(0)` ile no-op edilirdi → eski 'suggested' rec'ler 48h
 * TTL'e kadar DB'de aktif kalırdı (UI'da görünmez ama DB orphan).
 *
 * Yeni davranış: dbExpireAllSuggestedRecommendations çağrılır → tek seferde
 * temizlenir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

const mockDbListProducts = vi.fn();
const mockDbGetAllActiveProductIds = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: (...a: unknown[]) => mockDbListProducts(...a),
    dbGetAllActiveProductIds: (...a: unknown[]) => mockDbGetAllActiveProductIds(...a),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => false,
    aiEnrichPurchaseSuggestions: vi.fn(),
}));

const mockDbExpireSuggestedRecommendations = vi.fn();
const mockDbExpireAllSuggestedRecommendations = vi.fn();

vi.mock("@/lib/supabase/recommendations", () => ({
    dbUpsertRecommendation: vi.fn().mockResolvedValue({ id: "r", status: "suggested", decided_at: null }),
    dbExpireSuggestedRecommendations: (...a: unknown[]) => mockDbExpireSuggestedRecommendations(...a),
    dbExpireAllSuggestedRecommendations: (...a: unknown[]) => mockDbExpireAllSuggestedRecommendations(...a),
    dbExpireStaleRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireRecommendationsForMissingEntities: vi.fn().mockResolvedValue(0),
    dbExpireEntityRecommendations: vi.fn().mockResolvedValue(undefined),
    dbGetActiveRecommendationsForEntities: vi.fn().mockResolvedValue([]),
    dbUpdateRecommendationMetadata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "u-1" } } }) },
    }),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";

function makeHealthy(id: string): ProductWithStock {
    // available_now=100, min=10 → needsPurchase filtresine düşmez
    return {
        id,
        name: `Product ${id}`,
        sku: `SKU-${id}`,
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 100,
        reserved: 0,
        available_now: 100,
        min_stock_level: 10,
        is_active: true,
        product_type: "commercial",
        warehouse: null,
        reorder_qty: 5,
        preferred_vendor: null,
        daily_usage: null, // null → orderDeadline yok → filter pass
        lead_time_days: null,
        product_family: null,
        sub_category: null,
        sector_compatibility: null,
        cost_price: null,
        weight_kg: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
    };
}

function makeNeedsPurchase(id: string): ProductWithStock {
    return { ...makeHealthy(id), available_now: 5, min_stock_level: 20 };
}

beforeEach(() => {
    mockDbListProducts.mockReset();
    mockDbGetAllActiveProductIds.mockReset();
    mockDbGetAllActiveProductIds.mockResolvedValue([]);
    mockDbExpireSuggestedRecommendations.mockReset();
    mockDbExpireSuggestedRecommendations.mockResolvedValue(0);
    mockDbExpireAllSuggestedRecommendations.mockReset();
    mockDbExpireAllSuggestedRecommendations.mockResolvedValue(0);
});

describe("Fix 3 — needsPurchase=[] orphan suggested cleanup", () => {
    it("Tüm ürünler sağlıklı → dbExpireAllSuggestedRecommendations çağrılır", async () => {
        mockDbListProducts.mockResolvedValue([makeHealthy("p-1"), makeHealthy("p-2")]);
        await POST();
        expect(mockDbExpireAllSuggestedRecommendations).toHaveBeenCalledTimes(1);
        expect(mockDbExpireAllSuggestedRecommendations).toHaveBeenCalledWith("product", "purchase_suggestion");
    });

    it("Tüm ürünler sağlıklı → dbExpireSuggestedRecommendations ÇAĞRILMAZ (boş list pas)", async () => {
        mockDbListProducts.mockResolvedValue([makeHealthy("p-1")]);
        await POST();
        expect(mockDbExpireSuggestedRecommendations).not.toHaveBeenCalled();
    });

    it("En az 1 ürün needsPurchase → dbExpireSuggestedRecommendations çağrılır (regresyon)", async () => {
        mockDbListProducts.mockResolvedValue([makeNeedsPurchase("p-1"), makeHealthy("p-2")]);
        await POST();
        expect(mockDbExpireSuggestedRecommendations).toHaveBeenCalledTimes(1);
        const [entityType, ids, recType] = mockDbExpireSuggestedRecommendations.mock.calls[0];
        expect(entityType).toBe("product");
        expect(ids).toEqual(["p-1"]);
        expect(recType).toBe("purchase_suggestion");
    });

    it("En az 1 ürün needsPurchase → dbExpireAllSuggestedRecommendations ÇAĞRILMAZ", async () => {
        mockDbListProducts.mockResolvedValue([makeNeedsPurchase("p-1")]);
        await POST();
        expect(mockDbExpireAllSuggestedRecommendations).not.toHaveBeenCalled();
    });
});
