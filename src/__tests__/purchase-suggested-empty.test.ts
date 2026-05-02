/**
 * Sprint C bulgular 2. tur — computeOrderTotals sınır durumları.
 *
 * Boş dizi, tümü fiyatsız ve tek ürün senaryolarını kapsar.
 */
import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/purchase-utils";

describe("computeOrderTotals — sınır durumları", () => {
    it("boş dizi → sıfır totaller, isSingleCurrency: true", () => {
        const r = computeOrderTotals([]);
        expect(r.missingPriceCount).toBe(0);
        expect(r.currencyEntries).toHaveLength(0);
        expect(r.isSingleCurrency).toBe(true);
        expect(r.primaryTotal).toBe(0);
        expect(r.primaryAccepted).toBe(0);
        expect(r.primaryCurrency).toBe("TRY");
    });

    it("tüm ürünlerde fiyat eksik → missingPriceCount = n, total = 0", () => {
        const n = 5;
        const items = Array.from({ length: n }, (_, i) => ({
            id: `p${i}`,
            costPrice: null,
            price: null,
            currency: "TRY",
            suggestQty: 10,
        }));
        const r = computeOrderTotals(items);
        expect(r.missingPriceCount).toBe(n);
        expect(r.primaryTotal).toBe(0);
        expect(r.currencyEntries).toHaveLength(0);
    });

    it("tek ürün, fiyat var → doğru toplam", () => {
        const r = computeOrderTotals([{
            id: "p1", costPrice: null, price: 250, currency: "TRY", suggestQty: 4,
        }]);
        expect(r.missingPriceCount).toBe(0);
        expect(r.primaryTotal).toBe(1000); // 250 × 4
        expect(r.isSingleCurrency).toBe(true);
        expect(r.primaryCurrency).toBe("TRY");
    });

    it("tek ürün, currency USD → primaryCurrency = USD", () => {
        const r = computeOrderTotals([{
            id: "p1", costPrice: 10, price: null, currency: "USD", suggestQty: 3,
        }]);
        expect(r.primaryCurrency).toBe("USD");
        expect(r.primaryTotal).toBe(30);
    });

    it("TRY + USD karışık → isSingleCurrency: false, TRY önde", () => {
        const r = computeOrderTotals([
            { id: "p1", costPrice: 100, price: null, currency: "TRY", suggestQty: 2 },
            { id: "p2", costPrice: 10, price: null, currency: "USD", suggestQty: 5 },
        ]);
        expect(r.isSingleCurrency).toBe(false);
        expect(r.currencyEntries[0][0]).toBe("TRY");
        expect(r.currencyEntries[1][0]).toBe("USD");
        expect(r.primaryTotal).toBe(200); // TRY: 100 × 2
    });

    it("missingPriceCount: 0, accepted: 0 başlangıç değerleri korunur", () => {
        const r = computeOrderTotals([{
            id: "p1", costPrice: 50, price: null, currency: "TRY", suggestQty: 1,
        }]);
        expect(r.missingPriceCount).toBe(0);
        expect(r.primaryAccepted).toBe(0); // karar verilmemişse accepted = 0
    });
});
