/**
 * PUT /api/orders/[id] — taslak sipariş düzenleme (Faz 2).
 * Yetki (manage_sales_orders), draft guard (409), bulunamadı (404),
 * validation (400), başarı (200) + revalidateTag products.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
    getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
}));

vi.mock("@/lib/auth/redact", () => ({
    redactOrderForPerms: (o: unknown) => o,
}));

const mockServiceUpdateOrderLines = vi.fn();
const mockServiceGetOrder = vi.fn();
vi.mock("@/lib/services/order-service", () => ({
    serviceUpdateOrderLines: (...a: unknown[]) => mockServiceUpdateOrderLines(...a),
    serviceGetOrder: (...a: unknown[]) => mockServiceGetOrder(...a),
    serviceTransitionOrder: vi.fn(),
    serviceUpdateQuoteDeadline: vi.fn(),
}));

vi.mock("@/lib/services/parasut-service", () => ({ serviceSyncOrderToParasut: vi.fn() }));
vi.mock("@/lib/services/email-service", () => ({ notifyUsersByEmail: vi.fn() }));
vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn(), dbHardDeleteOrder: vi.fn() }));

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a) }));

import { NextRequest } from "next/server";
import { PUT } from "@/app/api/orders/[id]/route";

const ORDER_ID = "00000000-0000-4000-8000-000000000abc";
const VALID_BODY = {
    customer_id: "00000000-0000-4000-8000-0000000000c1",
    customer_name: "Test AŞ",
    currency: "TRY",
    notes: "",
    lines: [{ product_id: "00000000-0000-4000-8000-0000000000p1", product_name: "Vana", product_sku: "V1", unit: "adet", quantity: 2, unit_price: 100, discount_pct: 0, line_total: 200 }],
};

function putReq(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}
const ctx = { params: Promise.resolve({ id: ORDER_ID }) };

beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(null);
    mockServiceUpdateOrderLines.mockResolvedValue({ order_id: ORDER_ID, item_count: 1 });
    mockServiceGetOrder.mockResolvedValue({ id: ORDER_ID, order_number: "ORD-2026-1", lines: [] });
});

describe("PUT /api/orders/[id]", () => {
    it("yetkisiz (requirePermission guard döner) → guard response", async () => {
        const denied = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
        mockRequirePermission.mockResolvedValue(denied);
        const res = await PUT(putReq(VALID_BODY), ctx);
        expect(res.status).toBe(403);
        expect(mockServiceUpdateOrderLines).not.toHaveBeenCalled();
    });

    it("başarılı düzenleme → 200 + revalidateTag products + actor geçilir", async () => {
        const res = await PUT(putReq(VALID_BODY), ctx);
        expect(res.status).toBe(200);
        expect(mockServiceUpdateOrderLines).toHaveBeenCalledWith(ORDER_ID, expect.objectContaining({ customer_name: "Test AŞ" }), "user-1");
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("taslak değil → 409", async () => {
        mockServiceUpdateOrderLines.mockRejectedValue(new Error("Yalnızca taslak siparişler düzenlenebilir."));
        const res = await PUT(putReq(VALID_BODY), ctx);
        expect(res.status).toBe(409);
    });

    it("bulunamadı → 404", async () => {
        mockServiceUpdateOrderLines.mockRejectedValue(new Error("Sipariş bulunamadı."));
        const res = await PUT(putReq(VALID_BODY), ctx);
        expect(res.status).toBe(404);
    });

    it("validation hatası → 400", async () => {
        mockServiceUpdateOrderLines.mockRejectedValue(new Error("En az bir satır ürün girilmelidir."));
        const res = await PUT(putReq({ ...VALID_BODY, lines: [] }), ctx);
        expect(res.status).toBe(400);
    });

    it("geçersiz JSON → 400 (safeParseJson)", async () => {
        const req = new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: "{bozuk",
        });
        const res = await PUT(req, ctx);
        expect(res.status).toBe(400);
        expect(mockServiceUpdateOrderLines).not.toHaveBeenCalled();
    });
});
