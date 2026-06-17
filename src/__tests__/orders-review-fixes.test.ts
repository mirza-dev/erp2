/**
 * 2026-06-17 orders modülü denetim bulguları regresyon kilidi:
 *   Y1 — serviceReceivePOLines: PO mal kabulü alınan ürünler için yeniden tahsisat tetikler.
 *   O2 — serviceReallocateOrder: siparişin açık shortage ürünlerini FIFO çözer.
 *   O1 — orders GET'leri view_sales_orders guard'lı (source-lock).
 *   D1 — partially_shipped FulfillmentStatus union'ından kaldırıldı (source-lock).
 *   N1 — OrderForm localISODate kullanır (source-lock).
 *   N2 — parasut-status batch product fetch (N+1 yok, source-lock).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Mocks ──────────────────────────────────────────────────────
const mockReceive = vi.fn();
const mockGetPO = vi.fn();
const mockTryResolve = vi.fn();
const mockGetOpenShortageProductIds = vi.fn();
const mockGetOrderById = vi.fn();

vi.mock("@/lib/supabase/purchase-orders", async () => {
    const actual = await vi.importActual("@/lib/supabase/purchase-orders") as typeof import("@/lib/supabase/purchase-orders");
    return {
        ...actual,
        dbReceivePurchaseOrderLines: (...a: unknown[]) => mockReceive(...a),
        dbGetPurchaseOrderById: (...a: unknown[]) => mockGetPO(...a),
    };
});
vi.mock("@/lib/supabase/products", async () => {
    const actual = await vi.importActual("@/lib/supabase/products") as typeof import("@/lib/supabase/products");
    return {
        ...actual,
        dbTryResolveShortages: (...a: unknown[]) => mockTryResolve(...a),
        dbGetOpenShortageProductIds: (...a: unknown[]) => mockGetOpenShortageProductIds(...a),
    };
});
vi.mock("@/lib/supabase/orders", async () => {
    const actual = await vi.importActual("@/lib/supabase/orders") as typeof import("@/lib/supabase/orders");
    return {
        ...actual,
        dbGetOrderById: (...a: unknown[]) => mockGetOrderById(...a),
    };
});

import { serviceReceivePOLines } from "@/lib/services/purchase-order-service";
import { serviceReallocateOrder } from "@/lib/services/order-service";

beforeEach(() => {
    vi.clearAllMocks();
    mockTryResolve.mockResolvedValue({ success: true, shortages_resolved: 1, shortages_partially_resolved: 0, total_allocated: 5 });
    // alert-scan fetch (non-fatal)
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
});

describe("Y1 — serviceReceivePOLines yeniden tahsisat tetikler", () => {
    it("alınan satırların DISTINCT ürünleri için dbTryResolveShortages çağrılır", async () => {
        mockReceive.mockResolvedValue(undefined);
        mockGetPO.mockResolvedValue({
            id: "po-1", status: "partially_received",
            lines: [
                { id: "l1", product_id: "p1" },
                { id: "l2", product_id: "p2" },
                { id: "l3", product_id: "p1" }, // aynı ürün → distinct
            ],
        });
        const res = await serviceReceivePOLines("po-1", [{ line_id: "l1", qty: 3 }, { line_id: "l3", qty: 2 }], "tester");

        expect(res).toEqual({ id: "po-1", status: "partially_received" });
        // Yalnız alınan satırların (l1,l3) ürünleri → distinct {p1}
        const called = mockTryResolve.mock.calls.map((c) => c[0]);
        expect(called).toEqual(["p1"]);
    });

    it("alınmayan satırın ürünü tetiklenmez", async () => {
        mockReceive.mockResolvedValue(undefined);
        mockGetPO.mockResolvedValue({
            id: "po-1", status: "received",
            lines: [{ id: "l1", product_id: "p1" }, { id: "l2", product_id: "p2" }],
        });
        await serviceReceivePOLines("po-1", [{ line_id: "l2", qty: 1 }], "tester");
        expect(mockTryResolve.mock.calls.map((c) => c[0])).toEqual(["p2"]);
    });

    it("yeniden tahsisat hatası NON-FATAL (mal kabul başarılı kalır)", async () => {
        mockReceive.mockResolvedValue(undefined);
        mockGetPO.mockResolvedValue({ id: "po-1", status: "received", lines: [{ id: "l1", product_id: "p1" }] });
        mockTryResolve.mockRejectedValue(new Error("resolve patladı"));
        const res = await serviceReceivePOLines("po-1", [{ line_id: "l1", qty: 1 }], "tester");
        expect(res.status).toBe("received");
    });
});

describe("O2 — serviceReallocateOrder", () => {
    it("açık shortage ürünlerini FIFO çözer + güncel fulfillment döner", async () => {
        mockGetOrderById
            .mockResolvedValueOnce({ id: "o1", fulfillment_status: "partially_allocated" }) // ön kontrol
            .mockResolvedValueOnce({ id: "o1", fulfillment_status: "allocated" });            // sonuç
        mockGetOpenShortageProductIds.mockResolvedValue(["p1", "p2"]);

        const res = await serviceReallocateOrder("o1");
        expect(mockTryResolve.mock.calls.map((c) => c[0])).toEqual(["p1", "p2"]);
        expect(res.fulfillment_status).toBe("allocated");
        expect(res.productsTried).toBe(2);
        expect(res.shortagesResolved).toBe(2); // her çağrı 1 resolved
    });

    it("sipariş yoksa hata", async () => {
        mockGetOrderById.mockResolvedValue(null);
        await expect(serviceReallocateOrder("yok")).rejects.toThrow(/bulunamadı/i);
    });

    it("tek ürün hatası diğerlerini durdurmaz (best-effort)", async () => {
        mockGetOrderById.mockResolvedValue({ id: "o1", fulfillment_status: "partially_allocated" });
        mockGetOpenShortageProductIds.mockResolvedValue(["p1", "p2"]);
        mockTryResolve.mockRejectedValueOnce(new Error("p1 patladı"));
        const res = await serviceReallocateOrder("o1");
        expect(mockTryResolve).toHaveBeenCalledTimes(2); // p1 hata olsa da p2 denendi
        expect(res.productsTried).toBe(2);
    });
});

describe("source-locks — O1 / D1 / N1 / N2", () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

    it("O1 — orders GET'leri view_sales_orders guard'lı", () => {
        const list = read("src/app/api/orders/route.ts");
        const detail = read("src/app/api/orders/[id]/route.ts");
        expect(list).toContain('requirePermissionFor(ctx, "view_sales_orders")');
        expect(detail).toContain('requirePermissionFor(ctx, "view_sales_orders")');
    });

    it("D1 — partially_shipped FulfillmentStatus union'larından kaldırıldı", () => {
        for (const p of ["src/lib/database.types.ts", "src/lib/data-context.tsx", "src/lib/mock-data.ts"]) {
            const src = read(p);
            // tip union satırlarında partially_shipped geçmemeli (yorum hariç)
            const unionLines = src.split("\n").filter((l) => l.includes("partially_allocated") && !l.trim().startsWith("//"));
            for (const l of unionLines) expect(l).not.toContain("partially_shipped");
        }
        // UI config Record'larında da yok
        for (const p of ["src/components/dashboard/RecentOrders.tsx", "src/app/dashboard/orders/OrdersClient.tsx"]) {
            expect(read(p)).not.toContain("partially_shipped");
        }
    });

    it("N1 — OrderForm localISODate kullanır, ham toISOString().slice yok", () => {
        const src = read("src/app/dashboard/orders/OrderForm.tsx");
        expect(src).toContain("localISODate(");
        expect(src).not.toContain('toISOString().slice(0, 10)');
    });

    it("N2 — parasut-status batch fetch (per-line dbGetProductById yok)", () => {
        const src = read("src/app/api/orders/[id]/parasut-status/route.ts");
        expect(src).toContain("dbGetProductParasutIds");
        expect(src).not.toContain("dbGetProductById");
    });
});
