/**
 * POST /api/quotes/[id]/send-email — serviceSendQuoteToCustomer sonucu → HTTP map.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockSend = vi.fn();
vi.mock("@/lib/services/quote-service", () => ({
    serviceSendQuoteToCustomer: (...a: unknown[]) => mockSend(...a),
}));

const mockRequirePermission = vi.fn();
const mockGetUserId = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
    getCurrentUserId:  (...a: unknown[]) => mockGetUserId(...a),
}));

import { POST } from "@/app/api/quotes/[id]/send-email/route";

const QID = "quote-test-uuid";
const makeReq = () => new NextRequest(`http://localhost/api/quotes/${QID}/send-email`, { method: "POST" });
const idCtx = () => ({ params: Promise.resolve({ id: QID }) });

beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(null);  // yetki var
    mockGetUserId.mockResolvedValue("actor-1");
    mockSend.mockResolvedValue({ ok: true, messageId: "rs_1" });
});

describe("POST /api/quotes/[id]/send-email", () => {
    it("RBAC: manage_quotes yoksa → 403, servis çağrılmaz", async () => {
        mockRequirePermission.mockResolvedValue(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(403);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "manage_quotes");
        expect(mockSend).not.toHaveBeenCalled();
    });

    it("başarı → 200 status:sent + messageId; actor servise geçer", async () => {
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("sent");
        expect(body.messageId).toBe("rs_1");
        expect(mockSend).toHaveBeenCalledWith(QID, "actor-1");
    });

    it("teklif yok → 404", async () => {
        mockSend.mockResolvedValue({ ok: false, notFound: true });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(404);
    });

    it("müşteri e-postası yok → 400", async () => {
        mockSend.mockResolvedValue({ ok: false, reason: "no_email" });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(400);
    });

    it("suppression ile bloke alıcı → 409", async () => {
        mockSend.mockResolvedValue({ ok: false, reason: "suppressed" });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(409);
    });

    it("config_missing → 503", async () => {
        mockSend.mockResolvedValue({ ok: false, error: "config_missing" });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(503);
    });

    it("Resend fail → 502", async () => {
        mockSend.mockResolvedValue({ ok: false, error: "Bounce" });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(502);
    });
});
