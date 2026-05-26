/**
 * G11 — /api/ai/purchase-copilot hybrid auth
 *
 * Route ALWAYS_PUBLIC listesinde (middleware bypass). Kendi auth kontrolü yapar:
 *   1. CRON_SECRET Bearer token (vercel.json crons + manuel curl)
 *   2. Authenticated session (UI'dan tetikleme)
 *   3. Aksi halde → 401
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => mockGetUser() },
    }),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: vi.fn().mockResolvedValue([]),
    dbGetAllActiveProductIds: vi.fn().mockResolvedValue([]),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/recommendations", () => ({
    dbExpireStaleRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireRecommendationsForMissingEntities: vi.fn().mockResolvedValue(0),
    dbExpireEntityRecommendations: vi.fn().mockResolvedValue(undefined),
    dbExpireSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbExpireAllSuggestedRecommendations: vi.fn().mockResolvedValue(0),
    dbGetActiveRecommendationsForEntities: vi.fn().mockResolvedValue([]),
    dbUpdateRecommendationMetadata: vi.fn().mockResolvedValue(undefined),
    dbUpsertRecommendation: vi.fn().mockResolvedValue({ id: "rec-mock", status: "suggested" }),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => false,
    aiEnrichPurchaseSuggestions: vi.fn(),
}));

import { GET, POST } from "@/app/api/ai/purchase-copilot/route";
import type { NextRequest } from "next/server";

function makeRequest(authHeader: string | null): NextRequest {
    const headers = new Headers();
    if (authHeader) headers.set("authorization", authHeader);
    return { headers } as unknown as NextRequest;
}

describe("/api/ai/purchase-copilot — hybrid auth", () => {
    const ORIGINAL_SECRET = process.env.CRON_SECRET;

    beforeEach(async () => {
        mockGetUser.mockReset();
        process.env.CRON_SECRET = "test-cron-secret";
        // 2026-05-26: Route-level AI rate limit eklendi (5/dk/IP). Tüm bu testler
        // aynı IP'den (0.0.0.0, mock req'de x-forwarded-for yok) çağrılıyor →
        // 6. test 429 alır. Her test arasında map sıfırlanmalı.
        const { __resetAiRateLimitForTests } = await import("@/lib/ai-route-limit");
        __resetAiRateLimitForTests();
    });

    afterAll(() => {
        if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = ORIGINAL_SECRET;
    });

    it("Bearer CRON_SECRET → 200", async () => {
        // Session lookup'a düşmemeli; ama düşse bile fail olsun ki yanlış pozitif olmasın
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await POST(makeRequest("Bearer test-cron-secret"));
        expect(res.status).toBe(200);
    });

    it("Authenticated session (no Bearer) → 200", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
        const res = await POST(makeRequest(null));
        expect(res.status).toBe(200);
    });

    it("No auth → 401", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await POST(makeRequest(null));
        expect(res.status).toBe(401);
    });

    it("Wrong CRON_SECRET → falls through to session, 401 if no session", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await POST(makeRequest("Bearer wrong-secret"));
        expect(res.status).toBe(401);
    });

    it("Wrong CRON_SECRET + valid session → 200", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
        const res = await POST(makeRequest("Bearer wrong-secret"));
        expect(res.status).toBe(200);
    });

    it("Empty CRON_SECRET env → only session path works", async () => {
        delete process.env.CRON_SECRET;
        mockGetUser.mockResolvedValue({ data: { user: null } });
        // Even sending what looks like a Bearer should not authorize
        const res = await POST(makeRequest("Bearer anything"));
        expect(res.status).toBe(401);
    });

    it("createClient throws → falls to false → 401 (no Bearer)", async () => {
        mockGetUser.mockRejectedValue(new Error("no cookies"));
        const res = await POST(makeRequest(null));
        expect(res.status).toBe(401);
    });

    // ─── Method-aware auth (G11 audit 2. tur Fix 1) ──────────────────────
    // GET sadece CRON_SECRET; session-cookie'li GET CSRF benzeri risk taşıdığı için 401.

    it("GET + Bearer CRON_SECRET → 200 (Vercel Cron yolu)", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await GET(makeRequest("Bearer test-cron-secret"));
        expect(res.status).toBe(200);
    });

    it("GET no auth → 401", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await GET(makeRequest(null));
        expect(res.status).toBe(401);
    });

    it("GET + session (no Bearer) → 401 — CSRF guard", async () => {
        // Authenticated kullanıcının cookie'siyle gelen GET kabul EDİLMEMELİ.
        // <img src="...purchase-copilot"> ile yan etki tetiklenmesini engeller.
        mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
        const res = await GET(makeRequest(null));
        expect(res.status).toBe(401);
    });

    it("GET + valid session + Bearer → 200 (Bearer path)", async () => {
        // Bearer doğruysa session olsa da olmasa da geçer.
        mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
        const res = await GET(makeRequest("Bearer test-cron-secret"));
        expect(res.status).toBe(200);
    });

    it("POST + session (no Bearer) → 200 (UI yolu, regresyon)", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
        const res = await POST(makeRequest(null));
        expect(res.status).toBe(200);
    });

    it("POST + Bearer + no session → 200 (manuel curl)", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await POST(makeRequest("Bearer test-cron-secret"));
        expect(res.status).toBe(200);
    });
});
