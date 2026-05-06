/**
 * email-service tests — notifyUsersByEmail (preferences + dedup + Resend send).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockListUsers = vi.fn();
vi.mock("@/lib/supabase/users-with-prefs", () => ({
    dbListUsersForEmailNotification: (...a: unknown[]) => mockListUsers(...a),
}));

const mockCreateLog = vi.fn();
const mockUpdateLog = vi.fn();
const mockCheckDup = vi.fn();
const mockListFailed = vi.fn();
vi.mock("@/lib/supabase/email-logs", () => ({
    dbCreateEmailLog: (...a: unknown[]) => mockCreateLog(...a),
    dbUpdateEmailLogStatus: (...a: unknown[]) => mockUpdateLog(...a),
    dbCheckRecentDuplicate: (...a: unknown[]) => mockCheckDup(...a),
    dbListFailedEmailsForRetry: (...a: unknown[]) => mockListFailed(...a),
}));

const mockResendSend = vi.fn();
vi.mock("resend", () => ({
    Resend: class {
        emails = { send: mockResendSend };
    },
}));

import { notifyUsersByEmail, retryFailedEmails } from "@/lib/services/email-service";

beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "KokpitERP <test@resend.dev>";
    mockResendSend.mockResolvedValue({ data: { id: "rs_msg_1" }, error: null });
    mockCheckDup.mockResolvedValue(false);
    mockCreateLog.mockResolvedValue("log-1");
    mockUpdateLog.mockResolvedValue(undefined);
    mockListFailed.mockResolvedValue([]);
    mockListUsers.mockResolvedValue([]);
});

const STOCK_OPTS = {
    notificationType: "stock_critical" as const,
    entityType: "product",
    entityId: "p-1",
    render: { type: "stock_critical" as const, ctx: {
        productName: "Vana", sku: "V-1", available: 2, min: 10,
    } },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("notifyUsersByEmail — config / fail-safe", () => {
    it("RESEND_API_KEY yok → erken return, log yok", async () => {
        delete process.env.RESEND_API_KEY;
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r).toEqual({ sent: 0, skipped: 0, failed: 0 });
        expect(mockListUsers).not.toHaveBeenCalled();
        expect(mockCreateLog).not.toHaveBeenCalled();
    });

    it("EMAIL_FROM yok → erken return", async () => {
        delete process.env.EMAIL_FROM;
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r).toEqual({ sent: 0, skipped: 0, failed: 0 });
        expect(mockListUsers).not.toHaveBeenCalled();
    });
});

describe("notifyUsersByEmail — recipient resolution", () => {
    it("kimse istemiyor (empty list) → log yok, send yok", async () => {
        mockListUsers.mockResolvedValue([]);
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r.sent).toBe(0);
        expect(mockResendSend).not.toHaveBeenCalled();
        expect(mockCreateLog).not.toHaveBeenCalled();
    });

    it("preferences=true olan user'a gönderilir", async () => {
        mockListUsers.mockResolvedValue([{ userId: "u-1", email: "user@example.com", fullName: "Ali" }]);
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r.sent).toBe(1);
        expect(mockResendSend).toHaveBeenCalledWith(expect.objectContaining({
            to: "user@example.com",
            subject: expect.stringContaining("Kritik stok"),
        }));
    });
});

describe("notifyUsersByEmail — dedup", () => {
    it("son 6 saatte aynı entity'ye send var → atla", async () => {
        mockListUsers.mockResolvedValue([{ userId: "u-1", email: "user@x.com", fullName: "A" }]);
        mockCheckDup.mockResolvedValue(true);
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r.sent).toBe(0);
        expect(r.skipped).toBe(1);
        expect(mockCreateLog).not.toHaveBeenCalled();
        expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("dedup check başarısız → yine de gönder (best-effort)", async () => {
        mockListUsers.mockResolvedValue([{ userId: "u-1", email: "user@x.com", fullName: "A" }]);
        mockCheckDup.mockRejectedValue(new Error("DB down"));
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r.sent).toBe(1);
    });
});

describe("notifyUsersByEmail — Resend success/fail", () => {
    it("Resend success → log status='sent', resend_message_id metadata", async () => {
        mockListUsers.mockResolvedValue([{ userId: "u-1", email: "user@x.com", fullName: "A" }]);
        await notifyUsersByEmail(STOCK_OPTS);
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "sent", { resend_message_id: "rs_msg_1" });
    });

    it("Resend error response → status='failed', error_message metadata", async () => {
        mockListUsers.mockResolvedValue([{ userId: "u-1", email: "user@x.com", fullName: "A" }]);
        mockResendSend.mockResolvedValue({ data: null, error: { message: "Invalid recipient" } });
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r.failed).toBe(1);
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "failed", { error: "Invalid recipient" });
    });

    it("Resend throw → catch + status='failed'", async () => {
        mockListUsers.mockResolvedValue([{ userId: "u-1", email: "user@x.com", fullName: "A" }]);
        mockResendSend.mockRejectedValue(new Error("Network down"));
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r.failed).toBe(1);
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "failed", { error: "Network down" });
    });

    it("multiple recipients — bazı sent bazı dedup", async () => {
        mockListUsers.mockResolvedValue([
            { userId: "u-1", email: "a@x.com", fullName: "A" },
            { userId: "u-2", email: "b@x.com", fullName: "B" },
        ]);
        mockCheckDup.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const r = await notifyUsersByEmail(STOCK_OPTS);
        expect(r.sent).toBe(1);
        expect(r.skipped).toBe(1);
    });
});

describe("retryFailedEmails", () => {
    it("config yok → erken return", async () => {
        delete process.env.RESEND_API_KEY;
        const r = await retryFailedEmails();
        expect(r).toEqual({ retried: 0, succeeded: 0, failed: 0 });
        expect(mockListFailed).not.toHaveBeenCalled();
    });

    it("failed liste boş → 0 retried", async () => {
        mockListFailed.mockResolvedValue([]);
        const r = await retryFailedEmails();
        expect(r.retried).toBe(0);
    });

    it("failed kayıtları yeniden dener, başarılı ise sayar", async () => {
        mockListFailed.mockResolvedValue([
            { id: "log-1", recipient_email: "u@x.com", subject: "T",
              status: "failed", attempt_count: 1 },
        ]);
        const r = await retryFailedEmails();
        expect(r.retried).toBe(1);
        expect(r.succeeded).toBe(1);
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "sent", { resend_message_id: "rs_msg_1" });
    });

    it("retry'de Resend error → failed sayılır", async () => {
        mockListFailed.mockResolvedValue([
            { id: "log-1", recipient_email: "u@x.com", subject: "T", status: "failed", attempt_count: 1 },
        ]);
        mockResendSend.mockResolvedValue({ data: null, error: { message: "Bounce" } });
        const r = await retryFailedEmails();
        expect(r.failed).toBe(1);
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "failed", { error: "Bounce" });
    });
});
