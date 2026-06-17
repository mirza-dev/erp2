/**
 * A1 — Stok & Ürünler sunucu tarafı sayfalama (src/lib/supabase/products.ts):
 *  dbListProductsPaged (arama name/sku + çoklu-kategori + tip + sinyal id.in → SQL + count:exact)
 *  dbGetProductListCounts (tüm-katalog: total + kategori sayaçları + kritik [quoted gerekir]).
 * Sayfa "use client" kalır ama veri fetch'i sunucu-sayfalı → mega-fetch ölür.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { m: string; args: unknown[] };
let calls: Call[] = [];
let resultQueue: Array<{ data: unknown; error: unknown; count: number | null }> = [];

function builder() {
    const b: Record<string, unknown> = {};
    const rec = (m: string) => (...args: unknown[]) => { calls.push({ m, args }); return b; };
    for (const m of ["select", "eq", "neq", "gte", "lte", "in", "or", "order", "range"]) b[m] = rec(m);
    b.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(resultQueue.shift() ?? { data: [], error: null, count: 0 }).then(resolve, reject);
    return b;
}
const mockFrom = vi.fn(() => builder());
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: mockFrom }) }));

import { dbListProductsPaged, dbGetProductListCounts } from "@/lib/supabase/products";

beforeEach(() => { calls = []; resultQueue = []; mockFrom.mockClear(); });
const has = (m: string, p: (a: unknown[]) => boolean) => calls.some(c => c.m === m && p(c.args));
const orArg = () => (calls.find(c => c.m === "or")?.args[0] as string | undefined) ?? "";

describe("dbListProductsPaged", () => {
    it("rows + total (count:exact); varsayılan is_active=true", async () => {
        resultQueue = [{ data: [{ id: "1", on_hand: 5, reserved: 0 }], error: null, count: 7 }];
        const res = await dbListProductsPaged({ page: 1 });
        expect(res.rows).toHaveLength(1);
        expect(res.total).toBe(7);
        expect(has("select", a => (a[1] as { count?: string })?.count === "exact")).toBe(true);
        expect(has("eq", a => a[0] === "is_active" && a[1] === true)).toBe(true);
    });

    it("arama → name / sku ilike (.or)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListProductsPaged({ search: "vana" });
        expect(orArg()).toContain("name.ilike");
        expect(orArg()).toContain("sku.ilike");
    });

    it("çoklu kategori → in(category), tip → eq(product_type)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListProductsPaged({ categories: ["Vanalar", "Flanşlar"], product_type: "commercial" });
        expect(has("in", a => a[0] === "category" && Array.isArray(a[1]) && (a[1] as string[]).length === 2)).toBe(true);
        expect(has("eq", a => a[0] === "product_type" && a[1] === "commercial")).toBe(true);
    });

    it("sinyal id seti → in(id)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListProductsPaged({ ids: ["a", "b"], signalActive: true });
        expect(has("in", a => a[0] === "id" && (a[1] as string[]).join(",") === "a,b")).toBe(true);
    });

    it("sinyal aktif ama id yok → BOŞ (sorgu çalıştırmaz, tümünü döndürmez)", async () => {
        const res = await dbListProductsPaged({ signalActive: true, ids: [] });
        expect(res).toEqual({ rows: [], total: 0 });
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it("range 0-tabanlı (page 2 / 50)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListProductsPaged({ page: 2, pageSize: 50 });
        expect(has("range", a => a[0] === 50 && a[1] === 99)).toBe(true);
    });
});

describe("dbGetProductListCounts", () => {
    it("total + kategori sayaçları + kritik (promisable=on_hand-reserved-quoted ≤ minStok)", async () => {
        // products rows, sonra dbGetQuotedQuantities (order_lines) sonucu.
        resultQueue = [
            {
                data: [
                    { id: "a", category: "Vanalar", on_hand: 10, reserved: 0, min_stock_level: 5 }, // 10-8q=2 ≤5 kritik
                    { id: "b", category: "Vanalar", on_hand: 3, reserved: 0, min_stock_level: 5 },  // 3 ≤5 kritik
                    { id: "c", category: "Flanşlar", on_hand: 100, reserved: 0, min_stock_level: 5 }, // 100 >5 değil
                ],
                error: null, count: null,
            },
            { data: [{ product_id: "a", quantity: 8 }], error: null, count: null },
        ];
        const counts = await dbGetProductListCounts();
        expect(counts.total).toBe(3);
        expect(counts.categories).toEqual({ Vanalar: 2, Flanşlar: 1 });
        expect(counts.critical).toBe(2);
        expect(has("eq", a => a[0] === "is_active" && a[1] === true)).toBe(true);
    });
});
