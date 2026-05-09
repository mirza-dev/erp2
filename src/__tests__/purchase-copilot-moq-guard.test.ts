/**
 * G11 audit 2. tur Fix 5 — moq Math.max(1, ...) guard.
 *
 * `moq = p.reorder_qty ?? p.min_stock_level` — DB'de min_stock_level=0
 * default, reorder_qty nullable. Eğer her ikisi 0/null ise moq=0 olur ve
 * `Math.ceil(needed / 0) = Infinity` üretir → `suggestQty` NaN/Infinity.
 *
 * Frontend (page.tsx:226) `Math.max(1, ...)` ile zaten korumalı; backend de
 * aynı pattern'le kalkanlı.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock } from "@/lib/database.types";

const mockDbListProducts = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: (...a: unknown[]) => mockDbListProducts(...a),
    dbGetAllActiveProductIds: vi.fn().mockResolvedValue([]),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
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

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "p-1",
        name: "Test Product",
        sku: "TP-001",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 0,
        reserved: 0,
        available_now: 0,
        min_stock_level: 0,
        is_active: true,
        product_type: "commercial",
        warehouse: null,
        reorder_qty: null,
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

beforeEach(() => {
    mockDbListProducts.mockReset();
});

describe("Fix 5 — moq guard (reorder_qty/min_stock_level=0 senaryosu)", () => {
    it("reorder_qty=null, min=0 → suggestQty sonlu sayı (NaN/Infinity değil)", async () => {
        // available=0, min=0 → 0<=0 → needsPurchase filter geçer
        mockDbListProducts.mockResolvedValue([makeProduct()]);
        const res = await POST();
        const body = await res.json();
        expect(body.items).toHaveLength(1);
        const item = body.items[0];
        expect(Number.isFinite(item.suggestQty)).toBe(true);
        expect(Number.isNaN(item.suggestQty)).toBe(false);
        expect(item.moq).toBeGreaterThanOrEqual(1);
    });

    it("reorder_qty=0, min=0 → moq=1 fallback (Math.max guard)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct({ reorder_qty: 0 })]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].moq).toBe(1);
    });

    it("reorder_qty=null, min=0 → moq=1 fallback", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct()]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].moq).toBe(1);
    });

    it("reorder_qty=10, min=5 → moq=10 (regresyon: pozitif değerler korunur)", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ reorder_qty: 10, min_stock_level: 5, available_now: 0 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].moq).toBe(10);
    });

    it("reorder_qty=null, min=20 → moq=20 (Math.max etkisiz, fallback min korunur)", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ min_stock_level: 20, available_now: 5 }),
        ]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].moq).toBe(20);
    });

    it("JSON serializable — Infinity/NaN üretmez (response.json() throw etmez)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct()]);
        const res = await POST();
        // Response.json() Infinity → null, NaN → null çevirir; ama suggestQty sayısal olmalı
        const body = await res.json();
        const txt = JSON.stringify(body.items[0]);
        expect(txt).not.toContain("null,\"moq\"");
        expect(body.items[0].suggestQty).toBeTypeOf("number");
    });
});
