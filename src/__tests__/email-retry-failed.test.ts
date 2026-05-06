/**
 * POST /api/email/retry-failed CRON endpoint testi.
 *
 * Auth (CRON_SECRET) middleware tarafında doğrulanır; route handler kendi
 * içinde retryFailedEmails çağrısı yapar ve sonucu döner.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRetry = vi.fn();
vi.mock("@/lib/services/email-service", () => ({
    retryFailedEmails: (...a: unknown[]) => mockRetry(...a),
}));

import { POST } from "@/app/api/email/retry-failed/route";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("POST /api/email/retry-failed", () => {
    it("happy path → ok:true + sayılar döner", async () => {
        mockRetry.mockResolvedValue({ retried: 3, succeeded: 2, failed: 1 });
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ ok: true, retried: 3, succeeded: 2, failed: 1 });
    });

    it("retry boş → 0/0/0", async () => {
        mockRetry.mockResolvedValue({ retried: 0, succeeded: 0, failed: 0 });
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.retried).toBe(0);
    });

    it("retryFailedEmails throw → 500 + handleApiError", async () => {
        mockRetry.mockRejectedValue(new Error("DB down"));
        const res = await POST();
        expect(res.status).toBe(500);
    });
});
