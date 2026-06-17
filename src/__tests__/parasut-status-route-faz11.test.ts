/**
 * Faz 11.3 — GET /api/orders/[id]/parasut-status
 *   - 404: sipariş yok
 *   - badges: contact/product/shipment/invoice/edoc — her kombinasyon
 *   - eDoc status pass-through
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockDbGetOrderById    = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbGetProductParasutIds = vi.fn();
const mockDbCountRecentSyncLogsByStep = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...a: unknown[]) => mockDbGetOrderById(...a),
}));
vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...a: unknown[]) => mockDbGetCustomerById(...a),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbGetProductParasutIds: (...a: unknown[]) => mockDbGetProductParasutIds(...a),
}));
vi.mock("@/lib/supabase/sync-log", () => ({
    dbCountRecentSyncLogsByStep: (...a: unknown[]) => mockDbCountRecentSyncLogsByStep(...a),
}));

import { GET } from "@/app/api/orders/[id]/parasut-status/route";

const ORDER_ID = "ord-1";
const baseOrder = {
    id: ORDER_ID,
    order_number: "ORD-2026-0042",
    customer_id: "cust-1",
    parasut_step: "contact",
    parasut_error_kind: null,
    parasut_error: null,
    parasut_last_failed_step: null,
    parasut_retry_count: 0,
    parasut_next_retry_at: null,
    parasut_invoice_id: null,
    parasut_invoice_no: null,
    parasut_invoice_type: null,
    parasut_shipment_document_id: null,
    parasut_e_document_status: null,
    parasut_e_document_error: null,
    parasut_e_document_id: null,
    lines: [{ id: "ol-1", product_id: "prod-1", product_name: "Vana A" }],
};

function makeReq(): NextRequest {
    return new NextRequest(`http://localhost/api/orders/${ORDER_ID}/parasut-status`);
}
const params = { params: Promise.resolve({ id: ORDER_ID }) };

// ── Denetim Y1 (2026-06): route artık view_sales_orders şartı arar (demo-dostu requirePermissionFor) ──
const mockResolveAuthContext = vi.fn();
const mockRequirePermissionFor = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: (...a: unknown[]) => mockResolveAuthContext(...a),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermissionFor(...a),
}));

beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthContext.mockResolvedValue({
        user: { id: "u-1" }, userId: "u-1", roles: ["admin"], perms: new Set(["view_sales_orders"]),
    });
    mockRequirePermissionFor.mockReturnValue(null);
    mockDbGetOrderById.mockResolvedValue(baseOrder);
    mockDbGetCustomerById.mockResolvedValue({ id: "cust-1", parasut_contact_id: null });
    mockDbGetProductParasutIds.mockResolvedValue(new Map([["prod-1", null]]));
    mockDbCountRecentSyncLogsByStep.mockResolvedValue({});
});

describe("GET /api/orders/[id]/parasut-status", () => {
    it("sipariş yok → 404", async () => {
        mockDbGetOrderById.mockResolvedValue(null);
        const res = await GET(makeReq(), params);
        expect(res.status).toBe(404);
    });

    it("hiç bir step tamamlanmamış → tüm badges false/null", async () => {
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.badges.contactDone).toBe(false);
        expect(body.badges.productDone).toBe(false);
        expect(body.badges.shipmentDone).toBe(false);
        expect(body.badges.invoiceDone).toBe(false);
        expect(body.badges.edocStatus).toBeNull();
    });

    it("contact done → contactDone:true", async () => {
        mockDbGetCustomerById.mockResolvedValue({ id: "cust-1", parasut_contact_id: "ct-1" });
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.badges.contactDone).toBe(true);
        expect(body.badges.productDone).toBe(false);
    });

    it("contact + product done → productDone:true (tüm line products parasut_product_id var)", async () => {
        mockDbGetCustomerById.mockResolvedValue({ id: "cust-1", parasut_contact_id: "ct-1" });
        mockDbGetProductParasutIds.mockResolvedValue(new Map([["prod-1", "pr-1"]]));
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.badges.productDone).toBe(true);
    });

    it("bir line product'ın parasut_product_id'si yoksa productDone:false", async () => {
        mockDbGetOrderById.mockResolvedValue({
            ...baseOrder,
            lines: [
                { id: "ol-1", product_id: "prod-1", product_name: "A" },
                { id: "ol-2", product_id: "prod-2", product_name: "B" },
            ],
        });
        mockDbGetCustomerById.mockResolvedValue({ id: "cust-1", parasut_contact_id: "ct-1" });
        // prod-1 OK, prod-2 boş
        mockDbGetProductParasutIds.mockResolvedValue(new Map([["prod-1", "pr-1"], ["prod-2", null]]));
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.badges.productDone).toBe(false);
    });

    it("shipment + invoice + edoc done", async () => {
        mockDbGetOrderById.mockResolvedValue({
            ...baseOrder,
            parasut_shipment_document_id: "sh-1",
            parasut_invoice_id:           "inv-1",
            parasut_e_document_status:    "done",
            parasut_e_document_id:        "ed-1",
        });
        mockDbGetCustomerById.mockResolvedValue({ id: "cust-1", parasut_contact_id: "ct-1" });
        mockDbGetProductParasutIds.mockResolvedValue(new Map([["prod-1", "pr-1"]]));
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.badges.contactDone).toBe(true);
        expect(body.badges.productDone).toBe(true);
        expect(body.badges.shipmentDone).toBe(true);
        expect(body.badges.invoiceDone).toBe(true);
        expect(body.badges.edocStatus).toBe("done");
        expect(body.eDoc.id).toBe("ed-1");
    });

    it("error_kind + error pass-through", async () => {
        mockDbGetOrderById.mockResolvedValue({
            ...baseOrder,
            parasut_error_kind: "validation",
            parasut_error: "invalid VAT",
            parasut_last_failed_step: "invoice",
            parasut_retry_count: 2,
            parasut_next_retry_at: "2026-04-26T10:00:00Z",
        });
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.errorKind).toBe("validation");
        expect(body.error).toBe("invalid VAT");
        expect(body.lastFailedStep).toBe("invoice");
        expect(body.retryCount).toBe(2);
        expect(body.nextRetryAt).toBe("2026-04-26T10:00:00Z");
    });

    it("customer_id NULL → contactDone:false (lookup atlanır)", async () => {
        mockDbGetOrderById.mockResolvedValue({ ...baseOrder, customer_id: null });
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.badges.contactDone).toBe(false);
        expect(mockDbGetCustomerById).not.toHaveBeenCalled();
    });

    it("lines boş → productDone:false (vakum doğru değil)", async () => {
        mockDbGetOrderById.mockResolvedValue({ ...baseOrder, lines: [] });
        mockDbGetCustomerById.mockResolvedValue({ id: "cust-1", parasut_contact_id: "ct-1" });
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.badges.productDone).toBe(false);
    });

    // M2 (bulgu fix) — son 24h step başına deneme sayısı
    it("attemptsLast24h sync_log audit'inden döner", async () => {
        mockDbCountRecentSyncLogsByStep.mockResolvedValue({ contact: 3, invoice: 1 });
        const res = await GET(makeReq(), params);
        const body = await res.json();
        expect(body.attemptsLast24h).toEqual({ contact: 3, invoice: 1 });
        expect(mockDbCountRecentSyncLogsByStep).toHaveBeenCalledWith(ORDER_ID, 24);
    });

    it("sync log count fail → endpoint düşmez (best-effort), attemptsLast24h={}", async () => {
        mockDbCountRecentSyncLogsByStep.mockRejectedValue(new Error("DB down"));
        const res = await GET(makeReq(), params);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.attemptsLast24h).toEqual({});
    });
});

describe("Y1 RBAC guard", () => {
    it("izin yoksa 403 döner ve DB'ye inmez", async () => {
        mockRequirePermissionFor.mockReturnValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await GET({} as never, { params: Promise.resolve({ id: "o-1" }) });
        expect(res.status).toBe(403);
        expect(mockDbGetOrderById).not.toHaveBeenCalled();
    });
});
