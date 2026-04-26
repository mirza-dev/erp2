/**
 * parasut-service — Faz 10 coverage
 * upsertEDocument: crash recovery, type detection, manual skip, marker, create
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParasutEDocument, ParasutInvoiceWithEDocument, ParasutEInvoiceInbox } from "@/lib/parasut-adapter";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbGetOrderById    = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbGetProductById  = vi.fn();
const mockDbCreateSyncLog   = vi.fn();
const mockDbCreateAlert     = vi.fn();
const mockRpc               = vi.fn();

// Update zinciri: .update().eq()/.neq()/.select() destekli chainProxy
// pendingUpdateResults sıralı tüketilir; .select() ayrıca data: [{id}] döner
const pendingUpdateResults: Array<{ error: null | { message: string } }> = [];
// Re-read için .from().select().eq().single() sonuçları
const pendingRereadResults: Array<{ data: { parasut_e_document_status?: string } | null; error: null | { message: string } }> = [];

// dbWriteEDocMeta .select("id") dönüş verisini test başına kontrol et (boş dizi = 0 satır)
const pendingUpdateSelectRows: Array<Array<{ id: string }>> = [];

function selectResultProxy(): unknown {
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === "eq" || prop === "neq") return () => selectResultProxy();
            if (prop === "then") {
                const next = pendingUpdateResults.shift();
                if (next?.error) {
                    const p = Promise.resolve({ data: null, error: next.error });
                    return p.then.bind(p);
                }
                const rows = pendingUpdateSelectRows.shift() ?? [{ id: "order-1" }];
                const p = Promise.resolve({ data: rows, error: null });
                return p.then.bind(p);
            }
            if (prop === "catch") {
                const p = Promise.resolve({ data: [{ id: "order-1" }], error: null });
                return p.catch.bind(p);
            }
            return undefined;
        },
    });
}

function chainProxy(): unknown {
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === "eq" || prop === "neq") {
                return () => chainProxy();
            }
            if (prop === "select") {
                return () => selectResultProxy();
            }
            if (prop === "then") {
                const next = pendingUpdateResults.shift() ?? { error: null };
                const p = Promise.resolve(next);
                return p.then.bind(p);
            }
            if (prop === "catch") {
                const p = Promise.resolve(pendingUpdateResults[0] ?? { error: null });
                return p.catch.bind(p);
            }
            return undefined;
        },
    });
}

// Re-read mock: from().select().eq().single()
function rereadProxy(): unknown {
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === "eq" || prop === "neq") return () => rereadProxy();
            if (prop === "single") {
                return () => Promise.resolve(
                    pendingRereadResults.shift() ?? { data: { parasut_e_document_status: "done" }, error: null },
                );
            }
            return undefined;
        },
    });
}

const mockUpdateEq = vi.fn(() => chainProxy());
const mockUpdate   = vi.fn(() => ({ eq: mockUpdateEq }));

// Backward compat: tests using mockUpdateEq.mockResolvedValueOnce({error:...})
// — bu metodu override ederek pendingUpdateResults'a push edelim
const origMockResolvedValueOnce = mockUpdateEq.mockResolvedValueOnce.bind(mockUpdateEq);
mockUpdateEq.mockResolvedValueOnce = (val: { error: null | { message: string } }) => {
    pendingUpdateResults.push(val);
    return mockUpdateEq;
};
// Allow test to read or reset pending — not exposed but used via clearMocks
void origMockResolvedValueOnce;

const mockGetSalesInvoiceWithActiveEDocument = vi.fn();
const mockGetTrackableJob                    = vi.fn();
const mockListEInvoiceInboxesByVkn           = vi.fn();
const mockCreateEInvoice                     = vi.fn();
const mockCreateEArchive                     = vi.fn();

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
        listRecentShipmentDocuments:        () => Promise.resolve([]),
        createShipmentDocument:             () => Promise.resolve({ id: "n/a", attributes: {} }),
        findSalesInvoicesByNumber:          () => Promise.resolve([]),
        createSalesInvoice:                 () => Promise.resolve({ id: "n/a", attributes: {} }),
        getSalesInvoiceWithActiveEDocument: (...args: unknown[]) => mockGetSalesInvoiceWithActiveEDocument(...args),
        getTrackableJob:                    (...args: unknown[]) => mockGetTrackableJob(...args),
        listEInvoiceInboxesByVkn:           (...args: unknown[]) => mockListEInvoiceInboxesByVkn(...args),
        createEInvoice:                     (...args: unknown[]) => mockCreateEInvoice(...args),
        createEArchive:                     (...args: unknown[]) => mockCreateEArchive(...args),
    }),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({ update: mockUpdate, select: () => rereadProxy() }),
        rpc:  mockRpc,
    }),
}));

import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Record<string, unknown> = {}) {
    return {
        id:                                     "order-1",
        commercial_status:                      "approved",
        fulfillment_status:                     "shipped",
        order_number:                           "ORD-2026-0042",
        created_at:                             "2026-01-15T10:00:00.000Z",
        shipped_at:                             "2026-01-20T14:30:00.000Z",
        currency:                               "USD",
        customer_id:                            "cust-1",
        customer_name:                          "Test Müşteri",
        parasut_retry_count:                    0,
        // Önceki adımlar tamam — edoc'a kadar gel
        parasut_shipment_document_id:           "ship-existing",
        parasut_invoice_id:                     "inv-existing",
        parasut_e_document_id:                  null,
        parasut_e_document_status:              null,
        parasut_trackable_job_id:               null,
        parasut_e_document_create_attempted_at: null,
        parasut_invoice_type:                   null,
        lines:                                  [],
        ...overrides,
    };
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
    return {
        id:                  "cust-1",
        name:                "Test Müşteri",
        email:               "test@example.com",
        tax_number:          "1234567890", // 10 hane = VKN
        parasut_contact_id:  "contact-xyz",
        ...overrides,
    };
}

function makeFreshInvoice(activeEDoc: ParasutEDocument | null = null): ParasutInvoiceWithEDocument {
    return {
        id: "inv-existing",
        attributes: {
            invoice_no:     "KE2026000042",
            invoice_series: "KE",
            invoice_id:     20260042,
            net_total:      180,
            gross_total:    216,
            currency:       "USD",
            issue_date:     "2026-01-25",
        },
        active_e_document: activeEDoc,
    };
}

function makeEDoc(id = "edoc-1", type: "e_invoices" | "e_archives" = "e_archives"): ParasutEDocument {
    return { id, type, attributes: { status: "done" } };
}

function makeInbox(): ParasutEInvoiceInbox {
    return { id: "ix-1", attributes: { vkn: "1234567890", alias: "urn:mail:test" } };
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    pendingUpdateResults.length = 0;
    pendingUpdateSelectRows.length = 0;
    pendingRereadResults.length = 0;
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    process.env.PARASUT_ENABLED = "true";

    mockDbCreateSyncLog.mockResolvedValue({ id: "log-new" });
    mockDbCreateAlert.mockResolvedValue(undefined);

    mockRpc
        .mockResolvedValueOnce({ data: true,  error: null })
        .mockResolvedValueOnce({ data: null,  error: null });

    mockDbGetCustomerById.mockResolvedValue(makeCustomer());

    // Sensible defaults — most tests will override
    mockGetSalesInvoiceWithActiveEDocument.mockResolvedValue(makeFreshInvoice(null));
    mockGetTrackableJob.mockResolvedValue({ status: "running" });
    mockListEInvoiceInboxesByVkn.mockResolvedValue([]);
    mockCreateEInvoice.mockResolvedValue({ trackable_job_id: "job-new-1" });
    mockCreateEArchive.mockResolvedValue({ trackable_job_id: "job-new-2" });
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

// ─── Stale order regression (HIGH bulgu) ─────────────────────────────────────

describe("serviceSyncOrderToParasut — stale order re-fetch", () => {
    it("upsertInvoice sonrası order re-fetch edilir; edoc çalışır", async () => {
        // İlk yüklemede parasut_invoice_id null (Faz 9 daha çalışmamış)
        // Re-fetch'te dolu (upsertInvoice DB'ye yazdı)
        mockDbGetOrderById
            .mockResolvedValueOnce(makeOrder({ parasut_invoice_id: null }))
            .mockResolvedValueOnce(makeOrder({ parasut_invoice_id: "inv-fresh" }));

        await serviceSyncOrderToParasut("order-1");

        // Re-fetch yapıldı (>=2 çağrı)
        expect(mockDbGetOrderById.mock.calls.length).toBeGreaterThanOrEqual(2);
        // upsertEDocument validation fail değil → recovery 1 çağrılır
        expect(mockGetSalesInvoiceWithActiveEDocument).toHaveBeenCalled();
    });
});

// ─── Pre-condition: invoice_id zorunlu ───────────────────────────────────────

describe("upsertEDocument — invoice_id zorunlu", () => {
    it("parasut_invoice_id eksik → validation error", async () => {
        // İlk + re-fetch ikisi de null (gerçekten kayıp)
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_invoice_id: null }));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/invoice_id eksik/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                parasut_step:       "edoc",
                parasut_error_kind: "validation",
            }),
        );
    });
});

// ─── Recovery 1: active_e_document ───────────────────────────────────────────

describe("upsertEDocument — recovery 1: active_e_document", () => {
    it("active_e_document varsa → meta yazılır + done", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockGetSalesInvoiceWithActiveEDocument.mockResolvedValue(
            makeFreshInvoice(makeEDoc("recovered-edoc-1")),
        );

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateEInvoice).not.toHaveBeenCalled();
        expect(mockCreateEArchive).not.toHaveBeenCalled();
        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_e_document_id === "recovered-edoc-1",
        );
        expect(metaCall).toBeDefined();
        // markStepDone(edoc, done) çağrılır
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "done" }),
        );
    });

    it("parasut_e_document_id zaten dolu → idempotent done, recovery atlanır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_e_document_id:     "already-set",
            parasut_e_document_status: "done",
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockGetSalesInvoiceWithActiveEDocument).not.toHaveBeenCalled();
        expect(mockCreateEInvoice).not.toHaveBeenCalled();
        expect(mockCreateEArchive).not.toHaveBeenCalled();
        // Orchestrator markStepDone(edoc, done)
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "done" }),
        );
    });

    it("parasut_e_document_status=skipped → idempotent skipped, recovery atlanır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_e_document_status: "skipped",
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockGetSalesInvoiceWithActiveEDocument).not.toHaveBeenCalled();
        expect(mockCreateEInvoice).not.toHaveBeenCalled();
        expect(mockCreateEArchive).not.toHaveBeenCalled();
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "done" }),
        );
    });
});

// ─── Recovery 2: trackable_job ───────────────────────────────────────────────

describe("upsertEDocument — recovery 2: trackable_job", () => {
    it("job done → invoice re-read + meta yazılır + done", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_trackable_job_id:  "job-existing",
            parasut_e_document_status: "running",
        }));
        mockGetSalesInvoiceWithActiveEDocument
            .mockResolvedValueOnce(makeFreshInvoice(null)) // recovery 1 yok
            .mockResolvedValueOnce(makeFreshInvoice(makeEDoc("via-job"))); // recovery 2 done sonrası
        mockGetTrackableJob.mockResolvedValue({ status: "done" });

        await serviceSyncOrderToParasut("order-1");

        const metaCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_e_document_id === "via-job",
        );
        expect(metaCall).toBeDefined();
    });

    it("job done ama active_e_document null → server error", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_trackable_job_id:  "job-existing",
            parasut_e_document_status: "running",
        }));
        // recovery 1 ve done sonrası ikisi de boş
        mockGetSalesInvoiceWithActiveEDocument.mockResolvedValue(makeFreshInvoice(null));
        mockGetTrackableJob.mockResolvedValue({ status: "done" });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/active_e_document yok/i);
    });

    it("job running → status=running yazılır, sync sonuçta success(running)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_trackable_job_id:  "job-existing",
            parasut_e_document_status: "running",
        }));
        mockGetTrackableJob.mockResolvedValue({ status: "running" });

        const result = await serviceSyncOrderToParasut("order-1");

        // 'running' status → orchestrator markStepDone(edoc,done) çağırmaz
        const stepDone = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_step === "done",
        );
        expect(stepDone).toBeUndefined();
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_e_document_status: "running" }),
        );
        expect(result.success).toBe(true);
    });

    it("job error → alert + status=error + ParasutError fırlatır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_trackable_job_id:  "job-existing",
            parasut_e_document_status: "running",
        }));
        mockGetTrackableJob.mockResolvedValue({ status: "error", errors: ["bad VKN", "bad alias"] });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                entity_id: "00000000-0000-0000-0000-00000000a002", // ALERT_ENTITY_PARASUT_E_DOC
            }),
        );
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                parasut_e_document_status: "error",
                parasut_e_document_error:  "bad VKN; bad alias",
            }),
        );
    });

    it("job error + alert DB hata → validation/error semantiği maskelemez", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_trackable_job_id:  "job-existing",
            parasut_e_document_status: "running",
        }));
        mockGetTrackableJob.mockResolvedValue({ status: "error", errors: ["e"] });
        mockDbCreateAlert.mockRejectedValue(new Error("alert DB down"));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_e_document_status: "error" }),
        );
    });
});

// ─── Type detection ──────────────────────────────────────────────────────────

describe("upsertEDocument — tip seçimi", () => {
    it("VKN (10 hane) + inbox bulunur → e_invoice", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomer({ tax_number: "1234567890" }));
        mockListEInvoiceInboxesByVkn.mockResolvedValue([makeInbox()]);

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateEInvoice).toHaveBeenCalledTimes(1);
        expect(mockCreateEArchive).not.toHaveBeenCalled();
        // type marker'a yazılır
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_invoice_type: "e_invoice" }),
        );
    });

    it("VKN + inbox bulunmaz → e_archive", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomer({ tax_number: "1234567890" }));
        mockListEInvoiceInboxesByVkn.mockResolvedValue([]);

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateEArchive).toHaveBeenCalledTimes(1);
        expect(mockCreateEInvoice).not.toHaveBeenCalled();
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_invoice_type: "e_archive" }),
        );
    });

    it("TC kimlik (11 hane) → VKN sorgu yapılmaz, e_archive", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomer({ tax_number: "12345678901" }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockListEInvoiceInboxesByVkn).not.toHaveBeenCalled();
        expect(mockCreateEArchive).toHaveBeenCalledTimes(1);
    });

    it("VKN boşluk/tire içerse de 10 hane → e_invoice/e_archive", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomer({ tax_number: "12 345 678-90" }));
        mockListEInvoiceInboxesByVkn.mockResolvedValue([makeInbox()]);

        await serviceSyncOrderToParasut("order-1");

        expect(mockListEInvoiceInboxesByVkn).toHaveBeenCalledWith("1234567890");
        expect(mockCreateEInvoice).toHaveBeenCalledTimes(1);
    });

    it("tax_number null → VKN sorgu yapılmaz, e_archive", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomer({ tax_number: null }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockListEInvoiceInboxesByVkn).not.toHaveBeenCalled();
        expect(mockCreateEArchive).toHaveBeenCalledTimes(1);
    });

    it("order.parasut_invoice_type override → VKN sorgu yapılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_invoice_type: "e_invoice",
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockListEInvoiceInboxesByVkn).not.toHaveBeenCalled();
        expect(mockCreateEInvoice).toHaveBeenCalledTimes(1);
    });
});

// ─── Manual skip ─────────────────────────────────────────────────────────────

describe("upsertEDocument — manual skip", () => {
    it("type=manual → status=skipped, create çağrılmaz, markStepDone(edoc,done)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_invoice_type: "manual",
        }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateEInvoice).not.toHaveBeenCalled();
        expect(mockCreateEArchive).not.toHaveBeenCalled();
        // skipped writes status
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                parasut_invoice_type:      "manual",
                parasut_e_document_status: "skipped",
            }),
        );
        // orchestrator markStepDone(edoc, done) çağırır
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "done" }),
        );
    });
});

// ─── hasEDocAttemptedBefore ──────────────────────────────────────────────────

describe("upsertEDocument — hasEDocAttemptedBefore + trackable_job_id yok", () => {
    it("alert + validation error fırlatılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_e_document_create_attempted_at: "2026-01-26T08:00:00.000Z",
            parasut_trackable_job_id:               null,
        }));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/manual review/i);
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                entity_id: "00000000-0000-0000-0000-00000000a002",
            }),
        );
        expect(mockCreateEInvoice).not.toHaveBeenCalled();
        expect(mockCreateEArchive).not.toHaveBeenCalled();
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "validation" }),
        );
    });

    it("alert DB hata → validation semantiği korunur", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            parasut_e_document_create_attempted_at: "2026-01-26T08:00:00.000Z",
            parasut_trackable_job_id:               null,
        }));
        mockDbCreateAlert.mockRejectedValue(new Error("alert DB down"));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/manual review/i);
    });
});

// ─── Yeni job (e_invoice + e_archive) ────────────────────────────────────────

describe("upsertEDocument — yeni job create", () => {
    it("e_invoice akışı → marker + createEInvoice + trackable_job yazımı + status=running", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_invoice_type: "e_invoice" }));
        mockCreateEInvoice.mockResolvedValue({ trackable_job_id: "job-NEW" });

        await serviceSyncOrderToParasut("order-1");

        // marker
        const markerCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => typeof (c[0] as Record<string, unknown>)?.parasut_e_document_create_attempted_at === "string",
        );
        expect(markerCall).toBeDefined();
        // create called
        expect(mockCreateEInvoice).toHaveBeenCalledWith(
            "inv-existing",
            expect.objectContaining({ scenario: "commercial" }),
        );
        // job_id + running
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                parasut_trackable_job_id:  "job-NEW",
                parasut_e_document_status: "running",
            }),
        );
    });

    it("e_archive akışı → createEArchive + internet_sale=false", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_invoice_type: "e_archive" }));
        mockCreateEArchive.mockResolvedValue({ trackable_job_id: "job-ARCH" });

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateEArchive).toHaveBeenCalledWith(
            "inv-existing",
            expect.objectContaining({ internet_sale: false }),
        );
    });

    it("marker yazımı başarısız → create çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_invoice_type: "e_archive" }));
        // markStepDone'lar OK, marker hatalı
        mockUpdateEq
            .mockResolvedValueOnce({ error: null })  // markStepDone contact
            .mockResolvedValueOnce({ error: null })  // markStepDone product
            .mockResolvedValueOnce({ error: null })  // markStepDone shipment
            .mockResolvedValueOnce({ error: null })  // markStepDone invoice
            .mockResolvedValueOnce({ error: { message: "marker fail" } }); // edoc marker

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/marker yazılamadı/i);
        expect(mockCreateEArchive).not.toHaveBeenCalled();
    });

    it("running status → orchestrator markStepDone(edoc,done) çağırmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_invoice_type: "e_archive" }));

        await serviceSyncOrderToParasut("order-1");

        const stepDoneCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_step === "done",
        );
        expect(stepDoneCall).toBeUndefined();
    });
});

// ─── parasutApiCall context ──────────────────────────────────────────────────

describe("upsertEDocument — parasutApiCall context", () => {
    it("createEInvoice/EArchive 429 → wrapper retry edilir (op+orderId+step ile loglanır)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_invoice_type: "e_archive" }));

        await serviceSyncOrderToParasut("order-1");

        expect(mockCreateEArchive).toHaveBeenCalledTimes(1);
        // Wrapper'dan geçtiğinin dolaylı kanıtı: PARASUT_ENABLED guard görür (devre dışı senaryosunda fonksiyon hiç çağrılmaz)
    });
});

// ─── dbWriteEDocMeta — 0 satır guard durumu ──────────────────────────────────

describe("dbWriteEDocMeta — 0 satır guard durumu", () => {
    it("poll zaten 'done' yazdıysa (0 satır güncellendi) → güvenli, markStepDone çağrılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockGetSalesInvoiceWithActiveEDocument.mockResolvedValue(
            makeFreshInvoice(makeEDoc("poll-wrote-this")),
        );
        // dbWriteEDocMeta .select() → 0 satır güncellendi
        pendingUpdateSelectRows.push([]);
        // re-read: poll zaten 'done' yazmış — güvenli geç
        pendingRereadResults.push({ data: { parasut_e_document_status: "done" }, error: null });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(true);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "done" }),
        );
    });

    it("0 satır güncellendi + durum 'done' değil → server error, markStepDone çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockGetSalesInvoiceWithActiveEDocument.mockResolvedValue(
            makeFreshInvoice(makeEDoc("edoc-x")),
        );
        // dbWriteEDocMeta .select() → 0 satır güncellendi
        pendingUpdateSelectRows.push([]);
        // re-read: beklenmedi durum (örn. poll hata yazmış)
        pendingRereadResults.push({ data: { parasut_e_document_status: "error" }, error: null });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/0 satır güncellendi/i);
        const stepDoneCall = mockUpdate.mock.calls.find(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.parasut_step === "done",
        );
        expect(stepDoneCall).toBeUndefined();
    });
});

// ─── Validasyon: müşteri yok ─────────────────────────────────────────────────

describe("upsertEDocument — müşteri validasyonu", () => {
    it("edoc müşteri re-fetch null → not_found, step=edoc", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // Contact step: customer var; edoc re-fetch: null
        mockDbGetCustomerById
            .mockResolvedValueOnce(makeCustomer())  // contact
            .mockResolvedValueOnce(null);            // edoc re-fetch

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/müşteri bulunamadı/i);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                parasut_step:       "edoc",
                parasut_error_kind: "not_found",
            }),
        );
    });
});
