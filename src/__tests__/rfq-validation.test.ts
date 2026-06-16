import { describe, it, expect } from "vitest";
import {
    isValidRfqCurrency,
    validateRfqLines,
    validateRfqVendorIds,
    validateVendorPrices,
    validateRfqAwards,
} from "@/lib/rfq-validation";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("rfq-validation — para birimi", () => {
    it("TRY/USD/EUR geçerli, diğerleri değil", () => {
        expect(isValidRfqCurrency("TRY")).toBe(true);
        expect(isValidRfqCurrency("USD")).toBe(true);
        expect(isValidRfqCurrency("GBP")).toBe(false);
        expect(isValidRfqCurrency(null)).toBe(false);
    });
});

describe("rfq-validation — kalemler", () => {
    it("geçerli kalem listesi null döner", () => {
        expect(validateRfqLines([{ product_id: UUID_A, quantity: 5 }])).toBeNull();
    });
    it("boş liste reddedilir", () => {
        expect(validateRfqLines([])).toMatch(/en az 1 kalem/i);
    });
    it("geçersiz product_id reddedilir", () => {
        expect(validateRfqLines([{ product_id: "yok", quantity: 1 }])).toMatch(/ürün/i);
    });
    it("miktar pozitif tam sayı olmalı", () => {
        expect(validateRfqLines([{ product_id: UUID_A, quantity: 0 }])).toMatch(/pozitif tam sayı/i);
        expect(validateRfqLines([{ product_id: UUID_A, quantity: 1.5 }])).toMatch(/pozitif tam sayı/i);
        expect(validateRfqLines([{ product_id: UUID_A, quantity: "" }])).toMatch(/zorunlu/i);
    });
});

describe("rfq-validation — tedarikçi id'leri", () => {
    it("≥1 UUID gerekli", () => {
        expect(validateRfqVendorIds([UUID_A, UUID_B])).toBeNull();
        expect(validateRfqVendorIds([])).toMatch(/en az 1 tedarikçi/i);
        expect(validateRfqVendorIds(["x"])).toMatch(/UUID/i);
    });
});

describe("rfq-validation — tedarikçi fiyatları", () => {
    it("boş unit_price = teklif yok, kabul edilir", () => {
        expect(validateVendorPrices([{ rfq_line_id: UUID_A, unit_price: "" }])).toBeNull();
        expect(validateVendorPrices([{ rfq_line_id: UUID_A, unit_price: 12.5 }])).toBeNull();
    });
    it("negatif fiyat reddedilir", () => {
        expect(validateVendorPrices([{ rfq_line_id: UUID_A, unit_price: -1 }])).toMatch(/negatif/i);
    });
    it("geçersiz lead_time reddedilir", () => {
        expect(validateVendorPrices([{ rfq_line_id: UUID_A, lead_time_days: -3 }])).toMatch(/lead_time_days/i);
    });
});

describe("rfq-validation — karar (award)", () => {
    it("geçerli award (yalnız id'ler) null döner", () => {
        expect(validateRfqAwards([{ rfq_line_id: UUID_A, vendor_id: UUID_B }])).toBeNull();
    });
    it("boş liste reddedilir", () => {
        expect(validateRfqAwards([])).toMatch(/en az 1 kazanan/i);
    });
    it("rfq_line_id / vendor_id UUID olmalı", () => {
        expect(validateRfqAwards([{ rfq_line_id: "yok", vendor_id: UUID_B }])).toMatch(/rfq_line_id/i);
        expect(validateRfqAwards([{ rfq_line_id: UUID_A, vendor_id: "yok" }])).toMatch(/vendor_id/i);
    });
    it("quantity/unit_price DOĞRULANMAZ (mig.103 sunucu-otoriter) — gönderilse de yok sayılır", () => {
        // Eski sözleşmede reddedilen değerler artık award'ı bloklamaz (sunucu türetir).
        expect(validateRfqAwards([{ rfq_line_id: UUID_A, vendor_id: UUID_B, quantity: 0, unit_price: -5 }])).toBeNull();
        expect(validateRfqAwards([{ rfq_line_id: UUID_A, vendor_id: UUID_B }])).toBeNull();
    });
});
