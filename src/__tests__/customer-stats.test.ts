import { describe, expect, it } from "vitest";
import {
    aggregateCustomerOrderStats,
    emptyCustomerOrderStats,
    primaryRevenue,
    CUSTOMER_REVENUE_STATUS,
    type CustomerStatSourceOrder,
} from "@/lib/customer-stats";

function order(p: Partial<CustomerStatSourceOrder> = {}): CustomerStatSourceOrder {
    return {
        customer_id: "c1",
        commercial_status: "approved",
        grand_total: 100,
        currency: "USD",
        created_at: "2026-01-01T00:00:00Z",
        ...p,
    };
}

describe("aggregateCustomerOrderStats", () => {
    it("yalnız approved siparişleri sayar (draft/pending/cancelled hariç)", () => {
        const stats = aggregateCustomerOrderStats([
            order({ commercial_status: "approved", grand_total: 100 }),
            order({ commercial_status: "draft", grand_total: 999 }),
            order({ commercial_status: "cancelled", grand_total: 999 }),
            order({ commercial_status: "pending_approval", grand_total: 999 }),
        ]);
        expect(stats.get("c1")!.orderCount).toBe(1);
        expect(stats.get("c1")!.revenueByCurrency).toEqual({ USD: 100 });
    });

    it("ciro kuralı dashboard ile aynı sabiti kullanır", () => {
        expect(CUSTOMER_REVENUE_STATUS).toBe("approved");
    });

    it("FARKLI para birimlerini ASLA toplamaz — ayrı anahtarlarda tutar", () => {
        const stats = aggregateCustomerOrderStats([
            order({ currency: "EUR", grand_total: 5904 }),
            order({ currency: "USD", grand_total: 5889.6 }),
            order({ currency: "EUR", grand_total: 100 }),
        ]);
        expect(stats.get("c1")!.revenueByCurrency).toEqual({ EUR: 6004, USD: 5889.6 });
        expect(stats.get("c1")!.orderCount).toBe(3);
    });

    it("cari bazında ayrıştırır", () => {
        const stats = aggregateCustomerOrderStats([
            order({ customer_id: "c1", grand_total: 10 }),
            order({ customer_id: "c2", grand_total: 20 }),
        ]);
        expect(stats.get("c1")!.revenueByCurrency).toEqual({ USD: 10 });
        expect(stats.get("c2")!.revenueByCurrency).toEqual({ USD: 20 });
    });

    it("customer_id boş satırı atlar (cariye bağlanamaz)", () => {
        const stats = aggregateCustomerOrderStats([order({ customer_id: null })]);
        expect(stats.size).toBe(0);
    });

    it("lastOrderDate = en SON approved siparişin tarihi", () => {
        const stats = aggregateCustomerOrderStats([
            order({ created_at: "2026-03-01T00:00:00Z" }),
            order({ created_at: "2026-06-15T00:00:00Z" }),
            order({ created_at: "2026-01-01T00:00:00Z" }),
            // iptal daha yeni olsa bile son sipariş tarihini İLERLETMEZ
            order({ created_at: "2026-12-31T00:00:00Z", commercial_status: "cancelled" }),
        ]);
        expect(stats.get("c1")!.lastOrderDate).toBe("2026-06-15T00:00:00Z");
    });

    it("numeric string grand_total'ı sayıya çevirir (PostgREST davranışı)", () => {
        const stats = aggregateCustomerOrderStats([
            order({ grand_total: "120.50" }),
            order({ grand_total: "0.50" }),
        ]);
        expect(stats.get("c1")!.revenueByCurrency).toEqual({ USD: 121 });
    });

    it("bozuk tutar/PB toplamı kirletmez ama sipariş sayılır", () => {
        const stats = aggregateCustomerOrderStats([
            order({ grand_total: 100 }),
            order({ grand_total: null, currency: null }),
            order({ grand_total: "abc" }),
        ]);
        expect(stats.get("c1")!.orderCount).toBe(3);
        expect(stats.get("c1")!.revenueByCurrency).toEqual({ USD: 100 });
    });

    it("boş girdide boş harita döner", () => {
        expect(aggregateCustomerOrderStats([]).size).toBe(0);
    });

    it("emptyCustomerOrderStats sıfır durumu verir", () => {
        expect(emptyCustomerOrderStats()).toEqual({
            orderCount: 0, revenueByCurrency: {}, lastOrderDate: null,
        });
    });
});

describe("primaryRevenue", () => {
    it("cari kendi para birimini birincil gösterir", () => {
        expect(primaryRevenue({ USD: 500, EUR: 300 }, "USD")).toEqual({
            amount: 500, currency: "USD", others: [{ currency: "EUR", amount: 300 }],
        });
    });

    it("cari PB'sinde hiç sipariş yoksa 0 gösterir, diğerlerini gizlemez", () => {
        const r = primaryRevenue({ USD: 5889.6 }, "EUR");
        expect(r.amount).toBe(0);
        expect(r.currency).toBe("EUR");
        expect(r.others).toEqual([{ currency: "USD", amount: 5889.6 }]);
    });

    it("diğer para birimleri tutara göre büyükten küçüğe sıralanır", () => {
        const r = primaryRevenue({ TRY: 1, USD: 300, EUR: 900, GBP: 50 }, "TRY");
        expect(r.others.map(o => o.currency)).toEqual(["EUR", "USD", "GBP"]);
    });

    it("tek para birimi → others boş (yaygın durum sade kalır)", () => {
        expect(primaryRevenue({ USD: 100 }, "USD").others).toEqual([]);
    });

    it("hiç ciro yoksa 0 + boş others", () => {
        expect(primaryRevenue({}, "USD")).toEqual({ amount: 0, currency: "USD", others: [] });
    });
});
