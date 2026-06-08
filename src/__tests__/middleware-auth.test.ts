/**
 * Tests for middleware.ts — auth gate.
 *
 * Regression guard for:
 *   - anonymous → dashboard → redirect to /login
 *   - anonymous → API → 401
 *   - authenticated → dashboard → pass through
 *   - authenticated → /login → redirect to /dashboard
 *   - public path (/api/health) → always pass through
 *   - CRON_SECRET header → cron path → pass through
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mock @supabase/ssr ────────────────────────────────────────────────────────

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({
        auth: {
            getUser: mockGetUser,
        },
    }),
}));

import { middleware } from "../proxy";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(pathname: string, headers?: Record<string, string>): NextRequest {
    const url = `http://localhost${pathname}`;
    return new NextRequest(url, { headers });
}

const ANON = { data: { user: null } };
// Provize edilmiş kullanıcı: admin createUser her zaman app_metadata.roles set eder.
const AUTH = { data: { user: { id: "u1", email: "admin@pmt.com", app_metadata: { roles: ["admin"] } } } };
// Self-signup (Google OAuth ile kendi kaydolan): app_metadata.roles HİÇ yok.
const UNPROVISIONED = { data: { user: { id: "u9", email: "random@gmail.com", app_metadata: {} } } };

// ─── Anonymous user ────────────────────────────────────────────────────────────

describe("middleware — anonymous user", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue(ANON);
    });

    it("GET /dashboard → redirect to /login", async () => {
        const res = await middleware(makeRequest("/dashboard"));
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(res.headers.get("location")).toContain("/login");
    });

    it("GET /api/orders → 401 JSON", async () => {
        const res = await middleware(makeRequest("/api/orders"));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe("Yetkisiz erişim.");
    });
});

// ─── Authenticated user ────────────────────────────────────────────────────────

describe("middleware — authenticated user", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue(AUTH);
    });

    it("GET /dashboard → pass through (200)", async () => {
        const res = await middleware(makeRequest("/dashboard"));
        expect(res.status).toBe(200);
    });

    it("GET /login → redirect to /dashboard", async () => {
        const res = await middleware(makeRequest("/login"));
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(res.headers.get("location")).toContain("/dashboard");
    });
});

// ─── Provize edilmemiş kullanıcı (self-signup) — davetiye-bazlı kilit ──────────

describe("middleware — unprovisioned (self-signup) user", () => {
    const originalAdminEmails = process.env.ADMIN_EMAILS;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ADMIN_EMAILS = ""; // random@gmail.com bootstrap admin DEĞİL
        mockGetUser.mockResolvedValue(UNPROVISIONED);
    });

    afterEach(() => {
        process.env.ADMIN_EMAILS = originalAdminEmails;
    });

    it("GET /dashboard → /login?error=unauthorized'a yönlendirir", async () => {
        const res = await middleware(makeRequest("/dashboard"));
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        const loc = res.headers.get("location") ?? "";
        expect(loc).toContain("/login");
        expect(loc).toContain("error=unauthorized");
    });

    it("GET /api/orders → 403 (yetkili değil)", async () => {
        const res = await middleware(makeRequest("/api/orders"));
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toContain("yetkili değil");
    });

    it("GET /login → döngü yok, login'i gösterir (200)", async () => {
        const res = await middleware(makeRequest("/login"));
        expect(res.status).toBe(200);
    });

    it("ADMIN_EMAILS'te ise bootstrap admin geçer (/dashboard 200)", async () => {
        process.env.ADMIN_EMAILS = "random@gmail.com";
        const res = await middleware(makeRequest("/dashboard"));
        expect(res.status).toBe(200);
    });
});

// ─── Public paths ──────────────────────────────────────────────────────────────

describe("middleware — public paths", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // getUser should NOT be called for public paths
        mockGetUser.mockResolvedValue(ANON);
    });

    it("GET /api/health → pass through without calling getUser", async () => {
        const res = await middleware(makeRequest("/api/health"));
        expect(res.status).toBe(200);
        expect(mockGetUser).not.toHaveBeenCalled();
    });
});

// ─── CRON_SECRET bypass ────────────────────────────────────────────────────────

describe("middleware — CRON_SECRET bypass", () => {
    const originalEnv = process.env.CRON_SECRET;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.CRON_SECRET = "test-secret-abc";
        mockGetUser.mockResolvedValue(ANON);
    });

    afterEach(() => {
        process.env.CRON_SECRET = originalEnv;
    });

    it("POST /api/alerts/scan with correct Bearer → pass through without getUser", async () => {
        const res = await middleware(
            makeRequest("/api/alerts/scan", {
                Authorization: "Bearer test-secret-abc",
            })
        );
        expect(res.status).toBe(200);
        expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("POST /api/quotes/expire with correct Bearer → pass through without getUser", async () => {
        const res = await middleware(
            makeRequest("/api/quotes/expire", {
                Authorization: "Bearer test-secret-abc",
            })
        );
        expect(res.status).toBe(200);
        expect(mockGetUser).not.toHaveBeenCalled();
    });
});
