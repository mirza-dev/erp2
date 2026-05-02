/**
 * Sprint C bulgular 2. tur — Fix 1 doğrulaması: NULL fiyat sıfıra düşmüyor.
 *
 * Fix 1: page.tsx'te `p.price ?? null` → `p.price || null` değişikliği sayesinde
 * DB'den gelen price:null, api-mapper'ın ürettiği price:0'a dönüşse bile
 * computeOrderTotals'a null olarak ulaşır ve missingPriceCount'u artırır.
 *
 * Bu dosya computeOrderTotals'ın null input'larını doğru işlediğini doğrular —
 * Fix 1 sonrasında page'in gönderdiği değerler.
 */
import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/purchase-utils";

function item(overrides: {
    id?: string;
    costPrice?: number | null;
    price?: number | null;
    currency?: string;
    suggestQty?: number;
    decidedStatus?: string;
    decidedQty?: number;
}) {
    return {
        id: "p1",
        costPrice: null,
        price: null,
        currency: "TRY",
        suggestQty: 10,
        ...overrides,
    };
}

describe("computeOrderTotals — Fix 1: fiyat eksikliği doğru sayılır", () => {
    it("price: null, costPrice: null → missingPriceCount artar, total'a dahil olmaz", () => {
        const r = computeOrderTotals([item({ price: null, costPrice: null })]);
        expect(r.missingPriceCount).toBe(1);
        expect(r.primaryTotal).toBe(0);
        expect(r.currencyEntries).toHaveLength(0);
    });

    it("2 eksik fiyatlı ürün → missingPriceCount = 2", () => {
        const r = computeOrderTotals([
            item({ id: "p1", price: null, costPrice: null }),
            item({ id: "p2", price: null, costPrice: null }),
        ]);
        expect(r.missingPriceCount).toBe(2);
        expect(r.primaryTotal).toBe(0);
    });

    it("costPrice: 150, price: null → costPrice kullanılır, missingPriceCount = 0", () => {
        const r = computeOrderTotals([item({ costPrice: 150, price: null, suggestQty: 5 })]);
        expect(r.missingPriceCount).toBe(0);
        expect(r.primaryTotal).toBe(750); // 150 × 5
    });

    it("costPrice: null, price: 200 → price kullanılır", () => {
        const r = computeOrderTotals([item({ costPrice: null, price: 200, suggestQty: 3 })]);
        expect(r.missingPriceCount).toBe(0);
        expect(r.primaryTotal).toBe(600); // 200 × 3
    });

    it("costPrice: 120, price: 200 → costPrice öncelikli", () => {
        const r = computeOrderTotals([item({ costPrice: 120, price: 200, suggestQty: 4 })]);
        expect(r.primaryTotal).toBe(480); // 120 × 4, price görmezden gelindi
        expect(r.missingPriceCount).toBe(0);
    });

    it("edited kararı → decidedQty kullanılır, suggestQty değil", () => {
        const r = computeOrderTotals([
            item({ costPrice: 100, suggestQty: 10, decidedStatus: "edited", decidedQty: 25 }),
        ]);
        expect(r.primaryTotal).toBe(2500); // 100 × 25
    });

    it("accepted kararı → primaryAccepted total'a eşit", () => {
        const r = computeOrderTotals([
            item({ costPrice: 80, suggestQty: 7, decidedStatus: "accepted" }),
        ]);
        expect(r.primaryTotal).toBe(560);    // 80 × 7
        expect(r.primaryAccepted).toBe(560);
    });

    it("fiyatlı + fiyatsız karışık → doğru sayaç ve total", () => {
        const r = computeOrderTotals([
            item({ id: "p1", costPrice: 100, suggestQty: 2 }),  // 200
            item({ id: "p2", costPrice: null, price: null }),    // missing
            item({ id: "p3", price: 50, suggestQty: 4 }),       // 200
        ]);
        expect(r.missingPriceCount).toBe(1);
        expect(r.primaryTotal).toBe(400); // 200 + 200
    });
});
