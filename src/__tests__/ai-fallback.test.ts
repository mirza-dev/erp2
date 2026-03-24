/**
 * Tests for fallbackParseRow — Turkish column-name → ERP field mapping.
 * Used when AI is unavailable. Pure function, no mocks.
 *
 * NOTE: Documents a known latent bug: the FALLBACK_FIELD_MAP includes "ülke" as a key,
 * but the normalization regex `/[^a-z0-9_]/g` converts the Turkish `ü` to `_`,
 * producing `_lke` — which never matches "ülke". The working key is "ulke" (ASCII).
 */
import { describe, it, expect } from "vitest";
import { fallbackParseRow } from "@/lib/services/ai-service";

// ─── Customer mapping ────────────────────────────────────────────────────────

describe("fallbackParseRow — customer mapping", () => {
    it("maps firma_adi to name", () => {
        const { parsed_data } = fallbackParseRow({ firma_adi: "Acme Vana" }, "customer");
        expect(parsed_data.name).toBe("Acme Vana");
    });

    it("maps musteri_adi to name", () => {
        const { parsed_data } = fallbackParseRow({ musteri_adi: "Beta Corp" }, "customer");
        expect(parsed_data.name).toBe("Beta Corp");
    });

    it("maps email to email", () => {
        const { parsed_data } = fallbackParseRow({ email: "a@b.com" }, "customer");
        expect(parsed_data.email).toBe("a@b.com");
    });

    it("maps telefon to phone", () => {
        const { parsed_data } = fallbackParseRow({ telefon: "+90 555 0000" }, "customer");
        expect(parsed_data.phone).toBe("+90 555 0000");
    });

    it("maps ulke (ASCII) to country", () => {
        const { parsed_data } = fallbackParseRow({ ulke: "TR" }, "customer");
        expect(parsed_data.country).toBe("TR");
    });

    it("maps para_birimi to currency", () => {
        const { parsed_data } = fallbackParseRow({ para_birimi: "USD" }, "customer");
        expect(parsed_data.currency).toBe("USD");
    });

    it("maps vergi_no to tax_number", () => {
        const { parsed_data } = fallbackParseRow({ vergi_no: "1234567890" }, "customer");
        expect(parsed_data.tax_number).toBe("1234567890");
    });

    it("maps vergi_dairesi to tax_office", () => {
        const { parsed_data } = fallbackParseRow({ vergi_dairesi: "Kadikoy" }, "customer");
        expect(parsed_data.tax_office).toBe("Kadikoy");
    });

    it("maps adres to address", () => {
        const { parsed_data } = fallbackParseRow({ adres: "Istanbul" }, "customer");
        expect(parsed_data.address).toBe("Istanbul");
    });

    it("maps notlar to notes", () => {
        const { parsed_data } = fallbackParseRow({ notlar: "VIP musteri" }, "customer");
        expect(parsed_data.notes).toBe("VIP musteri");
    });
});

// ─── Product mapping ─────────────────────────────────────────────────────────

describe("fallbackParseRow — product mapping", () => {
    it("maps urun_kodu to sku", () => {
        const { parsed_data } = fallbackParseRow({ urun_kodu: "GV-050" }, "product");
        expect(parsed_data.sku).toBe("GV-050");
    });

    it("maps birim to unit", () => {
        const { parsed_data } = fallbackParseRow({ birim: "adet" }, "product");
        expect(parsed_data.unit).toBe("adet");
    });

    it("maps olcu_birimi to unit", () => {
        const { parsed_data } = fallbackParseRow({ olcu_birimi: "Set" }, "product");
        expect(parsed_data.unit).toBe("Set");
    });

    it("maps fiyat to price and converts string to number", () => {
        const { parsed_data } = fallbackParseRow({ fiyat: "250" }, "product");
        expect(parsed_data.price).toBe(250);
    });

    it("maps liste_fiyati_usd to price and converts to number", () => {
        const { parsed_data } = fallbackParseRow({ liste_fiyati_usd: "278.48" }, "product");
        expect(parsed_data.price).toBe(278.48);
    });

    it("maps guvenlik_stogu to min_stock_level and converts to number", () => {
        const { parsed_data } = fallbackParseRow({ guvenlik_stogu: "10" }, "product");
        expect(parsed_data.min_stock_level).toBe(10);
    });

    it("maps kategori to category as string (not converted to number)", () => {
        const { parsed_data } = fallbackParseRow({ kategori: "Vana" }, "product");
        expect(parsed_data.category).toBe("Vana");
    });
});

// ─── Order mapping ───────────────────────────────────────────────────────────

describe("fallbackParseRow — order mapping", () => {
    it("maps musteri_adi to customer_name", () => {
        const { parsed_data } = fallbackParseRow({ musteri_adi: "Acme Vana" }, "order");
        expect(parsed_data.customer_name).toBe("Acme Vana");
    });

    it("maps musteri_kodu to customer_name", () => {
        const { parsed_data } = fallbackParseRow({ musteri_kodu: "MUS-001" }, "order");
        expect(parsed_data.customer_name).toBe("MUS-001");
    });

    it("maps toplam_tutar to grand_total and converts to number", () => {
        const { parsed_data } = fallbackParseRow({ toplam_tutar: "12000" }, "order");
        expect(parsed_data.grand_total).toBe(12000);
    });

    it("maps toplam_tutar_usd to grand_total and converts to number", () => {
        const { parsed_data } = fallbackParseRow({ toplam_tutar_usd: "59386.89" }, "order");
        expect(parsed_data.grand_total).toBe(59386.89);
    });

    it("maps para_birimi to currency", () => {
        const { parsed_data } = fallbackParseRow({ para_birimi: "EUR" }, "order");
        expect(parsed_data.currency).toBe("EUR");
    });
});

// ─── Unmatched tracking ──────────────────────────────────────────────────────

describe("fallbackParseRow — unmatched tracking", () => {
    it("places unrecognized columns in unmatched_fields", () => {
        const { unmatched_fields } = fallbackParseRow({ xyz_column: "value", unknown_field: "abc" }, "customer");
        expect(unmatched_fields).toContain("xyz_column");
        expect(unmatched_fields).toContain("unknown_field");
    });

    it("returns empty unmatched_fields when all columns map successfully", () => {
        const { unmatched_fields } = fallbackParseRow({ firma_adi: "Acme", email: "a@b.com" }, "customer");
        expect(unmatched_fields).toEqual([]);
    });

    it("unknown entity_type sends all columns to unmatched_fields", () => {
        const { parsed_data, unmatched_fields } = fallbackParseRow({ firma_adi: "Acme", birim: "adet" }, "unknown_type");
        expect(Object.keys(parsed_data)).toHaveLength(0);
        expect(unmatched_fields).toContain("firma_adi");
        expect(unmatched_fields).toContain("birim");
    });

    it("every input column appears in either parsed_data keys or unmatched_fields", () => {
        const row = { firma_adi: "Acme", xyz_col: "val", email: "a@b.com", random_key: "x" };
        const { unmatched_fields } = fallbackParseRow(row, "customer");
        // Each unrecognized column must appear in unmatched_fields — no column silently disappears
        for (const col of Object.keys(row)) {
            if (!["firma_adi", "email"].includes(col)) {
                expect(unmatched_fields.includes(col)).toBe(true);
            }
        }
    });
});

// ─── Normalization edge cases ────────────────────────────────────────────────

describe("fallbackParseRow — normalization edge cases", () => {
    it("FIRMA_ADI (uppercase) normalizes to firma_adi and maps to name", () => {
        const { parsed_data } = fallbackParseRow({ FIRMA_ADI: "Acme" }, "customer");
        expect(parsed_data.name).toBe("Acme");
    });

    it("does not convert empty string to a number for numeric fields", () => {
        const { parsed_data } = fallbackParseRow({ fiyat: "" }, "product");
        // NaN check: empty string results in NaN from Number(""), so should remain as-is or not be stored
        // The implementation: Number("") === 0 but "" === "" so isNaN check catches it
        // Actually: Number("") is 0 which is not NaN — but value.trim() === "" check prevents conversion
        expect(parsed_data.price).toBe("");
    });

    it("maps Urun_Kodu (mixed case with underscore) to sku", () => {
        const { parsed_data } = fallbackParseRow({ Urun_Kodu: "GV-050" }, "product");
        expect(parsed_data.sku).toBe("GV-050");
    });

    // Documents the known latent bug: ülke (with Turkish ü) does NOT map via normalization
    // because regex converts ü → _ giving _lke which doesn't match "ulke" or "ülke" in the map.
    // The working key is "ulke" (ASCII-only). See FALLBACK_FIELD_MAP in ai-service.ts.
    it("BUG: ülke with Turkish ü does not map to country via normalization (dead code key)", () => {
        const { parsed_data, unmatched_fields } = fallbackParseRow({ ülke: "DE" }, "customer");
        // ülke → toLowerCase → ülke → regex replaces ü → _ → _lke → no match
        expect(parsed_data.country).toBeUndefined();
        expect(unmatched_fields).toContain("ülke");
    });

    it("ulke (ASCII, no diacritic) maps correctly to country", () => {
        const { parsed_data } = fallbackParseRow({ ulke: "DE" }, "customer");
        expect(parsed_data.country).toBe("DE");
    });
});
