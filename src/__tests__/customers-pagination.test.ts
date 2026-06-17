/**
 * A1 — Cariler sunucu tarafı sayfalama (src/lib/supabase/customers.ts):
 *  dbListCustomersPaged (arama/is_active → SQL + count) ·
 *  dbCountCustomers (tümü/aktif/pasif). Pasif sekmesi artık dolar (is_active=false).
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

import { dbListCustomersPaged, dbCountCustomers } from "@/lib/supabase/customers";

beforeEach(() => { calls = []; resultQueue = []; mockFrom.mockClear(); });
const has = (m: string, p: (a: unknown[]) => boolean) => calls.some(c => c.m === m && p(c.args));
const orArg = () => (calls.find(c => c.m === "or")?.args[0] as string | undefined) ?? "";

describe("dbListCustomersPaged", () => {
    it("rows + total (count:exact)", async () => {
        resultQueue = [{ data: [{ id: "1" }], error: null, count: 7 }];
        const res = await dbListCustomersPaged({ page: 1 });
        expect(res.rows).toHaveLength(1);
        expect(res.total).toBe(7);
        expect(has("select", a => (a[1] as { count?: string })?.count === "exact")).toBe(true);
    });

    it("is_active=false → pasifleri getirir (sekme artık dolu)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListCustomersPaged({ is_active: false });
        expect(has("eq", a => a[0] === "is_active" && a[1] === false)).toBe(true);
    });

    it("is_active undefined → eq(is_active) yok (tümü)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListCustomersPaged({});
        expect(has("eq", a => a[0] === "is_active")).toBe(false);
    });

    it("arama → .or(name/email/country ilike)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListCustomersPaged({ search: "acme" });
        expect(orArg()).toContain("name.ilike");
        expect(orArg()).toContain("email.ilike");
        expect(orArg()).toContain("country.ilike");
    });

    it("range 0-tabanlı (page 3 / 50)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListCustomersPaged({ page: 3, pageSize: 50 });
        expect(has("range", a => a[0] === 100 && a[1] === 149)).toBe(true);
    });
});

describe("dbCountCustomers", () => {
    it("tümü / aktif / pasif", async () => {
        resultQueue = [
            { data: null, error: null, count: 20 }, // all
            { data: null, error: null, count: 15 }, // active
            { data: null, error: null, count: 5 },  // passive
        ];
        const c = await dbCountCustomers();
        expect(c).toEqual({ all: 20, active: 15, passive: 5 });
    });
});
