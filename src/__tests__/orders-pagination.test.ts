/**
 * A1 — Orders sunucu tarafı sayfalama (src/lib/supabase/orders.ts):
 *  - buildOrderSearchOrFilter: PostgREST .or() güvenli escape (filtre enjeksiyonu).
 *  - dbListOrdersPaged: tab/arama/tarih/döviz/müşteri → SQL filtre + count:"exact"
 *    total (range'den bağımsız).
 *  - dbCountOrdersByTab: global sekme sayaçları (6 head+count).
 *
 * Supabase service client mock'lanır; filtre çevirisi mock çağrılarından doğrulanır.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────

type Call = { m: string; args: unknown[] };
let calls: Call[] = [];
let resultQueue: Array<{ data: unknown; error: unknown; count: number | null }> = [];

function builder() {
    const b: Record<string, unknown> = {};
    const rec = (m: string) => (...args: unknown[]) => { calls.push({ m, args }); return b; };
    b.select = rec("select");
    b.eq = rec("eq");
    b.neq = rec("neq");
    b.gte = rec("gte");
    b.lte = rec("lte");
    b.or = rec("or");
    b.order = rec("order");
    b.range = rec("range");
    b.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(resultQueue.shift() ?? { data: [], error: null, count: 0 }).then(resolve, reject);
    return b;
}

const mockFrom = vi.fn(() => builder());

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
}));

import {
    buildOrderSearchOrFilter,
    dbListOrdersPaged,
    dbCountOrdersByTab,
} from "@/lib/supabase/orders";

beforeEach(() => {
    calls = [];
    resultQueue = [];
    mockFrom.mockClear();
});

const has = (m: string, predicate: (args: unknown[]) => boolean) =>
    calls.some(c => c.m === m && predicate(c.args));

// ── buildOrderSearchOrFilter (pure) ───────────────────────────

describe("buildOrderSearchOrFilter", () => {
    it("order_number + customer_name ilike, çift-tırnaklı sarmalama", () => {
        expect(buildOrderSearchOrFilter("ab")).toBe(
            'order_number.ilike."%ab%",customer_name.ilike."%ab%"',
        );
    });
    it('enjeksiyon karakterlerini escape eder (" ve \\)', () => {
        const out = buildOrderSearchOrFilter('a"b\\c');
        expect(out).toContain('a\\"b\\\\c');
        // koşul ayracı `,` dış yapıda yalnız iki alan arasında
        expect(out.split('","').length).toBeGreaterThan(0);
    });
    it("baştaki/sondaki boşluğu kırpar", () => {
        expect(buildOrderSearchOrFilter("  x  ")).toBe(
            'order_number.ilike."%x%",customer_name.ilike."%x%"',
        );
    });
});

// ── dbListOrdersPaged ─────────────────────────────────────────

describe("dbListOrdersPaged", () => {
    it("rows + total (count:exact) döner", async () => {
        resultQueue = [{ data: [{ id: "1" }, { id: "2" }], error: null, count: 42 }];
        const res = await dbListOrdersPaged({ page: 1 });
        expect(res.rows).toHaveLength(2);
        expect(res.total).toBe(42);
        // count:"exact" istenmeli
        expect(has("select", a => a[0] === "*" && (a[1] as { count?: string })?.count === "exact")).toBe(true);
    });

    it("tab=approved → commercial=approved + fulfillment≠shipped", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListOrdersPaged({ tab: "approved" });
        expect(has("eq", a => a[0] === "commercial_status" && a[1] === "approved")).toBe(true);
        expect(has("neq", a => a[0] === "fulfillment_status" && a[1] === "shipped")).toBe(true);
    });

    it("tab=shipped → yalnız fulfillment=shipped (commercial eq yok)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListOrdersPaged({ tab: "shipped" });
        expect(has("eq", a => a[0] === "fulfillment_status" && a[1] === "shipped")).toBe(true);
        expect(has("eq", a => a[0] === "commercial_status")).toBe(false);
    });

    it("tab=draft → commercial=draft", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListOrdersPaged({ tab: "draft" });
        expect(has("eq", a => a[0] === "commercial_status" && a[1] === "draft")).toBe(true);
    });

    it("tab=ALL → durum filtresi uygulanmaz", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListOrdersPaged({ tab: "ALL" });
        expect(has("eq", a => a[0] === "commercial_status")).toBe(false);
        expect(has("eq", a => a[0] === "fulfillment_status")).toBe(false);
    });

    it("arama/tarih/döviz/müşteri → eq/gte/lte/or", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListOrdersPaged({
            search: "ACME",
            customer_id: "c-1",
            currency: "USD",
            date_from: "2026-01-01",
            date_to: "2026-01-31",
        });
        expect(has("eq", a => a[0] === "customer_id" && a[1] === "c-1")).toBe(true);
        expect(has("eq", a => a[0] === "currency" && a[1] === "USD")).toBe(true);
        expect(has("gte", a => a[0] === "created_at" && a[1] === "2026-01-01T00:00:00")).toBe(true);
        expect(has("lte", a => a[0] === "created_at" && a[1] === "2026-01-31T23:59:59.999")).toBe(true);
        expect(has("or", a => typeof a[0] === "string" && (a[0] as string).includes("ACME"))).toBe(true);
    });

    it("boş arama .or() üretmez", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListOrdersPaged({ search: "   " });
        expect(has("or", () => true)).toBe(false);
    });

    it("page/pageSize → range (0-tabanlı)", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListOrdersPaged({ page: 2, pageSize: 50 });
        expect(has("range", a => a[0] === 50 && a[1] === 99)).toBe(true);
    });

    it("error → throw", async () => {
        resultQueue = [{ data: null, error: { message: "boom" }, count: null }];
        await expect(dbListOrdersPaged()).rejects.toThrow("boom");
    });
});

// ── dbCountOrdersByTab ────────────────────────────────────────

describe("dbCountOrdersByTab", () => {
    it("6 kova sayacını döner", async () => {
        resultQueue = [
            { data: null, error: null, count: 100 }, // ALL
            { data: null, error: null, count: 5 },   // draft
            { data: null, error: null, count: 10 },  // pending
            { data: null, error: null, count: 20 },  // approved
            { data: null, error: null, count: 30 },  // shipped
            { data: null, error: null, count: 8 },   // cancelled
        ];
        const c = await dbCountOrdersByTab();
        expect(c).toEqual({
            ALL: 100,
            draft: 5,
            pending_approval: 10,
            approved: 20,
            shipped: 30,
            cancelled: 8,
        });
    });
});
