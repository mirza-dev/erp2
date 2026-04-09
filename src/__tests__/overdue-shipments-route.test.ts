/**
 * Tests for POST /api/orders/check-shipments
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockServiceCheckOverdueShipments = vi.fn();

vi.mock("@/lib/services/alert-service", () => ({
    serviceCheckOverdueShipments: (...args: unknown[]) => mockServiceCheckOverdueShipments(...args),
    serviceScanStockAlerts:        vi.fn(),
    serviceGenerateAiAlerts:       vi.fn(),
    serviceListAlerts:             vi.fn(),
    serviceGetAlert:               vi.fn(),
    serviceUpdateAlertStatus:      vi.fn(),
}));

import { POST } from "@/app/api/orders/check-shipments/route";

// ── Tests ─────────────────────────────────────────────────────

describe("POST /api/orders/check-shipments", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("1. happy path → 200 + { alerted: N }", async () => {
        mockServiceCheckOverdueShipments.mockResolvedValue({ alerted: 3 });

        const res = await POST();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toEqual({ alerted: 3 });
    });

    it("2. service throws → 500", async () => {
        mockServiceCheckOverdueShipments.mockRejectedValue(new Error("DB error"));

        const res = await POST();

        expect(res.status).toBe(500);
    });
});
