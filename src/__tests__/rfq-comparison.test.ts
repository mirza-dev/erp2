import { describe, it, expect } from "vitest";
import { toBase, bestCellForLine, bestVendorPerLine, type RateMap } from "@/lib/rfq-comparison";

const RATES: RateMap = { TRY: 1, USD: 34, EUR: 37 };

describe("rfq-comparison — toBase", () => {
    it("baz para birimine çevirir", () => {
        expect(toBase(10, "USD", RATES)).toBe(340);
        expect(toBase(100, "TRY", RATES)).toBe(100);
    });
    it("bilinmeyen kur → çeviri yok (1)", () => {
        expect(toBase(10, "GBP", RATES)).toBe(10);
    });
});

describe("rfq-comparison — bestCellForLine", () => {
    it("baz çevrili en ucuzu seçer (cross-currency)", () => {
        // 300 TRY vs 10 USD(=340 TRY) → TRY kazanır
        const best = bestCellForLine([
            { vendorId: "a", unitPrice: 300, currency: "TRY" },
            { vendorId: "b", unitPrice: 10, currency: "USD" },
        ], RATES);
        expect(best?.vendorId).toBe("a");
        expect(best?.converted).toBe(300);
    });
    it("null fiyat (teklif yok) atlanır", () => {
        const best = bestCellForLine([
            { vendorId: "a", unitPrice: null, currency: "TRY" },
            { vendorId: "b", unitPrice: 50, currency: "TRY" },
        ], RATES);
        expect(best?.vendorId).toBe("b");
    });
    it("hiç fiyat yoksa null", () => {
        expect(bestCellForLine([{ vendorId: "a", unitPrice: null, currency: "TRY" }], RATES)).toBeNull();
    });
    it("eşitlikte ilk gelen kazanır (deterministik)", () => {
        const best = bestCellForLine([
            { vendorId: "a", unitPrice: 100, currency: "TRY" },
            { vendorId: "b", unitPrice: 100, currency: "TRY" },
        ], RATES);
        expect(best?.vendorId).toBe("a");
    });
});

describe("rfq-comparison — bestVendorPerLine", () => {
    it("satır başına en iyi tedarikçiyi haritalar; fiyatsız satır haritada yok", () => {
        const map = bestVendorPerLine([
            { rfqLineId: "L1", cells: [{ vendorId: "a", unitPrice: 5, currency: "USD" }, { vendorId: "b", unitPrice: 180, currency: "TRY" }] },
            { rfqLineId: "L2", cells: [{ vendorId: "a", unitPrice: null, currency: "USD" }, { vendorId: "b", unitPrice: null, currency: "TRY" }] },
        ], RATES);
        // L1: 5 USD=170 TRY vs 180 TRY → a kazanır
        expect(map.get("L1")?.vendorId).toBe("a");
        expect(map.has("L2")).toBe(false);
    });
});
