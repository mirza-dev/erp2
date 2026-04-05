/**
 * Tests for PATCH /api/orders/[id] — "shipped" transition + Paraşüt sync.
 *
 * Regression guard for:
 *   - successful ship + successful sync → response includes parasut_invoice_id
 *   - successful ship + failed sync → response includes parasut_error
 *   - failed transition → serviceSyncOrderToParasut never called
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockServiceTransitionOrder = vi.fn();
const mockServiceGetOrder = vi.fn();
const mockServiceSyncOrderToParasut = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceTransitionOrder: (...args: unknown[]) => mockServiceTransitionOrder(...args),
    serviceGetOrder: (...args: unknown[]) => mockServiceGetOrder(...args),
}));

vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncOrderToParasut: (...args: unknown[]) => mockServiceSyncOrderToParasut(...args),
}));

import { PATCH } from "@/app/api/orders/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORDER_ID = "ord-ship-1";

function makeRequest(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

function makeParams(id = ORDER_ID): { params: Promise<{ id: string }> } {
    return { params: Promise.resolve({ id }) };
}

const stubOrderBase = {
    id: ORDER_ID,
    commercial_status: "approved",
    fulfillment_status: "shipped",
    order_number: "SIP-0042",
    customer_name: "Acme Vana",
    grand_total: 12000,
    currency: "TRY",
    lines: [],
};

const stubTransitionSuccess = {
    success: true,
    fulfillment_status: "shipped",
    shortages: [],
};

// ─── Successful ship + successful sync ────────────────────────────────────────

describe("PATCH /api/orders/[id] ship — successful sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceTransitionOrder.mockResolvedValue(stubTransitionSuccess);
        mockServiceSyncOrderToParasut.mockResolvedValue({
            success: true,
            invoice_id: "INV-123",
            sent_at: "2026-04-05T10:00:00Z",
        });
        mockServiceGetOrder.mockResolvedValue({
            ...stubOrderBase,
            parasut_invoice_id: "INV-123",
            parasut_sent_at: "2026-04-05T10:00:00Z",
            parasut_error: null,
        });
    });

    it("returns 200", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(res.status).toBe(200);
    });

    it("response contains parasut_invoice_id", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        const body = await res.json();
        expect(body.parasut_invoice_id).toBe("INV-123");
    });

    it("serviceSyncOrderToParasut called with orderId", async () => {
        await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(mockServiceSyncOrderToParasut).toHaveBeenCalledWith(ORDER_ID);
    });
});

// ─── Successful ship + failed sync ────────────────────────────────────────────

describe("PATCH /api/orders/[id] ship — failed sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceTransitionOrder.mockResolvedValue(stubTransitionSuccess);
        mockServiceSyncOrderToParasut.mockResolvedValue({
            success: false,
            error: "Paraşüt API hatası",
        });
        mockServiceGetOrder.mockResolvedValue({
            ...stubOrderBase,
            parasut_invoice_id: null,
            parasut_sent_at: null,
            parasut_error: "Paraşüt API hatası",
        });
    });

    it("returns 200 (ship succeeded even if sync failed)", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(res.status).toBe(200);
    });

    it("response contains parasut_error", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        const body = await res.json();
        expect(body.parasut_error).toBe("Paraşüt API hatası");
    });

    it("serviceSyncOrderToParasut still called", async () => {
        await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(mockServiceSyncOrderToParasut).toHaveBeenCalledWith(ORDER_ID);
    });
});

// ─── Failed transition → sync never called ────────────────────────────────────

describe("PATCH /api/orders/[id] ship — failed transition", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceTransitionOrder.mockResolvedValue({
            success: false,
            error: "Stok yetersiz.",
        });
    });

    it("returns 400", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(res.status).toBe(400);
    });

    it("serviceSyncOrderToParasut never called", async () => {
        await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(mockServiceSyncOrderToParasut).not.toHaveBeenCalled();
    });
});
