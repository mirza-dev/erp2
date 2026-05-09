/**
 * G11 audit 6. tur Fix 1 — decided rec drift kapsamı genişletildi.
 *
 * Önceki: kullanıcı öneriyi kabul etti, sonra stok düzeldi (örn. 5 → 200).
 * Ürün artık needsPurchase=false → response.recommendations'da entry yok →
 * UI'da "Stok değişti" rozeti hiç görünmüyor.
 *
 * Yeni: route tüm aktif decided rec'leri ayrıca yükler; response'a out-of-scope
 * entry'ler de girer. Drift hesabı items içindeki ürünler için item kullanır,
 * aksi halde products map'inden güncel state hesaplar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock, AiRecommendationRow } from "@/lib/database.types";

const mockDbListAllActiveProducts = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();
const mockDbGetActiveRecommendationsForEntities = vi.fn();
const mockDbListRecommendations = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: (...a: unknown[]) => mockDbListAllActiveProducts(...a),
    dbGetAllActiveProductIds: vi.fn().mockResolvedValue([]),
    dbGetQuotedQuantities: (...a: unknown[]) => mockDbGetQuotedQuantities(...a),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => false,
    aiEnrichPurchaseSuggestions: vi.fn(),
}));

vi.mock("@/lib/supabase/recommendations", () => ({
    dbUpsertRecommendation: vi.fn().mockResolvedValue({ id: "r", status: "suggested", decided_at: null }),
    dbExpireSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireAllSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireStaleRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireRecommendationsForMissingEntities: vi.fn().mockResolvedValue(0),
    dbGetActiveRecommendationsForEntities: (...a: unknown[]) => mockDbGetActiveRecommendationsForEntities(...a),
    dbListRecommendations: (...a: unknown[]) => mockDbListRecommendations(...a),
    dbUpdateRecommendationMetadata: vi.fn().mockResolvedValue(undefined),
    dbUpdateSuggestedRecommendation: vi.fn().mockResolvedValue({ id: "r", status: "suggested", decided_at: null }),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "u-1" } } }) },
    }),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "p-healthy",
        name: "Healthy",
        sku: "H-1",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 200,
        reserved: 0,
        available_now: 200, // > min, needsPurchase=false
        min_stock_level: 20,
        is_active: true,
        product_type: "commercial",
        warehouse: null,
        reorder_qty: 10,
        preferred_vendor: null,
        daily_usage: null,
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

function makeDecidedRec(overrides: Partial<AiRecommendationRow> = {}): AiRecommendationRow {
    return {
        id: "rec-decided",
        entity_id: "p-healthy",
        entity_type: "product",
        recommendation_type: "purchase_suggestion",
        status: "accepted",
        title: "Eski öneri",
        body: null,
        confidence: 0.7,
        severity: "warning",
        model_version: "v1",
        // Eski state: stok kritik (5/20), suggestQty=40, level=critical
        metadata: { suggestQty: 40, urgencyLevel: "critical", coverageDays: 2 },
        decided_at: new Date().toISOString(),
        edited_metadata: null,
        feedback_type: null,
        feedback_note: null,
        actor: null,
        expired_at: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    } as AiRecommendationRow;
}

beforeEach(() => {
    mockDbListAllActiveProducts.mockReset();
    mockDbGetQuotedQuantities.mockReset();
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbGetActiveRecommendationsForEntities.mockReset();
    mockDbGetActiveRecommendationsForEntities.mockResolvedValue([]);
    mockDbListRecommendations.mockReset();
    mockDbListRecommendations.mockResolvedValue([]);
});

describe("Fix 1 — out-of-scope decided rec drift", () => {
    it("accepted rec + ürün stok düzeldi → response.recommendations'da entry, drift dolu", async () => {
        // Ürün stok=200, min=20 → needsPurchase=false (items'a girmez)
        // Decided rec metadata frozen suggestQty=40, level=critical
        // Şimdi: stock=200, target=40 → needed=0 → suggestQty=10 (moq)
        // Frozen 40 ≠ current 10 → drift
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbListRecommendations.mockResolvedValue([makeDecidedRec()]);

        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-healthy");
        expect(rec).toBeDefined();
        expect(rec.status).toBe("accepted");
        expect(rec.currentDrift).not.toBeNull();
        expect(rec.currentDrift.suggestQty).toBe(10); // moq, çünkü stok yeterli
    });

    it("frozen suggestQty/level current ile aynı → currentDrift null", async () => {
        // Stok yeterli, target=40, moq=10, frozen=10/moderate (current=10/moderate)
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbListRecommendations.mockResolvedValue([
            makeDecidedRec({
                metadata: { suggestQty: 10, urgencyLevel: "moderate", coverageDays: null },
            }),
        ]);

        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-healthy");
        expect(rec).toBeDefined();
        expect(rec.currentDrift).toBeNull();
    });

    it("rejected rec out-of-scope ürün → response'a girer", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbListRecommendations.mockResolvedValue([
            makeDecidedRec({ status: "rejected" }),
        ]);

        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-healthy");
        expect(rec).toBeDefined();
        expect(rec.status).toBe("rejected");
    });

    it("ürün silinmiş (productMap'te yok) → drift hesaplanmaz, ama rec response'a girer", async () => {
        // productMap p-other içermiyor; decided rec p-other için → drift skip, response'a girer
        mockDbListAllActiveProducts.mockResolvedValue([]);
        mockDbListRecommendations.mockResolvedValue([
            makeDecidedRec({ id: "rec-other", entity_id: "p-other" }),
        ]);

        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-other");
        expect(rec).toBeDefined();
        expect(rec.currentDrift).toBeNull(); // silinmiş ürün için drift hesaplanmaz
    });

    it("needsPurchase + decided rec aynı anda → eski davranış (item-bazlı drift)", async () => {
        // Ürün stok=5, min=20 → needsPurchase=true → items'a girer
        // Decided rec → items içindeki hesap kullanılır (productMap fallback değil)
        const product = makeProduct({ available_now: 5, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);
        // dbGetActiveRecommendationsForEntities decided rec döndürür (in-scope)
        mockDbGetActiveRecommendationsForEntities.mockResolvedValue([makeDecidedRec()]);

        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-healthy");
        expect(rec).toBeDefined();
        expect(rec.status).toBe("accepted");
        // Frozen suggestQty=40 vs current items hesabı (target=40, needed=35, suggestQty=40) → eşit, drift null
        // Frozen level=critical, current level=moderate (cov null) → drift!
        expect(rec.currentDrift).not.toBeNull();
    });

    it("dbListRecommendations 7-gün sonrası decided'ları filter ediyor (stale)", async () => {
        // Ürün stok düzelmiş, decided rec 8 gün önce
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
        mockDbListRecommendations.mockResolvedValue([
            makeDecidedRec({ decided_at: eightDaysAgo }),
        ]);

        const res = await POST();
        const body = await res.json();
        const rec = body.recommendations.find((r: { productId: string }) => r.productId === "p-healthy");
        // 7-gün window dışı → response'a girmez
        expect(rec).toBeUndefined();
    });
});
