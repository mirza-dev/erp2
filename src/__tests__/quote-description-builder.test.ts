/**
 * Faz 4b (2026-05-25) — Auto-build description helper davranış matrisi.
 *
 * Plan §484: `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM`
 * Multi-type uyum (project_pmt_multi_type): Vana-merkezli şablon non-Vana
 * ürünlerde graceful degrade etmeli (yalnız name).
 */
import { describe, it, expect } from "vitest";
import {
    QUOTE_DESCRIPTION_TEMPLATE,
    buildQuoteLineDescription,
} from "@/lib/quote-description-builder";
import type { Product } from "@/lib/mock-data";

function makeProduct(overrides: Partial<Product>): Product {
    return {
        id: "p1",
        name: "",
        sku: "SKU-1",
        category: "valves",
        unit: "ADET",
        price: 100,
        currency: "USD",
        on_hand: 0,
        reserved: 0,
        available_now: 0,
        quoted: 0,
        promisable: 0,
        incoming: 0,
        forecasted: 0,
        minStockLevel: 0,
        isActive: true,
        productType: "commercial",
        warehouse: "main",
        ...overrides,
    };
}

describe("buildQuoteLineDescription — Faz 4b auto-build", () => {
    it("şablon constant'ı dokümantasyon ile aynı (plan §486)", () => {
        expect(QUOTE_DESCRIPTION_TEMPLATE).toBe(
            "{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM",
        );
    });

    it("Vana tüm field'lar dolu → plan örneği formatında çıkış", () => {
        const p = makeProduct({
            name: "GATE VALVE",
            productTypeId: "00000000-0000-4000-8000-000000000001",
            attributes: {
                body_material:  "A105 GÖVDE",
                pn_class:       "CLASS 600",
                end_connection: "SW",
                trim_material:  "SS",
            },
        });
        expect(buildQuoteLineDescription(p)).toBe("GATE VALVE A105 GÖVDE CLASS 600 SW, SS TRİM");
    });

    it("trim_material boş → trailing 'TRİM' tamamen düşer (anlamsız etiket kalmaz)", () => {
        const p = makeProduct({
            name: "BALL VALVE",
            attributes: {
                body_material:  "WCB",
                pn_class:       "PN16",
                end_connection: "Flanşlı",
                trim_material:  "",
            },
        });
        const out = buildQuoteLineDescription(p);
        expect(out).toBe("BALL VALVE WCB PN16 Flanşlı");
        expect(out).not.toMatch(/TRİM/);
    });

    it("body_material boş → çift boşluk collapse olur (sürpriz aralık kalmaz)", () => {
        const p = makeProduct({
            name: "GLOBE VALVE",
            attributes: {
                body_material:  "",
                pn_class:       "PN40",
                end_connection: "NPT",
                trim_material:  "STELLITE",
            },
        });
        expect(buildQuoteLineDescription(p)).toBe("GLOBE VALVE PN40 NPT, STELLITE TRİM");
    });

    it("Conta (Vana key'leri yok) → sadece name (multi-type graceful degrade)", () => {
        const p = makeProduct({
            name: "SPIRAL WOUND GASKET DN50",
            productTypeId: "00000000-0000-4000-8000-000000000002",
            attributes: {
                inner_id_mm:  50,
                outer_id_mm:  90,
                thickness_mm: 3,
                style:        "Spiral Wound",
            },
        });
        expect(buildQuoteLineDescription(p)).toBe("SPIRAL WOUND GASKET DN50");
    });

    it("attributes undefined → sadece name", () => {
        const p = makeProduct({ name: "FLANGE WN", attributes: undefined });
        expect(buildQuoteLineDescription(p)).toBe("FLANGE WN");
    });

    it("attributes null → sadece name (defensive runtime null)", () => {
        const p = makeProduct({
            name: "FITTING ELBOW 90",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            attributes: null as any,
        });
        expect(buildQuoteLineDescription(p)).toBe("FITTING ELBOW 90");
    });

    it("name boş + attrs dolu → attrs çıktısı (name placeholder düşer)", () => {
        const p = makeProduct({
            name: "",
            attributes: {
                body_material:  "CF8M",
                pn_class:       "PN25",
                end_connection: "Flanşlı",
                trim_material:  "13Cr",
            },
        });
        expect(buildQuoteLineDescription(p)).toBe("CF8M PN25 Flanşlı, 13Cr TRİM");
    });

    it("name + attrs hepsi boş → tamamen empty string", () => {
        const p = makeProduct({ name: "", attributes: {} });
        expect(buildQuoteLineDescription(p)).toBe("");
    });

    it("pn_class number ise string'e çevrilir (defensive type)", () => {
        const p = makeProduct({
            name: "VALVE",
            attributes: {
                body_material:  "A216",
                pn_class:       150, // number — bazı tipler integer tutabilir
                end_connection: "BW",
                trim_material:  "Inconel",
            },
        });
        expect(buildQuoteLineDescription(p)).toBe("VALVE A216 150 BW, Inconel TRİM");
    });

    it("trim_material yalnız whitespace → TRİM düşer (trim() sonrası boş)", () => {
        const p = makeProduct({
            name: "CHECK VALVE",
            attributes: {
                body_material:  "WCB",
                pn_class:       "300LB",
                end_connection: "Flanşlı",
                trim_material:  "   ",
            },
        });
        const out = buildQuoteLineDescription(p);
        expect(out).toBe("CHECK VALVE WCB 300LB Flanşlı");
        expect(out).not.toMatch(/TRİM/);
    });

    it("non-string attribute (array) → boş muamelesi (şablona uymayan tip)", () => {
        const p = makeProduct({
            name: "BUTTERFLY",
            attributes: {
                body_material:  "DUCTILE",
                pn_class:       "PN10",
                end_connection: "Wafer",
                // multiselect alanı yanlışlıkla burada görünürse array
                trim_material:  ["EPDM", "NBR"],
            },
        });
        const out = buildQuoteLineDescription(p);
        expect(out).toBe("BUTTERFLY DUCTILE PN10 Wafer");
        expect(out).not.toMatch(/TRİM/);
    });

    it("name etrafında fazla boşluk → tek boşluğa normalize edilir", () => {
        const p = makeProduct({
            name: "  GATE  VALVE  ",
            attributes: {
                body_material:  "A105",
                pn_class:       "600LB",
                end_connection: "SW",
                trim_material:  "SS",
            },
        });
        const out = buildQuoteLineDescription(p);
        expect(out).toBe("GATE VALVE A105 600LB SW, SS TRİM");
        expect(out).not.toMatch(/  /);
    });
});
