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
    for (const m of ["select", "eq", "neq", "gte", "lte", "or", "in", "order", "range"]) b[m] = rec(m);
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

/**
 * Sipariş/gelir sayaçları (2026-08-24). `total_orders` / `total_revenue` /
 * `last_order_date` DB kolonları ÖLÜYDÜ (yalnız 0/null yazılıyordu) → liste
 * her cariyi "0 sipariş · 0,00 gelir" gösteriyordu. Artık okuma anında
 * `sales_orders`'tan hesaplanıp satıra biniyor.
 */
describe("dbListCustomersPaged — sipariş/gelir sayaçları", () => {
    it("ölü kolonların yerine HESAPLANAN değerleri koyar", async () => {
        resultQueue = [
            { data: [{ id: "c1", currency: "USD", total_orders: 0, total_revenue: 0, last_order_date: null }], error: null, count: 1 },
            { data: [
                { customer_id: "c1", commercial_status: "approved", grand_total: 100, currency: "USD", created_at: "2026-01-01T00:00:00Z" },
                { customer_id: "c1", commercial_status: "approved", grand_total: 50, currency: "USD", created_at: "2026-06-15T00:00:00Z" },
            ], error: null, count: null },
        ];
        const res = await dbListCustomersPaged({});
        expect(res.rows[0].total_orders).toBe(2);
        expect(res.rows[0].total_revenue).toBe(150);
        expect(res.rows[0].last_order_date).toBe("2026-06-15T00:00:00Z");
        expect(res.rows[0].revenue_by_currency).toEqual({ USD: 150 });
    });

    it("sayaç sorgusu YALNIZ approved + sayfadaki carileri sorar", async () => {
        resultQueue = [
            { data: [{ id: "c1", currency: "USD" }, { id: "c2", currency: "USD" }], error: null, count: 2 },
            { data: [], error: null, count: null },
        ];
        await dbListCustomersPaged({});
        expect(has("in", a => a[0] === "customer_id" && (a[1] as string[]).join() === "c1,c2")).toBe(true);
        expect(has("eq", a => a[0] === "commercial_status" && a[1] === "approved")).toBe(true);
    });

    it("cari KENDİ para birimi total_revenue'ya girer, diğeri dökümde kalır", async () => {
        resultQueue = [
            { data: [{ id: "c1", currency: "EUR" }], error: null, count: 1 },
            { data: [
                { customer_id: "c1", commercial_status: "approved", grand_total: 5904, currency: "EUR", created_at: "2026-06-15T00:00:00Z" },
                { customer_id: "c1", commercial_status: "approved", grand_total: 5889.6, currency: "USD", created_at: "2026-06-10T00:00:00Z" },
            ], error: null, count: null },
        ];
        const res = await dbListCustomersPaged({});
        // EUR + USD ASLA toplanmaz (11793.6 gibi anlamsız sayı üretmez)
        expect(res.rows[0].total_revenue).toBe(5904);
        expect(res.rows[0].revenue_by_currency).toEqual({ EUR: 5904, USD: 5889.6 });
    });

    it("siparişi olmayan cari 0/0/null alır", async () => {
        resultQueue = [
            { data: [{ id: "c1", currency: "TRY", total_orders: 99, total_revenue: 12345 }], error: null, count: 1 },
            { data: [], error: null, count: null },
        ];
        const res = await dbListCustomersPaged({});
        expect(res.rows[0].total_orders).toBe(0);
        expect(res.rows[0].total_revenue).toBe(0);
        expect(res.rows[0].last_order_date).toBeNull();
    });

    it("cari yoksa sayaç sorgusuna HİÇ çıkmaz", async () => {
        resultQueue = [{ data: [], error: null, count: 0 }];
        await dbListCustomersPaged({});
        expect(has("in", a => a[0] === "customer_id")).toBe(false);
    });

    it("1000 satır dolduğunda SONRAKİ sayfayı da çeker (sessiz kırpma yok)", async () => {
        const full = Array.from({ length: 1000 }, (_, i) => ({
            customer_id: "c1", commercial_status: "approved", grand_total: 1,
            currency: "USD", created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
        }));
        resultQueue = [
            { data: [{ id: "c1", currency: "USD" }], error: null, count: 1 },
            { data: full, error: null, count: null },                          // 1. batch — DOLU
            { data: [{ ...full[0], grand_total: 7 }], error: null, count: null }, // 2. batch
        ];
        const res = await dbListCustomersPaged({});
        expect(res.rows[0].total_orders).toBe(1001);
        expect(res.rows[0].total_revenue).toBe(1007);
        expect(calls.filter(c => c.m === "in").length).toBe(2);
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
