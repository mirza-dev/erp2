import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockResolveAuth = vi.fn();
const mockGuard = vi.fn();
const mockList = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: (...a: unknown[]) => mockResolveAuth(...a),
}));
vi.mock("@/lib/auth/internal-access", () => ({
    requireInternalOperatorFor: (...a: unknown[]) => mockGuard(...a),
}));
vi.mock("@/lib/supabase/email-maintenance", () => ({
    dbListEmailDeliveries: (...a: unknown[]) => mockList(...a),
}));

import { GET } from "@/app/api/maintenance/email-deliveries/route";

beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuth.mockResolvedValue({ user: { id: "u-1" }, userId: "u-1", roles: ["admin"], perms: new Set(["view_settings"]) });
    mockGuard.mockReturnValue(null);
    mockList.mockResolvedValue([{
        id: "log-1",
        subject: "Test",
        html_body: "<strong>secret body</strong>",
        text_body: "secret body",
        metadata: { provider: "private" },
    }]);
});

describe("GET /api/maintenance/email-deliveries", () => {
    it("müşteri/anon internal guard yanıtını aynen döndürür", async () => {
        mockGuard.mockReturnValue(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await GET(new NextRequest("http://localhost/api/maintenance/email-deliveries"));
        expect(res.status).toBe(403);
        expect(mockList).not.toHaveBeenCalled();
    });

    it("internal operatöre güvenli audit verir; gövde ve metadata sızdırmaz", async () => {
        const req = new NextRequest("http://localhost/api/maintenance/email-deliveries?status=failed&recipient=a%40b.com");
        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", recipient: "a@b.com" }));
        const body = await res.json();
        expect(body[0]).toEqual({ id: "log-1", subject: "Test" });
        expect(JSON.stringify(body)).not.toContain("secret body");
        expect(JSON.stringify(body)).not.toContain("provider");
    });
});
