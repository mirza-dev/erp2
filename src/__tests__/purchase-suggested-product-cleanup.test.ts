/**
 * Sprint C bulgular 2. tur — Fix 3: Ürün silinince/deaktif edilince
 * önerileri hemen expire eder.
 *
 * DELETE /api/products/[id] ve PATCH /api/products/[id] (is_active: false)
 * route handler'larının dbExpireEntityRecommendations'ı tetiklediğini doğrular.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockDbUpdateProduct = vi.fn();
const mockDbDeleteProduct = vi.fn();
const mockDbBatchResolveAlerts = vi.fn();
const mockDbExpireEntityRecommendations = vi.fn();
const mockRevalidateTag = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: vi.fn(),
    dbUpdateProduct: (...a: unknown[]) => mockDbUpdateProduct(...a),
    dbDeleteProduct: (...a: unknown[]) => mockDbDeleteProduct(...a),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbBatchResolveAlerts: (...a: unknown[]) => mockDbBatchResolveAlerts(...a),
}));

vi.mock("@/lib/supabase/recommendations", () => ({
    dbExpireEntityRecommendations: (...a: unknown[]) => mockDbExpireEntityRecommendations(...a),
}));

vi.mock("next/cache", () => ({
    revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
}));

import { DELETE, PATCH } from "@/app/api/products/[id]/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PARAMS = (id = "prod-1") => ({ params: Promise.resolve({ id }) });

function makeReq(body: unknown, id = "prod-1") {
    return new NextRequest(`http://localhost/api/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

const mockProduct = { id: "prod-1", name: "Test Ürün", sku: "SKU-001", is_active: false };

beforeEach(() => {
    vi.clearAllMocks();
    mockDbDeleteProduct.mockResolvedValue(undefined);
    mockDbUpdateProduct.mockResolvedValue(mockProduct);
    mockDbBatchResolveAlerts.mockResolvedValue([]);
    mockDbExpireEntityRecommendations.mockResolvedValue(undefined);
    mockRevalidateTag.mockReturnValue(undefined);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DELETE /api/products/[id] — Fix 3: rec cleanup", () => {
    it("silme → dbExpireEntityRecommendations çağrılır", async () => {
        const res = await DELETE(new NextRequest("http://localhost/api/products/prod-1"), PARAMS());
        expect(res.status).toBe(200);
        expect(mockDbExpireEntityRecommendations).toHaveBeenCalledWith("prod-1", "product");
    });

    it("silme → dbBatchResolveAlerts da çağrılır (alert cleanup)", async () => {
        await DELETE(new NextRequest("http://localhost/api/products/prod-1"), PARAMS());
        expect(mockDbBatchResolveAlerts).toHaveBeenCalled();
    });

    it("dbExpireEntityRecommendations hata fırlatırsa yine 200 döner (best-effort)", async () => {
        mockDbExpireEntityRecommendations.mockRejectedValue(new Error("DB bağlantı hatası"));
        const res = await DELETE(new NextRequest("http://localhost/api/products/prod-1"), PARAMS());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });
});

describe("PATCH /api/products/[id] — Fix 3: is_active=false → rec cleanup", () => {
    it("is_active: false → dbExpireEntityRecommendations çağrılır", async () => {
        const res = await PATCH(makeReq({ is_active: false }), PARAMS());
        expect(res.status).toBe(200);
        expect(mockDbExpireEntityRecommendations).toHaveBeenCalledWith("prod-1", "product");
    });

    it("is_active: false → dbBatchResolveAlerts da çağrılır", async () => {
        await PATCH(makeReq({ is_active: false }), PARAMS());
        expect(mockDbBatchResolveAlerts).toHaveBeenCalled();
    });

    it("is_active: true → dbExpireEntityRecommendations çağrılmaz", async () => {
        mockDbUpdateProduct.mockResolvedValue({ ...mockProduct, is_active: true });
        await PATCH(makeReq({ is_active: true }), PARAMS());
        expect(mockDbExpireEntityRecommendations).not.toHaveBeenCalled();
    });

    it("is_active yoksa (başka alan güncellemesi) → dbExpireEntityRecommendations çağrılmaz", async () => {
        mockDbUpdateProduct.mockResolvedValue({ ...mockProduct, is_active: true });
        await PATCH(makeReq({ name: "Yeni İsim" }), PARAMS());
        expect(mockDbExpireEntityRecommendations).not.toHaveBeenCalled();
    });

    it("dbExpireEntityRecommendations hata fırlatırsa is_active=false güncelleme yine 200 döner", async () => {
        mockDbExpireEntityRecommendations.mockRejectedValue(new Error("Hata"));
        const res = await PATCH(makeReq({ is_active: false }), PARAMS());
        expect(res.status).toBe(200);
    });
});
