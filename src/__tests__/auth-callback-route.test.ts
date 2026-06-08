import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";

const { mockExchangeCodeForSession, mockCreateClient } = vi.hoisted(() => ({
    mockExchangeCodeForSession: vi.fn(),
    mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: mockCreateClient,
}));

beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockCreateClient.mockResolvedValue({
        auth: { exchangeCodeForSession: mockExchangeCodeForSession },
    });
});

afterEach(() => vi.restoreAllMocks());

describe("GET /auth/callback", () => {
    it("code varsa exchange eder ve /dashboard'a 307 ile yönlendirir (relative Location)", async () => {
        const res = await GET(new Request("https://erp.example.com/auth/callback?code=abc123"));

        expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc123");
        expect(res.status).toBe(307);
        expect(res.headers.get("Location")).toBe("/dashboard");
    });

    it("exchange başarısızsa /login?error=oauth'a yönlendirir", async () => {
        mockExchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });
        const res = await GET(new Request("https://erp.example.com/auth/callback?code=bad"));

        expect(mockExchangeCodeForSession).toHaveBeenCalledWith("bad");
        expect(res.status).toBe(307);
        expect(res.headers.get("Location")).toBe("/login?error=oauth");
    });

    it("code yoksa exchange çağırmaz, /login?error=oauth'a yönlendirir", async () => {
        const res = await GET(new Request("https://erp.example.com/auth/callback"));

        expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get("Location")).toBe("/login?error=oauth");
    });
});
