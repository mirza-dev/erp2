import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";

const { mockExchangeCodeForSession, mockCreateClient, mockGetUser, mockSignOut, mockReconcile } =
    vi.hoisted(() => ({
        mockExchangeCodeForSession: vi.fn(),
        mockCreateClient: vi.fn(),
        mockGetUser: vi.fn(),
        mockSignOut: vi.fn(),
        mockReconcile: vi.fn(),
    }));

vi.mock("@/lib/supabase/server", () => ({
    createClient: mockCreateClient,
}));

vi.mock("@/lib/auth/oauth-provision", () => ({
    reconcileOAuthUserRoles: (...a: unknown[]) => mockReconcile(...a),
}));

const PROVISIONED_USER = {
    id: "u-1",
    email: "ali@firma.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { roles: ["sales"] },
};

const UNPROVISIONED_USER = {
    id: "u-2",
    email: "yeni@gmail.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: {},
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.ADMIN_EMAILS;
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: PROVISIONED_USER } });
    mockSignOut.mockResolvedValue({ error: null });
    mockReconcile.mockResolvedValue(null);
    mockCreateClient.mockResolvedValue({
        auth: {
            exchangeCodeForSession: mockExchangeCodeForSession,
            getUser: mockGetUser,
            signOut: mockSignOut,
        },
    });
});

afterEach(() => vi.restoreAllMocks());

describe("GET /auth/callback", () => {
    it("code varsa exchange eder, provizyonlu kullanıcıyı /dashboard'a 307 ile yönlendirir", async () => {
        const res = await GET(new Request("https://erp.example.com/auth/callback?code=abc123"));

        expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc123");
        expect(res.status).toBe(307);
        expect(res.headers.get("Location")).toBe("/dashboard");
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("provider error paramı varsa exchange'e hiç girmez → reason=provider", async () => {
        const res = await GET(new Request(
            "https://erp.example.com/auth/callback?error=access_denied&error_description=user+cancelled",
        ));

        expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
        expect(res.headers.get("Location")).toBe("/login?error=oauth&reason=provider");
    });

    it("code yoksa reason=no_code", async () => {
        const res = await GET(new Request("https://erp.example.com/auth/callback"));

        expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
        expect(res.headers.get("Location")).toBe("/login?error=oauth&reason=no_code");
    });

    it("exchange 'code verifier' hatası → reason=pkce (Redirect URL allowlist teşhisi)", async () => {
        mockExchangeCodeForSession.mockResolvedValue({
            error: { message: "invalid request: both auth code and code verifier should be non-empty" },
        });
        const res = await GET(new Request("https://erp.example.com/auth/callback?code=bad"));

        expect(res.headers.get("Location")).toBe("/login?error=oauth&reason=pkce");
    });

    it("diğer exchange hataları → reason=exchange", async () => {
        mockExchangeCodeForSession.mockResolvedValue({ error: { message: "invalid grant" } });
        const res = await GET(new Request("https://erp.example.com/auth/callback?code=bad"));

        expect(res.headers.get("Location")).toBe("/login?error=oauth&reason=exchange");
    });

    it("provizyonsuz + onarım başarısız → signOut + unauthorized&attempted=<email>", async () => {
        mockGetUser.mockResolvedValue({ data: { user: UNPROVISIONED_USER } });
        const res = await GET(new Request("https://erp.example.com/auth/callback?code=ok"));

        expect(mockReconcile).toHaveBeenCalledWith("u-2", "yeni@gmail.com", true);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(res.headers.get("Location")).toBe(
            "/login?error=unauthorized&attempted=yeni%40gmail.com",
        );
    });

    it("provizyonsuz ama e-posta-eşleşme onarımı roller döndürdü → /dashboard, signOut YOK", async () => {
        mockGetUser.mockResolvedValue({ data: { user: UNPROVISIONED_USER } });
        mockReconcile.mockResolvedValue(["sales"]);
        const res = await GET(new Request("https://erp.example.com/auth/callback?code=ok"));

        expect(res.headers.get("Location")).toBe("/dashboard");
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("rolsüz ama ADMIN_EMAILS'teki e-posta → onarım denenmeden /dashboard (bootstrap)", async () => {
        process.env.ADMIN_EMAILS = "yeni@gmail.com";
        mockGetUser.mockResolvedValue({ data: { user: UNPROVISIONED_USER } });
        const res = await GET(new Request("https://erp.example.com/auth/callback?code=ok"));

        expect(mockReconcile).not.toHaveBeenCalled();
        expect(res.headers.get("Location")).toBe("/dashboard");
    });

    it("doğrulanmamış e-posta onarıma emailVerified=false ile gider", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { ...UNPROVISIONED_USER, email_confirmed_at: null } },
        });
        await GET(new Request("https://erp.example.com/auth/callback?code=ok"));

        expect(mockReconcile).toHaveBeenCalledWith("u-2", "yeni@gmail.com", false);
    });
});
