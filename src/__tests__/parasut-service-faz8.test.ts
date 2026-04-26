/**
 * parasut-service — Faz 8 coverage
 * upsertShipment: idempotent, recovery pagination, durable marker, create, dbWriteShipmentMeta
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParasutShipmentDocument } from "@/lib/parasut-adapter";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbGetOrderById    = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbGetProductById  = vi.fn();
const mockDbCreateSyncLog   = vi.fn();
const mockDbCreateAlert     = vi.fn();
const mockRpc               = vi.fn();

const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate   = vi.fn(() => ({ eq: mockUpdateEq }));

const mockListRecentShipmentDocuments = vi.fn();
const mockCreateShipmentDocument      = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...args: unknown[]) => mockDbGetOrderById(...args),
}));

vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...args: unknown[]) => mockDbGetCustomerById(...args),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: (...args: unknown[]) => mockDbGetProductById(...args),
}));

vi.mock("@/lib/supabase/sync-log", () => ({
    dbCreateSyncLog:  (...args: unknown[]) => mockDbCreateSyncLog(...args),
    dbGetSyncLog:     vi.fn(),
    dbUpdateSyncLog:  vi.fn(),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: (...args: unknown[]) => mockDbCreateAlert(...args),
}));

vi.mock("@/lib/parasut", () => ({
    getParasutAdapter: () => ({
        listRecentShipmentDocuments: (...args: unknown[]) => mockListRecentShipmentDocuments(...args),
        createShipmentDocument:      (...args: unknown[]) => mockCreateShipmentDocument(...args),
    }),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({ update: mockUpdate }),
        rpc:  mockRpc,
    }),
}));

import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Record<string, unknown> = {}) {
    return {
        id:                                   "order-1",
        commercial_status:                    "approved",
        fulfillment_status:                   "shipped",
        order_number:                         "ORD-2026-0042",
        created_at:                           "2026-01-15T10:00:00.000Z",
        shipped_at:                           "2026-01-20T14:30:00.000Z",
        currency:                             "USD",
        customer_id:                          "cust-1",
        customer_name:                        "Test Müşteri",
        parasut_retry_count:                  0,
        parasut_shipment_document_id:         null,
        parasut_shipment_create_attempted_at: null,
        lines:                                [],
        ...overrides,
    };
}

function makeOrderLine(overrides: Record<string, unknown> = {}) {
    return {
        id:           "line-1",
        order_id:     "order-1",
        product_id:   "prod-1",
        product_name: "Test Ürün",
        product_sku:  "SKU-001",
        unit:         "adet",
        quantity:     2,
        unit_price:   100,
        discount_pct: 0,
        line_total:   200,
        sort_order:   1,
        vat_rate:     20,
        ...overrides,
    };
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
    return {
        id:                 "cust-1",
        name:               "Test Müşteri",
        email:              "test@example.com",
        tax_number:         "1234567890",
        parasut_contact_id: "contact-xyz",
        city:               "İstanbul",
        district:           "Kadıköy",
        address:            "Test Cad. 1/A",
        ...overrides,
    };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
    return {
        id:                 "prod-1",
        name:               "Test Ürün",
        sku:                "SKU-001",
        price:              100,
        parasut_product_id: "parasut-prod-1",
        available_now:      10,
        ...overrides,
    };
}

function makeShipmentDoc(id = "shipment-doc-1", procurement_number = "ORD-2026-0042"): ParasutShipmentDocument {
    return {
        id,
        attributes: {
            inflow:             false,
            procurement_number,
            shipment_date:      "2026-01-20",
            issue_date:         "2026-01-20",
        },
    };
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    saved.PARASUT_ENABLED                    = process.env.PARASUT_ENABLED;
    saved.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES = process.env.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES;
    process.env.PARASUT_ENABLED = "true";
    delete process.env.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES;

    mockDbCreateSyncLog.mockResolvedValue({ id: "log-new" });
    mockDbCreateAlert.mockResolvedValue(undefined);

    mockRpc
        .mockResolvedValueOnce({ data: true,  error: null })
        .mockResolvedValueOnce({ data: null,  error: null });

    mockDbGetCustomerById.mockResolvedValue(makeCustomer());
    mockDbGetProductById.mockResolvedValue(makeProduct());

    mockListRecentShipmentDocuments.mockResolvedValue([]);
    mockCreateShipmentDocument.mockResolvedValue(makeShipmentDoc());
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
    if (saved.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES !== undefined) {
        process.env.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES = saved.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES;
    } else {
        delete process.env.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES;
    }
});

// ─── Idempotent skip ─────────────────────────────────────────────────────────

describe("upsertShipment — idempotent skip", () => {
    it("parasut_shipment_document_id dolu → recovery ve create atlanır, invoice adımına geçer", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_shipment_document_id: "existing-ship-id",
        }));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(mockListRecentShipmentDocuments).not.toHaveBeenCalled();
        expect(mockCreateShipmentDocument).not.toHaveBeenCalled();
        // Advances past shipment to invoice stub
        // Advances past shipment to invoice (will fail because invoice adapter not mocked here)
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "invoice" }),
        );
    });
});

// ─── Recovery ────────────────────────────────────────────────────────────────

describe("upsertShipment — recovery pagination", () => {
    it("sayfa 1'de eşleşme → createShipmentDocument çağrılmaz, DB meta yazılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockListRecentShipmentDocuments.mockResolvedValueOnce([
            makeShipmentDoc("found-id", "ORD-2026-0042"),
        ]);

        const result = await serviceSyncOrderToParasut("order-1");

        expect(mockCreateShipmentDocument).not.toHaveBeenCalled();
        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_shipment_document_id === "found-id",
        );
        expect(metaCall).toBeDefined();
        // Advances to invoice stub
        // Advances past shipment to invoice (will fail because invoice adapter not mocked here)
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "invoice" }),
        );
    });

    it("sayfa 2'de eşleşme → iki sayfa listelenir, create çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        const page1 = Array.from({ length: 25 }, (_, i) =>
            makeShipmentDoc(`other-${i}`, "ORD-2026-9999"),
        );
        const page2 = [makeShipmentDoc("page2-found", "ORD-2026-0042")];
        mockListRecentShipmentDocuments
            .mockResolvedValueOnce(page1)
            .mockResolvedValueOnce(page2);

        await serviceSyncOrderToParasut("order-1");

        expect(mockListRecentShipmentDocuments).toHaveBeenCalledTimes(2);
        expect(mockCreateShipmentDocument).not.toHaveBeenCalled();
        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_shipment_document_id === "page2-found",
        );
        expect(metaCall).toBeDefined();
    });

    it("boş sayfa → döngü durur (empty page break)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockListRecentShipmentDocuments
            .mockResolvedValueOnce([])  // page 1 empty → break

        await serviceSyncOrderToParasut("order-1");

        expect(mockListRecentShipmentDocuments).toHaveBeenCalledTimes(1);
    });

    it("sayfa 25 items'dan az → döngü durur (son sayfa işareti)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        const partialPage = Array.from({ length: 10 }, (_, i) =>
            makeShipmentDoc(`other-${i}`, "ORD-2026-9999"),
        );
        mockListRecentShipmentDocuments.mockResolvedValueOnce(partialPage);

        await serviceSyncOrderToParasut("order-1");

        // partial page (10 < 25) → break after page 1, no match → proceeds to create
        expect(mockListRecentShipmentDocuments).toHaveBeenCalledTimes(1);
        expect(mockCreateShipmentDocument).toHaveBeenCalledTimes(1);
    });

    it("PARASUT_SHIPMENT_RECOVERY_MAX_PAGES=2 → 2 sayfadan fazla listelenmez", async () => {
        process.env.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES = "2";
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // Return 25 mismatched items per page so loop doesn't early-exit
        const fullPage = Array.from({ length: 25 }, (_, i) =>
            makeShipmentDoc(`other-${i}`, "ORD-2026-9999"),
        );
        mockListRecentShipmentDocuments.mockResolvedValue(fullPage);

        await serviceSyncOrderToParasut("order-1");

        expect(mockListRecentShipmentDocuments).toHaveBeenCalledTimes(2);
    });
});

// ─── hasAttemptedBefore + no recovery ────────────────────────────────────────

describe("upsertShipment — hasAttemptedBefore + recovery negatif", () => {
    it("alert yaratılır ve validation error fırlatılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_shipment_create_attempted_at: "2026-01-20T10:00:00.000Z",
        }));
        // Recovery finds nothing
        mockListRecentShipmentDocuments.mockResolvedValue([]);

        const result = await serviceSyncOrderToParasut("order-1");

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                entity_id: "00000000-0000-0000-0000-00000000a003",
                type:      "sync_issue",
            }),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/manual review/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "validation" }),
        );
    });

    it("createShipmentDocument çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_shipment_create_attempted_at: "2026-01-20T10:00:00.000Z",
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateShipmentDocument).not.toHaveBeenCalled();
    });

    it("dbCreateAlert fırlatsa bile validation error korunur (MEDIUM bulgu)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_shipment_create_attempted_at: "2026-01-20T10:00:00.000Z",
        }));
        mockDbCreateAlert.mockRejectedValue(new Error("alert DB down"));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/manual review/i);
        // Must classify as validation, not server
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "validation" }),
        );
    });
});

// ─── Normal create ───────────────────────────────────────────────────────────

describe("upsertShipment — normal create path", () => {
    it("attempted marker yazıldıktan sonra create çağrılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        const callOrder: string[] = [];
        mockUpdateEq.mockImplementation(() => {
            callOrder.push("updateEq");
            return Promise.resolve({ error: null });
        });
        mockCreateShipmentDocument.mockImplementation(() => {
            callOrder.push("createShipmentDocument");
            return Promise.resolve(makeShipmentDoc());
        });

        await serviceSyncOrderToParasut("order-1");

        const markerIdx  = callOrder.lastIndexOf("updateEq",  callOrder.indexOf("createShipmentDocument") - 1);
        const createIdx  = callOrder.indexOf("createShipmentDocument");
        expect(markerIdx).toBeGreaterThanOrEqual(0);
        expect(createIdx).toBeGreaterThan(markerIdx);
    });

    it("inflow=false ve procurement_number=order_number ile çağrılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateShipmentDocument).toHaveBeenCalledWith(
            expect.objectContaining({
                inflow:             false,
                procurement_number: "ORD-2026-0042",
                contact_id:         "contact-xyz",
            }),
        );
    });

    it("shipment_date = shipped_at.slice(0,10)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            shipped_at: "2026-01-20T14:30:00.000Z",
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateShipmentDocument).toHaveBeenCalledWith(
            expect.objectContaining({ shipment_date: "2026-01-20" }),
        );
    });

    it("shipped_at null → shipment_date = created_at.slice(0,10)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            shipped_at: null,
            created_at: "2026-01-15T10:00:00.000Z",
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateShipmentDocument).toHaveBeenCalledWith(
            expect.objectContaining({ shipment_date: "2026-01-15" }),
        );
    });

    it("city / district / address müşteriden alınır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateShipmentDocument).toHaveBeenCalledWith(
            expect.objectContaining({
                city:     "İstanbul",
                district: "Kadıköy",
                address:  "Test Cad. 1/A",
            }),
        );
    });

    it("city/district/address null → undefined olarak gönderilir (opsiyonel alan)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // Second dbGetCustomerById call (for upsertShipment) returns customer with nulls
        mockDbGetCustomerById
            .mockResolvedValueOnce(makeCustomer())              // serviceEnsureParasutContact
            .mockResolvedValueOnce(makeCustomer({ city: null, district: null, address: null }));

        await serviceSyncOrderToParasut("order-1");

        const [input] = mockCreateShipmentDocument.mock.calls[0] as [Record<string, unknown>];
        expect(input.city).toBeUndefined();
        expect(input.district).toBeUndefined();
        expect(input.address).toBeUndefined();
    });

    it("create sonrası parasut_shipment_document_id DB'ye yazılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());

        await serviceSyncOrderToParasut("order-1");

        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_shipment_document_id === "shipment-doc-1",
        );
        expect(metaCall).toBeDefined();
    });

    it("satır detayları — parasut_product_id ve açıklama dahil", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateShipmentDocument).toHaveBeenCalledWith(
            expect.objectContaining({
                details: [
                    expect.objectContaining({
                        quantity:    2,
                        product_id:  "parasut-prod-1",
                        description: "Test Ürün (SKU-001)",
                    }),
                ],
            }),
        );
    });
});

// ─── Validasyon hataları ─────────────────────────────────────────────────────

describe("upsertShipment — validasyon hataları", () => {
    it("müşteri bulunamadı → not_found hatası, adım shipment", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // Second call (inside upsertShipment) returns null
        mockDbGetCustomerById
            .mockResolvedValueOnce(makeCustomer())   // serviceEnsureParasutContact
            .mockResolvedValueOnce(null);             // upsertShipment re-fetch

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/müşteri bulunamadı/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                parasut_step:       "shipment",
                parasut_error_kind: "not_found",
            }),
        );
    });

    it("müşteri parasut_contact_id eksik → validation hatası, adım shipment", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById
            .mockResolvedValueOnce(makeCustomer())
            .mockResolvedValueOnce(makeCustomer({ parasut_contact_id: null }));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/contact ID/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "validation" }),
        );
    });

    it("ürün bulunamadı → not_found hatası", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        // product step: has parasut_product_id → bypass; shipment step: null
        mockDbGetProductById
            .mockResolvedValueOnce(makeProduct())  // serviceEnsureParasutProduct
            .mockResolvedValueOnce(null);           // upsertShipment

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/ürün bulunamadı/i);
    });

    it("ürün validation hatası → parasut_shipment_create_attempted_at yazılmaz (HIGH bulgu)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockDbGetProductById
            .mockResolvedValueOnce(makeProduct())                           // product step (bypass, has ID)
            .mockResolvedValueOnce(makeProduct({ parasut_product_id: null })); // shipment step re-fetch

        await serviceSyncOrderToParasut("order-1");

        const markerCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => typeof (c[0] as Record<string, unknown>)?.parasut_shipment_create_attempted_at === "string",
        );
        expect(markerCall).toBeUndefined();
    });

    it("ürün parasut_product_id eksik → validation hatası", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockDbGetProductById
            .mockResolvedValueOnce(makeProduct())                           // product step
            .mockResolvedValueOnce(makeProduct({ parasut_product_id: null })); // shipment step

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/product id eksik/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "validation" }),
        );
    });
});

// ─── Durable marker ──────────────────────────────────────────────────────────

describe("upsertShipment — durable attempted marker", () => {
    it("marker DB yazımı başarısız → createShipmentDocument çağrılmaz, hata fırlatılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // markStepDone contact, markStepDone product → ok; attempted marker → error
        mockUpdateEq
            .mockResolvedValueOnce({ error: null })                              // markStepDone contact
            .mockResolvedValueOnce({ error: null })                              // markStepDone product
            .mockResolvedValueOnce({ error: { message: "db down" } });           // attempted marker

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/attempted marker yazılamadı/i);
        expect(mockCreateShipmentDocument).not.toHaveBeenCalled();
    });

    it("attempted marker write DB'ye parasut_shipment_create_attempted_at yazar", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());

        await serviceSyncOrderToParasut("order-1");

        const markerCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => {
                const p = c[0] as Record<string, unknown>;
                return typeof p.parasut_shipment_create_attempted_at === "string";
            },
        );
        expect(markerCall).toBeDefined();
    });
});

// ─── dbWriteShipmentMeta ─────────────────────────────────────────────────────

describe("upsertShipment — dbWriteShipmentMeta", () => {
    it("meta DB yazımı başarısız → hata döner, step=shipment", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // markStepDone contact, markStepDone product, attempted marker → ok; meta write → error
        mockUpdateEq
            .mockResolvedValueOnce({ error: null })                           // markStepDone contact
            .mockResolvedValueOnce({ error: null })                           // markStepDone product
            .mockResolvedValueOnce({ error: null })                           // attempted marker
            .mockResolvedValueOnce({ error: { message: "meta write failed" } }); // dbWriteShipmentMeta

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/dbWriteShipmentMeta/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "shipment" }),
        );
    });

    it("meta yazımı başarılı → parasut_shipment_error null'a sıfırlanır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());

        await serviceSyncOrderToParasut("order-1");

        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_shipment_document_id === "shipment-doc-1",
        );
        expect(metaCall?.[0]).toEqual(
            expect.objectContaining({ parasut_shipment_error: null }),
        );
    });
});

// ─── Entegrasyon: tam başarılı shipment adımı ─────────────────────────────────

describe("upsertShipment — entegrasyon: tam akış", () => {
    it("shipment başarılı → markStepDone(shipment,invoice) çağrılır, parasut_step=invoice olur", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());

        await serviceSyncOrderToParasut("order-1");

        // markStepDone("shipment", "invoice") sets parasut_step: "invoice"
        const stepDoneCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_step === "invoice",
        );
        expect(stepDoneCall).toBeDefined();
    });

    it("shipment başarılı → sync log step=shipment status=success yazılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());

        await serviceSyncOrderToParasut("order-1");

        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(
            expect.objectContaining({ step: "shipment", status: "success" }),
        );
    });
});
