/**
 * Tests for serviceCheckOverdueShipments
 * (src/lib/services/alert-service.ts)
 *
 * - planned_shipment_date in the past → alert
 * - no planned_shipment_date, created 7+ days ago → alert
 * - dedup: active alert exists → skip
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListOverdueShipments = vi.fn();
const mockDbListActiveAlerts     = vi.fn();
const mockDbCreateAlert          = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbListOverdueShipments: (...args: unknown[]) => mockDbListOverdueShipments(...args),
    dbListOrders: vi.fn(),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:           vi.fn(),
    dbGetAlertById:         vi.fn(),
    dbCreateAlert:          (...args: unknown[]) => mockDbCreateAlert(...args),
    dbUpdateAlertStatus:    vi.fn(),
    dbDismissAlertsBySource: vi.fn(),
    dbListActiveAlerts:     (...args: unknown[]) => mockDbListActiveAlerts(...args),
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts:   vi.fn(),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts:              vi.fn(),
    dbGetOpenShortagesByProduct: vi.fn(),
    dbGetQuotedQuantities:       vi.fn(),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable:       vi.fn().mockReturnValue(false),
    aiGenerateOpsSummary: vi.fn(),
}));

import { serviceCheckOverdueShipments } from "@/lib/services/alert-service";

// ── Fixtures ──────────────────────────────────────────────────

const PAST_DATE = "2026-03-01";
const OLD_DATE  = new Date(Date.now() - 8 * 86_400_000).toISOString();

const orderWithDate = {
    id: "order-1",
    order_number: "ORD-001",
    customer_name: "Acme",
    commercial_status: "approved",
    fulfillment_status: "unallocated",
    planned_shipment_date: PAST_DATE,
    created_at: OLD_DATE,
};

const orderWithoutDate = {
    id: "order-2",
    order_number: "ORD-002",
    customer_name: "Beta Ltd",
    commercial_status: "approved",
    fulfillment_status: "allocated",
    planned_shipment_date: null,
    created_at: OLD_DATE,
};

// ── Tests ─────────────────────────────────────────────────────

describe("serviceCheckOverdueShipments", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbListActiveAlerts.mockResolvedValue([]);
        mockDbCreateAlert.mockResolvedValue(undefined);
    });

    it("1. overdue sipariş yok → { alerted: 0 }, alert yaratılmaz", async () => {
        mockDbListOverdueShipments.mockResolvedValue([]);

        const result = await serviceCheckOverdueShipments();

        expect(result).toEqual({ alerted: 0 });
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });

    it("2. planned_shipment_date geçmiş → alert, description tarihi içerir", async () => {
        mockDbListOverdueShipments.mockResolvedValue([orderWithDate]);

        const result = await serviceCheckOverdueShipments();

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "overdue_shipment",
                entity_id: "order-1",
                description: expect.stringContaining(PAST_DATE),
            })
        );
        expect(result).toEqual({ alerted: 1 });
    });

    it("3. planned_shipment_date null, 8 gün önce oluşturulmuş → alert, description '7+' içerir", async () => {
        mockDbListOverdueShipments.mockResolvedValue([orderWithoutDate]);

        const result = await serviceCheckOverdueShipments();

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "overdue_shipment",
                entity_id: "order-2",
                description: expect.stringContaining("7+"),
            })
        );
        expect(result).toEqual({ alerted: 1 });
    });

    it("4. aktif overdue_shipment alert zaten var → dedup, alerted artmaz", async () => {
        mockDbListOverdueShipments.mockResolvedValue([orderWithDate]);
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "overdue_shipment", entity_id: "order-1" },
        ]);

        const result = await serviceCheckOverdueShipments();

        expect(mockDbCreateAlert).not.toHaveBeenCalled();
        expect(result).toEqual({ alerted: 0 });
    });

    it("5. mix: 2 overdue, 1'i zaten alerted → { alerted: 1 }", async () => {
        mockDbListOverdueShipments.mockResolvedValue([orderWithDate, orderWithoutDate]);
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "overdue_shipment", entity_id: "order-1" },
        ]);

        const result = await serviceCheckOverdueShipments();

        expect(mockDbCreateAlert).toHaveBeenCalledTimes(1);
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ entity_id: "order-2" })
        );
        expect(result).toEqual({ alerted: 1 });
    });
});
