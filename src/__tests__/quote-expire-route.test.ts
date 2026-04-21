/**
 * Tests for POST /api/quotes/expire — CRON endpoint for auto-expiring quotes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Service mock ────────────────────────────────────────────────────────────

const mockServiceExpireQuotes = vi.fn();

vi.mock("@/lib/services/quote-service", () => ({
    serviceExpireQuotes: (...args: unknown[]) => mockServiceExpireQuotes(...args),
}));

import { POST } from "@/app/api/quotes/expire/route";

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/quotes/expire", () => {
    it("happy path → 200 + { expired: N }", async () => {
        mockServiceExpireQuotes.mockResolvedValue({ expired: 3 });
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ expired: 3 });
    });

    it("no expired → 200 + { expired: 0 }", async () => {
        mockServiceExpireQuotes.mockResolvedValue({ expired: 0 });
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ expired: 0 });
    });

    it("service throws → 500", async () => {
        mockServiceExpireQuotes.mockRejectedValue(new Error("DB error"));
        const res = await POST();
        expect(res.status).toBe(500);
    });
});
