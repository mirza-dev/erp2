/**
 * G4 (bulgular) — purchase-suggested-acik-column
 *
 * G3 fix: "Açık Sipariş" sütunu (header + tooltip + 0 değer).
 * copilot route'u her item için `available` ve `min` döndürür (stok durumu için).
 * Satın alma önerilerinde "deficit" field'ı hesaplanmaz (UI görevi değil).
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

    it("response item'da deficit field'ı yok (UI hesaplamaz, sütun 0 gösterir)", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(item).not.toHaveProperty("deficit");
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
