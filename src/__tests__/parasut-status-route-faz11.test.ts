/**
 * Faz 11.3 — GET /api/orders/[id]/parasut-status
 *   - 404: sipariş yok
 *   - badges: contact/product/shipment/invoice/edoc — her kombinasyon
 *   - eDoc status pass-through
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDbGetOrderById    = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbGetProductById  = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...a: unknown[]) => mockDbGetOrderById(...a),
}));
vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...a: unknown[]) => mockDbGetCustomerById(...a),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: (...a: unknown[]) => mockDbGetProductById(...a),
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

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetOrderById.mockResolvedValue(baseOrder);
    mockDbGetCustomerById.mockResolvedValue({ id: "cust-1", parasut_contact_id: null });
    mockDbGetProductById.mockResolvedValue({ id: "prod-1", parasut_product_id: null });
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
        mockDbGetProductById.mockResolvedValue({ id: "prod-1", parasut_product_id: "pr-1" });
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
        mockDbGetProductById
            .mockResolvedValueOnce({ id: "prod-1", parasut_product_id: "pr-1" })
            .mockResolvedValueOnce({ id: "prod-2", parasut_product_id: null });
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
        mockDbGetProductById.mockResolvedValue({ id: "prod-1", parasut_product_id: "pr-1" });
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
});
