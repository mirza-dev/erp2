/**
 * Kullanıcı daveti (onboarding, 2026-09-16) — servis + yeniden-gönder ucu + şablon.
 *
 * NEDEN VAR: Admin eskiden parola yazıp elden iletiyordu. Davet = Supabase'in
 * ÜRETTİĞİ recovery bağlantısı + BİZİM gönderdiğimiz e-posta (Resend). İki
 * bileşenin birleşimi üç yerde kırılabilir: bağlantı üretilemez, e-posta
 * gitmez, ya da süreli/tek-kullanımlık bağlantı cron'la yeniden gönderilir.
 * Üçü de burada kilitli.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGenerateLink, mockGetUserById, mockListUsers, mockAuditInsert,
    mockSendDirectEmail, mockRuntimeStatus, mockCreateEmailLog, mockUpdateEmailLogStatus,
    mockGetCompanySettings, mockGetUser,
} = vi.hoisted(() => ({
    mockGenerateLink: vi.fn(),
    mockGetUserById: vi.fn(),
    mockListUsers: vi.fn(),
    mockAuditInsert: vi.fn(),
    mockSendDirectEmail: vi.fn(),
    mockRuntimeStatus: vi.fn(),
    mockCreateEmailLog: vi.fn(),
    mockUpdateEmailLogStatus: vi.fn(),
    mockGetCompanySettings: vi.fn(),
    mockGetUser: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        auth: { admin: { generateLink: mockGenerateLink, getUserById: mockGetUserById, listUsers: mockListUsers } },
        from: (table: string) => ({
            insert: (row: unknown) => mockAuditInsert(table, row),
        }),
    }),
    ConfigError: class ConfigError extends Error {},
}));
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/services/email-service", () => ({
    sendDirectEmail: (...a: unknown[]) => mockSendDirectEmail(...a),
    getEmailRuntimeStatus: () => mockRuntimeStatus(),
}));
vi.mock("@/lib/supabase/email-logs", () => ({
    dbCreateEmailLog: (...a: unknown[]) => mockCreateEmailLog(...a),
    dbUpdateEmailLogStatus: (...a: unknown[]) => mockUpdateEmailLogStatus(...a),
}));
vi.mock("@/lib/supabase/company-settings", () => ({
    dbGetCompanySettings: () => mockGetCompanySettings(),
}));

import { sendUserInvite, inviteAvailable, randomInvitePassword } from "@/lib/services/user-invite-service";
import { renderUserInvite } from "@/lib/email/templates";
import { POST as resendInvite } from "@/app/api/admin/users/[id]/invite/route";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";

const LINK = "https://x.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=https%3A%2F%2Ferp.example.com%2Fauth%2Fcallback";

beforeEach(() => {
    vi.clearAllMocks();
    mockRuntimeStatus.mockReturnValue({ configured: false, hasApiKey: true, hasFrom: true, hasWebhookSecret: false });
    mockGenerateLink.mockResolvedValue({ data: { properties: { action_link: LINK } }, error: null });
    mockSendDirectEmail.mockResolvedValue({ ok: true, messageId: "msg-1" });
    mockCreateEmailLog.mockResolvedValue("log-1");
    mockUpdateEmailLogStatus.mockResolvedValue(undefined);
    mockGetCompanySettings.mockResolvedValue({ name: "PMT Endüstriyel" });
    mockAuditInsert.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1", email: "a@pmt.com", app_metadata: { roles: ["admin"] } } } });
});

describe("inviteAvailable — doğrudan gönderim eşiği", () => {
    it("RESEND_API_KEY ∧ EMAIL_FROM yeter; webhook sırrı GEREKMEZ (o outbox eşiği)", () => {
        expect(inviteAvailable()).toBe(true);
        mockRuntimeStatus.mockReturnValue({ configured: false, hasApiKey: true, hasFrom: false, hasWebhookSecret: true });
        expect(inviteAvailable()).toBe(false);
    });
});

describe("randomInvitePassword", () => {
    it("her çağrıda farklı, uzun ve politikadan geçen bir sır üretir", () => {
        const a = randomInvitePassword();
        const b = randomInvitePassword();
        expect(a).not.toBe(b);
        expect(a.length).toBeGreaterThan(40);
        // Politika davet yolunda KOŞMAZ ama sır yine de zayıf olmamalı (savunma derinliği).
        for (let i = 0; i < 20; i++) expect(checkPasswordPolicy(randomInvitePassword(), { email: "x@y.z" })).toBeNull();
    });
});

describe("sendUserInvite", () => {
    const input = {
        userId: "u-1",
        email: "yeni@pmt.com",
        roles: ["sales" as const],
        inviter: { id: "admin-1", email: "a@pmt.com" },
        origin: "https://erp.example.com/",
    };

    it("recovery bağlantısı mevcut kurtarma zincirine döner (/auth/callback?next=/sifre-yenile) — yeni next hedefi AÇILMAZ", async () => {
        const res = await sendUserInvite(input);
        expect(res.ok).toBe(true);
        expect(mockGenerateLink).toHaveBeenCalledWith({
            type: "recovery",
            email: "yeni@pmt.com",
            options: { redirectTo: "https://erp.example.com/auth/callback?next=/sifre-yenile" },
        });
    });

    it("e-postayı Resend'le gönderir; log user_invite + idempotency anahtarı + sent", async () => {
        await sendUserInvite(input);
        expect(mockCreateEmailLog).toHaveBeenCalledWith(expect.objectContaining({
            notification_type: "user_invite",
            entity_type: "user_invite",
            entity_id: "u-1",
            recipient_email: "yeni@pmt.com",
            user_id: "admin-1",
        }));
        const sendArg = mockSendDirectEmail.mock.calls[0][0] as { to: string; html: string; idempotencyKey: string };
        expect(sendArg.to).toBe("yeni@pmt.com");
        expect(sendArg.html).toContain(LINK.replace(/&/g, "&amp;"));
        expect(sendArg.idempotencyKey).toBe("user-invite-log-log-1");
        expect(mockUpdateEmailLogStatus).toHaveBeenCalledWith("log-1", "sent", { resend_message_id: "msg-1" });
    });

    it("audit: user_invited satırı actor + hedef bilgileriyle ({ error } çözülür)", async () => {
        await sendUserInvite(input);
        expect(mockAuditInsert).toHaveBeenCalledWith("audit_log", expect.objectContaining({
            actor: "a@pmt.com",
            action: "user_invited",
            entity_type: "user",
            source: "ui",
            after_state: { user_id: "u-1", email: "yeni@pmt.com", roles: ["sales"] },
        }));
    });

    it("bağlantı üretilemezse e-posta HİÇ gönderilmez", async () => {
        mockGenerateLink.mockResolvedValue({ data: null, error: { message: "user not found" } });
        const res = await sendUserInvite(input);
        expect(res).toEqual({ ok: false, error: "user not found" });
        expect(mockSendDirectEmail).not.toHaveBeenCalled();
        expect(mockAuditInsert).not.toHaveBeenCalled();
    });

    it("gönderim düşerse log failed + ok:false (audit yazılmaz — olmamış işi damgalama)", async () => {
        mockSendDirectEmail.mockResolvedValue({ ok: false, error: "config_missing" });
        const res = await sendUserInvite(input);
        expect(res).toEqual({ ok: false, error: "config_missing" });
        expect(mockUpdateEmailLogStatus).toHaveBeenCalledWith("log-1", "failed", { error: "config_missing" });
        expect(mockAuditInsert).not.toHaveBeenCalled();
    });

    it("firma adı süs: okunamazsa davet yine gider", async () => {
        mockGetCompanySettings.mockRejectedValue(new Error("db down"));
        const res = await sendUserInvite(input);
        expect(res.ok).toBe(true);
        expect((mockSendDirectEmail.mock.calls[0][0] as { subject: string }).subject).toContain("Roven");
    });
});

describe("renderUserInvite — şablon", () => {
    it("CTA bağlantısı, rol etiketi, davet eden ve süre notu; HTML kaçışlı", () => {
        const out = renderUserInvite({
            email: "yeni@pmt.com",
            roleLabels: ["Satış", "Satın Alma"],
            inviterEmail: "a@pmt.com",
            actionLink: "https://x/verify?a=1&b=2",
            companyName: "<PMT> & Co",
            expiresInMinutes: 60,
        });
        expect(out.subject).toBe("<PMT> & Co | Hesabınız hazır — parolanızı belirleyin");
        expect(out.html).toContain("Parolamı belirle");
        expect(out.html).toContain('href="https://x/verify?a=1&amp;b=2"');
        expect(out.html).toContain("Satış, Satın Alma");
        expect(out.html).toContain("a@pmt.com");
        expect(out.html).toContain("60 dakika");
        expect(out.html).toContain("&lt;PMT&gt; &amp; Co");
        expect(out.html).not.toContain("<PMT>");
        // Bildirim-tercihi footer'ı YOK: bu bir işlem e-postası, tercih değil.
        expect(out.html).not.toContain("bildirim tercihleri");
        expect(out.text).toContain("https://x/verify?a=1&b=2");
    });

    it("firma adı yoksa Roven; rol/davet eden yoksa satırları basmaz", () => {
        const out = renderUserInvite({ email: "e@x.y", roleLabels: [], inviterEmail: null, actionLink: "https://x/l" });
        expect(out.subject.startsWith("Roven |")).toBe(true);
        expect(out.html).not.toContain("Davet eden");
        expect(out.html).not.toContain(">Rol<");
    });
});

describe("POST /api/admin/users/[id]/invite — daveti yeniden gönder", () => {
    const req = () => new NextRequest("http://localhost/api/admin/users/u-1/invite", { method: "POST" });
    const params = { params: Promise.resolve({ id: "u-1" }) };

    it("admin değilse 403; davet servisi çağrılmaz", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "s", email: "s@pmt.com", app_metadata: { roles: ["sales"] } } } });
        mockListUsers.mockResolvedValue({ data: { users: [{ id: "a", email: "a@pmt.com", app_metadata: { roles: ["admin"] } }] }, error: null });
        const res = await resendInvite(req(), params);
        expect(res.status).toBe(403);
        expect(mockGenerateLink).not.toHaveBeenCalled();
    });

    it("e-posta yapılandırılmamışsa 400", async () => {
        mockRuntimeStatus.mockReturnValue({ configured: false, hasApiKey: false, hasFrom: false, hasWebhookSecret: false });
        const res = await resendInvite(req(), params);
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("email_not_configured");
    });

    it("zaten giriş yapmış kullanıcıya 409 — yolu 'Şifre sıfırla'", async () => {
        mockGetUserById.mockResolvedValue({ data: { user: { id: "u-1", email: "e@pmt.com", last_sign_in_at: "2026-09-01T00:00:00Z", app_metadata: {} } }, error: null });
        const res = await resendInvite(req(), params);
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe("already_signed_in");
        expect(mockGenerateLink).not.toHaveBeenCalled();
    });

    it("hiç giriş yapmamış kullanıcıya yeniden gönderir (rolleri app_metadata'dan)", async () => {
        mockGetUserById.mockResolvedValue({ data: { user: { id: "u-1", email: "e@pmt.com", last_sign_in_at: null, app_metadata: { roles: ["purchasing"] } } }, error: null });
        const res = await resendInvite(req(), params);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, email: "e@pmt.com" });
        expect(mockGenerateLink).toHaveBeenCalledWith(expect.objectContaining({ email: "e@pmt.com" }));
        const html = (mockSendDirectEmail.mock.calls[0][0] as { html: string }).html;
        expect(html).toContain("Satın Alma");
    });

    it("kullanıcı yoksa 404", async () => {
        mockGetUserById.mockResolvedValue({ data: { user: null }, error: { message: "not found" } });
        expect((await resendInvite(req(), params)).status).toBe(404);
    });
});
