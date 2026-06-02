/**
 * Ürün gövde doğrulama parity — POST'taki validation katmanı PATCH'e de uygulandı.
 * Önce: PATCH /api/products/[id] HİÇ doğrulama yapmıyordu (string uzunluğu yok,
 * numeric sınır yok); POST ise yalnız `> MAX` kontrol ediyor, negatifleri geçiriyordu.
 * Şimdi: ortak `validateProductInput` her iki route'ta + negatif guard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { validateProductInput } from "@/lib/validation/product-input";

// ── Pure helper davranışı ────────────────────────────────────
describe("validateProductInput (pure)", () => {
    it("requireCore: name/sku/unit zorunlu", () => {
        expect(validateProductInput({}, { requireCore: true })).toMatch(/Ürün adı/);
        expect(validateProductInput({ name: "X" }, { requireCore: true })).toMatch(/SKU/);
        expect(validateProductInput({ name: "X", sku: "S" }, { requireCore: true })).toMatch(/Birim/);
        expect(validateProductInput({ name: "X", sku: "S", unit: "adet" }, { requireCore: true })).toBeNull();
    });
    it("requireCore: false → name/sku/unit atlanabilir", () => {
        expect(validateProductInput({ price: 10 }, { requireCore: false })).toBeNull();
    });
    it("negatif sayı → hata (her iki mod)", () => {
        expect(validateProductInput({ price: -1 }, { requireCore: false })).toMatch(/negatif/);
        expect(validateProductInput({ on_hand: -5 }, { requireCore: false })).toMatch(/negatif/);
        expect(validateProductInput({ name: "X", sku: "S", unit: "adet", cost_price: -3 }, { requireCore: true })).toMatch(/negatif/);
    });
    it("üst sınır aşımı → hata", () => {
        expect(validateProductInput({ min_stock_level: 1_000_000_000 }, { requireCore: false })).toMatch(/çok büyük/);
    });
    it("negatif numeric-string de yakalanır (coerce)", () => {
        expect(validateProductInput({ price: "-2" as unknown as number }, { requireCore: false })).toMatch(/negatif/);
    });
    it("sayısal olmayan değer sessizce geçer (DB reddeder — mevcut davranış)", () => {
        expect(validateProductInput({ price: "abc" as unknown as number }, { requireCore: false })).toBeNull();
    });
    it("uzun string (>10k) → hata", () => {
        expect(validateProductInput({ product_notes: "a".repeat(10_001) }, { requireCore: false })).toBeTruthy();
    });
    it("geçerli tam gövde → null", () => {
        expect(validateProductInput(
            { name: "Vana", sku: "KV-1", unit: "adet", price: 100, on_hand: 5, cost_price: 60 },
            { requireCore: true },
        )).toBeNull();
    });
});

// ── Route entegrasyonu (gerçek validateProductInput, mock DB) ─
const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockQuoted = vi.fn();
const mockIncoming = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById:      (...a: unknown[]) => mockGetById(...a),
    dbUpdateProduct:       (...a: unknown[]) => mockUpdate(...a),
    dbDeleteProduct:       vi.fn(),
    dbCreateProduct:       (...a: unknown[]) => mockCreate(...a),
    dbGetQuotedQuantities: (...a: unknown[]) => mockQuoted(...a),
    dbListProducts:        vi.fn(),
}));
vi.mock("@/lib/supabase/purchase-commitments", () => ({
    dbGetIncomingQuantities: (...a: unknown[]) => mockIncoming(...a),
}));
vi.mock("@/lib/supabase/alerts", () => ({ dbBatchResolveAlerts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/supabase/recommendations", () => ({ dbExpireEntityRecommendations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(new Set(["view_sales_prices", "view_purchase_costs"])),
}));
vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

import { PATCH } from "@/app/api/products/[id]/route";
import { POST } from "@/app/api/products/route";

const params = { params: Promise.resolve({ id: "p1" }) };
function product() {
    return {
        id: "p1", name: "Vana", sku: "SKU-1", category: null, unit: "adet",
        price: 100, currency: "USD", on_hand: 10, reserved: 2, available_now: 8,
        min_stock_level: 5, is_active: true, product_type: "manufactured",
        cost_price: 60, daily_usage: null, lead_time_days: null,
        created_at: "2024-01-01", updated_at: "2024-01-01",
    };
}
function patchReq(body: unknown) {
    return new NextRequest("http://localhost/api/products/p1", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
}
function postReq(body: unknown) {
    return new NextRequest("http://localhost/api/products", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(product());
    mockUpdate.mockResolvedValue(product());
    mockCreate.mockResolvedValue(product());
    mockQuoted.mockResolvedValue(new Map());
    mockIncoming.mockResolvedValue(new Map());
});

describe("PATCH /api/products/[id] — validation parity", () => {
    it("negatif fiyat → 400 + dbUpdateProduct ÇAĞRILMAZ", async () => {
        const res = await PATCH(patchReq({ price: -1 }), params);
        expect(res.status).toBe(400);
        expect(mockUpdate).not.toHaveBeenCalled();
    });
    it("aşırı uzun string → 400 + dbUpdateProduct ÇAĞRILMAZ", async () => {
        const res = await PATCH(patchReq({ product_notes: "a".repeat(10_001) }), params);
        expect(res.status).toBe(400);
        expect(mockUpdate).not.toHaveBeenCalled();
    });
    it("geçerli body → 200 + dbUpdateProduct çağrılır", async () => {
        const res = await PATCH(patchReq({ price: 120, min_stock_level: 3 }), params);
        expect(res.status).toBe(200);
        expect(mockUpdate).toHaveBeenCalledOnce();
    });
    it("is_active: false (deaktif) → validation engellemez, 200", async () => {
        const res = await PATCH(patchReq({ is_active: false }), params);
        expect(res.status).toBe(200);
        expect(mockUpdate).toHaveBeenCalledOnce();
    });
});

describe("POST /api/products — negatif guard (yeni)", () => {
    it("negatif on_hand → 400 + dbCreateProduct ÇAĞRILMAZ", async () => {
        const res = await POST(postReq({ name: "X", sku: "S", unit: "adet", on_hand: -2 }));
        expect(res.status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });
    it("zorunlu alan eksik (sku) → 400", async () => {
        const res = await POST(postReq({ name: "X", unit: "adet" }));
        expect(res.status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });
    it("geçerli → 201 + dbCreateProduct çağrılır", async () => {
        const res = await POST(postReq({ name: "X", sku: "S-NEW", unit: "adet", price: 50 }));
        expect(res.status).toBe(201);
        expect(mockCreate).toHaveBeenCalledOnce();
    });
});
