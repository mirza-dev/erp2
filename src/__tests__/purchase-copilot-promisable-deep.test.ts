/**
 * G11 audit 4. tur Bulgu 1 + 2 — promisable filter + tüm hesaplar.
 *
 * Önceki sürüm: filter `available_now <= min_stock_level` ile başlıyordu
 * (quoted düşmüş ürün yakalanmıyordu); ayrıca suggestQty, coverageDays,
 * available, urgency hesapları p.available_now üzerinden yapılıyordu.
 *
 * Yeni: filter promisable bakar, tüm hesaplar promisable üzerinden.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

const mockDbListAllActiveProducts = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();
const mockDbUpsertRecommendation = vi.fn();

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
    dbUpsertRecommendation: (...a: unknown[]) => mockDbUpsertRecommendation(...a),
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
        name: "Test",
        sku: "TP-1",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 50,
        reserved: 0,
        available_now: 50,
        min_stock_level: 20,
        is_active: true,
        product_type: "commercial",
        warehouse: null,
        reorder_qty: 10,
        preferred_vendor: null,
        daily_usage: null, // null → deadline path pasif
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

beforeEach(() => {
    mockDbListAllActiveProducts.mockReset();
    mockDbGetQuotedQuantities.mockReset();
    mockDbUpsertRecommendation.mockReset();
    mockDbUpsertRecommendation.mockResolvedValue({ id: "r", status: "suggested", decided_at: null });
});

describe("Bulgu 1 — filter promisable üzerinden (available_now değil)", () => {
    it("available=50, quoted=40, min=20 → promisable=10 ≤ min → öneriye girer (kritik fix)", async () => {
        // Önceki bug: available_now=50 > min=20 → filter ilk dalı pas → daily_usage=null → deadline path da pas → öneri yok
        // Yeni: promisable=50-40=10 ≤ min=20 → öneri var
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 40]]));
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(1);
    });

    it("available=50, quoted=30, min=20 → promisable=20 = min → öneriye girer (boundary)", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 30]]));
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(1);
    });

    it("available=50, quoted=10, min=20 → promisable=40 > min → öneriye girmez", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 10]]));
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(0);
    });
});

describe("Bulgu 2 — tüm hesaplar promisable üzerinden", () => {
    it("response.items[0].available promisable yansıtır (available_now değil)", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 40]]));
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].available).toBe(10); // promisable
    });

    it("suggestQty promisable üzerinden hesaplanır (available_now değil)", async () => {
        // available=50, quoted=40, min=20 → promisable=10
        // target = min*2 = 40 (formula=fallback, daily_usage=null)
        // needed = max(0, 40-10) = 30
        // suggestQty = max(moq=10, ceil(30/10)*10) = 30
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 40]]));
        await POST();
        const [input] = mockDbUpsertRecommendation.mock.calls[0];
        // available_now=50 üzerinden hesaplansaydı: needed=max(0,40-50)=0 → suggestQty=moq=10
        // promisable=10 üzerinden: 30
        expect(input.metadata.suggestQty).toBe(30);
    });

    it("coverageDays promisable üzerinden hesaplanır", async () => {
        // available=50, quoted=40, daily_usage=2, min=10 → promisable=10
        // coverageDays = round(promisable/daily_usage) = round(10/2) = 5
        mockDbListAllActiveProducts.mockResolvedValue([
            makeProduct({ daily_usage: 2, min_stock_level: 10, available_now: 50 }),
        ]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 40]]));
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].coverageDays).toBe(5);
    });

    it("urgencyLevel promisable bazlı coverage'tan türer (lead-time risk)", async () => {
        // available=50, quoted=40 → promisable=10, daily_usage=2 → coverageDays=5
        // 5 < 7 → critical
        mockDbListAllActiveProducts.mockResolvedValue([
            makeProduct({ daily_usage: 2, min_stock_level: 10, available_now: 50 }),
        ]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 40]]));
        await POST();
        const [input] = mockDbUpsertRecommendation.mock.calls[0];
        expect(input.metadata.urgencyLevel).toBe("critical");
    });

    it("Quote yoksa promisable=available_now → eski davranış korunur (regresyon)", async () => {
        // available=5, min=20 (klasik kritik), quote yok → suggestQty hesabı available değişmemeli
        mockDbListAllActiveProducts.mockResolvedValue([
            makeProduct({ available_now: 5, min_stock_level: 20 }),
        ]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map());
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].available).toBe(5); // promisable=5-0=5
        expect(body.counts.needs_purchase).toBe(1);
    });
});

// ─── Audit 8. tur Fix 1 — over-quoted in-scope items clamp ──────────────────

describe("Audit 8 Fix 1 — backend in-scope items max(0, promisable) clamp", () => {
    it("Over-quoted in-scope (promisable=-5) → suggestQty UI ile aynı (40, eski 50)", async () => {
        // available=10, quoted=15 → promisable=-5
        // target = min*2 = 40 (fallback formula, dailyUsage=null)
        // Eski: needed = max(0, 40-(-5)) = 45 → suggestQty = 50
        // Yeni: stock=max(0,-5)=0, needed = 40 → suggestQty = 40 (UI ile aynı)
        mockDbListAllActiveProducts.mockResolvedValue([
            makeProduct({ available_now: 10, min_stock_level: 20, reorder_qty: 10 }),
        ]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 15]]));
        const res = await POST();
        const body = await res.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0].suggestQty).toBe(40);
    });

    it("Over-quoted in-scope coverageDays = 0 (negatif değil)", async () => {
        // promisable=-5, dailyUsage=2 → stock=max(0,-5)=0 → coverageDays=0
        mockDbListAllActiveProducts.mockResolvedValue([
            makeProduct({ available_now: 10, min_stock_level: 20, daily_usage: 2 }),
        ]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 15]]));
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].coverageDays).toBe(0);
    });

    it("Pozitif promisable: clamp etkisi yok (regresyon)", async () => {
        // available=50, quoted=10, min=20 → promisable=40 > min, deadline path
        // daily_usage=null → deadline path pasif → öneriye girmez
        mockDbListAllActiveProducts.mockResolvedValue([
            makeProduct({ available_now: 50, min_stock_level: 20 }),
        ]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["p-1", 10]]));
        const res = await POST();
        const body = await res.json();
        expect(body.counts.needs_purchase).toBe(0);
    });
});
