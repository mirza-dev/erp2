/**
 * A1 — Satın Alma Siparişleri sunucu tarafı sayfalama
 * (src/lib/supabase/purchase-orders.ts):
 *  dbListPurchaseOrdersPaged (status/arama + vendor_id.in → SQL + count) ·
 *  dbCountPurchaseOrdersByStatus (global sekme sayaçları).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { m: string; args: unknown[] };
let calls: Call[] = [];
let resultQueue: Array<{ data: unknown; error: unknown; count: number | null }> = [];

function builder() {
    const b: Record<string, unknown> = {};
    const rec = (m: string) => (...args: unknown[]) => { calls.push({ m, args }); return b; };
    for (const m of ["select", "eq", "neq", "gte", "lte", "or", "order", "range"]) b[m] = rec(m);
    b.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(resultQueue.shift() ?? { data: [], error: null, count: 0 }).then(resolve, reject);
    return b;
}
const mockFrom = vi.fn(() => builder());
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: mockFrom }) }));

import { dbListPurchaseOrdersPaged, dbCountPurchaseOrdersByStatus } from "@/lib/supabase/purchase-orders";

beforeEach(() => { calls = []; resultQueue = []; mockFrom.mockClear(); });
const has = (m: string, p: (a: unknown[]) => boolean) => calls.some(c => c.m === m && p(c.args));
const orArg = () => (calls.find(c => c.m === "or")?.args[0] as string | undefined) ?? "";

describe("dbListPurchaseOrdersPaged", () => {
    it("rows + total (count:exact)", async () => {
        resultQueue = [{ data: [{ id: "1" }], error: null, count: 9 }];
        const res = await dbListPurchaseOrdersPaged({ page: 1 });
        expect(res.rows).toHaveLength(1);
        expect(res.total).toBe(9);
        expect(has("select", a => (a[1] as { count?: string })?.count === "exact")).toBe(true);
    });

    it("status → eq(status)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListPurchaseOrdersPaged({ status: "confirmed" });
        expect(has("eq", a => a[0] === "status" && a[1] === "confirmed")).toBe(true);
    });

    it("arama → .or(po_number.ilike) + vendor adı eşleşen vendor_id.in", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListPurchaseOrdersPaged({ search: "ACME", vendorIds: ["v1", "v2"] });
        expect(orArg()).toContain("po_number.ilike");
        expect(orArg()).toContain("vendor_id.in.(v1,v2)");
    });

    it("arama var ama vendorIds yok → yalnız po_number.ilike", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListPurchaseOrdersPaged({ search: "PO-1" });
        expect(orArg()).toContain("po_number.ilike");
        expect(orArg()).not.toContain("vendor_id.in");
    });

    it("range 0-tabanlı (page 2 / 50)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListPurchaseOrdersPaged({ page: 2, pageSize: 50 });
        expect(has("range", a => a[0] === 50 && a[1] === 99)).toBe(true);
    });
});

describe("dbCountPurchaseOrdersByStatus", () => {
    it("all + 6 status sayacı", async () => {
        resultQueue = [
            { data: null, error: null, count: 40 }, // all
            { data: null, error: null, count: 5 },  // draft
            { data: null, error: null, count: 6 },  // sent
            { data: null, error: null, count: 7 },  // confirmed
            { data: null, error: null, count: 8 },  // partially_received
            { data: null, error: null, count: 9 },  // received
            { data: null, error: null, count: 5 },  // cancelled
        ];
        const c = await dbCountPurchaseOrdersByStatus();
        expect(c).toEqual({ all: 40, draft: 5, sent: 6, confirmed: 7, partially_received: 8, received: 9, cancelled: 5 });
    });
});
