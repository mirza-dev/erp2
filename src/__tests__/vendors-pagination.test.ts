/**
 * A1 — Tedarikçiler sunucu tarafı sayfalama (src/lib/supabase/vendors.ts):
 *  dbListVendorsPaged (arama name/contact_person/contact_email + isActive → SQL + count).
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
vi.mock("@/lib/validation", () => ({ isValidEmail: () => true, isValidTaxNumber: () => true }));

import { dbListVendorsPaged } from "@/lib/supabase/vendors";

beforeEach(() => { calls = []; resultQueue = []; mockFrom.mockClear(); });
const has = (m: string, p: (a: unknown[]) => boolean) => calls.some(c => c.m === m && p(c.args));
const orArg = () => (calls.find(c => c.m === "or")?.args[0] as string | undefined) ?? "";

describe("dbListVendorsPaged", () => {
    it("rows + total (count:exact)", async () => {
        resultQueue = [{ data: [{ id: "1" }], error: null, count: 4 }];
        const res = await dbListVendorsPaged({ page: 1 });
        expect(res.rows).toHaveLength(1);
        expect(res.total).toBe(4);
        expect(has("select", a => (a[1] as { count?: string })?.count === "exact")).toBe(true);
    });

    it("isActive=true → yalnız aktif; undefined → eq(is_active) yok", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListVendorsPaged({ isActive: true });
        expect(has("eq", a => a[0] === "is_active" && a[1] === true)).toBe(true);
        calls = [];
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListVendorsPaged({});
        expect(has("eq", a => a[0] === "is_active")).toBe(false);
    });

    it("arama → name / contact_person / contact_email ilike", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListVendorsPaged({ search: "metal" });
        expect(orArg()).toContain("name.ilike");
        expect(orArg()).toContain("contact_person.ilike");
        expect(orArg()).toContain("contact_email.ilike");
    });

    it("range 0-tabanlı (page 2 / 50)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListVendorsPaged({ page: 2, pageSize: 50 });
        expect(has("range", a => a[0] === 50 && a[1] === 99)).toBe(true);
    });
});
