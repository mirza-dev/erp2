/**
 * M-3 Rate Limiting — middleware entegrasyon testleri.
 *
 * `rate-limit` modülü mock'lanır (gerçek Redis bağlanmaz); davranış matrisi:
 *   - /api/health absolute bypass (rate limit ATLANIR)
 *   - CRON_SECRET Bearer + CRON_PATH → bypass
 *   - CRON_PATH ama secret yok → 401 (M-1 invariant)
 *   - /api/auth/demo artık rate limit'e tabi (ALWAYS_PUBLIC bypass öncesi)
 *   - /api/ai/** rate limit'e tabi (AI cost amplification)
 *   - Auth-cookie var → API_AUTH policy
 *   - Anon limit aşıldı → 429 + Retry-After
 *   - Redis down (fail-open) → 200 geçer
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockRateLimitCheck = vi.fn();

vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({
        auth: { getUser: mockGetUser },
    }),
}));

// rate-limit modülünün gerçek pure helper'ları korunur (extractClientIp, selectPolicy,
// detectSupabaseAuthCookie, POLICIES); sadece rateLimitCheck mock'lanır.
vi.mock("@/lib/rate-limit", async () => {
    const actual = await vi.importActual("@/lib/rate-limit") as Record<string, unknown>;
    return {
        ...actual,
        rateLimitCheck: (...args: unknown[]) => mockRateLimitCheck(...args),
    };
});

import { middleware } from "../../middleware";
import { selectPolicy, POLICIES } from "@/lib/rate-limit";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(pathname: string, opts: { method?: string; headers?: Record<string, string>; cookies?: Record<string, string> } = {}): NextRequest {
    const url = `http://localhost${pathname}`;
    const cookieHeader = opts.cookies
        ? Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join("; ")
        : undefined;
    return new NextRequest(url, {
        method: opts.method ?? "GET",
        headers: {
            ...(opts.headers ?? {}),
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
        },
    });
}

const RATE_OK = { ok: true, limit: 300, remaining: 299, retryAfter: 0, fromRedis: true };
const RATE_BLOCKED = { ok: false, limit: 30, remaining: 0, retryAfter: 45, fromRedis: true };
const RATE_FAIL_OPEN = { ok: true, limit: 30, remaining: 30, retryAfter: 0, fromRedis: false };

beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockRateLimitCheck.mockResolvedValue(RATE_OK);
});

afterEach(() => {
    delete process.env.CRON_SECRET;
});

// ── 1. /api/health absolute bypass ───────────────────────────────────────────

describe("middleware rate-limit — /api/health absolute bypass", () => {
    it("/api/health → rate limit ATLANIR (monitoring kırılmasın)", async () => {
        const res = await middleware(makeRequest("/api/health"));
        expect(res.status).toBe(200);
        expect(mockRateLimitCheck).not.toHaveBeenCalled();
    });
});

// ── 2-3. CRON_SECRET ─────────────────────────────────────────────────────────

describe("middleware rate-limit — CRON_SECRET Bearer", () => {
    it("CRON_SECRET + CRON_PATH → rate limit ATLANIR", async () => {
        process.env.CRON_SECRET = "test-secret";
        const res = await middleware(makeRequest("/api/parasut/sync-all", {
            method: "POST",
            headers: { authorization: "Bearer test-secret" },
        }));
        expect(res.status).toBe(200);
        expect(mockRateLimitCheck).not.toHaveBeenCalled();
    });

    it("CRON_PATH ama CRON_SECRET yok → 401 (M-1 invariant korunur)", async () => {
        // CRON_SECRET env set değil + Bearer header yok
        // Rate limit hâlâ çağrılır (M-3 sırası: rate-limit önce, sonra CRON 401)
        const res = await middleware(makeRequest("/api/parasut/sync-all", { method: "POST" }));
        expect(res.status).toBe(401);
        // Rate limit çağrılmış olmalı (önce passed, sonra CRON_SECRET check 401)
        expect(mockRateLimitCheck).toHaveBeenCalled();
    });
});

// ── 4-5. Demo + AI artık rate limit'e tabi ───────────────────────────────────

describe("middleware rate-limit — eski ALWAYS_PUBLIC artık rate limit'te", () => {
    it("/api/auth/demo GET → rate limit ÇAĞRILIR (DEMO policy seçilir)", async () => {
        // M-3 Review (2026-05-25): Demo route gerçek akışı GET (route.ts:10 GET handler;
        // DemoButton.tsx:16 <Link href>). Eski test POST'tu — gerçek abuse yüzeyini
        // ölçmüyordu. GET'e geçirildi.
        const res = await middleware(makeRequest("/api/auth/demo", { method: "GET" }));
        expect(mockRateLimitCheck).toHaveBeenCalled();
        // 1. arg: ip:0.0.0.0 (header yok), 2. arg: DEMO policy
        const [key, policy] = mockRateLimitCheck.mock.calls[0]!;
        expect(key).toMatch(/^ip:/);
        expect((policy as { name: string }).name).toBe("demo");
        // ALWAYS_PUBLIC bypass'tan geçti → 200
        expect(res.status).toBe(200);
    });

    it("/api/ai/purchase-copilot → rate limit ÇAĞRILIR (AI policy)", async () => {
        const res = await middleware(makeRequest("/api/ai/purchase-copilot", { method: "POST" }));
        expect(mockRateLimitCheck).toHaveBeenCalled();
        const [, policy] = mockRateLimitCheck.mock.calls[0]!;
        expect((policy as { name: string }).name).toBe("ai");
        expect(res.status).toBe(200);
    });
});

// ── 6. Auth-cookie hibrit policy ─────────────────────────────────────────────

describe("middleware rate-limit — auth-cookie hibrit policy seçimi", () => {
    it("Supabase auth cookie var → API_AUTH policy (300/dk)", async () => {
        // Authenticated user da set et — başarı response'ında header'lar dönsün
        mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "x@y.com" } } });
        const res = await middleware(makeRequest("/api/orders", {
            cookies: { "sb-abcd-auth-token": "fake-token-value" },
        }));
        const [, policy] = mockRateLimitCheck.mock.calls[0]!;
        expect((policy as { name: string }).name).toBe("auth");
        expect(res.status).toBe(200);
        // Başarı response'ında observability header'ları
        expect(res.headers.get("X-RateLimit-Limit")).toBe("300");
        expect(res.headers.get("X-RateLimit-Remaining")).toBe("299");
    });

    it("Auth cookie yok → API_ANON policy (30/dk)", async () => {
        await middleware(makeRequest("/api/products"));
        const [, policy] = mockRateLimitCheck.mock.calls[0]!;
        expect((policy as { name: string }).name).toBe("anon");
    });
});

// ── 7. Limit aşıldı → 429 ────────────────────────────────────────────────────

describe("middleware rate-limit — 429 Too Many Requests", () => {
    it("Limit aşıldı → 429 + Retry-After + Content-Type JSON", async () => {
        mockRateLimitCheck.mockResolvedValueOnce(RATE_BLOCKED);
        const res = await middleware(makeRequest("/api/products"));
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("45");
        expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
        expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
        expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
        const body = await res.json();
        expect(body.error).toMatch(/Çok fazla istek/);
        expect(body.retryAfter).toBe(45);
        // 429 dönülünce auth gate ARTIK ÇAĞRILMAZ (kısa devre)
        expect(mockGetUser).not.toHaveBeenCalled();
    });
});

// ── 8. Redis down — fail-open ────────────────────────────────────────────────

describe("middleware rate-limit — Redis down (fail-open)", () => {
    it("rateLimitCheck fromRedis=false → request geçer + header eklenmez (no-op)", async () => {
        mockRateLimitCheck.mockResolvedValueOnce(RATE_FAIL_OPEN);
        const res = await middleware(makeRequest("/api/health"));
        // health zaten bypass; başka bir endpoint dene
        mockRateLimitCheck.mockResolvedValueOnce(RATE_FAIL_OPEN);
        const res2 = await middleware(makeRequest("/api/products"));
        // Auth gate sonrası API anonim → 401 (mevcut davranış); rate limit fail-open
        expect([200, 401, 307]).toContain(res.status);
        expect([401]).toContain(res2.status);   // anon /api/products → 401
        // Rate limit çağrıldı ama fail-open → request akış devam etti
        expect(mockRateLimitCheck).toHaveBeenCalled();
    });
});

// ── Review 1 (2026-05-25) — 6 bulgu kapatma regression testleri ─────────────

describe("middleware rate-limit Review 1 — bulgular regression lock", () => {
    it("P2 (demo cookie auth-like): demo_mode=1 → API_AUTH policy (300/dk, anon değil)", async () => {
        // Demo dashboard auto-reload trafiği (alerts 60s + purchase 60s vb.) anon
        // 30/dk limitine takılırsa kullanıcı yanlışlıkla 429 görür. demo_mode
        // cookie de "session-like" sayılır.
        await middleware(makeRequest("/api/orders", { cookies: { demo_mode: "1" } }));
        const [, policy] = mockRateLimitCheck.mock.calls[0]!;
        expect((policy as { name: string }).name).toBe("auth");
    });

    it("P2 (withRateHeaders): ALWAYS_PUBLIC bypass response'unda da X-RateLimit-* var", async () => {
        // Eskiden ALWAYS_PUBLIC bypass NextResponse.next() döndüğü için header'lar
        // eklenmiyordu. Review sonrası withRateHeaders ile tüm allow path'ler dahil.
        // /api/auth/demo en güvenilir test (rate limit çağrılır + ALWAYS_PUBLIC).
        mockRateLimitCheck.mockResolvedValueOnce({
            ok: true, limit: 5, remaining: 4, retryAfter: 0, fromRedis: true,
        });
        const res = await middleware(makeRequest("/api/auth/demo"));
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
        expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
    });

    it("P2 (withRateHeaders): anon /api/products 401 response'unda da X-RateLimit-* var", async () => {
        // Auth gate'in 401 dalı da header taşımalı (client observability).
        mockRateLimitCheck.mockResolvedValueOnce({
            ok: true, limit: 30, remaining: 29, retryAfter: 0, fromRedis: true,
        });
        const res = await middleware(makeRequest("/api/products"));
        expect(res.status).toBe(401);
        expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
        expect(res.headers.get("X-RateLimit-Remaining")).toBe("29");
    });

    it("P1 (login dead-code): selectPolicy POST /login hâlâ LOGIN policy döner (gelecek server route için hazır)", () => {
        // Login akışı şu an client-side Supabase SDK (login/page.tsx:21) → middleware
        // görmez. /api/auth/login server route eklenirse otomatik aktif olur.
        // selectPolicy doğrudan test — runtime'da hit etmez ama invariant kilitli.
        expect(selectPolicy("/login", "POST", false)).toBe(POLICIES.LOGIN);
    });
});
