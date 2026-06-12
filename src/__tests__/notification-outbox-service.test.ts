import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationOutboxRow } from "@/lib/database.types";

const mockClaim = vi.fn();
const mockUpdateOutbox = vi.fn();
const mockDeleteOldOutbox = vi.fn();
const mockListUsers = vi.fn();
const mockGetLogForRecipient = vi.fn();
const mockCreateLog = vi.fn();
const mockMarkSuppressed = vi.fn();
const mockUpdateLog = vi.fn();
const mockClearSnapshots = vi.fn();
const mockFindSuppression = vi.fn();
const mockOpenIncident = vi.fn();
const mockResolveIncident = vi.fn();
const mockDeleteOldAudit = vi.fn();
const mockSendDirect = vi.fn();

vi.mock("@/lib/supabase/notification-outbox", () => ({
    dbClaimNotificationOutbox: (...args: unknown[]) => mockClaim(...args),
    dbDeleteOldCompletedOutbox: (...args: unknown[]) => mockDeleteOldOutbox(...args),
    dbEnqueueNotification: vi.fn(),
    dbUpdateOutboxState: (...args: unknown[]) => mockUpdateOutbox(...args),
}));

vi.mock("@/lib/supabase/users-with-prefs", () => ({
    dbListUsersForEmailNotification: (...args: unknown[]) => mockListUsers(...args),
}));

vi.mock("@/lib/supabase/email-logs", () => ({
    dbCreateEmailLog: (...args: unknown[]) => mockCreateLog(...args),
    dbClearEmailSnapshotsForOutbox: (...args: unknown[]) => mockClearSnapshots(...args),
    dbGetEmailLogById: vi.fn(),
    dbGetEmailLogForOutboxRecipient: (...args: unknown[]) => mockGetLogForRecipient(...args),
    dbMarkEmailLogSuppressed: (...args: unknown[]) => mockMarkSuppressed(...args),
    dbUpdateEmailLogStatus: (...args: unknown[]) => mockUpdateLog(...args),
}));

vi.mock("@/lib/supabase/email-maintenance", () => ({
    dbDeleteOldEmailDeliveryAudit: (...args: unknown[]) => mockDeleteOldAudit(...args),
    dbFindActiveSuppression: (...args: unknown[]) => mockFindSuppression(...args),
    dbOpenMaintenanceIncident: (...args: unknown[]) => mockOpenIncident(...args),
    dbResolveMaintenanceIncidentByKey: (...args: unknown[]) => mockResolveIncident(...args),
}));

vi.mock("@/lib/services/email-service", () => ({
    getEmailRuntimeStatus: () => ({
        configured: !!(
            process.env.RESEND_API_KEY
            && process.env.EMAIL_FROM
            && process.env.RESEND_WEBHOOK_SECRET
        ),
        hasApiKey: !!process.env.RESEND_API_KEY,
        hasFrom: !!process.env.EMAIL_FROM,
        hasWebhookSecret: !!process.env.RESEND_WEBHOOK_SECRET,
    }),
    sendDirectEmail: (...args: unknown[]) => mockSendDirect(...args),
}));

import { processNotificationOutbox } from "@/lib/services/notification-outbox-service";

function event(overrides: Partial<NotificationOutboxRow> = {}): NotificationOutboxRow {
    return {
        id: "outbox-1",
        event_key: "sales_order:o-1:pending_approval",
        notification_type: "order_pending",
        entity_type: "sales_order",
        entity_id: "o-1",
        render_payload: {
            type: "order_pending",
            ctx: {
                orderId: "o-1",
                orderNumber: "SO-1",
                customerName: "Acme",
                total: 100,
                currency: "TRY",
                actorLabel: "Satış Kullanıcısı",
            },
        },
        actor_user_id: "actor-1",
        actor_label: "Satış Kullanıcısı",
        status: "processing",
        attempt_count: 0,
        next_attempt_at: new Date().toISOString(),
        locked_at: new Date().toISOString(),
        locked_by: "worker-1",
        last_error: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Roven <test@example.com>";
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    mockClaim.mockResolvedValue([event()]);
    mockListUsers.mockResolvedValue([{
        userId: "recipient-1",
        email: "recipient@example.com",
        fullName: "Alıcı",
        roles: ["admin"],
        internalOperator: false,
    }]);
    mockGetLogForRecipient.mockResolvedValue(null);
    mockCreateLog.mockResolvedValue("log-1");
    mockFindSuppression.mockResolvedValue(null);
    mockSendDirect.mockResolvedValue({ ok: true, messageId: "resend-1" });
    mockUpdateOutbox.mockResolvedValue(undefined);
    mockUpdateLog.mockResolvedValue(undefined);
    mockMarkSuppressed.mockResolvedValue("log-suppressed");
    mockClearSnapshots.mockResolvedValue(undefined);
    mockOpenIncident.mockResolvedValue(undefined);
    mockResolveIncident.mockResolvedValue(undefined);
    mockDeleteOldOutbox.mockResolvedValue(undefined);
    mockDeleteOldAudit.mockResolvedValue(undefined);
});

describe("processNotificationOutbox", () => {
    it("başarılı teslimatı idempotency anahtarıyla gönderir ve olayı tamamlar", async () => {
        const result = await processNotificationOutbox({ limit: 10 });

        expect(result).toEqual({ claimed: 1, sent: 1, suppressed: 0, failed: 0 });
        expect(mockListUsers).toHaveBeenCalledWith("order_pending", { actorUserId: "actor-1" });
        expect(mockSendDirect).toHaveBeenCalledWith(expect.objectContaining({
            to: "recipient@example.com",
            idempotencyKey: "internal-email-log-log-1",
        }));
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "sent", { resend_message_id: "resend-1" });
        expect(mockUpdateOutbox).toHaveBeenCalledWith("outbox-1", expect.objectContaining({
            status: "completed",
            last_error: null,
        }));
    });

    it("runtime konfigürasyonu eksikse deneme hakkı tüketmeden waiting_config yapar", async () => {
        delete process.env.RESEND_WEBHOOK_SECRET;

        await processNotificationOutbox();

        expect(mockSendDirect).not.toHaveBeenCalled();
        expect(mockUpdateOutbox).toHaveBeenCalledWith("outbox-1", expect.objectContaining({
            status: "waiting_config",
            last_error: "E-posta çalışma zamanı konfigürasyonu eksik.",
        }));
        expect(mockUpdateOutbox.mock.calls[0][1]).not.toHaveProperty("attempt_count");
        expect(mockOpenIncident).toHaveBeenCalledWith(expect.objectContaining({
            incidentKey: "email:runtime-config",
            kind: "email_config",
        }));
    });

    it("suppression olan alıcıya göndermez ve olayı tamamlar", async () => {
        mockFindSuppression.mockResolvedValue({ id: "suppression-1" });

        const result = await processNotificationOutbox();

        expect(result.suppressed).toBe(1);
        expect(mockMarkSuppressed).toHaveBeenCalledWith(expect.objectContaining({
            outbox_id: "outbox-1",
            recipient_email: "recipient@example.com",
        }));
        expect(mockSendDirect).not.toHaveBeenCalled();
        expect(mockUpdateOutbox).toHaveBeenCalledWith("outbox-1", expect.objectContaining({
            status: "completed",
        }));
    });

    it("üçüncü başarısızlıkta retry gövdesini temizler ve bakım kaydı açar", async () => {
        mockClaim.mockResolvedValue([event({ attempt_count: 2 })]);
        mockSendDirect.mockResolvedValue({ ok: false, error: "temporary provider failure" });

        const result = await processNotificationOutbox();

        expect(result.failed).toBe(1);
        expect(mockUpdateOutbox).toHaveBeenCalledWith("outbox-1", expect.objectContaining({
            status: "failed",
            attempt_count: 3,
        }));
        expect(mockClearSnapshots).toHaveBeenCalledWith("outbox-1");
        expect(mockOpenIncident).toHaveBeenCalledWith(expect.objectContaining({
            incidentKey: "email:retry-exhausted:outbox-1",
            kind: "email_retry_exhausted",
        }));
    });
});
