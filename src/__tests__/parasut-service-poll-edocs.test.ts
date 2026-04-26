/**
 * parasut-service — Poll CRON (e-belge) coverage
 * serviceParasutPollEDocuments: idempotent guard'lar, done/running/error dalları, raw_status log
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbCreateSyncLog = vi.fn();
const mockDbCreateAlert   = vi.fn();

const mockGetTrackableJob                    = vi.fn();
const mockGetSalesInvoiceWithActiveEDocument = vi.fn();

// Builder for chained query: .eq().eq().neq() returns Promise<{ error }>
let mockUpdateResult: { error: { message: string } | null } = { error: null };
const mockUpdateNeq = vi.fn(() => Promise.resolve(mockUpdateResult));
const mockUpdateEq2 = vi.fn(() => ({ neq: mockUpdateNeq }));
const mockUpdateEq1 = vi.fn(() => ({ eq: mockUpdateEq2, neq: mockUpdateNeq }));
const mockUpdate    = vi.fn(() => ({ eq: mockUpdateEq1 }));

// Select chain: .select().eq().eq().not().limit() → Promise
let mockSelectResolve: { data: unknown[]; error: null | { message: string } } = { data: [], error: null };
const mockLimit  = vi.fn(() => Promise.resolve(mockSelectResolve));
const mockNot    = vi.fn(() => ({ limit: mockLimit }));
const mockSelEq2 = vi.fn(() => ({ not: mockNot, limit: mockLimit }));
const mockSelEq1 = vi.fn(() => ({ eq: mockSelEq2, not: mockNot, limit: mockLimit }));
const mockSelect = vi.fn(() => ({ eq: mockSelEq1 }));

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: vi.fn(),
}));

vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: vi.fn(),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: vi.fn(),
}));

vi.mock("@/lib/supabase/sync-log", () => ({
    dbCreateSyncLog: (...args: unknown[]) => mockDbCreateSyncLog(...args),
    dbGetSyncLog:    vi.fn(),
    dbUpdateSyncLog: vi.fn(),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: (...args: unknown[]) => mockDbCreateAlert(...args),
}));

vi.mock("@/lib/parasut", () => ({
    getParasutAdapter: () => ({
        getTrackableJob:                    (...args: unknown[]) => mockGetTrackableJob(...args),
        getSalesInvoiceWithActiveEDocument: (...args: unknown[]) => mockGetSalesInvoiceWithActiveEDocument(...args),
    }),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({ update: mockUpdate, select: mockSelect }),
        rpc:  vi.fn(),
    }),
}));

import { serviceParasutPollEDocuments } from "@/lib/services/parasut-service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}) {
    return {
        id:                          "order-1",
        order_number:                "ORD-2026-0042",
        parasut_invoice_id:          "inv-1",
        parasut_trackable_job_id:    "job-1",
        parasut_e_document_status:   "running",
        ...overrides,
    };
}

function makeFreshInvoice(eDocId: string | null = null) {
    return {
        id: "inv-1",
        attributes: {
            invoice_no:     "KE2026000042",
            invoice_series: "KE",
            invoice_id:     20260042,
            net_total:      100,
            gross_total:    120,
            currency:       "USD",
            issue_date:     "2026-01-25",
        },
        active_e_document: eDocId
            ? { id: eDocId, type: "e_archives" as const, attributes: { status: "done" } }
            : null,
    };
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    process.env.PARASUT_ENABLED = "true";

    mockSelectResolve = { data: [], error: null };
    mockUpdateResult  = { error: null };
    mockDbCreateSyncLog.mockResolvedValue({ id: "log-new" });
    mockDbCreateAlert.mockResolvedValue(undefined);
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

// ─── Disabled guard ──────────────────────────────────────────────────────────

describe("serviceParasutPollEDocuments — disabled guard", () => {
    it("PARASUT_ENABLED=false → erken dön (boş sonuç)", async () => {
        process.env.PARASUT_ENABLED = "false";
        const result = await serviceParasutPollEDocuments();
        expect(result).toEqual({ polled: 0, done: 0, running: 0, error: 0, errors: [] });
        expect(mockSelect).not.toHaveBeenCalled();
    });
});

// ─── Job done dalı ───────────────────────────────────────────────────────────

describe("serviceParasutPollEDocuments — job done", () => {
    it("done → invoice re-read + idempotent guard'lı update + sync log", async () => {
        mockSelectResolve = { data: [makeRow()], error: null };
        mockGetTrackableJob.mockResolvedValue({ status: "done" });
        mockGetSalesInvoiceWithActiveEDocument.mockResolvedValue(makeFreshInvoice("edoc-fresh"));

        const result = await serviceParasutPollEDocuments();

        expect(result.polled).toBe(1);
        expect(result.done).toBe(1);

        // Update args: { parasut_e_document_id: "edoc-fresh", status: "done", step: "done", ... }
        const updArg = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(updArg).toEqual(expect.objectContaining({
            parasut_e_document_id:     "edoc-fresh",
            parasut_e_document_status: "done",
            parasut_step:              "done",
            parasut_e_document_error:  null,
        }));

        // Idempotent guard: .eq("id", orderId).eq("parasut_trackable_job_id", jobId).neq("parasut_e_document_status", "done")
        expect(mockUpdateEq1).toHaveBeenCalledWith("id", "order-1");
        expect(mockUpdateEq2).toHaveBeenCalledWith("parasut_trackable_job_id", "job-1");
        expect(mockUpdateNeq).toHaveBeenCalledWith("parasut_e_document_status", "done");

        // Sync log step=edoc, source=poll
        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(
            expect.objectContaining({
                step:     "edoc",
                status:   "success",
                metadata: expect.objectContaining({ source: "poll" }),
            }),
        );
    });

    it("done ama active_e_document yok → error, errors listesinde", async () => {
        mockSelectResolve = { data: [makeRow()], error: null };
        mockGetTrackableJob.mockResolvedValue({ status: "done" });
        mockGetSalesInvoiceWithActiveEDocument.mockResolvedValue(makeFreshInvoice(null));

        const result = await serviceParasutPollEDocuments();

        expect(result.error).toBe(1);
        expect(result.errors[0]).toMatch(/active_e_document yok/i);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("done update DB hatası → errors'a yazılır, alert atılmaz", async () => {
        mockSelectResolve = { data: [makeRow()], error: null };
        mockGetTrackableJob.mockResolvedValue({ status: "done" });
        mockGetSalesInvoiceWithActiveEDocument.mockResolvedValue(makeFreshInvoice("edoc-fresh"));
        mockUpdateResult  = { error: { message: "constraint violation" } };

        const result = await serviceParasutPollEDocuments();

        expect(result.error).toBe(1);
        expect(result.errors[0]).toMatch(/constraint violation/i);
    });
});

// ─── Job running dalı ────────────────────────────────────────────────────────

describe("serviceParasutPollEDocuments — job running", () => {
    it("running → DB update yapılmaz, sayaç artar", async () => {
        mockSelectResolve = { data: [makeRow()], error: null };
        mockGetTrackableJob.mockResolvedValue({ status: "running" });

        const result = await serviceParasutPollEDocuments();

        expect(result.polled).toBe(1);
        expect(result.running).toBe(1);
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

// ─── Job error dalı ──────────────────────────────────────────────────────────

describe("serviceParasutPollEDocuments — job error", () => {
    it("error → alert + status=error idempotent guard ile yazılır", async () => {
        mockSelectResolve = { data: [makeRow()], error: null };
        mockGetTrackableJob.mockResolvedValue({ status: "error", errors: ["bad alias"] });

        const result = await serviceParasutPollEDocuments();

        expect(result.error).toBe(1);
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                entity_id: "00000000-0000-0000-0000-00000000a002", // ALERT_ENTITY_PARASUT_E_DOC
            }),
        );
        const updArg = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(updArg).toEqual(expect.objectContaining({
            parasut_e_document_status: "error",
            parasut_e_document_error:  "bad alias",
        }));
        // Idempotent guard
        expect(mockUpdateNeq).toHaveBeenCalledWith("parasut_e_document_status", "done");
    });

    it("error + alert hatası → semantik korunur, sayaç error", async () => {
        mockSelectResolve = { data: [makeRow()], error: null };
        mockGetTrackableJob.mockResolvedValue({ status: "error", errors: ["x"] });
        mockDbCreateAlert.mockRejectedValue(new Error("alert DB down"));

        const result = await serviceParasutPollEDocuments();

        expect(result.error).toBe(1);
        expect(mockUpdate).toHaveBeenCalled();
    });
});

// ─── raw_status metadata (Faz 12 hazırlık) ───────────────────────────────────

describe("serviceParasutPollEDocuments — raw_status log", () => {
    it("bilinmeyen status (örn. pending) → console.log ile uyarı + running'e map edilir (plan §poll)", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => { /* swallow */ });
        mockSelectResolve = { data: [makeRow()], error: null };
        // Gerçek HTTP adapter pending döndürürse — tipik geçiş durumu
        mockGetTrackableJob.mockResolvedValue({ status: "pending" } as never);

        const result = await serviceParasutPollEDocuments();

        const unknownLog = logSpy.mock.calls.find((c) =>
            typeof c[0] === "string" && c[0].includes("parasut_poll_unknown_status"),
        );
        expect(unknownLog).toBeDefined();
        // Plan §poll: pending → running map; DB update yapılmaz, gereksiz yazım önlenir
        expect(result.running).toBe(1);
        expect(result.done).toBe(0);
        expect(result.error).toBe(0);
        expect(mockUpdate).not.toHaveBeenCalled();
        logSpy.mockRestore();
    });
});

// ─── Multi-row + filtre/skip ─────────────────────────────────────────────────

describe("serviceParasutPollEDocuments — birden çok satır", () => {
    it("eksik invoice_id veya job_id → atlanır", async () => {
        mockSelectResolve = {
            data: [
                makeRow({ id: "o1", parasut_invoice_id: null }),       // skip
                makeRow({ id: "o2", parasut_trackable_job_id: null }), // skip
                makeRow({ id: "o3" }),                                  // poll
            ],
            error: null,
        };
        mockGetTrackableJob.mockResolvedValue({ status: "running" });

        const result = await serviceParasutPollEDocuments();

        expect(result.polled).toBe(1);
        expect(mockGetTrackableJob).toHaveBeenCalledTimes(1);
    });
});
