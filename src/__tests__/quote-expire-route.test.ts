/**
 * Tests for POST /api/quotes/expire — CRON endpoint for auto-expiring quotes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidateTag } from "next/cache";

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
    it("happy path → 200 + { expired: N, expiredIds }", async () => {
        mockServiceExpireQuotes.mockResolvedValue({ expired: 3, expiredIds: ["id1", "id2", "id3"] });
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ expired: 3, expiredIds: ["id1", "id2", "id3"] });
    });

    it("no expired → 200 + { expired: 0, expiredIds: [] }", async () => {
        mockServiceExpireQuotes.mockResolvedValue({ expired: 0, expiredIds: [] });
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ expired: 0, expiredIds: [] });
    });

    it("expired > 0 → liste ve per-quote revalidateTag çağrılır", async () => {
        mockServiceExpireQuotes.mockResolvedValue({ expired: 2, expiredIds: ["id1", "id2"] });
        await POST();
        expect(revalidateTag).toHaveBeenCalledWith("quotes", "max");
        expect(revalidateTag).toHaveBeenCalledWith("quote-id1", "max");
        expect(revalidateTag).toHaveBeenCalledWith("quote-id2", "max");
    });

    it("expired === 0 → revalidateTag çağrılmaz", async () => {
        mockServiceExpireQuotes.mockResolvedValue({ expired: 0, expiredIds: [] });
        await POST();
        expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("service throws → 500", async () => {
        mockServiceExpireQuotes.mockRejectedValue(new Error("DB error"));
        const res = await POST();
        expect(res.status).toBe(500);
    });
});
