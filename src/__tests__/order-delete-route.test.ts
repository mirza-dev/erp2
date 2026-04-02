/**
 * Tests for DELETE /api/orders/[id] route handler.
 * Regression guard: the route must return correct HTTP status codes so the
 * orders-list UI can detect failures instead of silently treating them as success.
 *
 * Soft cancel (default):   success → 200 {ok:true}
 *                          failure → 400 {error:...}
 * Hard delete (?permanent=1): wrong status → 409
 *                             success → 200 {success:true}
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Service / DB mocks ───────────────────────────────────────────────────────

const mockServiceTransitionOrder = vi.fn();
const mockServiceGetOrder        = vi.fn();
const mockDbGetOrderById         = vi.fn();
const mockDbHardDeleteOrder      = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceTransitionOrder: (...args: unknown[]) => mockServiceTransitionOrder(...args),
    serviceGetOrder:        (...args: unknown[]) => mockServiceGetOrder(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:   (...args: unknown[]) => mockDbGetOrderById(...args),
    dbHardDeleteOrder: (...args: unknown[]) => mockDbHardDeleteOrder(...args),
}));

vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncOrderToParasut: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE } from "@/app/api/orders/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORDER_ID = "ord-del-1";

function makeDeleteRequest(permanent = false): NextRequest {
    const url = permanent
        ? `http://localhost/api/orders/${ORDER_ID}?permanent=1`
        : `http://localhost/api/orders/${ORDER_ID}`;
    return new NextRequest(url, { method: "DELETE" });
}

function makeParams(id = ORDER_ID): { params: Promise<{ id: string }> } {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── Soft cancel (default DELETE) ────────────────────────────────────────────

describe("DELETE /api/orders/[id] — soft cancel (default)", () => {
    it("başarılı cancel → 200 {ok:true}", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: true });
        const res = await DELETE(makeDeleteRequest(), makeParams());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it("transition başarısız (zaten sevk edilmiş) → 400 hata mesajıyla", async () => {
        mockServiceTransitionOrder.mockResolvedValue({
            success: false,
            error: "Sevk edilmiş sipariş iptal edilemez.",
        });
        const res = await DELETE(makeDeleteRequest(), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Sevk");
    });

    it("transition başarısız (zaten iptal) → 400", async () => {
        mockServiceTransitionOrder.mockResolvedValue({
            success: false,
            error: "'cancelled' durumundan iptal edilemez.",
        });
        const res = await DELETE(makeDeleteRequest(), makeParams());
        expect(res.status).toBe(400);
    });

    it("başarısız cancel'da serviceGetOrder / refetch çağrılmaz", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: false, error: "hata" });
        await DELETE(makeDeleteRequest(), makeParams());
        expect(mockServiceGetOrder).not.toHaveBeenCalled();
    });
});

// ─── Hard delete (?permanent=1) ───────────────────────────────────────────────

describe("DELETE /api/orders/[id]?permanent=1 — hard delete", () => {
    it("onaylı sipariş → 409", async () => {
        mockDbGetOrderById.mockResolvedValue({ id: ORDER_ID, commercial_status: "approved" });
        const res = await DELETE(makeDeleteRequest(true), makeParams());
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toBeTruthy();
    });

    it("onay bekleyen sipariş → 409", async () => {
        mockDbGetOrderById.mockResolvedValue({ id: ORDER_ID, commercial_status: "pending_approval" });
        const res = await DELETE(makeDeleteRequest(true), makeParams());
        expect(res.status).toBe(409);
    });

    it("taslak sipariş → 200 {success:true}", async () => {
        mockDbGetOrderById.mockResolvedValue({ id: ORDER_ID, commercial_status: "draft" });
        mockDbHardDeleteOrder.mockResolvedValue(undefined);
        const res = await DELETE(makeDeleteRequest(true), makeParams());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
    });

    it("iptal edilmiş sipariş → 200 {success:true}", async () => {
        mockDbGetOrderById.mockResolvedValue({ id: ORDER_ID, commercial_status: "cancelled" });
        mockDbHardDeleteOrder.mockResolvedValue(undefined);
        const res = await DELETE(makeDeleteRequest(true), makeParams());
        expect(res.status).toBe(200);
    });

    it("sipariş bulunamadı → 404", async () => {
        mockDbGetOrderById.mockResolvedValue(null);
        const res = await DELETE(makeDeleteRequest(true), makeParams());
        expect(res.status).toBe(404);
    });
});
