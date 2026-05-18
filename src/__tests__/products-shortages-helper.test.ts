/**
 * Faz 10 — dbGetOpenShortagesByProductId (helper)
 *
 * Pattern: thenable chain (purchase-orders.test.ts ile aynı) — fluent Supabase
 * query'sinin tüm zincirini tek thenable nesne ile temsil eder. `await chain`
 * doğrudan _pendingResult'u resolve eder; her .select/.eq() çağrısı kendisini
 * geri döner.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

let _pendingResult: { data: unknown; error: unknown } = { data: [], error: null };
function setResult(v: { data: unknown; error: unknown }) { _pendingResult = v; }

const makeChain = () => {
    const c: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(_pendingResult).then(resolve),
        catch: (reject: (e: unknown) => unknown) => Promise.resolve(_pendingResult).catch(reject),
    };
    c.select = (_v?: unknown) => c;
    c.eq     = (_k: unknown, _v: unknown) => c;
    c.order  = (_v: unknown, _o?: unknown) => c;
    return c;
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: (t: string) => { mockFrom(t); return makeChain(); } }),
}));

import { dbGetOpenShortagesByProductId } from "@/lib/supabase/products";

beforeEach(() => {
    vi.clearAllMocks();
    setResult({ data: [], error: null });
});

describe("dbGetOpenShortagesByProductId", () => {
    it("empty result → empty array", async () => {
        setResult({ data: [], error: null });
        const result = await dbGetOpenShortagesByProductId("p-1");
        expect(result).toEqual([]);
        expect(mockFrom).toHaveBeenCalledWith("shortages");
    });

    it("supabase error → empty array (defensive — drawer crash etmesin)", async () => {
        setResult({ data: null, error: { message: "db fail" } });
        const result = await dbGetOpenShortagesByProductId("p-1");
        expect(result).toEqual([]);
    });

    it("data null → empty array", async () => {
        setResult({ data: null, error: null });
        const result = await dbGetOpenShortagesByProductId("p-1");
        expect(result).toEqual([]);
    });

    it("3 satır → DESC sıralı (createdAt en yeni üstte)", async () => {
        setResult({
            data: [
                { id: "s1", requested_qty: 10, available_qty: 4, shortage_qty: 6, created_at: "2026-05-01T00:00:00Z",
                  sales_orders: { id: "o1", order_number: "ORD-001", commercial_status: "approved", customer_id: "c1", customer_name: "Müşteri A" } },
                { id: "s2", requested_qty: 20, available_qty: 0, shortage_qty: 20, created_at: "2026-05-15T00:00:00Z",
                  sales_orders: { id: "o2", order_number: "ORD-002", commercial_status: "approved", customer_id: "c2", customer_name: "Müşteri B" } },
                { id: "s3", requested_qty: 5, available_qty: 2, shortage_qty: 3, created_at: "2026-05-10T00:00:00Z",
                  sales_orders: { id: "o3", order_number: "ORD-003", commercial_status: "approved", customer_id: "c3", customer_name: "Müşteri C" } },
            ],
            error: null,
        });
        const result = await dbGetOpenShortagesByProductId("p-1");
        expect(result).toHaveLength(3);
        expect(result[0].shortageId).toBe("s2"); // May 15 — en yeni
        expect(result[1].shortageId).toBe("s3"); // May 10
        expect(result[2].shortageId).toBe("s1"); // May 1
    });

    it("PostgREST many-to-one ARRAY shape → defensive normalize (array[0])", async () => {
        setResult({
            data: [
                { id: "s1", requested_qty: 10, available_qty: 4, shortage_qty: 6, created_at: "2026-05-01T00:00:00Z",
                  sales_orders: [{ id: "o1", order_number: "ORD-001", commercial_status: "approved", customer_id: "c1", customer_name: "Müşteri A" }] },
            ],
            error: null,
        });
        const result = await dbGetOpenShortagesByProductId("p-1");
        expect(result).toHaveLength(1);
        expect(result[0].orderNumber).toBe("ORD-001");
        expect(result[0].customerName).toBe("Müşteri A");
    });

    it("sales_orders null veya boş array → row skip", async () => {
        setResult({
            data: [
                { id: "s1", requested_qty: 10, available_qty: 4, shortage_qty: 6, created_at: "2026-05-01T00:00:00Z", sales_orders: null },
                { id: "s2", requested_qty: 10, available_qty: 4, shortage_qty: 6, created_at: "2026-05-02T00:00:00Z", sales_orders: [] },
            ],
            error: null,
        });
        const result = await dbGetOpenShortagesByProductId("p-1");
        expect(result).toEqual([]);
    });

    it("alan mapping doğru: shortageId/orderId/customerName/requestedQty/availableQty/shortageQty/createdAt", async () => {
        setResult({
            data: [
                { id: "s1", requested_qty: 100, available_qty: 30, shortage_qty: 70, created_at: "2026-05-01T00:00:00Z",
                  sales_orders: { id: "o1", order_number: "ORD-X", commercial_status: "approved", customer_id: "c1", customer_name: "ABC" } },
            ],
            error: null,
        });
        const result = await dbGetOpenShortagesByProductId("p-1");
        expect(result[0]).toEqual({
            shortageId: "s1",
            orderId: "o1",
            orderNumber: "ORD-X",
            customerId: "c1",
            customerName: "ABC",
            requestedQty: 100,
            availableQty: 30,
            shortageQty: 70,
            createdAt: "2026-05-01T00:00:00Z",
        });
    });
});
