/**
 * Tests for serviceExpireQuotes
 * (src/lib/services/order-service.ts)
 *
 * - Expired draft orders → auto-cancelled
 * - Expired pending_approval orders → alert (dedup)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ───────────────────────────────────────────

const mockDbListExpiredQuotes = vi.fn();
const mockDbCancelOrder       = vi.fn();
const mockDbListActiveAlerts  = vi.fn();
const mockDbCreateAlert       = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbListExpiredQuotes: (...args: unknown[]) => mockDbListExpiredQuotes(...args),
    dbCancelOrder:       (...args: unknown[]) => mockDbCancelOrder(...args),
    // other exports used by serviceTransitionOrder — stub them
    dbGetOrderById:      vi.fn(),
    dbApproveOrder:      vi.fn(),
    dbShipOrderFull:     vi.fn(),
    dbUpdateOrderStatus: vi.fn(),
    dbLogOrderAction:    vi.fn(),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbListActiveAlerts: (...args: unknown[]) => mockDbListActiveAlerts(...args),
    dbCreateAlert:      (...args: unknown[]) => mockDbCreateAlert(...args),
}));

import { serviceExpireQuotes } from "@/lib/services/order-service";

// ── Fixtures ──────────────────────────────────────────────────

const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const expiredDraft = {
    id: "order-draft-1",
    order_number: "ORD-001",
    customer_name: "Acme",
    commercial_status: "draft",
    quote_valid_until: YESTERDAY,
};

const expiredPending = {
    id: "order-pending-1",
    order_number: "ORD-002",
    customer_name: "Beta Ltd",
    commercial_status: "pending_approval",
    quote_valid_until: YESTERDAY,
};

// ── Tests ─────────────────────────────────────────────────────

describe("serviceExpireQuotes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbListActiveAlerts.mockResolvedValue([]);
        mockDbCreateAlert.mockResolvedValue(undefined);
    });

    it("1. no expired orders → { expired: 0, alerted: 0 }", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([]);

        const result = await serviceExpireQuotes();

        expect(result).toEqual({ expired: 0, alerted: 0 });
        expect(mockDbCancelOrder).not.toHaveBeenCalled();
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });

    it("2. 1 expired draft → auto-cancel, { expired: 1, alerted: 0 }", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([expiredDraft]);
        mockDbCancelOrder.mockResolvedValue({ success: true });

        const result = await serviceExpireQuotes();

        expect(mockDbCancelOrder).toHaveBeenCalledWith("order-draft-1");
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
        expect(result).toEqual({ expired: 1, alerted: 0 });
    });

    it("3. 1 expired pending_approval → alert, { expired: 0, alerted: 1 }", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([expiredPending]);

        const result = await serviceExpireQuotes();

        expect(mockDbCancelOrder).not.toHaveBeenCalled();
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ type: "quote_expired", entity_id: "order-pending-1" })
        );
        expect(result).toEqual({ expired: 0, alerted: 1 });
    });

    it("4. mix: 2 draft + 1 pending → { expired: 2, alerted: 1 }", async () => {
        const draft2 = { ...expiredDraft, id: "order-draft-2", order_number: "ORD-003" };
        mockDbListExpiredQuotes.mockResolvedValue([expiredDraft, draft2, expiredPending]);
        mockDbCancelOrder.mockResolvedValue({ success: true });

        const result = await serviceExpireQuotes();

        expect(mockDbCancelOrder).toHaveBeenCalledTimes(2);
        expect(mockDbCreateAlert).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ expired: 2, alerted: 1 });
    });

    it("5. active quote_expired alert already exists → dedup, alerted stays 0", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([expiredPending]);
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "quote_expired", entity_id: "order-pending-1" },
        ]);

        const result = await serviceExpireQuotes();

        expect(mockDbCreateAlert).not.toHaveBeenCalled();
        expect(result).toEqual({ expired: 0, alerted: 0 });
    });

    it("6. cancel fails (success: false) → expired does not increment", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([expiredDraft]);
        mockDbCancelOrder.mockResolvedValue({ success: false, error: "RPC failed" });

        const result = await serviceExpireQuotes();

        expect(mockDbCancelOrder).toHaveBeenCalledWith("order-draft-1");
        expect(result).toEqual({ expired: 0, alerted: 0 });
    });
});
