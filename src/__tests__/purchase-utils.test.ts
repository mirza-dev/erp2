import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/purchase-utils";
import type { OrderTotalsItem } from "@/lib/purchase-utils";

const item = (overrides: Partial<OrderTotalsItem> & { id: string; suggestQty: number }): OrderTotalsItem => ({
    costPrice: null,
    price: null,
    currency: "TRY",
    ...overrides,
});

describe("computeOrderTotals", () => {
    it("returns zeros and empty map for empty input", () => {
        const r = computeOrderTotals([]);
        expect(r.primaryTotal).toBe(0);
        expect(r.primaryAccepted).toBe(0);
        expect(r.missingPriceCount).toBe(0);
        expect(r.currencyEntries).toHaveLength(0);
        expect(r.isSingleCurrency).toBe(true);
        expect(r.primaryCurrency).toBe("TRY");
    });

    it("counts item with no price as missing and excludes from total", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 10, costPrice: null, price: null }),
        ]);
        expect(r.missingPriceCount).toBe(1);
        expect(r.primaryTotal).toBe(0);
        expect(r.currencyEntries).toHaveLength(0);
    });

    it("uses costPrice over price when both present", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 5, costPrice: 10, price: 99, currency: "TRY" }),
        ]);
        expect(r.primaryTotal).toBe(50);
    });

    it("falls back to price when costPrice is null", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 3, costPrice: null, price: 20, currency: "TRY" }),
        ]);
        expect(r.primaryTotal).toBe(60);
    });

    it("uses editedQty for 'edited' decisions", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 10, costPrice: 5, currency: "TRY", decidedStatus: "edited", decidedQty: 2 }),
        ]);
        expect(r.primaryTotal).toBe(10); // 2 * 5
    });

    it("uses suggestQty when decidedQty is absent even if status is edited", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 4, costPrice: 5, currency: "TRY", decidedStatus: "edited", decidedQty: undefined }),
        ]);
        expect(r.primaryTotal).toBe(20); // 4 * 5
    });

    it("accumulates accepted totals separately", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 10, costPrice: 2, currency: "TRY", decidedStatus: "accepted" }),
            item({ id: "p2", suggestQty: 5, costPrice: 4, currency: "TRY" }),
        ]);
        expect(r.primaryTotal).toBe(40); // 20 + 20
        expect(r.primaryAccepted).toBe(20); // only p1
    });

    it("groups by currency and sorts TRY first", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 1, costPrice: 100, currency: "USD" }),
            item({ id: "p2", suggestQty: 1, costPrice: 200, currency: "TRY" }),
            item({ id: "p3", suggestQty: 1, costPrice: 50, currency: "EUR" }),
        ]);
        expect(r.isSingleCurrency).toBe(false);
        expect(r.currencyEntries[0][0]).toBe("TRY");
        expect(r.primaryCurrency).toBe("TRY");
        expect(r.primaryTotal).toBe(200);
        expect(r.currencyEntries).toHaveLength(3);
    });

    it("marks isSingleCurrency true when all products share one currency", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 2, costPrice: 10, currency: "USD" }),
            item({ id: "p2", suggestQty: 3, costPrice: 20, currency: "USD" }),
        ]);
        expect(r.isSingleCurrency).toBe(true);
        expect(r.primaryCurrency).toBe("USD");
        expect(r.primaryTotal).toBe(80); // 20 + 60
    });

    it("defaults currency to TRY when currency field is empty string", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 1, costPrice: 50, currency: "" }),
        ]);
        expect(r.primaryCurrency).toBe("TRY");
        expect(r.primaryTotal).toBe(50);
    });

    it("mixes missing-price and priced items correctly", () => {
        const r = computeOrderTotals([
            item({ id: "p1", suggestQty: 5, costPrice: null, price: null }),
            item({ id: "p2", suggestQty: 2, costPrice: 10, currency: "TRY" }),
        ]);
        expect(r.missingPriceCount).toBe(1);
        expect(r.primaryTotal).toBe(20);
    });
});
