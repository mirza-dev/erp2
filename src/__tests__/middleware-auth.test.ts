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

import { middleware } from "../../middleware";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(pathname: string, headers?: Record<string, string>): NextRequest {
    const url = `http://localhost${pathname}`;
    return new NextRequest(url, { headers });
}

const ANON = { data: { user: null } };
const AUTH = { data: { user: { id: "u1", email: "admin@pmt.com" } } };

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
});
