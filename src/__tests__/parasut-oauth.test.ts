/**
 * Faz 2 — Paraşüt OAuth token lease service tests.
 *
 * Covers:
 *  getAccessToken:
 *    - token still valid → no refresh
 *    - no row → throws "OAuth bağlantısı kurulmamış"
 *    - DB error → throws
 *    - token expired → lease + re-read + refresh + CAS
 *    - re-read after lease shows fresh token → release + return (no adapter call)
 *    - lock held by another → poll → fresh token returned
 *    - CAS conflict → sync_issue alert + throws
 *    - stale lock → new owner acquires + refresh
 *
 *  GET /oauth/start:
 *    - 401 when unauthenticated
 *    - 403 when not admin
 *    - mock mode → redirect to callback + HMAC-signed state cookie
 *    - no ADMIN_EMAILS restriction → allowed
 *    - real mode, missing env vars → 503
 *    - real mode → redirect to Paraşüt authorize URL
 *
 *  GET /oauth/callback:
 *    - state mismatch → 400
 *    - state cookie missing → 400
 *    - code missing → 400
 *    - lock active → 409
 *    - first connection (no row) → upsert token_version=1 + redirect
 *    - re-auth (row exists) → upsert token_version=existing+1 + redirect
 *    - exchangeAuthCode throws → 502
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// ── next/headers mock ─────────────────────────────────────────────────────────

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined }),
}));

// ── supabase/server mock (start route requireAdmin) ───────────────────────────

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => mockGetUser() },
    }),
}));

// ── Parasut adapter mock ──────────────────────────────────────────────────────

const mockExchangeAuthCode = vi.fn();
const mockRefreshToken     = vi.fn();

vi.mock("@/lib/parasut", () => ({
    getParasutAdapter: () => ({
        exchangeAuthCode: (...args: unknown[]) => mockExchangeAuthCode(...args),
        refreshToken:     (...args: unknown[]) => mockRefreshToken(...args),
    }),
}));

// ── dbCreateAlert mock ────────────────────────────────────────────────────────

const mockDbCreateAlert = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: (...args: unknown[]) => mockDbCreateAlert(...args),
}));

// ── Supabase service client mock ──────────────────────────────────────────────

type SupabaseChain = Record<string, unknown>;

let mockFromImpl: (table: string) => SupabaseChain;

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: (table: string) => mockFromImpl(table) }),
    ConfigError: class ConfigError extends Error {
        readonly code = "CONFIG_ERROR";
        constructor(message: string) { super(message); this.name = "ConfigError"; }
    },
}));

// ── Imports under test ────────────────────────────────────────────────────────

import { getAccessToken } from "@/lib/services/parasut-oauth";
import { GET as startGET }    from "@/app/api/parasut/oauth/start/route";
import { GET as callbackGET } from "@/app/api/parasut/oauth/callback/route";
import { NextRequest } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function futureISO(offsetMs: number): string {
    return new Date(Date.now() + offsetMs).toISOString();
}

function expiredISO(): string {
    return new Date(Date.now() - 10_000).toISOString();
}

function makeTokenRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id:                  "tok-1",
        singleton_key:       "default",
        access_token:        "old_access",
        refresh_token:       "old_refresh",
        expires_at:          futureISO(3_600_000),
        refresh_lock_until:  null,
        refresh_lock_owner:  null,
        token_version:       1,
        updated_at:          new Date().toISOString(),
        created_at:          new Date().toISOString(),
        ...overrides,
    };
}

function makeAdapter() {
    return {
        exchangeAuthCode: mockExchangeAuthCode,
        refreshToken:     mockRefreshToken,
    };
}

/** Build a signed state cookie value matching the start route implementation. */
function signState(state: string, secret = ""): string {
    const sig = createHmac("sha256", secret).update(state).digest("hex");
    return `${state}.${sig}`;
}

function buildMockRequest(url: string, cookies: Record<string, string> = {}): NextRequest {
    const req = new NextRequest(url);
    for (const [name, value] of Object.entries(cookies)) {
        req.cookies.set(name, value);
    }
    return req;
}

/** Build request with a correctly HMAC-signed state cookie. */
function buildCallbackRequest(state: string, code: string, secret = ""): NextRequest {
    const cookieVal = signState(state, secret);
    return buildMockRequest(
        `http://localhost/api/parasut/oauth/callback?code=${code}&state=${state}`,
        { parasut_oauth_state: cookieVal }
    );
}

// ── Env save/restore ──────────────────────────────────────────────────────────

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.resetAllMocks();
    savedEnv.PARASUT_USE_MOCK      = process.env.PARASUT_USE_MOCK;
    savedEnv.ADMIN_EMAILS          = process.env.ADMIN_EMAILS;
    savedEnv.PARASUT_AUTHORIZE_URL = process.env.PARASUT_AUTHORIZE_URL;
    savedEnv.PARASUT_CLIENT_ID     = process.env.PARASUT_CLIENT_ID;
    savedEnv.PARASUT_REDIRECT_URI  = process.env.PARASUT_REDIRECT_URI;
    savedEnv.CRON_SECRET           = process.env.CRON_SECRET;
    process.env.PARASUT_USE_MOCK   = "true";
    process.env.CRON_SECRET        = "";
});

afterEach(() => {
    process.env.PARASUT_USE_MOCK      = savedEnv.PARASUT_USE_MOCK;
    process.env.ADMIN_EMAILS          = savedEnv.ADMIN_EMAILS;
    process.env.PARASUT_AUTHORIZE_URL = savedEnv.PARASUT_AUTHORIZE_URL;
    process.env.PARASUT_CLIENT_ID     = savedEnv.PARASUT_CLIENT_ID;
    process.env.PARASUT_REDIRECT_URI  = savedEnv.PARASUT_REDIRECT_URI;
    process.env.CRON_SECRET           = savedEnv.CRON_SECRET;
});

// ── Seq-based mock factory ────────────────────────────────────────────────────

/**
 * Builds a mockFromImpl that dispatches sequentially per call index.
 * seqMap: { 1: returnValue, 2: returnValue, ... }
 * fallback: returned for any index beyond the map.
 */
function makeSeqMock(
    seqMap: Record<number, SupabaseChain>,
    fallback?: SupabaseChain
): () => SupabaseChain {
    let seq = 0;
    return () => {
        seq++;
        return seqMap[seq] ?? fallback ?? {};
    };
}

/** Standard select chain returning `data`. */
function selectChain(data: unknown) {
    return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data, error: null }) }) }),
    };
}

/** Lease acquire UPDATE chain. Returns { data: rows } from .or().select(). */
function leaseAcquireChain(rows: Array<{ id: string }>) {
    return {
        update: () => ({
            eq: () => ({
                or: () => ({
                    select: () => Promise.resolve({ data: rows, error: null }),
                }),
            }),
        }),
    };
}

/** CAS update UPDATE chain. Returns { data: rows } from .eq().eq().select(). */
function casUpdateChain(rows: Array<{ access_token: string }>) {
    return {
        update: () => ({
            eq: () => ({
                eq: () => ({
                    select: () => Promise.resolve({ data: rows, error: null }),
                }),
            }),
        }),
    };
}

/** releaseLease UPDATE chain (no select needed — just resolves). */
function releaseChain() {
    return {
        update: () => ({
            eq: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
            }),
        }),
    };
}

// ── getAccessToken ────────────────────────────────────────────────────────────

describe("getAccessToken", () => {
    it("returns existing token when still valid (no refresh)", async () => {
        mockFromImpl = makeSeqMock({ 1: selectChain(makeTokenRow()) });

        const token = await getAccessToken(makeAdapter() as never);
        expect(token).toBe("old_access");
        expect(mockRefreshToken).not.toHaveBeenCalled();
    });

    it("throws when no row exists (OAuth not set up)", async () => {
        mockFromImpl = makeSeqMock({ 1: selectChain(null) });

        await expect(getAccessToken(makeAdapter() as never)).rejects.toThrow("OAuth bağlantısı kurulmamış");
    });

    it("throws when DB read fails", async () => {
        mockFromImpl = () => ({
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "connection refused" } }) }) }),
        });

        await expect(getAccessToken(makeAdapter() as never)).rejects.toThrow("token okuma hatası");
    });

    it("refreshes token when expired (full lease + re-read + CAS sequence)", async () => {
        const newTokens = {
            access_token:  "new_access",
            refresh_token: "new_refresh",
            expires_at:    futureISO(7_200_000),
        };
        mockRefreshToken.mockResolvedValueOnce(newTokens);

        const expiredRow = makeTokenRow({ expires_at: expiredISO(), token_version: 2 });

        mockFromImpl = makeSeqMock({
            1: selectChain(expiredRow),           // initial read
            2: leaseAcquireChain([{ id: "x" }]), // lease acquired
            3: selectChain(expiredRow),           // re-read — still expired, proceed
            4: casUpdateChain([{ access_token: "new_access" }]), // CAS success
            5: releaseChain(),                    // finally releaseLease
        });

        const token = await getAccessToken(makeAdapter() as never);
        expect(token).toBe("new_access");
        expect(mockRefreshToken).toHaveBeenCalledWith("old_refresh");
    });

    it("uses fresh token when re-read shows another process refreshed during lease acquisition", async () => {
        const expiredRow = makeTokenRow({ expires_at: expiredISO() });
        const freshRow   = makeTokenRow({ access_token: "competitor_access", expires_at: futureISO(3_600_000) });

        mockFromImpl = makeSeqMock({
            1: selectChain(expiredRow),           // initial read — expired
            2: leaseAcquireChain([{ id: "x" }]), // lease acquired
            3: selectChain(freshRow),             // re-read — another process refreshed
            4: releaseChain(),                    // explicit releaseLease (not try/finally)
        });

        const token = await getAccessToken(makeAdapter() as never);
        expect(token).toBe("competitor_access");
        expect(mockRefreshToken).not.toHaveBeenCalled();
    });

    it("polls when lock is held by another process and fresh token becomes available", async () => {
        vi.useFakeTimers();

        const freshRow  = makeTokenRow({ access_token: "fresh_polled", expires_at: futureISO(3_600_000) });
        const lockedRow = makeTokenRow({ expires_at: expiredISO(), refresh_lock_until: futureISO(30_000) });

        let selectCallCount = 0;
        mockFromImpl = () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: () => {
                        selectCallCount++;
                        if (selectCallCount === 1) return Promise.resolve({ data: lockedRow, error: null });
                        return Promise.resolve({ data: freshRow, error: null });
                    },
                }),
            }),
        });

        const promise = getAccessToken(makeAdapter() as never);
        await vi.runAllTimersAsync();
        const token = await promise;

        expect(token).toBe("fresh_polled");
        expect(mockRefreshToken).not.toHaveBeenCalled();

        vi.useRealTimers();
    });

    it("raises sync_issue alert on CAS conflict and throws", async () => {
        const expiredRow = makeTokenRow({ expires_at: expiredISO(), token_version: 5 });
        mockRefreshToken.mockResolvedValueOnce({
            access_token: "new_a", refresh_token: "new_r", expires_at: futureISO(7_200_000),
        });
        mockDbCreateAlert.mockResolvedValue(null);

        mockFromImpl = makeSeqMock({
            1: selectChain(expiredRow),           // initial read
            2: leaseAcquireChain([{ id: "x" }]), // lease acquired
            3: selectChain(expiredRow),           // re-read — still expired
            4: casUpdateChain([]),                // CAS conflict (empty)
            5: releaseChain(),                    // finally releaseLease
        });

        await expect(getAccessToken(makeAdapter() as never)).rejects.toThrow("CAS çakışması");
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ type: "sync_issue" })
        );
    });

    it("acquires lease when previous lock is expired (stale lock)", async () => {
        const staleLockRow = makeTokenRow({
            expires_at:         expiredISO(),
            refresh_lock_until: expiredISO(),
            token_version:      3,
        });
        mockRefreshToken.mockResolvedValueOnce({
            access_token: "stale_new", refresh_token: "stale_r", expires_at: futureISO(7_200_000),
        });

        mockFromImpl = makeSeqMock({
            1: selectChain(staleLockRow),         // initial read — stale lock
            2: leaseAcquireChain([{ id: "x" }]), // lease acquired
            3: selectChain(staleLockRow),         // re-read — still expired
            4: casUpdateChain([{ access_token: "stale_new" }]), // CAS success
            5: releaseChain(),                    // finally releaseLease
        });

        const token = await getAccessToken(makeAdapter() as never);
        expect(token).toBe("stale_new");
    });
});

// ── GET /api/parasut/oauth/start ──────────────────────────────────────────────

describe("GET /api/parasut/oauth/start", () => {
    it("returns 401 when unauthenticated", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null } });
        const req = buildMockRequest("http://localhost/api/parasut/oauth/start");
        const res = await startGET(req);
        expect(res.status).toBe(401);
    });

    it("returns 403 when not admin", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: { email: "other@test.com" } } });
        process.env.ADMIN_EMAILS = "admin@kokpit.app";
        const req = buildMockRequest("http://localhost/api/parasut/oauth/start");
        const res = await startGET(req);
        expect(res.status).toBe(403);
    });

    it("mock mode: redirects to callback with fake code and sets HMAC-signed state cookie", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: { email: "admin@kokpit.app" } } });
        process.env.ADMIN_EMAILS  = "admin@kokpit.app";
        process.env.PARASUT_USE_MOCK = "true";
        const req = buildMockRequest("http://localhost/api/parasut/oauth/start");
        const res = await startGET(req);
        expect(res.status).toBe(307);
        const location = res.headers.get("location") ?? "";
        expect(location).toContain("/api/parasut/oauth/callback");
        expect(location).toContain("code=mock_code");
        const locationUrl = new URL(location);
        const stateParam = locationUrl.searchParams.get("state") ?? "";
        expect(stateParam).toBeTruthy();

        // Cookie must be HMAC-signed (format: {state}.{sig})
        const cookieHeader = res.headers.get("set-cookie") ?? "";
        expect(cookieHeader).toContain("parasut_oauth_state=");
        expect(cookieHeader).toContain("HttpOnly");
        const match = cookieHeader.match(/parasut_oauth_state=([^;]+)/);
        expect(match).toBeTruthy();
        const cookieVal = match![1];
        expect(cookieVal).toContain(".");
        // state param should be the state portion of the signed cookie
        expect(cookieVal.startsWith(stateParam)).toBe(true);
    });

    it("admin with no ADMIN_EMAILS restriction is allowed", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: { email: "anyone@test.com" } } });
        process.env.ADMIN_EMAILS  = "";
        process.env.PARASUT_USE_MOCK = "true";
        const req = buildMockRequest("http://localhost/api/parasut/oauth/start");
        const res = await startGET(req);
        expect(res.status).toBe(307);
    });

    it("real mode: returns 503 when env vars missing", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: { email: "admin@test.com" } } });
        process.env.ADMIN_EMAILS       = "";
        process.env.PARASUT_USE_MOCK   = "false";
        delete process.env.PARASUT_AUTHORIZE_URL;
        delete process.env.PARASUT_CLIENT_ID;
        delete process.env.PARASUT_REDIRECT_URI;
        const req = buildMockRequest("http://localhost/api/parasut/oauth/start");
        const res = await startGET(req);
        expect(res.status).toBe(503);
    });

    it("real mode: redirects to Paraşüt authorize URL with correct params", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: { email: "admin@test.com" } } });
        process.env.ADMIN_EMAILS          = "";
        process.env.PARASUT_USE_MOCK      = "false";
        process.env.PARASUT_AUTHORIZE_URL = "https://uygulama.parasut.com/oauth/authorize";
        process.env.PARASUT_CLIENT_ID     = "test_client";
        process.env.PARASUT_REDIRECT_URI  = "https://myerp.com/api/parasut/oauth/callback";
        const req = buildMockRequest("http://localhost/api/parasut/oauth/start");
        const res = await startGET(req);
        expect(res.status).toBe(307);
        const location = res.headers.get("location") ?? "";
        expect(location).toContain("uygulama.parasut.com");
        expect(location).toContain("client_id=test_client");
        expect(location).toContain("response_type=code");
        expect(location).toContain("state=");
    });
});

// ── GET /api/parasut/oauth/callback ──────────────────────────────────────────

describe("GET /api/parasut/oauth/callback", () => {
    it("returns 400 on state mismatch (CSRF)", async () => {
        mockFromImpl = makeSeqMock({ 1: selectChain(null) });
        // Cookie signed with state "good_state" but URL state is "bad_state"
        const cookieVal = signState("good_state");
        const req = buildMockRequest(
            "http://localhost/api/parasut/oauth/callback?code=abc&state=bad_state",
            { parasut_oauth_state: cookieVal }
        );
        const res = await callbackGET(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("CSRF");
    });

    it("returns 400 when state cookie is missing", async () => {
        const req = buildMockRequest(
            "http://localhost/api/parasut/oauth/callback?code=abc&state=some_state"
        );
        const res = await callbackGET(req);
        expect(res.status).toBe(400);
    });

    it("returns 400 when code is missing", async () => {
        mockFromImpl = makeSeqMock({ 1: selectChain(null) });
        const req = buildCallbackRequest("mystate", "");
        // Rebuild without code param
        const cookieVal = signState("nocode");
        const req2 = buildMockRequest(
            "http://localhost/api/parasut/oauth/callback?state=nocode",
            { parasut_oauth_state: cookieVal }
        );
        const res = await callbackGET(req2);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("OAuth kodu eksik");
    });

    it("returns 409 when refresh lock is active", async () => {
        const lockedRow = { token_version: 1, refresh_lock_until: futureISO(30_000) };
        mockFromImpl = makeSeqMock({ 1: selectChain(lockedRow) });
        const req = buildCallbackRequest("s1", "abc");
        const res = await callbackGET(req);
        expect(res.status).toBe(409);
    });

    it("first connection (no row): upserts with token_version=1 and redirects", async () => {
        const newTokens = {
            access_token:  "first_access",
            refresh_token: "first_refresh",
            expires_at:    futureISO(7_200_000),
        };
        mockExchangeAuthCode.mockResolvedValueOnce(newTokens);

        const mockUpsert = vi.fn().mockResolvedValue({ error: null });

        mockFromImpl = () => ({
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
            upsert: mockUpsert,
        });

        const req = buildCallbackRequest("s2", "abc");
        const res = await callbackGET(req);
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain("/dashboard/settings");
        expect(res.headers.get("location")).toContain("parasut=connected");
        expect(mockUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                singleton_key: "default",
                access_token:  "first_access",
                token_version: 1, // 0 (no row) + 1
            }),
            expect.objectContaining({ onConflict: "singleton_key" })
        );
    });

    it("re-auth (row exists, no lock): upserts with incremented token_version", async () => {
        const existingRow = { token_version: 3, refresh_lock_until: null };
        const newTokens   = {
            access_token:  "re_access",
            refresh_token: "re_refresh",
            expires_at:    futureISO(7_200_000),
        };
        mockExchangeAuthCode.mockResolvedValueOnce(newTokens);

        const mockUpsert = vi.fn().mockResolvedValue({ error: null });

        mockFromImpl = () => ({
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingRow, error: null }) }) }),
            upsert: mockUpsert,
        });

        const req = buildCallbackRequest("s3", "abc");
        const res = await callbackGET(req);
        expect(res.status).toBe(307);
        expect(mockUpsert).toHaveBeenCalledWith(
            expect.objectContaining({ token_version: 4, access_token: "re_access" }),
            expect.objectContaining({ onConflict: "singleton_key" })
        );
    });

    it("returns 502 when exchangeAuthCode throws", async () => {
        mockExchangeAuthCode.mockRejectedValueOnce(new Error("network error"));
        mockFromImpl = makeSeqMock({ 1: selectChain(null) });
        const req = buildCallbackRequest("s4", "bad");
        const res = await callbackGET(req);
        expect(res.status).toBe(502);
    });
});
