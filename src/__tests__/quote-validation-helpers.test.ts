/**
 * Teklif V7 — Faz 2 pure validasyon helper'ları.
 *
 * V7-A11 (qty pozitif tam sayı, create/edit), V4-A2+V4-A4 (send-time hard check),
 * V3-A1 (GTİP soft warn). "Gerçek ürün satırı" predicate'leri kuraldan kurala
 * değişir (plan: substantive tanımı) — bu testler her birini kilitler.
 */
import { describe, it, expect } from "vitest";
import {
    validateQuoteLineQuantities,
    validateQuoteForSend,
    findMissingHsLines,
    type QuoteLineForValidation,
} from "@/lib/quote-validation";

describe("validateQuoteLineQuantities (V7-A11)", () => {
    it("gerçek satır (product_id) küsüratlı qty → hata", () => {
        const err = validateQuoteLineQuantities([{ product_id: "p-1", quantity: 2.5, unit_price: 100 }]);
        expect(err).toMatch(/Satır 1.*pozitif tam sayı/i);
    });

    it("gerçek satır qty=0 → hata", () => {
        expect(validateQuoteLineQuantities([{ product_id: "p-1", quantity: 0, unit_price: 100 }])).toMatch(/pozitif tam sayı/i);
    });

    it("gerçek satır qty=3 → null (geçer)", () => {
        expect(validateQuoteLineQuantities([{ product_id: "p-1", quantity: 3, unit_price: 100 }])).toBeNull();
    });

    it("salt-açıklama satırı (product yok, fiyat yok) qty=0 → muaf (null)", () => {
        expect(validateQuoteLineQuantities([{ product_id: null, quantity: 0, unit_price: 0, hs_code: "" }])).toBeNull();
    });

    it("fiyatı>0 ama product yok, küsüratlı qty → hata (fiyat substantive yapar)", () => {
        expect(validateQuoteLineQuantities([{ product_id: null, quantity: 2.5, unit_price: 50 }])).toMatch(/pozitif tam sayı/i);
    });

    it("product_id var qty=1 → null", () => {
        expect(validateQuoteLineQuantities([{ product_id: "p-1", quantity: 1, unit_price: 0 }])).toBeNull();
    });

    it("hatalı satır indeksi 1-based döner (2. satır)", () => {
        const lines: QuoteLineForValidation[] = [
            { product_id: "p-1", quantity: 2, unit_price: 10 },
            { product_id: "p-2", quantity: 1.5, unit_price: 20 },
        ];
        expect(validateQuoteLineQuantities(lines)).toMatch(/Satır 2/);
    });

    it("boş liste → null", () => {
        expect(validateQuoteLineQuantities([])).toBeNull();
    });
});

describe("validateQuoteForSend (V4-A2 + V4-A4)", () => {
    it("customer_address boş → hata", () => {
        expect(validateQuoteForSend({ customer_address: "", lines: [] })).toMatch(/müşteri adresi/i);
    });

    it("customer_address null → hata", () => {
        expect(validateQuoteForSend({ customer_address: null, lines: [] })).toMatch(/müşteri adresi/i);
    });

    it("customer_address sadece boşluk → hata", () => {
        expect(validateQuoteForSend({ customer_address: "   ", lines: [] })).toMatch(/müşteri adresi/i);
    });

    it("adres dolu + boş satırlar → null", () => {
        expect(validateQuoteForSend({ customer_address: "İstanbul", lines: [] })).toBeNull();
    });

    it("substantive satır (fiyat>0) product_id null → hata", () => {
        const err = validateQuoteForSend({
            customer_address: "İstanbul",
            lines: [{ product_id: null, quantity: 0, unit_price: 100 }],
        });
        expect(err).toMatch(/Satır 1.*ürüne bağlı/i);
    });

    it("substantive satır (qty>0) product_id null → hata", () => {
        const err = validateQuoteForSend({
            customer_address: "İstanbul",
            lines: [{ product_id: null, quantity: 5, unit_price: 0 }],
        });
        expect(err).toMatch(/ürüne bağlı/i);
    });

    it("salt-açıklama satırı (qty 0, fiyat 0) product_id null → muaf (null)", () => {
        expect(validateQuoteForSend({
            customer_address: "İstanbul",
            lines: [{ product_id: null, quantity: 0, unit_price: 0 }],
        })).toBeNull();
    });

    it("adres dolu + tüm substantive satırlar ürüne bağlı → null", () => {
        expect(validateQuoteForSend({
            customer_address: "İstanbul",
            lines: [{ product_id: "p-1", quantity: 3, unit_price: 100 }],
        })).toBeNull();
    });
});

describe("findMissingHsLines (V3-A1)", () => {
    it("substantive satır + hs boş → 1-based indeks", () => {
        expect(findMissingHsLines([{ product_id: "p-1", unit_price: 100, quantity: 2, hs_code: "" }])).toEqual([1]);
    });

    it("hs dolu → boş dizi", () => {
        expect(findMissingHsLines([{ product_id: "p-1", unit_price: 100, quantity: 2, hs_code: "8481.80" }])).toEqual([]);
    });

    it("salt-açıklama satırı (substantive değil) hs boş → boş dizi", () => {
        expect(findMissingHsLines([{ product_id: null, unit_price: 0, quantity: 0, hs_code: "" }])).toEqual([]);
    });

    it("hs sadece boşluk → eksik sayılır", () => {
        expect(findMissingHsLines([{ product_id: "p-1", unit_price: 100, quantity: 1, hs_code: "   " }])).toEqual([1]);
    });

    it("karışık liste → yalnız eksik substantive indeksleri", () => {
        const lines: QuoteLineForValidation[] = [
            { product_id: "p-1", unit_price: 100, quantity: 1, hs_code: "8481.80" }, // dolu
            { product_id: "p-2", unit_price: 50, quantity: 2, hs_code: "" },          // eksik → 2
            { product_id: null, unit_price: 0, quantity: 0, hs_code: "" },            // muaf
        ];
        expect(findMissingHsLines(lines)).toEqual([2]);
    });
});
