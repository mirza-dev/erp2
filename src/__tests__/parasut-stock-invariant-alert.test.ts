/**
 * Faz 11.6 (LOW bulgu fix) — STOCK_INVARIANT alert üretimi
 * upsertInvoice içinde createSalesInvoice fırlatırsa ve mesaj "stok invariant"
 * kalıbına uyarsa, ALERT_ENTITY_PARASUT_STOCK_INVARIANT entity_id ile sync_issue
 * alert üretilir. Diğer validation hatalarında bu alert üretilmez.
 *
 * Mock yaklaşımı: serviceSyncOrderToParasut'u olduğu gibi çalıştırıp
 * adapter.createSalesInvoice'tan stok invariant ParasutError fırlatıyoruz.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDbGetOrderById    = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbGetProductById  = vi.fn();
const mockDbCreateAlert     = vi.fn();
const mockDbCreateSyncLog   = vi.fn();
const mockRpc               = vi.fn();
const mockDbListActiveAlerts= vi.fn().mockResolvedValue([]);

const updateCalls: Array<Record<string, unknown>> = [];
function chainProxy(): unknown {
    const result = { data: [{ id: "x" }], error: null };
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === "then")  { const p = Promise.resolve(result); return p.then.bind(p); }
            if (prop === "catch") { const p = Promise.resolve(result); return p.catch.bind(p); }
            return () => chainProxy();
        },
    });
}
const mockUpdate = vi.fn((patch: Record<string, unknown>) => {
    updateCalls.push(patch);
    return chainProxy();
});

const mockCreateSalesInvoice = vi.fn();

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
    dbGetSyncLog:    vi.fn(),
    dbUpdateSyncLog: vi.fn(),
}));
vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert:      (...a: unknown[]) => mockDbCreateAlert(...a),
    dbListActiveAlerts: (...a: unknown[]) => mockDbListActiveAlerts(...a),
}));

vi.mock("@/lib/parasut", () => ({
    getParasutAdapter: () => ({
        // contact + product + shipment OK; sadece invoice'da inject ediyoruz
        findContactsByTaxNumber:   () => Promise.resolve([{ id: "ct-1", attributes: {} }]),
        findContactsByEmail:       () => Promise.resolve([]),
        updateContact:             () => Promise.resolve({ id: "ct-1", attributes: {} }),
        createContact:             () => Promise.resolve({ id: "ct-1", attributes: {} }),
        findProductsByCode:        () => Promise.resolve([{ id: "pr-1", attributes: {} }]),
        createProduct:             () => Promise.resolve({ id: "pr-1", attributes: {} }),
        listRecentShipmentDocuments: () => Promise.resolve([]),
        createShipmentDocument:    () => Promise.resolve({ id: "sh-1", attributes: {} }),
        findSalesInvoicesByNumber: () => Promise.resolve([]),
        createSalesInvoice:        (...a: unknown[]) => mockCreateSalesInvoice(...a),
        getSalesInvoiceWithActiveEDocument: () => Promise.resolve({ active_e_document: null }),
        getTrackableJob:           () => Promise.resolve({ status: "running" }),
        listEInvoiceInboxesByVkn:  () => Promise.resolve([]),
        createEInvoice:            () => Promise.resolve({ trackable_job_id: "j" }),
        createEArchive:            () => Promise.resolve({ trackable_job_id: "j" }),
    }),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({
            update: mockUpdate,
            select: () => chainProxy(),
            insert: () => chainProxy(),
        }),
        rpc: mockRpc,
    }),
}));

import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";
import { ParasutError } from "@/lib/parasut-adapter";

const ORDER_ID = "ord-inv-1";
const order = {
    id:                      ORDER_ID,
    order_number:            "ORD-2026-0042",
    commercial_status:       "approved",
    fulfillment_status:      "shipped",
    customer_id:             "cust-1",
    customer_name:           "Test",
    currency:                "USD",
    parasut_step:            "invoice",
    parasut_retry_count:     0,
    parasut_shipment_document_id: "sh-1",
    parasut_invoice_id:      null,
    parasut_invoice_no:      null,
    parasut_e_document_id:   null,
    parasut_e_document_status: null,
    parasut_trackable_job_id: null,
    shipped_at:              "2026-04-26T10:00:00Z",
    created_at:              "2026-04-25T10:00:00Z",
    lines: [
        { id: "ol-1", product_id: "prod-1", product_name: "Vana A", product_sku: "VAN-001",
          quantity: 1, unit_price: 100, line_total: 100, vat_rate: 0.20, discount_pct: 0, unit: "adet" },
    ],
};
const customer = {
    id: "cust-1", name: "Test", tax_number: "1234567890",
    parasut_contact_id: "ct-1", address: "A", city: "İST", district: "K",
};
const product = {
    id: "prod-1", name: "Vana A", sku: "VAN-001", unit: "adet",
    parasut_product_id: "pr-1", price: 100, currency: "USD",
};

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    process.env.PARASUT_ENABLED = "true";
    mockDbGetOrderById.mockResolvedValue(order);
    mockDbGetCustomerById.mockResolvedValue(customer);
    mockDbGetProductById.mockResolvedValue(product);
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockDbCreateSyncLog.mockResolvedValue({ id: "log" });
    mockDbCreateAlert.mockResolvedValue(undefined);
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

describe("STOCK_INVARIANT alert (Faz 11.6 LOW fix)", () => {
    it("createSalesInvoice 'stok invariant' validation error → STOCK_INVARIANT alert üretilir", async () => {
        mockCreateSalesInvoice.mockRejectedValue(
            new ParasutError("validation", "createSalesInvoice: shipment_included MUST be false"),
        );
        await serviceSyncOrderToParasut(ORDER_ID);
        const alertCalls = mockDbCreateAlert.mock.calls.map(c => c[0]);
        const stockAlert = alertCalls.find(
            (a: Record<string, unknown>) => a.entity_id === "00000000-0000-0000-0000-00000000a004",
        );
        expect(stockAlert).toBeDefined();
        expect(stockAlert?.type).toBe("sync_issue");
        expect(stockAlert?.severity).toBe("critical");
    });

    it("'warehouse' invariant ihlali → alert üretilir", async () => {
        mockCreateSalesInvoice.mockRejectedValue(
            new ParasutError("validation", "detail must NOT contain warehouse (stok invariant)"),
        );
        await serviceSyncOrderToParasut(ORDER_ID);
        const alertCalls = mockDbCreateAlert.mock.calls.map(c => c[0]);
        const stockAlert = alertCalls.find(
            (a: Record<string, unknown>) => a.entity_id === "00000000-0000-0000-0000-00000000a004",
        );
        expect(stockAlert).toBeDefined();
    });

    it("invariant DIŞINDA validation hatası → STOCK_INVARIANT alert YOK", async () => {
        mockCreateSalesInvoice.mockRejectedValue(
            new ParasutError("validation", "Müşteri tax_number eksik"),
        );
        await serviceSyncOrderToParasut(ORDER_ID);
        const alertCalls = mockDbCreateAlert.mock.calls.map(c => c[0]);
        const stockAlert = alertCalls.find(
            (a: Record<string, unknown>) => a.entity_id === "00000000-0000-0000-0000-00000000a004",
        );
        expect(stockAlert).toBeUndefined();
    });
});
