/**
 * Faz 2d Review P3-005 — ENV opt-in demo guard for attachments routes.
 * Faz 2d Review P3-007 — Davranış testleri (vi.stubEnv + gerçek middleware).
 *
 * Coverage:
 *   - Source-regex regression locks (env flag, path tree, 401)
 *   - Behavior tests: middleware'i gerçek NextRequest + mock Supabase ile koş,
 *     env true/false × demo cookie × auth user kombinasyonlarını assert et.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

// ── Source files for regression locks ────────────────────────────────────────

const MIDDLEWARE = fs.readFileSync(
    // M-3 Review 2 (2026-05-25): middleware.ts → src/proxy.ts (Next 16 Turbopack
    // proxy convention; root-level proxy.ts discover edilmiyor). İçerik aynen
    // korundu (export `proxy` + alias `middleware`); demo guard branch'i aynı.
    path.join(process.cwd(), "src/proxy.ts"),
    "utf8",
);
const URL_ROUTE = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/products/[id]/attachments/[attachmentId]/url/route.ts"),
    "utf8",
);
const ENV_EXAMPLE = fs.readFileSync(
    path.join(process.cwd(), ".env.example"),
    "utf8",
);

// ── Source-regex regression locks ────────────────────────────────────────────

describe("Faz 2d Review P3-005 — middleware demo guard (source)", () => {
    it("middleware: bloklama DEFAULT — yalnız ATTACHMENTS_ALLOW_DEMO_ANON='true' acar (O11 flip)", () => {
        expect(MIDDLEWARE).toMatch(/process\.env\.ATTACHMENTS_ALLOW_DEMO_ANON !== "true"/);
        expect(MIDDLEWARE).not.toContain("ATTACHMENTS_BLOCK_DEMO_ANON");
    });

    it("guard targets /api/products/:id/attachments path tree", () => {
        // Middleware kaynağında: /^\/api\/products\/[^/]+\/attachments/
        expect(MIDDLEWARE).toContain("\\/api\\/products\\/[^/]+\\/attachments");
    });

    it("guard returns 401 with Turkish message", () => {
        expect(MIDDLEWARE).toMatch(/status:\s*401/);
        expect(MIDDLEWARE).toMatch(/kimlik doğrulama gerekiyor/);
    });

    it("guard sits INSIDE the demo-cookie branch (not unconditional)", () => {
        const idx = MIDDLEWARE.indexOf("ATTACHMENTS_ALLOW_DEMO_ANON");
        const before = MIDDLEWARE.slice(0, idx);
        expect(before).toMatch(/isDemoMode/);
    });

    it("url route documents the opt-out flag in its security note", () => {
        expect(URL_ROUTE).toMatch(/ATTACHMENTS_ALLOW_DEMO_ANON=true/);
    });

    it(".env.example documents the opt-out flag", () => {
        expect(ENV_EXAMPLE).toMatch(/ATTACHMENTS_ALLOW_DEMO_ANON/);
        expect(ENV_EXAMPLE).not.toMatch(/ATTACHMENTS_BLOCK_DEMO_ANON/);
    });
});

// ── Behavior tests — gerçek middleware koşumu (P3-007) ───────────────────────

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({
        auth: { getUser: mockGetUser },
    }),
}));

// NOT: import middleware after the mock declaration.
import { middleware } from "../proxy";

const ANON = { data: { user: null } };
const AUTH = { data: { user: { id: "u1", email: "admin@pmt.com", app_metadata: { roles: ["admin"] } } } };
const DEMO_COOKIE = { demo_mode: "1" };
const PROD = "00000000-0000-4000-8000-000000000001";
const ATT = "00000000-0000-4000-8000-000000000010";

function makeReq(
    pathname: string,
    options?: { method?: string; cookies?: Record<string, string> },
): NextRequest {
    const req = new NextRequest(`http://localhost${pathname}`, {
        method: options?.method ?? "GET",
    });
    if (options?.cookies) {
        for (const [k, v] of Object.entries(options.cookies)) {
            req.cookies.set(k, v);
        }
    }
    return req;
}

describe("O11 flip — middleware demo guard (behavior, DEFAULT: env unset → bloklu)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue(ANON);
        // env bilerek stub'lanmaz: bloklama VARSAYILAN davranış.
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("demo cookie + GET attachments LIST → 401 (guard active)", async () => {
        const res = await middleware(makeReq(`/api/products/${PROD}/attachments`, { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toMatch(/kimlik doğrulama/i);
    });

    it("demo cookie + GET single signed URL endpoint → 401", async () => {
        const res = await middleware(makeReq(`/api/products/${PROD}/attachments/${ATT}/url`, { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(401);
    });

    it("demo cookie + GET single attachment PATCH path → 401 (regex catches whole subtree)", async () => {
        const res = await middleware(makeReq(`/api/products/${PROD}/attachments/${ATT}`, { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(401);
    });

    it("demo cookie + GET unrelated /api/products → 200 (guard scoped, no over-reach)", async () => {
        const res = await middleware(makeReq("/api/products", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("demo cookie + GET /api/orders → 200 (guard scoped to attachments)", async () => {
        const res = await middleware(makeReq("/api/orders", { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("authenticated user (no demo) + GET attachments → 200 (guard sits in demo branch only)", async () => {
        mockGetUser.mockResolvedValue(AUTH);
        const res = await middleware(makeReq(`/api/products/${PROD}/attachments`));
        expect(res.status).toBe(200);
    });

    it("authenticated user + demo cookie + GET attachments → 200 (auth wins, demo branch skipped)", async () => {
        mockGetUser.mockResolvedValue(AUTH);
        const res = await middleware(makeReq(`/api/products/${PROD}/attachments`, { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });
});

describe("O11 flip — middleware demo guard (behavior, bilinçli opt-out: ALLOW=true)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue(ANON);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("ALLOW='true' + demo cookie + GET attachments → 200 (izole demo dağıtımı bilinçli açar)", async () => {
        vi.stubEnv("ATTACHMENTS_ALLOW_DEMO_ANON", "true");
        const res = await middleware(makeReq(`/api/products/${PROD}/attachments`, { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(200);
    });

    it("ALLOW='false' + demo cookie → 401 (yalnız literal 'true' açar)", async () => {
        vi.stubEnv("ATTACHMENTS_ALLOW_DEMO_ANON", "false");
        const res = await middleware(makeReq(`/api/products/${PROD}/attachments`, { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(401);
    });

    it("ALLOW='1' + demo cookie → 401 (string compare; '1' yetmez)", async () => {
        vi.stubEnv("ATTACHMENTS_ALLOW_DEMO_ANON", "1");
        const res = await middleware(makeReq(`/api/products/${PROD}/attachments`, { cookies: DEMO_COOKIE }));
        expect(res.status).toBe(401);
    });
});
