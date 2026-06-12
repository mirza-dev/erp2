import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockVerify = vi.fn();
const mockProcess = vi.fn();

vi.mock("@/lib/services/email-webhook-service", () => ({
    verifyResendWebhook: (...args: unknown[]) => mockVerify(...args),
    processResendWebhook: (...args: unknown[]) => mockProcess(...args),
}));

import { POST } from "@/app/api/email/webhooks/resend/route";

function request(headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost/api/email/webhooks/resend", {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "email.delivered" }),
    });
}

const validHeaders = {
    "svix-id": "svix-1",
    "svix-timestamp": "1710000000",
    "svix-signature": "v1,signature",
};

beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue({ type: "email.delivered", data: { email_id: "email-1" } });
    mockProcess.mockResolvedValue({ duplicate: false, matched: true });
});

describe("POST /api/email/webhooks/resend", () => {
    it("eksik veya geçersiz imzayı 400 ile reddeder", async () => {
        expect((await POST(request())).status).toBe(400);

        mockVerify.mockImplementation(() => { throw new Error("invalid signature"); });
        expect((await POST(request(validHeaders))).status).toBe(400);
        expect(mockProcess).not.toHaveBeenCalled();
    });

    it("doğrulanmış webhook işleme hatasında provider retry için 500 döner", async () => {
        mockProcess.mockRejectedValue(new Error("database unavailable"));

        const response = await POST(request(validHeaders));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Webhook işlenemedi." });
    });

    it("başarılı webhook sonucunu 200 ile döner", async () => {
        const response = await POST(request(validHeaders));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true, duplicate: false, matched: true });
    });
});
