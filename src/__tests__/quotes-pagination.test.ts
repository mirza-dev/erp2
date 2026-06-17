/**
 * A1 — Quotes sunucu tarafı sayfalama (src/lib/supabase/quotes.ts):
 *  dbListQuotesPaged (status/arama/döviz/tarih → SQL + count:"exact" total) ·
 *  dbCountQuotesByStatus (global sekme sayaçları).
 *
 * Supabase service client mock'lanır (db-aging deseni).
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

import { dbListQuotesPaged, dbCountQuotesByStatus } from "@/lib/supabase/quotes";

beforeEach(() => { calls = []; resultQueue = []; mockFrom.mockClear(); });
const has = (m: string, p: (a: unknown[]) => boolean) => calls.some(c => c.m === m && p(c.args));

describe("dbListQuotesPaged", () => {
    it("rows + total (count:exact)", async () => {
        resultQueue = [{ data: [{ id: "1" }], error: null, count: 12 }];
        const res = await dbListQuotesPaged({ page: 1 });
        expect(res.rows).toHaveLength(1);
        expect(res.total).toBe(12);
        expect(has("select", a => (a[1] as { count?: string })?.count === "exact")).toBe(true);
    });

    it("status/döviz/tarih/arama → eq/gte/lte/or", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListQuotesPaged({ status: "sent", currency: "EUR", date_from: "2026-02-01", date_to: "2026-02-28", search: "ACME" });
        expect(has("eq", a => a[0] === "status" && a[1] === "sent")).toBe(true);
        expect(has("eq", a => a[0] === "currency" && a[1] === "EUR")).toBe(true);
        expect(has("gte", a => a[0] === "created_at" && a[1] === "2026-02-01T00:00:00")).toBe(true);
        expect(has("lte", a => a[0] === "created_at" && a[1] === "2026-02-28T23:59:59.999")).toBe(true);
        expect(has("or", a => typeof a[0] === "string" && (a[0] as string).includes("quote_number.ilike"))).toBe(true);
    });

    it("status yoksa eq(status) yok; boş arama or yok", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListQuotesPaged({ search: "  " });
        expect(has("eq", a => a[0] === "status")).toBe(false);
        expect(has("or", () => true)).toBe(false);
    });

    it("range 0-tabanlı (page 2 / 50)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListQuotesPaged({ page: 2, pageSize: 50 });
        expect(has("range", a => a[0] === 50 && a[1] === 99)).toBe(true);
    });
});

describe("dbCountQuotesByStatus", () => {
    it("ALL + 6 status sayacı", async () => {
        resultQueue = [
            { data: null, error: null, count: 30 }, // ALL
            { data: null, error: null, count: 3 },  // draft
            { data: null, error: null, count: 5 },  // sent
            { data: null, error: null, count: 7 },  // accepted
            { data: null, error: null, count: 2 },  // rejected
            { data: null, error: null, count: 1 },  // expired
            { data: null, error: null, count: 4 },  // revised
        ];
        const c = await dbCountQuotesByStatus();
        expect(c).toEqual({ ALL: 30, draft: 3, sent: 5, accepted: 7, rejected: 2, expired: 1, revised: 4 });
    });
});
