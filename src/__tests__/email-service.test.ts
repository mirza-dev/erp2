/**
 * email-service tests — notifyUsersByEmail (preferences + dedup + Resend send).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockListUsers = vi.fn();
vi.mock("@/lib/supabase/users-with-prefs", () => ({
    dbListUsersForEmailNotification: (...a: unknown[]) => mockListUsers(...a),
}));

const mockCreateLog = vi.fn();
const mockUpdateLog = vi.fn();
const mockCheckDup = vi.fn();
const mockListFailed = vi.fn();
const mockClearSnapshot = vi.fn();
const mockClearExpiredSnapshots = vi.fn();
vi.mock("@/lib/supabase/email-logs", () => ({
    dbCreateEmailLog: (...a: unknown[]) => mockCreateLog(...a),
    dbUpdateEmailLogStatus: (...a: unknown[]) => mockUpdateLog(...a),
    dbCheckRecentDuplicate: (...a: unknown[]) => mockCheckDup(...a),
    dbListFailedEmailsForRetry: (...a: unknown[]) => mockListFailed(...a),
    dbClearEmailSnapshot: (...a: unknown[]) => mockClearSnapshot(...a),
    dbClearExpiredEmailSnapshots: (...a: unknown[]) => mockClearExpiredSnapshots(...a),
}));

const mockResendSend = vi.fn();
vi.mock("resend", () => ({
    Resend: class {
        emails = { send: mockResendSend };
    },
}));

import { notifyUsersByEmail, retryFailedEmails, sendDirectEmail } from "@/lib/services/email-service";

beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Roven <test@resend.dev>";
    mockResendSend.mockResolvedValue({ data: { id: "rs_msg_1" }, error: null });
    mockCheckDup.mockResolvedValue(false);
    mockCreateLog.mockResolvedValue("log-1");
    mockUpdateLog.mockResolvedValue(undefined);
    mockListFailed.mockResolvedValue([]);
    mockClearSnapshot.mockResolvedValue(undefined);
    mockClearExpiredSnapshots.mockResolvedValue(undefined);
    mockListUsers.mockResolvedValue([]);
});

const STOCK_OPTS = {
    notificationType: "stock_critical" as const,
    entityType: "product",
    entityId: "p-1",
    render: { type: "stock_critical" as const, ctx: {
        productId: "p-1", productName: "Vana", sku: "V-1", available: 2, min: 10,
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
        }), { idempotencyKey: "legacy-email-log-log-1" });
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
        expect(mockCreateLog).toHaveBeenCalledWith(expect.objectContaining({
            html_body: expect.stringContaining("Roven"),
            text_body: expect.stringContaining("Kritik stok"),
            body_expires_at: expect.any(String),
        }));
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
        expect(mockClearExpiredSnapshots).toHaveBeenCalledOnce();
    });

    it("failed liste boş → 0 retried", async () => {
        mockListFailed.mockResolvedValue([]);
        const r = await retryFailedEmails();
        expect(r.retried).toBe(0);
    });

    it("failed kayıtları yeniden dener, başarılı ise sayar", async () => {
        mockListFailed.mockResolvedValue([
            { id: "log-1", recipient_email: "u@x.com", subject: "T",
              status: "failed", attempt_count: 1, html_body: "<html>özgün</html>", text_body: "özgün" },
        ]);
        const r = await retryFailedEmails();
        expect(r.retried).toBe(1);
        expect(r.succeeded).toBe(1);
        expect(mockResendSend).toHaveBeenCalledWith(expect.objectContaining({
            html: "<html>özgün</html>",
            text: "özgün",
        }), { idempotencyKey: "legacy-email-log-log-1" });
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "sent", { resend_message_id: "rs_msg_1" });
    });

    it("retry'de Resend error → failed sayılır", async () => {
        mockListFailed.mockResolvedValue([
            { id: "log-1", recipient_email: "u@x.com", subject: "T", status: "failed", attempt_count: 1,
              html_body: "<html>özgün</html>", text_body: "özgün" },
        ]);
        mockResendSend.mockResolvedValue({ data: null, error: { message: "Bounce" } });
        const r = await retryFailedEmails();
        expect(r.failed).toBe(1);
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "failed", { error: "Bounce" });
    });

    it("son retry başarısızsa gövde snapshot'ını temizler", async () => {
        mockListFailed.mockResolvedValue([
            { id: "log-1", recipient_email: "u@x.com", subject: "T", status: "failed", attempt_count: 2,
              html_body: "<html>özgün</html>", text_body: "özgün" },
        ]);
        mockResendSend.mockResolvedValue({ data: null, error: { message: "Bounce" } });
        await retryFailedEmails();
        expect(mockClearSnapshot).toHaveBeenCalledWith("log-1");
    });

    it("her retry turunun başında süresi dolan snapshot'ları temizler", async () => {
        await retryFailedEmails();
        expect(mockClearExpiredSnapshots).toHaveBeenCalledOnce();
    });
});

describe("sendDirectEmail", () => {
    it("ek (attachment) Resend'e iletilir + ok:true + messageId", async () => {
        const r = await sendDirectEmail({
            to: "musteri@firma.com",
            subject: "Teklifimiz — TKL-1",
            html: "<p>body</p>",
            text: "body",
            attachments: [{ filename: "Teklif-TKL-1.html", content: Buffer.from("<html></html>", "utf-8") }],
        });
        expect(r.ok).toBe(true);
        expect(r.messageId).toBe("rs_msg_1");
        const arg = mockResendSend.mock.calls[0][0];
        expect(arg.to).toBe("musteri@firma.com");
        expect(arg.attachments).toHaveLength(1);
        expect(arg.attachments[0].filename).toBe("Teklif-TKL-1.html");
        expect(Buffer.isBuffer(arg.attachments[0].content)).toBe(true);
    });

    it("ek yoksa attachments alanı Resend payload'ına eklenmez", async () => {
        await sendDirectEmail({ to: "a@b.com", subject: "S", html: "<p>h</p>", text: "t" });
        const arg = mockResendSend.mock.calls[0][0];
        expect("attachments" in arg).toBe(false);
    });

    it("replyTo verilirse Resend payload'ına iletilir", async () => {
        await sendDirectEmail({
            to: "a@b.com",
            subject: "S",
            html: "<p>h</p>",
            text: "t",
            replyTo: "teklif@firma.com",
        });
        expect(mockResendSend.mock.calls[0][0]).toEqual(expect.objectContaining({
            replyTo: "teklif@firma.com",
        }));
    });

    it("idempotency anahtarı Resend request seçeneğine iletilir", async () => {
        await sendDirectEmail({
            to: "a@b.com",
            subject: "S",
            html: "<p>h</p>",
            text: "t",
            idempotencyKey: "internal-email-log-log-1",
        });
        expect(mockResendSend.mock.calls[0][1]).toEqual({
            idempotencyKey: "internal-email-log-log-1",
        });
    });

    it("config eksik (EMAIL_FROM yok) → ok:false config_missing, Resend çağrılmaz", async () => {
        delete process.env.EMAIL_FROM;
        const r = await sendDirectEmail({ to: "a@b.com", subject: "S", html: "<p>h</p>", text: "t" });
        expect(r.ok).toBe(false);
        expect(r.error).toBe("config_missing");
        expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("Resend error → ok:false + error mesajı (throw etmez)", async () => {
        mockResendSend.mockResolvedValue({ data: null, error: { message: "Invalid from" } });
        const r = await sendDirectEmail({ to: "a@b.com", subject: "S", html: "<p>h</p>", text: "t" });
        expect(r.ok).toBe(false);
        expect(r.error).toBe("Invalid from");
    });

    /**
     * 2026-09-05 — E-POSTA YAPILANDIRMASININ İKİ AYRI EŞİĞİ VAR ve belge bunu
     * yanlış anlatıyordu.
     *
     * `deploy-env-matrix.md` `EMAIL_FROM`u "canlıdaki sorun bu" diye tek suçlu
     * gösteriyor, `RESEND_WEBHOOK_SECRET`i ise yalnız "teslimat durumu geri
     * okunamaz" diye yazıyordu. Kod başka söylüyor:
     *
     *   · DOĞRUDAN gönderim (teklif "Gönder", test ucu, admin parola sıfırlama)
     *     → yalnız `RESEND_API_KEY` ∧ `EMAIL_FROM` ister.
     *   · OUTBOX dispatch (10 birikmiş bildirim + 11 uyarı tipi)
     *     → `configured`, yani ÜÇÜ BİRDEN ister.
     *
     * Yani yalnız `EMAIL_FROM` set etmek outbox'ı AÇMAZ; kayıtlar
     * `waiting_config`te kalır ve sebebi görünmez. Deploy gününde tam olarak
     * bu tuzağa düşülürdü.
     */
    describe("yapılandırma eşikleri (doğrudan gönderim ≠ outbox)", () => {
        it("`configured` ÜÇ değişkenin hepsini ister", () => {
            const src = readFileSync(join(process.cwd(), "src/lib/services/email-service.ts"), "utf8");
            expect(src).toMatch(/configured:\s*hasApiKey\s*&&\s*hasFrom\s*&&\s*hasWebhookSecret/);
        });

        it("doğrudan gönderim webhook secret'ı İSTEMEZ (yalnız key + from)", () => {
            const src = readFileSync(join(process.cwd(), "src/lib/services/email-service.ts"), "utf8");
            expect(src).toMatch(/const resend = getResend\(\);[\s\S]{0,200}?if \(!resend \|\| !from\) return/);
        });

        it("outbox dispatch `configured` eşiğine bağlı — biri eksikse waiting_config", () => {
            const src = readFileSync(join(process.cwd(), "src/lib/services/notification-outbox-service.ts"), "utf8");
            expect(src).toMatch(/if \(!runtime\.configured\)\s*\{\s*await markWaitingForConfig/);
        });

        it("belge iki eşiği de anlatıyor — `EMAIL_FROM` tek suçlu gösterilmiyor", () => {
            const matrix = readFileSync(join(process.cwd(), "docs/deploy-env-matrix.md"), "utf8");
            // Satır SATIR BAŞINDAN seçilir. `includes` ile arandığında kural
            // yanlış satırı yakalıyordu: `EMAIL_FROM` satırı da bu değişkenin
            // adını geçiriyor ve tabloda ÖNCE geliyor → kural, hedefindeki satır
            // bozulsa bile yeşil kalıyordu. (Kırmızı-kanıt turu yakaladı; aynı
            // sınıf hata bu hafta üçüncü kez: iddia hedefini tam adreslemeli.)
            const row = matrix.split("\n").find((l) => l.startsWith("| `RESEND_WEBHOOK_SECRET`")) ?? "";
            expect(row, "webhook secret satırı bulunamadı").not.toBe("");
            // Zayıf kural tuzağı (kırmızı-kanıt turu yakaladı): "outbox geçiyor mu"
            // demek YETMİYOR — satır zaten başka bağlamda o kelimeyi taşıyordu.
            // Kural, iddianın KENDİSİNİ aramalı: bu değişkenin outbox eşiğinin
            // ORTAK KOŞULU olduğu, yani diğer ikisiyle BİRLİKTE arandığı.
            expect(row, "satır `configured` eşiğine atıf yapmalı").toMatch(/configured/);
            expect(row, "satır eşiğin diğer bileşenlerini de saymalı").toMatch(/EMAIL_FROM/);
            expect(row, "satır RESEND_API_KEY'i de saymalı").toMatch(/RESEND_API_KEY/);
        });
    });
});
