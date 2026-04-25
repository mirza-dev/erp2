/**
 * parasut-service — Faz 4 coverage
 * classifyAndPatch: error kinds, step-specific fields, backoff
 * markStepDone: DB update, audit log, step-specific field clearing
 * checkAuthAlertThreshold: below / at / above threshold
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ParasutError } from "@/lib/parasut-adapter";
import { ALERT_ENTITY_PARASUT_AUTH } from "@/lib/parasut-constants";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbCreateSyncLog = vi.fn().mockResolvedValue({ id: "log-1" });
const mockDbCreateAlert   = vi.fn().mockResolvedValue({ id: "alert-1" });

let mockAuthCount = 0;

// Count query chain: .select().eq().gte() → { count }
const countChain = {
    eq:  vi.fn().mockReturnThis(),
    gte: vi.fn(() => Promise.resolve({ count: mockAuthCount, error: null })),
};

// Update chain: .update({}).eq(id) → resolves
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate   = vi.fn(() => ({ eq: mockUpdateEq }));

const mockFrom = vi.fn((table: string) => {
    if (table === "integration_sync_logs") return { select: vi.fn(() => countChain) };
    return { update: mockUpdate };
});

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/supabase/sync-log", () => ({
    dbCreateSyncLog: (...args: unknown[]) => mockDbCreateSyncLog(...args),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: (...args: unknown[]) => mockDbCreateAlert(...args),
}));

import {
    classifyAndPatch,
    markStepDone,
    checkAuthAlertThreshold,
} from "@/lib/services/parasut-service";

// ─── classifyAndPatch ─────────────────────────────────────────────────────────

describe("classifyAndPatch", () => {
    it("sets parasut_error, error_kind, step, last_failed_step for all errors", () => {
        const order = { parasut_retry_count: 0 };
        const pe = new ParasutError("server", "Internal error");
        const patch = classifyAndPatch(order, "contact", pe);
        expect(patch.parasut_error).toBe("Internal error");
        expect(patch.parasut_error_kind).toBe("server");
        expect(patch.parasut_step).toBe("contact");
        expect(patch.parasut_last_failed_step).toBe("contact");
    });

    it("rate_limit → next_retry_at = now + retryAfterSec", () => {
        const before = Date.now();
        const pe = new ParasutError("rate_limit", "Too many requests", 15);
        const patch = classifyAndPatch({ parasut_retry_count: 0 }, "contact", pe);
        const retryAt = new Date(patch.parasut_next_retry_at!).getTime();
        expect(retryAt).toBeGreaterThanOrEqual(before + 15000);
        expect(retryAt).toBeLessThan(before + 16000);
    });

    it("rate_limit without retryAfterSec → defaults to 30s", () => {
        const before = Date.now();
        const pe = new ParasutError("rate_limit", "Too many requests");
        const patch = classifyAndPatch({ parasut_retry_count: 0 }, "contact", pe);
        const retryAt = new Date(patch.parasut_next_retry_at!).getTime();
        expect(retryAt).toBeGreaterThanOrEqual(before + 30000);
        expect(retryAt).toBeLessThan(before + 31000);
    });

    it("auth → next_retry_at = 2099, no retry_count change", () => {
        const patch = classifyAndPatch(
            { parasut_retry_count: 0 },
            "invoice",
            new ParasutError("auth", "Unauthorized"),
        );
        expect(patch.parasut_next_retry_at).toBe("2099-01-01T00:00:00.000Z");
        expect(patch.parasut_retry_count).toBeUndefined();
    });

    it("validation → next_retry_at = 2099, no retry_count change", () => {
        const patch = classifyAndPatch(
            { parasut_retry_count: 2 },
            "contact",
            new ParasutError("validation", "Tax number required"),
        );
        expect(patch.parasut_next_retry_at).toBe("2099-01-01T00:00:00.000Z");
        expect(patch.parasut_retry_count).toBeUndefined();
    });

    it("server (retry_count=0) → retry_count becomes 1, backoff = 30*2^1 = 60s", () => {
        const before = Date.now();
        const patch = classifyAndPatch(
            { parasut_retry_count: 0 },
            "shipment",
            new ParasutError("server", "Internal error"),
        );
        expect(patch.parasut_retry_count).toBe(1);
        const retryAt = new Date(patch.parasut_next_retry_at!).getTime();
        expect(retryAt).toBeGreaterThanOrEqual(before + 60000);
    });

    it("server (retry_count=4) → retry_count becomes 5, blocked at 2099", () => {
        const patch = classifyAndPatch(
            { parasut_retry_count: 4 },
            "shipment",
            new ParasutError("server", "Internal error"),
        );
        expect(patch.parasut_retry_count).toBe(5);
        expect(patch.parasut_next_retry_at).toBe("2099-01-01T00:00:00.000Z");
    });

    it("network (retry_count=3) → retry_count becomes 4, backoff = 30*2^4 = 480s (capped at 1800)", () => {
        const before = Date.now();
        const patch = classifyAndPatch(
            { parasut_retry_count: 3 },
            "contact",
            new ParasutError("network", "Timeout"),
        );
        expect(patch.parasut_retry_count).toBe(4);
        const retryAt = new Date(patch.parasut_next_retry_at!).getTime();
        expect(retryAt).toBeGreaterThanOrEqual(before + 480000);
    });

    it("step=shipment → sets parasut_shipment_error", () => {
        const patch = classifyAndPatch(
            { parasut_retry_count: 0 },
            "shipment",
            new ParasutError("server", "Shipment failed"),
        );
        expect(patch.parasut_shipment_error).toBe("Shipment failed");
        expect(patch.parasut_invoice_error).toBeUndefined();
        expect(patch.parasut_e_document_error).toBeUndefined();
    });

    it("step=invoice → sets parasut_invoice_error", () => {
        const patch = classifyAndPatch(
            { parasut_retry_count: 0 },
            "invoice",
            new ParasutError("server", "Invoice error"),
        );
        expect(patch.parasut_invoice_error).toBe("Invoice error");
        expect(patch.parasut_shipment_error).toBeUndefined();
    });

    it("step=edoc → sets parasut_e_document_error", () => {
        const patch = classifyAndPatch(
            { parasut_retry_count: 0 },
            "edoc",
            new ParasutError("server", "E-doc error"),
        );
        expect(patch.parasut_e_document_error).toBe("E-doc error");
        expect(patch.parasut_shipment_error).toBeUndefined();
    });

    it("step=contact → no step-specific error fields", () => {
        const patch = classifyAndPatch(
            { parasut_retry_count: 0 },
            "contact",
            new ParasutError("not_found", "Contact missing"),
        );
        expect(patch.parasut_shipment_error).toBeUndefined();
        expect(patch.parasut_invoice_error).toBeUndefined();
        expect(patch.parasut_e_document_error).toBeUndefined();
    });

    it("step=product → no step-specific error fields", () => {
        const patch = classifyAndPatch(
            { parasut_retry_count: 0 },
            "product",
            new ParasutError("not_found", "Product missing"),
        );
        expect(patch.parasut_shipment_error).toBeUndefined();
        expect(patch.parasut_invoice_error).toBeUndefined();
        expect(patch.parasut_e_document_error).toBeUndefined();
    });
});

// ─── markStepDone ─────────────────────────────────────────────────────────────

describe("markStepDone", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateEq.mockResolvedValue({ error: null });
        mockDbCreateSyncLog.mockResolvedValue({ id: "log-1" });
    });

    it("updates sales_orders with nextStep and clears common error fields", async () => {
        await markStepDone("order-1", "contact", "product");
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                parasut_step:             "product",
                parasut_error:            null,
                parasut_error_kind:       null,
                parasut_next_retry_at:    null,
                parasut_retry_count:      0,
                parasut_last_failed_step: null,
            }),
        );
        expect(mockUpdateEq).toHaveBeenCalledWith("id", "order-1");
    });

    it("step=shipment → sets parasut_shipment_synced_at, clears parasut_shipment_error", async () => {
        await markStepDone("order-1", "shipment", "invoice");
        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(updateArgs.parasut_shipment_error).toBeNull();
        expect(typeof updateArgs.parasut_shipment_synced_at).toBe("string");
    });

    it("step=invoice → sets parasut_invoice_synced_at, clears parasut_invoice_error", async () => {
        await markStepDone("order-1", "invoice", "edoc");
        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(updateArgs.parasut_invoice_error).toBeNull();
        expect(typeof updateArgs.parasut_invoice_synced_at).toBe("string");
    });

    it("step=edoc → clears parasut_e_document_error", async () => {
        await markStepDone("order-1", "edoc", "done");
        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(updateArgs.parasut_e_document_error).toBeNull();
    });

    it("step=contact → no shipment/invoice/edoc fields in update", async () => {
        await markStepDone("order-1", "contact", "product");
        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(updateArgs.parasut_shipment_error).toBeUndefined();
        expect(updateArgs.parasut_invoice_error).toBeUndefined();
        expect(updateArgs.parasut_e_document_error).toBeUndefined();
    });

    it("calls dbCreateSyncLog with step and metadata.next_step", async () => {
        await markStepDone("order-1", "contact", "product");
        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(
            expect.objectContaining({
                entity_type: "sales_order",
                entity_id:   "order-1",
                direction:   "push",
                status:      "success",
                step:        "contact",
                metadata:    { next_step: "product" },
            }),
        );
    });

    it("DB update hatası → throw, audit log yazılmaz", async () => {
        mockUpdateEq.mockResolvedValue({ error: { message: "connection lost" } });
        await expect(markStepDone("order-1", "contact", "product")).rejects.toThrow("connection lost");
        expect(mockDbCreateSyncLog).not.toHaveBeenCalled();
    });
});

// ─── checkAuthAlertThreshold ──────────────────────────────────────────────────

describe("checkAuthAlertThreshold", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthCount = 0;
        countChain.gte.mockImplementation(() => Promise.resolve({ count: mockAuthCount, error: null }));
        mockDbCreateAlert.mockResolvedValue({ id: "alert-1" });
    });

    it("count < 3 → no alert created", async () => {
        mockAuthCount = 2;
        countChain.gte.mockResolvedValue({ count: 2, error: null });
        await checkAuthAlertThreshold();
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });

    it("count = 3 → alert created with sync_issue + ALERT_ENTITY_PARASUT_AUTH", async () => {
        countChain.gte.mockResolvedValue({ count: 3, error: null });
        await checkAuthAlertThreshold();
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                type:      "sync_issue",
                severity:  "critical",
                entity_id: ALERT_ENTITY_PARASUT_AUTH,
                source:    "system",
            }),
        );
    });

    it("count > 3 → alert created", async () => {
        countChain.gte.mockResolvedValue({ count: 7, error: null });
        await checkAuthAlertThreshold();
        expect(mockDbCreateAlert).toHaveBeenCalledOnce();
    });

    it("count = null → no alert (treated as 0)", async () => {
        countChain.gte.mockResolvedValue({ count: null, error: null });
        await checkAuthAlertThreshold();
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });

    it("queries integration_sync_logs with error_kind=auth and gte(oneHourAgo)", async () => {
        countChain.gte.mockResolvedValue({ count: 0, error: null });
        await checkAuthAlertThreshold();
        expect(countChain.eq).toHaveBeenCalledWith("error_kind", "auth");
        expect(countChain.gte).toHaveBeenCalledWith(
            "requested_at",
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        );
    });
});
