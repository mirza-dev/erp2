/**
 * Tests for PATCH /api/orders/[id] — "approved" transition.
 * Verifies that fulfillment_status and shortages are correctly
 * propagated from the service layer to the HTTP response.
 *
 * Regression guard for:
 *   - partial allocation: response must carry fulfillment_status:"partially_allocated" + shortages[]
 *   - full allocation: response must carry fulfillment_status:"allocated", no shortages key
 *   - zero-stock (success:false): must return 400 with error
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Service mock ──────────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ORDER_ID = "ord-test-1";

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

const stubOrderAllocated = {
    id: ORDER_ID,
    commercial_status: "approved",
    fulfillment_status: "allocated",
    order_number: "SIP-0001",
    customer_name: "Acme Ltd",
    grand_total: 5000,
    currency: "USD",
    lines: [],
};

const stubOrderPartial = {
    ...stubOrderAllocated,
    fulfillment_status: "partially_allocated",
};

beforeEach(() => {
    vi.clearAllMocks();
    mockServiceSyncOrderToParasut.mockResolvedValue(undefined);
});

// ─── Full allocation ───────────────────────────────────────────────────────────

describe("PATCH /api/orders/[id] approve — full allocation", () => {
    beforeEach(() => {
        mockServiceTransitionOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "allocated",
            shortages: [],
        });
        mockServiceGetOrder.mockResolvedValue(stubOrderAllocated);
    });

    it("returns 200", async () => {
        const res = await PATCH(makeRequest({ transition: "approved" }), makeParams());
        expect(res.status).toBe(200);
    });

    it("response contains fulfillment_status:'allocated'", async () => {
        const res = await PATCH(makeRequest({ transition: "approved" }), makeParams());
        const body = await res.json();
        expect(body.fulfillment_status).toBe("allocated");
    });

    it("response does NOT contain shortages key (empty array omitted)", async () => {
        const res = await PATCH(makeRequest({ transition: "approved" }), makeParams());
        const body = await res.json();
        expect(body).not.toHaveProperty("shortages");
    });
});

// ─── Partial allocation ────────────────────────────────────────────────────────

describe("PATCH /api/orders/[id] approve — partial allocation", () => {
    const stubShortages = [
        { product_name: "Vana DN25", requested: 10, reserved: 3, shortage: 7 },
    ];

    beforeEach(() => {
        mockServiceTransitionOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "partially_allocated",
            shortages: stubShortages,
        });
        mockServiceGetOrder.mockResolvedValue(stubOrderPartial);
    });

    it("returns 200", async () => {
        const res = await PATCH(makeRequest({ transition: "approved" }), makeParams());
        expect(res.status).toBe(200);
    });

    it("response contains fulfillment_status:'partially_allocated'", async () => {
        const res = await PATCH(makeRequest({ transition: "approved" }), makeParams());
        const body = await res.json();
        expect(body.fulfillment_status).toBe("partially_allocated");
    });

    it("response contains shortages array with correct shape", async () => {
        const res = await PATCH(makeRequest({ transition: "approved" }), makeParams());
        const body = await res.json();
        expect(body.shortages).toHaveLength(1);
        expect(body.shortages[0].product_name).toBe("Vana DN25");
        expect(body.shortages[0].requested).toBe(10);
        expect(body.shortages[0].reserved).toBe(3);
        expect(body.shortages[0].shortage).toBe(7);
    });
});

// ─── Zero stock / approve failure ─────────────────────────────────────────────

describe("PATCH /api/orders/[id] approve — zero stock (success:false)", () => {
    beforeEach(() => {
        mockServiceTransitionOrder.mockResolvedValue({
            success: false,
            error: "Hiçbir satır için yeterli stok yok.",
        });
    });

    it("returns 400", async () => {
        const res = await PATCH(makeRequest({ transition: "approved" }), makeParams());
        expect(res.status).toBe(400);
    });

    it("response contains error message", async () => {
        const res = await PATCH(makeRequest({ transition: "approved" }), makeParams());
        const body = await res.json();
        expect(body.error).toContain("stok");
    });

    it("serviceGetOrder is NOT called when transition fails", async () => {
        await PATCH(makeRequest({ transition: "approved" }), makeParams());
        expect(mockServiceGetOrder).not.toHaveBeenCalled();
    });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("PATCH /api/orders/[id] — missing transition", () => {
    it("empty body → 400", async () => {
        const res = await PATCH(makeRequest({}), makeParams());
        expect(res.status).toBe(400);
    });
});
