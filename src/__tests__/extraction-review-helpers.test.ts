/**
 * Faz 3b — ExtractionReview pure helper tests + ClassifierQueue type guards.
 */
import { describe, it, expect } from "vitest";
import {
    formatMatchAction,
    getMatchActionColor,
    pickSuggestedAction,
    formatProductTypeName,
} from "@/lib/extraction-review-helpers";
import {
    isExtractionSupportedType,
    isMigrationExcelType,
} from "@/lib/classifier-helpers";

describe("formatMatchAction", () => {
    it("returns Turkish labels for all 5 actions", () => {
        expect(formatMatchAction("pending")).toMatch(/bekliyor/i);
        expect(formatMatchAction("matched")).toMatch(/eşle/i);
        expect(formatMatchAction("new_product")).toMatch(/yeni/i);
        expect(formatMatchAction("skipped")).toMatch(/atla/i);
        expect(formatMatchAction("reviewed")).toMatch(/onay/i);
    });
});

describe("getMatchActionColor", () => {
    it("matched/reviewed → success palette", () => {
        const m = getMatchActionColor("matched");
        expect(m.text).toBe("var(--success-text)");
        expect(getMatchActionColor("reviewed").text).toBe("var(--success-text)");
    });
    it("new_product → accent", () => {
        expect(getMatchActionColor("new_product").text).toBe("var(--accent-text)");
    });
    it("skipped → tertiary", () => {
        expect(getMatchActionColor("skipped").text).toBe("var(--text-tertiary)");
    });
    it("pending → warning", () => {
        expect(getMatchActionColor("pending").text).toBe("var(--warning-text)");
    });
});

describe("pickSuggestedAction", () => {
    it("null score → new_product", () => {
        expect(pickSuggestedAction(null)).toBe("new_product");
    });
    it(">=85 → matched", () => {
        expect(pickSuggestedAction(85)).toBe("matched");
        expect(pickSuggestedAction(100)).toBe("matched");
    });
    it("60-84 → pending (top-3 prompt)", () => {
        expect(pickSuggestedAction(60)).toBe("pending");
        expect(pickSuggestedAction(84)).toBe("pending");
    });
    it("<60 → new_product", () => {
        expect(pickSuggestedAction(59)).toBe("new_product");
    });
});

describe("formatProductTypeName (Review 3b 3.tur multi-type)", () => {
    const types = [
        { id: "type-vana", name: "Vana" },
        { id: "type-conta", name: "Conta" },
    ];

    it("null id → —", () => {
        expect(formatProductTypeName(null, types)).toBe("—");
    });

    it("known UUID → name", () => {
        expect(formatProductTypeName("type-vana", types)).toBe("Vana");
        expect(formatProductTypeName("type-conta", types)).toBe("Conta");
    });

    it("unknown UUID → —", () => {
        expect(formatProductTypeName("type-unknown", types)).toBe("—");
    });

    it("empty types list + any id → —", () => {
        expect(formatProductTypeName("type-vana", [])).toBe("—");
    });
});

describe("isExtractionSupportedType / isMigrationExcelType — ClassifierQueue", () => {
    it("product_catalog/datasheet supported", () => {
        expect(isExtractionSupportedType("product_catalog")).toBe(true);
        expect(isExtractionSupportedType("product_datasheet")).toBe(true);
    });
    it("certificate types supported", () => {
        expect(isExtractionSupportedType("material_certificate")).toBe(true);
        expect(isExtractionSupportedType("compliance_doc")).toBe(true);
        expect(isExtractionSupportedType("test_report")).toBe(true);
    });
    it("excludes msds/vendor/photo/unknown/migration_excel", () => {
        expect(isExtractionSupportedType("msds")).toBe(false);
        expect(isExtractionSupportedType("vendor_profile")).toBe(false);
        expect(isExtractionSupportedType("product_photo")).toBe(false);
        expect(isExtractionSupportedType("unknown")).toBe(false);
        expect(isExtractionSupportedType("migration_excel")).toBe(false);
    });
    it("isMigrationExcelType true ONLY for migration_excel", () => {
        expect(isMigrationExcelType("migration_excel")).toBe(true);
        expect(isMigrationExcelType("product_catalog")).toBe(false);
        expect(isMigrationExcelType("unknown")).toBe(false);
    });
});
