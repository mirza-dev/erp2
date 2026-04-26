/**
 * parasut-service — Faz 9 coverage
 * upsertInvoice: idempotent, fast lookup, durable marker, create, dbWriteInvoiceMeta, stok invariant
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParasutInvoice } from "@/lib/parasut-adapter";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbGetOrderById    = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbGetProductById  = vi.fn();
const mockDbCreateSyncLog   = vi.fn();
const mockDbCreateAlert     = vi.fn();
const mockRpc               = vi.fn();

const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate   = vi.fn(() => ({ eq: mockUpdateEq }));

// Shipment mocks (Faz 8 yolu) — geçişli
const mockListRecentShipmentDocuments = vi.fn().mockResolvedValue([]);
const mockCreateShipmentDocument      = vi.fn();

// Invoice mocks (Faz 9)
const mockFindSalesInvoicesByNumber = vi.fn();
const mockCreateSalesInvoice        = vi.fn();

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
        findSalesInvoicesByNumber:   (...args: unknown[]) => mockFindSalesInvoicesByNumber(...args),
        createSalesInvoice:          (...args: unknown[]) => mockCreateSalesInvoice(...args),
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
        // Shipment zaten tamamlanmış (Faz 9 testi → invoice'a kadar gel)
        parasut_shipment_document_id:         "ship-existing",
        parasut_shipment_create_attempted_at: null,
        parasut_invoice_id:                   null,
        parasut_invoice_create_attempted_at:  null,
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
        discount_pct: 10,
        line_total:   180,
        sort_order:   1,
        vat_rate:     20,
        ...overrides,
    };
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
    return {
        id:                  "cust-1",
        name:                "Test Müşteri",
        email:               "test@example.com",
        tax_number:          "1234567890",
        parasut_contact_id:  "contact-xyz",
        city:                "İstanbul",
        district:            "Kadıköy",
        address:             "Test Cad. 1/A",
        payment_terms_days:  30,
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

function makeInvoice(id = "inv-doc-1", invoice_id_int = 202600420042): ParasutInvoice {
    return {
        id,
        attributes: {
            invoice_no:     `KE2026000042`,
            invoice_series: "KE",
            invoice_id:     invoice_id_int,
            net_total:      180,
            gross_total:    216,
            currency:       "USD",
            issue_date:     "2026-01-25",
        },
    };
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    process.env.PARASUT_ENABLED = "true";

    mockDbCreateSyncLog.mockResolvedValue({ id: "log-new" });
    mockDbCreateAlert.mockResolvedValue(undefined);

    mockRpc
        .mockResolvedValueOnce({ data: true,  error: null })
        .mockResolvedValueOnce({ data: null,  error: null });

    mockDbGetCustomerById.mockResolvedValue(makeCustomer());
    mockDbGetProductById.mockResolvedValue(makeProduct());

    mockListRecentShipmentDocuments.mockResolvedValue([]);
    mockFindSalesInvoicesByNumber.mockResolvedValue([]);
    mockCreateSalesInvoice.mockResolvedValue(makeInvoice());
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

// ─── Idempotent skip ─────────────────────────────────────────────────────────

describe("upsertInvoice — idempotent skip", () => {
    it("parasut_invoice_id dolu → lookup ve create atlanır, edoc adımına geçer", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_invoice_id: "existing-inv-id",
        }));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(mockFindSalesInvoicesByNumber).not.toHaveBeenCalled();
        expect(mockCreateSalesInvoice).not.toHaveBeenCalled();
        // markStepDone(invoice, edoc) çağrılır → parasut_step=edoc
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "edoc" }),
        );
    });
});

// ─── Fast lookup ─────────────────────────────────────────────────────────────

describe("upsertInvoice — fast remote lookup", () => {
    it("series+number ile bulunursa → create atlanır, meta yazılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockFindSalesInvoicesByNumber.mockResolvedValue([
            makeInvoice("found-inv-id"),
        ]);

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateSalesInvoice).not.toHaveBeenCalled();
        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_invoice_id === "found-inv-id",
        );
        expect(metaCall).toBeDefined();
    });

    it("series=KE ve numberInt deterministik → ORD-2026-0042 → 20260042", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ order_number: "ORD-2026-0042" }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockFindSalesInvoicesByNumber).toHaveBeenCalledWith("KE", 20260042);
    });

    it("kötü order_number formatı → validation error", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ order_number: "BAD-FORMAT" }));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/order_number formatı/i);
        expect(mockCreateSalesInvoice).not.toHaveBeenCalled();
    });
});

// ─── hasInvoiceAttemptedBefore + lookup negatif ──────────────────────────────

describe("upsertInvoice — hasInvoiceAttemptedBefore + lookup negatif", () => {
    it("alert yaratılır ve validation error fırlatılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_invoice_create_attempted_at: "2026-01-25T10:00:00.000Z",
        }));
        mockFindSalesInvoicesByNumber.mockResolvedValue([]);

        const result = await serviceSyncOrderToParasut("order-1");

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                type:        "sync_issue",
                entity_type: "parasut",
                entity_id:   "00000000-0000-0000-0000-00000000a005", // ALERT_ENTITY_PARASUT_INVOICE
            }),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/manual review/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "validation" }),
        );
    });

    it("createSalesInvoice çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_invoice_create_attempted_at: "2026-01-25T10:00:00.000Z",
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateSalesInvoice).not.toHaveBeenCalled();
    });

    it("dbCreateAlert fırlatsa bile validation error korunur", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_invoice_create_attempted_at: "2026-01-25T10:00:00.000Z",
        }));
        mockDbCreateAlert.mockRejectedValue(new Error("alert DB down"));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/manual review/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "validation" }),
        );
    });
});

// ─── Normal create ───────────────────────────────────────────────────────────

describe("upsertInvoice — normal create path", () => {
    it("attempted marker yazıldıktan sonra create çağrılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        const callOrder: string[] = [];
        mockUpdateEq.mockImplementation(() => {
            callOrder.push("updateEq");
            return Promise.resolve({ error: null });
        });
        mockCreateSalesInvoice.mockImplementation(() => {
            callOrder.push("createSalesInvoice");
            return Promise.resolve(makeInvoice());
        });

        await serviceSyncOrderToParasut("order-1");

        const createIdx = callOrder.indexOf("createSalesInvoice");
        const markerIdx = callOrder.lastIndexOf("updateEq", createIdx - 1);
        expect(markerIdx).toBeGreaterThanOrEqual(0);
        expect(createIdx).toBeGreaterThan(markerIdx);
    });

    it("shipment_included=false ile çağrılır (stok invariant)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateSalesInvoice).toHaveBeenCalledWith(
            expect.objectContaining({
                shipment_included: false,
                contact_id:        "contact-xyz",
                invoice_series:    "KE",
                invoice_id:        20260042,
            }),
        );
    });

    it("currency mapCurrency'den geçer (USD → USD, GBP → GBP)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            currency: "GBP",
            lines:    [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateSalesInvoice).toHaveBeenCalledWith(
            expect.objectContaining({ currency: "GBP" }),
        );
    });

    it("currency bilinmeyen → TRL fallback", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            currency: "JPY",
            lines:    [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateSalesInvoice).toHaveBeenCalledWith(
            expect.objectContaining({ currency: "TRL" }),
        );
    });

    it("due_date = issue_date + payment_terms_days", async () => {
        const fixedNow = new Date("2026-01-25T10:00:00.000Z");
        vi.setSystemTime(fixedNow);
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockDbGetCustomerById.mockResolvedValue(makeCustomer({ payment_terms_days: 15 }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateSalesInvoice).toHaveBeenCalledWith(
            expect.objectContaining({
                issue_date: "2026-01-25",
                due_date:   "2026-02-09", // 25 + 15 = Feb 9
            }),
        );
        vi.useRealTimers();
    });

    it("payment_terms_days null → 30 gün varsayılan", async () => {
        const fixedNow = new Date("2026-01-25T10:00:00.000Z");
        vi.setSystemTime(fixedNow);
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockDbGetCustomerById.mockResolvedValue(makeCustomer({ payment_terms_days: null }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateSalesInvoice).toHaveBeenCalledWith(
            expect.objectContaining({
                issue_date: "2026-01-25",
                due_date:   "2026-02-24", // 25 + 30 = Feb 24
            }),
        );
        vi.useRealTimers();
    });

    it("satır detayı: vat_rate, discount_type='percentage', discount_value, product_id", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine({ vat_rate: 18, discount_pct: 5 })],
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateSalesInvoice).toHaveBeenCalledWith(
            expect.objectContaining({
                details: [
                    expect.objectContaining({
                        quantity:       2,
                        unit_price:     100,
                        vat_rate:       18,
                        discount_type:  "percentage",
                        discount_value: 5,
                        product_id:     "parasut-prod-1",
                        description:    "Test Ürün (SKU-001)",
                    }),
                ],
            }),
        );
    });

    it("vat_rate undefined → varsayılan 20", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine({ vat_rate: undefined })],
        }));

        await serviceSyncOrderToParasut("order-1");

        const [input] = mockCreateSalesInvoice.mock.calls[0] as [Record<string, unknown>];
        const details = input.details as Array<{ vat_rate: number }>;
        expect(details[0].vat_rate).toBe(20);
    });

    it("warehouse alanı detail'da YOK (stok invariant)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        const [input] = mockCreateSalesInvoice.mock.calls[0] as [Record<string, unknown>];
        const details = input.details as Array<Record<string, unknown>>;
        expect(details[0]).not.toHaveProperty("warehouse");
    });

    it("create sonrası dbWriteInvoiceMeta tüm alanları yazar", async () => {
        const fixedNow = new Date("2026-01-25T10:00:00.000Z");
        vi.setSystemTime(fixedNow);
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockCreateSalesInvoice.mockResolvedValue(makeInvoice("inv-new", 20260042));

        await serviceSyncOrderToParasut("order-1");

        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_invoice_id === "inv-new",
        );
        expect(metaCall?.[0]).toEqual(
            expect.objectContaining({
                parasut_invoice_id:         "inv-new",
                parasut_invoice_no:         "KE2026000042",
                parasut_invoice_series:     "KE",
                parasut_invoice_number_int: 20260042,
                parasut_invoice_error:      null,
            }),
        );
        // Legacy parasut_sent_at + parasut_invoice_synced_at her ikisi de yazılır
        expect((metaCall?.[0] as Record<string, unknown>).parasut_sent_at).toBeTruthy();
        expect((metaCall?.[0] as Record<string, unknown>).parasut_invoice_synced_at).toBeTruthy();
        vi.useRealTimers();
    });
});

// ─── Validasyon hataları ─────────────────────────────────────────────────────

describe("upsertInvoice — validasyon hataları", () => {
    it("müşteri bulunamadı → not_found", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById
            .mockResolvedValueOnce(makeCustomer())  // contact step (bypass)
            .mockResolvedValueOnce(null);            // invoice step

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/müşteri bulunamadı/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                parasut_step:       "invoice",
                parasut_error_kind: "not_found",
            }),
        );
    });

    it("müşteri parasut_contact_id eksik → validation", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById
            .mockResolvedValueOnce(makeCustomer())
            .mockResolvedValueOnce(makeCustomer({ parasut_contact_id: null }));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/contact ID/i);
    });

    it("ürün bulunamadı → not_found", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockDbGetProductById
            .mockResolvedValueOnce(makeProduct())  // product step
            .mockResolvedValueOnce(null);           // invoice step

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/ürün bulunamadı/i);
    });

    it("ürün parasut_product_id eksik → validation", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockDbGetProductById
            .mockResolvedValueOnce(makeProduct())
            .mockResolvedValueOnce(makeProduct({ parasut_product_id: null }));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/product id eksik/i);
    });

    it("ürün validation hatası → marker yazılmaz (HIGH bulgu)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockDbGetProductById
            .mockResolvedValueOnce(makeProduct())
            .mockResolvedValueOnce(makeProduct({ parasut_product_id: null }));

        await serviceSyncOrderToParasut("order-1");

        const markerCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => typeof (c[0] as Record<string, unknown>)?.parasut_invoice_create_attempted_at === "string",
        );
        expect(markerCall).toBeUndefined();
    });
});

// ─── Durable marker ──────────────────────────────────────────────────────────

describe("upsertInvoice — durable attempted marker", () => {
    it("marker DB yazımı başarısız → createSalesInvoice çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        // markStepDone contact, product, shipment → ok; attempted marker → error
        mockUpdateEq
            .mockResolvedValueOnce({ error: null })   // markStepDone contact
            .mockResolvedValueOnce({ error: null })   // markStepDone product
            .mockResolvedValueOnce({ error: null })   // markStepDone shipment (idempotent shipment skip; markStepDone yine yazar)
            .mockResolvedValueOnce({ error: { message: "marker db down" } }); // invoice attempted marker

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/marker yazılamadı/i);
        expect(mockCreateSalesInvoice).not.toHaveBeenCalled();
    });

    it("marker write DB'ye parasut_invoice_create_attempted_at yazar", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        const markerCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => typeof (c[0] as Record<string, unknown>)?.parasut_invoice_create_attempted_at === "string",
        );
        expect(markerCall).toBeDefined();
    });
});

// ─── dbWriteInvoiceMeta ──────────────────────────────────────────────────────

describe("upsertInvoice — dbWriteInvoiceMeta", () => {
    it("meta DB yazımı başarısız → hata döner, step=invoice", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));
        mockUpdateEq
            .mockResolvedValueOnce({ error: null })  // markStepDone contact
            .mockResolvedValueOnce({ error: null })  // markStepDone product
            .mockResolvedValueOnce({ error: null })  // markStepDone shipment
            .mockResolvedValueOnce({ error: null })  // attempted marker
            .mockResolvedValueOnce({ error: { message: "invoice meta failed" } }); // dbWriteInvoiceMeta

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/dbWriteInvoiceMeta/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "invoice" }),
        );
    });

    it("legacy parasut_sent_at alanı yazılır (UI api-mappers uyumluluğu)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_invoice_id === "inv-doc-1",
        );
        expect((metaCall?.[0] as Record<string, unknown>).parasut_sent_at).toBeTruthy();
    });
});

// ─── Entegrasyon ─────────────────────────────────────────────────────────────

describe("upsertInvoice — entegrasyon", () => {
    it("invoice başarılı → markStepDone(invoice,edoc) → step=edoc", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        const stepDoneCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_step === "edoc",
        );
        expect(stepDoneCall).toBeDefined();
    });

    it("invoice başarılı → sync log step=invoice status=success", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [makeOrderLine()],
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(
            expect.objectContaining({ step: "invoice", status: "success" }),
        );
    });
});
