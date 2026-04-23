/**
 * Tests for middleware.ts — demo mode gate.
 *
 * Regression guard for:
 *   - demo cookie + GET /dashboard → pass through
 *   - demo cookie + GET /api/products → pass through
 *   - demo cookie + POST /api/products → 403
 *   - demo cookie + PATCH /api/orders/x → 403
 *   - demo cookie + DELETE /api/customers/x → 403
 *   - no cookie + GET /dashboard → redirect /login (existing behavior)
 *   - auth'd user + demo cookie → normal auth flow (demo ignored)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

function makeRequest(
    pathname: string,
    options?: { method?: string; cookies?: Record<string, string>; headers?: Record<string, string> }
): NextRequest {
    const url = `http://localhost${pathname}`;
    const req = new NextRequest(url, {
        method: options?.method ?? "GET",
        headers: options?.headers,
    });
    if (options?.cookies) {
        for (const [name, value] of Object.entries(options.cookies)) {
            req.cookies.set(name, value);
        }
    }
    return req;
}

const ANON = { data: { user: null } };
const AUTH = { data: { user: { id: "u1", email: "admin@pmt.com" } } };
const DEMO_COOKIE = { demo_mode: "1" };

// ─── Demo mode — anonymous with cookie ────────────────────────────────────────

describe("middleware — demo mode (anonymous + demo cookie)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue(ANON);
    });

    it("GET /dashboard → pass through (200)", async () => {
        const res = await middleware(makeRequest("/dashboard", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("GET /dashboard/orders → pass through (200)", async () => {
        const res = await middleware(makeRequest("/dashboard/orders", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("GET /api/products → pass through (200)", async () => {
        const res = await middleware(makeRequest("/api/products", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("GET /api/orders → pass through (200)", async () => {
        const res = await middleware(makeRequest("/api/orders", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("POST /api/products → 403", async () => {
        const res = await middleware(makeRequest("/api/products", { method: "POST", cookies: DEMO_COOKIE }));
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toMatch(/demo/i);
    });

    it("PATCH /api/orders/abc → 403", async () => {
        const res = await middleware(makeRequest("/api/orders/abc", { method: "PATCH", cookies: DEMO_COOKIE }));
        expect(res.status).toBe(403);
    });

    it("DELETE /api/customers/abc → 403", async () => {
        const res = await middleware(makeRequest("/api/customers/abc", { method: "DELETE", cookies: DEMO_COOKIE }));
        expect(res.status).toBe(403);
    });

    it("GET / → pass through (landing page still accessible)", async () => {
        const res = await middleware(makeRequest("/", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });
});

// ─── No demo cookie — existing behavior preserved ─────────────────────────────

describe("middleware — no demo cookie (anonymous)", () => {
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

    it("GET /api/orders → 401", async () => {
        const res = await middleware(makeRequest("/api/orders"));
        expect(res.status).toBe(401);
    });
});

// ─── Auth'd user with demo cookie — demo ignored ──────────────────────────────

describe("middleware — authenticated user with demo cookie", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue(AUTH);
    });

    it("GET /dashboard → pass through (normal auth flow)", async () => {
        const res = await middleware(makeRequest("/dashboard", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("GET /login → redirect to /dashboard (not trapped by demo)", async () => {
        const res = await middleware(makeRequest("/login", { cookies: DEMO_COOKIE }));
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(res.headers.get("location")).toContain("/dashboard");
    });
});

// ─── Demo mode blocks sensitive write endpoints ────────────────���──────────────
//
// Regression guard: even if a future refactor changes the path list, these
// specific high-value endpoints must remain blocked for demo users.

describe("middleware — demo mode blocks sensitive write endpoints", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue(ANON);
    });

    // Regular API paths — demo mode returns 403 (write blocked)
    const sensitiveWrites: Array<[string, string]> = [
        ["POST",   "/api/admin/users"],
        ["DELETE", "/api/admin/users/user-1"],
        ["POST",   "/api/import/batch-1/confirm"],
        ["POST",   "/api/parasut/retry"],
        ["PATCH",  "/api/recommendations/rec-1"],
        ["POST",   "/api/ai/purchase-copilot"],
        ["DELETE", "/api/orders/order-1"],
        ["PATCH",  "/api/orders/order-1"],
        ["DELETE", "/api/customers/cust-1"],
        ["POST",   "/api/production"],
        ["DELETE", "/api/production/entry-1"],
        ["PATCH",  "/api/quotes/quote-1"],
        ["DELETE", "/api/quotes/quote-1"],
    ];

    for (const [method, path] of sensitiveWrites) {
        it(`${method} ${path} → 403 in demo mode`, async () => {
            const res = await middleware(makeRequest(path, { method, cookies: DEMO_COOKIE }));
            expect(res.status).toBe(403);
            const body = await res.json();
            expect(body.error).toMatch(/demo/i);
        });
    }

    // CRON paths — middleware returns 401 (CRON_SECRET required), not 403
    // Demo mode does not apply: CRON paths are checked before user/demo state
    it("POST /api/alerts/ai-suggest → 401 in demo mode (CRON_SECRET required)", async () => {
        const res = await middleware(makeRequest("/api/alerts/ai-suggest", { method: "POST", cookies: DEMO_COOKIE }));
        expect(res.status).toBe(401);
    });

    it("POST /api/parasut/sync-all → 401 in demo mode (CRON_SECRET required)", async () => {
        const res = await middleware(makeRequest("/api/parasut/sync-all", { method: "POST", cookies: DEMO_COOKIE }));
        expect(res.status).toBe(401);
    });

    it("POST /api/quotes/expire → 401 in demo mode (CRON_SECRET required)", async () => {
        const res = await middleware(makeRequest("/api/quotes/expire", { method: "POST", cookies: DEMO_COOKIE }));
        expect(res.status).toBe(401);
    });

    // /api/alerts/scan is in ALWAYS_PUBLIC — middleware passes through, route handles own auth
    it("POST /api/alerts/scan → 200 from middleware (route manages own auth via CRON_SECRET or session)", async () => {
        const res = await middleware(makeRequest("/api/alerts/scan", { method: "POST", cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("GET /api/admin/users → 200 in demo mode (read-only list allowed)", async () => {
        const res = await middleware(makeRequest("/api/admin/users", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });
});
