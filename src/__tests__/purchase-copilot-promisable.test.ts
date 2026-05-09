/**
 * G11 audit 3. tur Fix 1 — purchase-copilot route promisable hesabı.
 *
 * Önceki sürüm: `dbListProducts` çağırıyordu; helper promisable üretmiyordu →
 * route'ta `p.promisable ?? p.available_now` her zaman fallback `available_now`
 * değerini kullanıyordu → quote'lu siparişler dikkate alınmıyordu.
 *
 * Yeni: dbListAllActiveProducts + dbGetQuotedQuantities paralel çekiliyor;
 * promisable = available_now - quoted hesaplanıp deadline filter'ında
 * kullanılıyor (UI ile aynı semantik).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

const mockDbListAllActiveProducts = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();

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

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "p-1",
        name: "Test Product",
        sku: "TP-001",
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
        reorder_qty: 10,
        preferred_vendor: null,
        daily_usage: 2,    // 2/gün
        lead_time_days: 30, // 30 gün lead
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
    mockDbListAllActiveProducts.mockReset();
    mockDbGetQuotedQuantities.mockReset();
});

describe("Fix 1 — promisable hesabı (dbGetQuotedQuantities entegrasyonu)", () => {
    it("Quote yoksa promisable === available_now → eski davranış korunur", async () => {
        // available_now=100, daily_usage=2 → coverageDays=50, lead=30
        // promisable=100, stockoutDays=50, deadline=50-30-7=13 → 13>7 → suggest etme
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map());
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(0);
    });

    it("Quote miktarı promisable'ı düşürüp deadline'ı yaklaştırır → öneriye girer", async () => {
        // available=100, quoted=80 → promisable=20
        // promisable=20, daily_usage=2 → stockoutDays=10, deadline=10-30-7=-27 (geçmiş)
        // -27 ≤ 7 → öneri filter geçer
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 80]]));
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(1);
        expect(body.items[0].productId).toBe("p-1");
    });

    it("Quote yoksa öneriye girmeyen ürün, quote ile birlikte öneriye girer (regresyon)", async () => {
        // İki run karşılaştırması — tek test'te iki call
        // Run 1: no quote → 0 öneri
        // Run 2: quote=80 → 1 öneri
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);

        mockDbGetQuotedQuantities.mockResolvedValueOnce(new Map());
        const res1 = await POST();
        const body1 = await res1.json();

        mockDbGetQuotedQuantities.mockResolvedValueOnce(new Map([["p-1", 80]]));
        const res2 = await POST();
        const body2 = await res2.json();

        expect(body1.counts.needs_purchase).toBe(0);
        expect(body2.counts.needs_purchase).toBe(1);
    });

    it("dbGetQuotedQuantities çağrılır (paralel fetch ile dbListAllActiveProducts)", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map());
        await POST();
        expect(mockDbGetQuotedQuantities).toHaveBeenCalledTimes(1);
    });

    it("available_now <= min_stock_level olan ürün quote'tan bağımsız her zaman öneriye girer", async () => {
        // available=5, min=10 → 5<=10 → filter ilk dalında geçer (deadline check'ine düşmez)
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ available_now: 5, min_stock_level: 10 })]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map());
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(1);
    });
});
