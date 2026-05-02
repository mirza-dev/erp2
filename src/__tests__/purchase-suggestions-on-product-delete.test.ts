/**
 * G4 (bulgular) — purchase-suggestions-on-product-delete
 *
 * G1 fix: copilot POST artık dbGetAllActiveProductIds kullanıyor (pageSize:500
 * truncation'ından bağımsız). Silinmiş ürünler bu listede yer almaz →
 * dbExpireRecommendationsForMissingEntities doğru ID setiyle çağrılır.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();
const mockDbGetAllActiveProductIds = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...a: unknown[]) => mockDbListProducts(...a),
    dbGetAllActiveProductIds: (...a: unknown[]) => mockDbGetAllActiveProductIds(...a),
}));

const mockDbExpireStaleRecommendations = vi.fn();
const mockDbExpireRecommendationsForMissingEntities = vi.fn();
const mockDbGetActiveRecommendationsForEntities = vi.fn();
const mockDbExpireSuggestedRecommendations = vi.fn();
const mockDbUpsertRecommendation = vi.fn();

vi.mock("@/lib/supabase/recommendations", () => ({
    dbExpireStaleRecommendations: (...a: unknown[]) => mockDbExpireStaleRecommendations(...a),
    dbExpireRecommendationsForMissingEntities: (...a: unknown[]) => mockDbExpireRecommendationsForMissingEntities(...a),
    dbGetActiveRecommendationsForEntities: (...a: unknown[]) => mockDbGetActiveRecommendationsForEntities(...a),
    dbExpireSuggestedRecommendations: (...a: unknown[]) => mockDbExpireSuggestedRecommendations(...a),
    dbUpsertRecommendation: (...a: unknown[]) => mockDbUpsertRecommendation(...a),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => false,
    aiEnrichPurchaseSuggestions: vi.fn(),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const activeProduct = {
    id: "prod-active",
    name: "Aktif Ürün",
    sku: "SKU-A",
    product_type: "commercial",
    available_now: 2,
    min_stock_level: 10,
    on_hand: 2,
    reserved: 0,
    daily_usage: null,
    lead_time_days: null,
    reorder_qty: null,
    preferred_vendor: null,
    is_active: true,
    unit: "adet",
    price: 100,
    currency: "TRY",
    cost_price: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListProducts.mockResolvedValue([activeProduct]);
    mockDbGetAllActiveProductIds.mockResolvedValue(["prod-active"]);
    mockDbExpireStaleRecommendations.mockResolvedValue(0);
    mockDbExpireRecommendationsForMissingEntities.mockResolvedValue(0);
    mockDbGetActiveRecommendationsForEntities.mockResolvedValue([]);
    mockDbExpireSuggestedRecommendations.mockResolvedValue(0);
    mockDbUpsertRecommendation.mockResolvedValue({ id: "rec-1", status: "suggested" });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — G1: silinmiş ürün rec expire", () => {
    it("dbGetAllActiveProductIds çağrılır", async () => {
        await POST();
        expect(mockDbGetAllActiveProductIds).toHaveBeenCalledTimes(1);
    });

    it("dbExpireRecommendationsForMissingEntities, dbGetAllActiveProductIds dönüşüyle çağrılır", async () => {
        mockDbGetAllActiveProductIds.mockResolvedValue(["prod-active"]);
        await POST();
        expect(mockDbExpireRecommendationsForMissingEntities).toHaveBeenCalledWith(
            "product",
            ["prod-active"],
            "purchase_suggestion",
        );
    });

    it("silinmiş ürün aktif ID listesine dahil edilmez → expire çağrısı onu içermez", async () => {
        // Silinmiş ürün: dbListProducts'ta yok (is_active=false filtreli)
        // ama eskiden prod-deleted için rec mevcutmuş.
        // dbGetAllActiveProductIds sadece aktif olanları döner.
        mockDbGetAllActiveProductIds.mockResolvedValue(["prod-active"]);
        await POST();
        const [, idList] = mockDbExpireRecommendationsForMissingEntities.mock.calls[0] as [string, string[]];
        expect(idList).not.toContain("prod-deleted");
    });

    it("dbGetAllActiveProductIds hata fırlatırsa route yine 200 döner (non-fatal)", async () => {
        mockDbGetAllActiveProductIds.mockRejectedValue(new Error("DB hata"));
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("500+ aktif ürün olsa da expire, dbGetAllActiveProductIds'in tam listesini kullanır", async () => {
        const bigIdList = Array.from({ length: 600 }, (_, i) => `prod-${i}`);
        mockDbGetAllActiveProductIds.mockResolvedValue(bigIdList);
        await POST();
        const [, idList] = mockDbExpireRecommendationsForMissingEntities.mock.calls[0] as [string, string[]];
        expect(idList).toHaveLength(600);
    });
});
