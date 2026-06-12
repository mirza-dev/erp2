/**
 * POST /api/email/test — internal operator smoke test endpoint testleri.
 *
 * Coverage:
 *   - requireInternalOperator guard
 *   - Body validation (to/type)
 *   - Config check (RESEND_API_KEY + EMAIL_FROM yoksa 503)
 *   - Resend send → email_logs sent
 *   - Resend error → email_logs failed + 502
 *   - Recipient lookup + dedup BYPASS (direct send to body.to)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockInternalGuard = vi.fn();
const mockGetUser = vi.fn();
const mockCreateLog = vi.fn();
const mockUpdateLogStatus = vi.fn();
const mockResendSend = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: async () => {
        const { data: { user } } = await mockGetUser();
        return { user: user ?? null, userId: user?.id ?? null, roles: ["admin"], perms: new Set() };
    },
}));
vi.mock("@/lib/auth/internal-access", () => ({
    requireInternalOperatorFor: (...a: unknown[]) => mockInternalGuard(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: async () => mockGetUser() },
    }),
}));
vi.mock("@/lib/supabase/email-logs", () => ({
    dbCreateEmailLog: (...a: unknown[]) => mockCreateLog(...a),
    dbUpdateEmailLogStatus: (...a: unknown[]) => mockUpdateLogStatus(...a),
}));
vi.mock("resend", () => ({
    Resend: class MockResend {
        emails = { send: (...a: unknown[]) => mockResendSend(...a) };
    },
}));

import { POST } from "@/app/api/email/test/route";

function makeReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/email/test", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockInternalGuard.mockReturnValue(null);
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    mockCreateLog.mockResolvedValue("log-1");
    mockUpdateLogStatus.mockResolvedValue(undefined);
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "test@example.com";
});

describe("POST /api/email/test — auth + validation", () => {
    it("internal operator değil → 403 döndürür", async () => {
        const { NextResponse } = await import("next/server");
        mockInternalGuard.mockReturnValueOnce(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await POST(makeReq({ to: "a@b.com", type: "stock_critical" }));
        expect(res.status).toBe(403);
        expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("oturumsuz kullanıcı → internal guard 401 yanıtını döndürür", async () => {
        const { NextResponse } = await import("next/server");
        mockInternalGuard.mockReturnValueOnce(NextResponse.json({ error: "Yetkisiz." }, { status: 401 }));
        const res = await POST(makeReq({ to: "a@b.com", type: "stock_critical" }));
        expect(res.status).toBe(401);
    });

    it("geçersiz JSON body → 400", async () => {
        const res = await POST(makeReq("not-json"));
        expect(res.status).toBe(400);
    });

    it("geçersiz email → 400", async () => {
        const res = await POST(makeReq({ to: "not-an-email", type: "stock_critical" }));
        expect(res.status).toBe(400);
        expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("geçersiz type → 400", async () => {
        const res = await POST(makeReq({ to: "a@b.com", type: "unknown_type" }));
        expect(res.status).toBe(400);
        expect(mockResendSend).not.toHaveBeenCalled();
    });
});

describe("POST /api/email/test — config check", () => {
    it("RESEND_API_KEY yoksa → 503 + config_missing", async () => {
        delete process.env.RESEND_API_KEY;
        const res = await POST(makeReq({ to: "a@b.com", type: "stock_critical" }));
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.status).toBe("config_missing");
        expect(JSON.stringify(body)).not.toContain("RESEND_API_KEY");
        expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("EMAIL_FROM yoksa → 503 + config_missing", async () => {
        delete process.env.EMAIL_FROM;
        const res = await POST(makeReq({ to: "a@b.com", type: "stock_critical" }));
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(JSON.stringify(body)).not.toContain("EMAIL_FROM");
    });
});

describe("POST /api/email/test — happy path", () => {
    it("stock_critical happy path → log oluşturulur, Resend çağrılır, sent döner", async () => {
        mockResendSend.mockResolvedValueOnce({ data: { id: "resend-123" }, error: null });
        const res = await POST(makeReq({ to: "admin@example.com", type: "stock_critical" }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("sent");
        expect(body.resend_message_id).toBe("resend-123");
        expect(body.log_id).toBe("log-1");
        expect(body.to).toBe("admin@example.com");

        // Log create
        expect(mockCreateLog).toHaveBeenCalledWith(expect.objectContaining({
            user_id: "u-1",
            notification_type: "stock_critical",
            entity_type: "test_email",
            entity_id: null,
            recipient_email: "admin@example.com",
        }));
        // Resend send (recipient lookup BYPASS — body.to'ya direkt)
        expect(mockResendSend).toHaveBeenCalledWith(expect.objectContaining({
            from: "test@example.com",
            to: "admin@example.com",
            subject: expect.stringContaining("Kritik stok"),
        }));
        // Status update
        expect(mockUpdateLogStatus).toHaveBeenCalledWith("log-1", "sent", { resend_message_id: "resend-123" });
    });

    it("5 iç bildirim + müşteri teklif örneğini kabul ediyor", async () => {
        mockResendSend.mockResolvedValue({ data: { id: "x" }, error: null });
        for (const t of ["stock_critical", "order_pending", "order_new", "sync_error", "order_shipped", "quote_customer_send"]) {
            const res = await POST(makeReq({ to: "a@b.com", type: t }));
            expect(res.status).toBe(200);
        }
    });

    it("teklif testi dış firma markalı HTML gönderir", async () => {
        mockResendSend.mockResolvedValue({ data: { id: "x" }, error: null });
        await POST(makeReq({ to: "a@b.com", type: "quote_customer_send" }));
        const payload = mockResendSend.mock.calls[0][0];
        expect(payload.subject).toContain("Örnek Endüstriyel A.Ş. | Teklif");
        expect(payload.html).not.toContain("Roven");
    });
});

describe("POST /api/email/test — Resend error path", () => {
    it("Resend response.error → log failed + 502", async () => {
        mockResendSend.mockResolvedValueOnce({ data: null, error: { message: "Domain not verified" } });
        const res = await POST(makeReq({ to: "a@b.com", type: "stock_critical" }));
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.status).toBe("failed");
        expect(body.error).toContain("Domain not verified");
        expect(mockUpdateLogStatus).toHaveBeenCalledWith("log-1", "failed", { error: "Domain not verified" });
    });

    it("Resend throw → log failed + 502", async () => {
        mockResendSend.mockRejectedValueOnce(new Error("Network down"));
        const res = await POST(makeReq({ to: "a@b.com", type: "stock_critical" }));
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.status).toBe("error");
        expect(mockUpdateLogStatus).toHaveBeenCalledWith("log-1", "failed", { error: "Network down" });
    });
});
