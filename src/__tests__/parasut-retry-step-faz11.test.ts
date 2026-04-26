/**
 * Faz 11.2 — Step-granular manual retry
 * serviceRetryParasutStep + POST /api/parasut/retry kontratı:
 *   - step='all' → orchestrator full sync
 *   - step='X' (X != 'all') → dep guard + claim + tek step + markStepDone(next)
 *   - dep fail → 400 + claim alınmaz
 *   - eDoc 'running' status → markStepDone çağrılmaz (poll bitirir)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbGetOrderById     = vi.fn();
const mockDbGetCustomerById  = vi.fn();
const mockDbGetProductById   = vi.fn();
const mockDbCreateSyncLog    = vi.fn();
const mockDbCreateAlert      = vi.fn();
const mockDbGetSyncLog       = vi.fn();
const mockDbUpdateSyncLog    = vi.fn();
const mockRpc                = vi.fn();
const mockDbListActiveAlerts = vi.fn().mockResolvedValue([]);

const updateCalls: Array<Record<string, unknown>> = [];
// Generic Supabase query-builder mock: tüm chaining metodlar self-return; await edildiğinde
// veya .select("...") çağrıldığında { data: [{id:'x'}], error: null } döner.
function chainProxy(): unknown {
    const result = { data: [{ id: "x" }], error: null };
    const handler: ProxyHandler<object> = {
        get(_t, prop) {
            if (prop === "then") {
                const p = Promise.resolve(result);
                return p.then.bind(p);
            }
            if (prop === "catch") {
                const p = Promise.resolve(result);
                return p.catch.bind(p);
            }
            // chaining: .eq() .neq() .or() .is() .in() .select() .order() .limit() .range() .single() .maybeSingle()
            return () => chainProxy();
        },
    };
    return new Proxy({}, handler);
}
const mockUpdate = vi.fn((patch: Record<string, unknown>) => {
    updateCalls.push(patch);
    return chainProxy();
});

const mockFindContactsByTax    = vi.fn();
const mockFindContactsByEmail  = vi.fn();
const mockUpdateContact        = vi.fn();
const mockCreateContact        = vi.fn();
const mockFindProductsByCode   = vi.fn();
const mockCreateProduct        = vi.fn();
const mockListShipments        = vi.fn();
const mockCreateShipment       = vi.fn();
const mockListInvoices         = vi.fn();
const mockCreateInvoice        = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...a: unknown[]) => mockDbGetOrderById(...a),
}));

vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...a: unknown[]) => mockDbGetCustomerById(...a),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: (...a: unknown[]) => mockDbGetProductById(...a),
}));

vi.mock("@/lib/supabase/sync-log", () => ({
    dbCreateSyncLog: (...a: unknown[]) => mockDbCreateSyncLog(...a),
    dbGetSyncLog:    (...a: unknown[]) => mockDbGetSyncLog(...a),
    dbUpdateSyncLog: (...a: unknown[]) => mockDbUpdateSyncLog(...a),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert:      (...a: unknown[]) => mockDbCreateAlert(...a),
    dbListActiveAlerts: (...a: unknown[]) => mockDbListActiveAlerts(...a),
}));

vi.mock("@/lib/parasut", () => ({
    getParasutAdapter: () => ({
        findContactsByTaxNumber:            (...a: unknown[]) => mockFindContactsByTax(...a),
        findContactsByEmail:                (...a: unknown[]) => mockFindContactsByEmail(...a),
        updateContact:                      (...a: unknown[]) => mockUpdateContact(...a),
        createContact:                      (...a: unknown[]) => mockCreateContact(...a),
        findProductsByCode:                 (...a: unknown[]) => mockFindProductsByCode(...a),
        createProduct:                      (...a: unknown[]) => mockCreateProduct(...a),
        listRecentShipmentDocuments:        (...a: unknown[]) => mockListShipments(...a),
        createShipmentDocument:             (...a: unknown[]) => mockCreateShipment(...a),
        findSalesInvoicesByNumber:          (...a: unknown[]) => mockListInvoices(...a),
        createSalesInvoice:                 (...a: unknown[]) => mockCreateInvoice(...a),
        getSalesInvoiceWithActiveEDocument: () => Promise.resolve({ active_e_document: null }),
        getTrackableJob:                    () => Promise.resolve({ status: "running" }),
        listEInvoiceInboxesByVkn:           () => Promise.resolve([]),
        createEInvoice:                     () => Promise.resolve({ trackable_job_id: "job-x" }),
        createEArchive:                     () => Promise.resolve({ trackable_job_id: "job-x" }),
    }),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({
            update: mockUpdate,
            select: () => chainProxy(),
            insert: () => chainProxy(),
            delete: () => chainProxy(),
        }),
        rpc:  mockRpc,
    }),
}));

import { serviceRetryParasutStep } from "@/lib/services/parasut-service";
import { POST as retryRoute } from "@/app/api/parasut/retry/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORDER_ID = "ord-1";
const baseOrder = {
    id:                       ORDER_ID,
    order_number:             "ORD-2026-0042",
    commercial_status:        "approved",
    fulfillment_status:       "shipped",
    customer_id:              "cust-1",
    customer_name:            "Test",
    currency:                 "USD",
    parasut_step:             "contact",
    parasut_retry_count:      0,
    parasut_shipment_document_id: null,
    parasut_invoice_id:       null,
    parasut_e_document_id:    null,
    parasut_e_document_status:null,
    parasut_trackable_job_id: null,
    lines: [
        { id: "ol-1", product_id: "prod-1", product_name: "Vana A", product_sku: "VAN-001", quantity: 1, unit_price: 100, line_total: 100, vat_rate: 0.20, discount_pct: 0, unit: "adet" },
    ],
};

const baseCustomer = {
    id:                 "cust-1",
    name:               "Test Müşteri",
    tax_number:         "1234567890",
    parasut_contact_id: null,
    address:            "Adres",
    city:               "İstanbul",
    district:           "Kadıköy",
};

const baseProduct = {
    id:                 "prod-1",
    name:               "Vana A",
    sku:                "VAN-001",
    unit:               "adet",
    parasut_product_id: null,
    price:              100,
    currency:           "USD",
};

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    process.env.PARASUT_ENABLED = "true";
    mockDbGetOrderById.mockResolvedValue(baseOrder);
    mockDbGetCustomerById.mockResolvedValue(baseCustomer);
    mockDbGetProductById.mockResolvedValue(baseProduct);
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockFindContactsByTax.mockResolvedValue([]);
    mockFindContactsByEmail.mockResolvedValue([]);
    mockUpdateContact.mockResolvedValue({ id: "ct-new", attributes: {} });
    mockCreateContact.mockResolvedValue({ id: "ct-new", attributes: {} });
    mockFindProductsByCode.mockResolvedValue([]);
    mockCreateProduct.mockResolvedValue({ id: "pr-new", attributes: {} });
    mockListShipments.mockResolvedValue([]);
    mockCreateShipment.mockResolvedValue({ id: "sh-new", attributes: {} });
    mockListInvoices.mockResolvedValue([]);
    mockCreateInvoice.mockResolvedValue({ id: "inv-new", attributes: { invoice_id: "inv-new" } });
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

function makeRetryReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/parasut/retry", {
        method:  "POST",
        body:    JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

// ─── serviceRetryParasutStep — dep guard ─────────────────────────────────────

describe("serviceRetryParasutStep — dep guard", () => {
    it("step=product, parasut_contact_id NULL → reddet (claim alınmaz)", async () => {
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, parasut_contact_id: null });
        const r = await serviceRetryParasutStep(ORDER_ID, "product");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/contact.*tamamlanmalı/);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("step=shipment, herhangi bir product.parasut_product_id NULL → reddet", async () => {
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, parasut_contact_id: "ct-1" });
        mockDbGetProductById.mockResolvedValue({ ...baseProduct, parasut_product_id: null });
        const r = await serviceRetryParasutStep(ORDER_ID, "shipment");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/product.*tamamlanmalı/);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("step=invoice, parasut_shipment_document_id NULL → reddet", async () => {
        const r = await serviceRetryParasutStep(ORDER_ID, "invoice");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/shipment.*tamamlanmalı/);
    });

    it("step=edoc, parasut_invoice_id NULL → reddet", async () => {
        const r = await serviceRetryParasutStep(ORDER_ID, "edoc");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/invoice.*tamamlanmalı/);
    });

    it("step=contact → dep yok, çalışır (claim alınır)", async () => {
        const r = await serviceRetryParasutStep(ORDER_ID, "contact");
        expect(r.success).toBe(true);
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.any(Object));
    });
});

// ─── serviceRetryParasutStep — order eligibility ─────────────────────────────

describe("serviceRetryParasutStep — eligibility", () => {
    it("PARASUT_ENABLED=false → reddet", async () => {
        process.env.PARASUT_ENABLED = "false";
        const r = await serviceRetryParasutStep(ORDER_ID, "contact");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/devre dışı/);
    });

    it("commercial_status approved değil → reddet", async () => {
        mockDbGetOrderById.mockResolvedValue({ ...baseOrder, commercial_status: "draft" });
        const r = await serviceRetryParasutStep(ORDER_ID, "contact");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/onaylı/);
    });

    it("fulfillment_status shipped değil → reddet", async () => {
        mockDbGetOrderById.mockResolvedValue({ ...baseOrder, fulfillment_status: "allocated" });
        const r = await serviceRetryParasutStep(ORDER_ID, "contact");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/sevk edilmiş/);
    });

    it("claim alınamaz (başka worker tutuyor) → skipped:true", async () => {
        mockRpc.mockResolvedValue({ data: false, error: null });
        const r = await serviceRetryParasutStep(ORDER_ID, "contact");
        expect(r.success).toBe(false);
        expect(r.skipped).toBe(true);
    });
});

// ─── serviceRetryParasutStep — step='all' ────────────────────────────────────

describe("serviceRetryParasutStep — step='all'", () => {
    it("step='all' → orchestrator yolu (claim alınır + dbGetOrderById çağrılır)", async () => {
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, parasut_contact_id: "ct-1" });
        mockDbGetProductById.mockResolvedValue({ ...baseProduct, parasut_product_id: "pr-1" });
        await serviceRetryParasutStep(ORDER_ID, "all");
        // Orchestrator'ı çağırdığını kanıtlamak için: dbGetOrderById çağrıldı + claim_sync RPC tetiklendi
        expect(mockDbGetOrderById).toHaveBeenCalledWith(ORDER_ID);
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.any(Object));
    });
});

// ─── POST /api/parasut/retry route ───────────────────────────────────────────

describe("POST /api/parasut/retry — Faz 11.2 kontratı", () => {
    it("body { orderId, step:'contact' } → 200", async () => {
        const res = await retryRoute(makeRetryReq({ orderId: ORDER_ID, step: "contact" }));
        expect(res.status).toBe(200);
    });

    it("body { orderId } (step yok) → 'all' default, orchestrator çağrılır", async () => {
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, parasut_contact_id: "ct-1" });
        mockDbGetProductById.mockResolvedValue({ ...baseProduct, parasut_product_id: "pr-1" });
        await retryRoute(makeRetryReq({ orderId: ORDER_ID }));
        // 'all' default'u orchestrator'a yönlendi → claim alınır
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.any(Object));
    });

    it("geçersiz step → 400", async () => {
        const res = await retryRoute(makeRetryReq({ orderId: ORDER_ID, step: "garbage" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/Geçersiz step/);
    });

    it("dep guard fail → 400", async () => {
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, parasut_contact_id: null });
        const res = await retryRoute(makeRetryReq({ orderId: ORDER_ID, step: "product" }));
        expect(res.status).toBe(400);
    });

    it("body { sync_log_id } eski API geriye dönük: serviceRetrySyncLog çağrılır", async () => {
        mockDbGetSyncLog.mockResolvedValue({
            id: "log-1", entity_id: ORDER_ID, retry_count: 0,
        });
        mockDbUpdateSyncLog.mockResolvedValue(undefined);
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, parasut_contact_id: "ct-1" });
        mockDbGetProductById.mockResolvedValue({ ...baseProduct, parasut_product_id: "pr-1" });
        await retryRoute(makeRetryReq({ sync_log_id: "log-1" }));
        expect(mockDbGetSyncLog).toHaveBeenCalledWith("log-1");
        // sync_log path da orchestrator'a giderek claim alır
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.any(Object));
    });

    it("body boş → 400", async () => {
        const res = await retryRoute(makeRetryReq({}));
        expect(res.status).toBe(400);
    });

    it("skipped (başka worker tutuyor) → 200 + skipped:true (400 değil)", async () => {
        mockRpc.mockResolvedValue({ data: false, error: null });
        const res = await retryRoute(makeRetryReq({ orderId: ORDER_ID, step: "contact" }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.skipped).toBe(true);
    });
});
