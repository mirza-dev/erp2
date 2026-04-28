/**
 * Faz 11.5 bulgular — /api/parasut/oauth/refresh hata yolları
 *   T1: expires_at update hatası → 500 (false-success yok)
 *   T2: token kaydı yok → 404
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetUser      = vi.fn();
const mockGetAccessToken = vi.fn();

// Supabase client mock — her çağrıyı sırayla tüket
type MockResult = { data: unknown; error: unknown };
const responses: MockResult[] = [];

function makeChain(result: MockResult): unknown {
    const handler: ProxyHandler<object> = {
        get(_t, prop) {
            if (prop === "then") {
                const p = Promise.resolve(result);
                return p.then.bind(p);
            }
            if (prop === "catch") {
                const p = Promise.resolve(result);
                return p.catch.bind(p);
            }
            return () => makeChain(result);
        },
    };
    return new Proxy({}, handler);
}

const mockFrom = vi.fn(() => ({
    select:      () => makeChain(responses.shift() ?? { data: null, error: null }),
    update:      () => makeChain(responses.shift() ?? { data: null, error: null }),
    insert:      () => makeChain(responses.shift() ?? { data: null, error: null }),
    maybeSingle: () => Promise.resolve(responses.shift() ?? { data: null, error: null }),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () =>
        Promise.resolve({
            auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1", email: "admin@test.com" } } }) },
        }),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
    ConfigError: class ConfigError extends Error {
        constructor(message: string) { super(message); this.name = "ConfigError"; }
    },
}));

vi.mock("@/lib/services/parasut-oauth", () => ({
    getAccessToken: (...a: unknown[]) => mockGetAccessToken(...a),
}));

vi.mock("@/lib/parasut", () => ({
    getParasutAdapter: () => ({}),
}));

import { POST } from "@/app/api/parasut/oauth/refresh/route";

// ─── Setup ───────────────────────────────────────────────────────────────────

const TOKEN_ROW = { id: "tok-1", expires_at: "2099-01-01T00:00:00.000Z" };

beforeEach(() => {
    vi.clearAllMocks();
    responses.length = 0;
    process.env.ADMIN_EMAILS = "admin@test.com";
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/parasut/oauth/refresh — hata yolları", () => {
    it("T1: expires_at update başarısız → 500, success:true DÖNMEZ", async () => {
        // 1. token row read → başarılı
        responses.push({ data: TOKEN_ROW, error: null });
        // 2. update expires_at → DB hatası
        responses.push({ data: null, error: { message: "DB yazma hatası" } });

        const res = await POST();
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.success).toBeUndefined();
        expect(mockGetAccessToken).not.toHaveBeenCalled();
    });

    it("T2: token kaydı yok → 404", async () => {
        // maybeSingle → data: null (kayıt yok)
        responses.push({ data: null, error: null });

        const res = await POST();
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toMatch(/OAuth bağlantısı/);
        expect(mockGetAccessToken).not.toHaveBeenCalled();
    });
});
