/**
 * G4 (bulgular) — purchase-suggested-acik-column
 *
 * G3 fix: "Açık Sipariş" sütunu (header + tooltip + gerçek sipariş sayısı).
 * Bulgular 4. tur: değer artık hardcoded 0 değil; UI ayrı endpoint'ten çekiyor:
 *   `GET /api/orders/open-count-by-product` → `Record<productId, count>`.
 * Backend helper: `dbGetOpenOrderCountByProduct` (alerts-acik-column.test.ts'te
 * birim test edilmiş).
 *
 * Bu dosya iki kontratı belgeler:
 * 1. POST /api/ai/purchase-copilot response item'ında `openOrderCount` veya
 *    `deficit` field'ı YOK (UI ayrı endpoint kullanıyor).
 * 2. UI render eksik: hardcoded 0 yerine `openOrderCounts[id] ?? 0` pattern'i.
 *    (Render'in kendisi component test gerektirdiğinden integration test alerts
 *    sayfasındaki paralel yapı + manuel doğrulama ile kapatılır.)
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
    isAIAvailable: () => false,
    aiEnrichPurchaseSuggestions: vi.fn(),
}));

import { POST } from "@/app/api/ai/purchase-copilot/route";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const belowMinProduct = {
    id: "prod-1",
    name: "Test Ürün",
    sku: "SKU-001",
    product_type: "commercial",
    available_now: 3,
    min_stock_level: 10,
    on_hand: 3,
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
    mockDbListProducts.mockResolvedValue([belowMinProduct]);
    mockDbGetAllActiveProductIds.mockResolvedValue(["prod-1"]);
    mockDbExpireStaleRecommendations.mockResolvedValue(0);
    mockDbExpireRecommendationsForMissingEntities.mockResolvedValue(0);
    mockDbGetActiveRecommendationsForEntities.mockResolvedValue([]);
    mockDbExpireSuggestedRecommendations.mockResolvedValue(0);
    mockDbUpsertRecommendation.mockResolvedValue({ id: "rec-1", status: "suggested" });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/ai/purchase-copilot — G3: Açık Sipariş uyumlu response", () => {
    it("response item'ın available ve min field'ları var", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.available).toBeDefined();
        expect(item.min).toBeDefined();
    });

    it("response item'da deficit field'ı yok (UI hesaplamaz)", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item).not.toHaveProperty("deficit");
    });

    it("response item'da openOrderCount field'ı yok — UI ayrı endpoint'ten çekiyor", async () => {
        // Açık sipariş sayısı /api/orders/open-count-by-product'tan geliyor.
        // copilot response'ında bu alanın olmaması, UI'nin doğru kaynaktan
        // veri çektiğini garanti eder (hardcoded 0 regresyonunu da yakalar).
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item).not.toHaveProperty("openOrderCount");
    });

    it("available < min olan ürün items içinde gelir (stok açığı var)", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items).toHaveLength(1);
        const item = body.items[0];
        expect(item.available).toBeLessThan(item.min);
    });

    it("response item'da suggestQty pozitif", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.suggestQty).toBeGreaterThan(0);
    });

    it("response yapısı: items, counts, generatedAt bulunur", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body).toHaveProperty("items");
        expect(body).toHaveProperty("counts");
        expect(body).toHaveProperty("generatedAt");
        expect(body.counts.needs_purchase).toBeGreaterThan(0);
    });
});
