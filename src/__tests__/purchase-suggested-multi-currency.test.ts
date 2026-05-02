/**
 * G4 (bulgular) — purchase-suggested-multi-currency
 *
 * computeOrderTotals'ın çok-para birimi senaryolarını kapsar.
 * Tek currency, TRY+USD karışık, accepted toplam ve üç currency sıralama.
 */
import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/purchase-utils";

describe("computeOrderTotals — multi-currency", () => {
    it("sadece USD → primaryCurrency USD, isSingleCurrency: true", () => {
        const r = computeOrderTotals([
            { id: "p1", costPrice: 100, price: null, currency: "USD", suggestQty: 3 },
            { id: "p2", costPrice: 50, price: null, currency: "USD", suggestQty: 2 },
        ]);
        expect(r.primaryCurrency).toBe("USD");
        expect(r.isSingleCurrency).toBe(true);
        expect(r.primaryTotal).toBe(400); // 100×3 + 50×2
    });

    it("TRY + USD → isSingleCurrency: false, TRY önde", () => {
        const r = computeOrderTotals([
            { id: "p1", costPrice: 200, price: null, currency: "TRY", suggestQty: 5 },
            { id: "p2", costPrice: 10, price: null, currency: "USD", suggestQty: 2 },
        ]);
        expect(r.isSingleCurrency).toBe(false);
        expect(r.currencyEntries).toHaveLength(2);
        expect(r.currencyEntries[0][0]).toBe("TRY");
        expect(r.currencyEntries[1][0]).toBe("USD");
        expect(r.primaryCurrency).toBe("TRY");
        expect(r.primaryTotal).toBe(1000); // 200×5
    });

    it("birden fazla TRY ürünü → toplamı doğru biriktirir", () => {
        const r = computeOrderTotals([
            { id: "p1", costPrice: 100, price: null, currency: "TRY", suggestQty: 10 },
            { id: "p2", costPrice: 250, price: null, currency: "TRY", suggestQty: 4 },
        ]);
        expect(r.primaryCurrency).toBe("TRY");
        expect(r.primaryTotal).toBe(2000); // 1000 + 1000
        expect(r.isSingleCurrency).toBe(true);
    });

    it("accepted karar verilen → primaryAccepted doğru", () => {
        const r = computeOrderTotals([
            { id: "p1", costPrice: 100, price: null, currency: "TRY", suggestQty: 5, decidedStatus: "accepted" },
            { id: "p2", costPrice: 80, price: null, currency: "TRY", suggestQty: 3 },
        ]);
        expect(r.primaryAccepted).toBe(500); // sadece p1 kabul
        expect(r.primaryTotal).toBe(740);    // 500 + 240
    });

    it("edited karar → decidedQty kullanılır, total güncellenir", () => {
        const r = computeOrderTotals([
            { id: "p1", costPrice: 50, price: null, currency: "TRY", suggestQty: 10, decidedStatus: "edited", decidedQty: 6 },
        ]);
        expect(r.primaryTotal).toBe(300); // 50 × 6 (editedQty)
    });

    it("üç currency → TRY önde, geri kalan alfabetik", () => {
        const r = computeOrderTotals([
            { id: "p1", costPrice: 100, price: null, currency: "EUR", suggestQty: 1 },
            { id: "p2", costPrice: 100, price: null, currency: "USD", suggestQty: 1 },
            { id: "p3", costPrice: 100, price: null, currency: "TRY", suggestQty: 1 },
        ]);
        expect(r.currencyEntries[0][0]).toBe("TRY");
        expect(r.currencyEntries[1][0]).toBe("EUR");
        expect(r.currencyEntries[2][0]).toBe("USD");
        expect(r.isSingleCurrency).toBe(false);
    });

    it("fiyatsız ürün karışık currency listede → sadece fiyatlılar toplama girer", () => {
        const r = computeOrderTotals([
            { id: "p1", costPrice: 100, price: null, currency: "TRY", suggestQty: 2 },
            { id: "p2", costPrice: null, price: null, currency: "USD", suggestQty: 5 },
        ]);
        expect(r.missingPriceCount).toBe(1);
        expect(r.isSingleCurrency).toBe(true); // sadece TRY'li ürün fiyatlı
        expect(r.primaryCurrency).toBe("TRY");
        expect(r.primaryTotal).toBe(200);
    });
});
