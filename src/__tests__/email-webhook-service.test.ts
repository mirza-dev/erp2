import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRecord = vi.fn();
const mockGetLog = vi.fn();
const mockUpdate = vi.fn();
const mockSuppress = vi.fn();
const mockDeleteRecord = vi.fn();

vi.mock("@/lib/supabase/email-maintenance", () => ({
    dbDeleteWebhookEvent: (...a: unknown[]) => mockDeleteRecord(...a),
    dbRecordWebhookEvent: (...a: unknown[]) => mockRecord(...a),
    dbUpsertSuppression: (...a: unknown[]) => mockSuppress(...a),
}));
vi.mock("@/lib/supabase/email-logs", () => ({
    dbGetEmailLogByResendMessageId: (...a: unknown[]) => mockGetLog(...a),
    dbUpdateEmailDeliveryFromProvider: (...a: unknown[]) => mockUpdate(...a),
}));

import { processResendWebhook } from "@/lib/services/email-webhook-service";

const log = {
    id: "log-1",
    recipient_email: "user@example.com",
    notification_type: "order_shipped",
};

const event = (type: string) => ({
    type,
    created_at: "2026-06-12T10:00:00.000Z",
    data: { email_id: "resend-1" },
}) as never;

beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue(true);
    mockGetLog.mockResolvedValue(log);
    mockUpdate.mockResolvedValue(true);
    mockSuppress.mockResolvedValue(undefined);
    mockDeleteRecord.mockResolvedValue(undefined);
});

describe("processResendWebhook", () => {
    it("aynı svix-id tekrarında hiçbir yan etki üretmez", async () => {
        mockRecord.mockResolvedValue(false);
        await expect(processResendWebhook(event("email.delivered"), "svix-1"))
            .resolves.toEqual({ duplicate: true, matched: false });
        expect(mockGetLog).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("hard bounce adresi global suppression'a alır", async () => {
        await processResendWebhook(event("email.bounced"), "svix-2");
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            id: "log-1",
            deliveryStatus: "bounced",
        }));
        expect(mockSuppress).toHaveBeenCalledWith({
            recipientEmail: "user@example.com",
            scopeKey: "*",
            reason: "hard_bounce",
            sourceEmailLogId: "log-1",
        });
    });

    it("spam complaint yalnız ilgili bildirim türünü suppress eder", async () => {
        await processResendWebhook(event("email.complained"), "svix-3");
        expect(mockSuppress).toHaveBeenCalledWith({
            recipientEmail: "user@example.com",
            scopeKey: "order_shipped",
            reason: "complaint",
            sourceEmailLogId: "log-1",
        });
    });

    it("işleme yarıda kalırsa svix kaydını siler ve provider retry'ına izin verir", async () => {
        mockUpdate.mockRejectedValue(new Error("database unavailable"));

        await expect(processResendWebhook(event("email.delivered"), "svix-retry"))
            .rejects.toThrow("database unavailable");
        expect(mockDeleteRecord).toHaveBeenCalledWith("svix-retry");
    });
});
