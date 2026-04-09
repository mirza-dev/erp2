/**
 * Tests for POST /api/orders/expire-quotes
 *
 * Faz 6 — Teklif Süresi & Auto-expire: cron-callable endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockServiceExpireQuotes = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceExpireQuotes: (...args: unknown[]) => mockServiceExpireQuotes(...args),
    // stub other exports to avoid import side-effects
    serviceTransitionOrder: vi.fn(),
    validateOrderCreate: vi.fn(),
}));

import { POST } from "@/app/api/orders/expire-quotes/route";

// ── Tests ─────────────────────────────────────────────────────

describe("POST /api/orders/expire-quotes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("1. happy path → 200 + { expired, alerted }", async () => {
        mockServiceExpireQuotes.mockResolvedValue({ expired: 2, alerted: 1 });

        const res = await POST();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toEqual({ expired: 2, alerted: 1 });
    });

    it("2. service throws → 500", async () => {
        mockServiceExpireQuotes.mockRejectedValue(new Error("DB error"));

        const res = await POST();

        expect(res.status).toBe(500);
    });
});
