/**
 * Faz 2c — Teknik sekmesi dinamik alan rendering + tip seçici + attributes JSONB.
 * P3-003 — getMissingRequiredAttributes: handleSave zorunlu alan validasyonu.
 *
 * Coverage:
 *   - computeLostAttributeKeys pure helper
 *   - formatAttributeValue pure helper (display formatting per field type)
 *   - getMissingRequiredAttributes pure helper
 *   - Source-regex regression locks: type selector, dynamic Teknik render,
 *     PATCH body includes product_type_id + attributes, confirm modal,
 *     handleSave required validation
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
    computeLostAttributeKeys,
    formatAttributeValue,
    getMissingRequiredAttributes,
} from "@/app/dashboard/products/[id]/page";
import type { ProductTypeFieldRow } from "@/lib/database.types";

const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/products/[id]/page.tsx"),
    "utf8",
);

function makeField(overrides: Partial<ProductTypeFieldRow> = {}): ProductTypeFieldRow {
    return {
        id: "f-1",
        product_type_id: "t-1",
        field_key: "dn",
        label_tr: "DN",
        label_en: "DN",
        field_type: "number",
        unit: "mm",
        options: null,
        required: false,
        placeholder: null,
        help_text: null,
        sort_order: 0,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
        ...overrides,
    };
}

// ── Pure helper: computeLostAttributeKeys ─────────────────────────────────────

describe("computeLostAttributeKeys", () => {
    it("returns empty when all current keys are present in new fields", () => {
        const result = computeLostAttributeKeys(
            { dn: 50, pn_class: "600LB" },
            [makeField({ field_key: "dn" }), makeField({ field_key: "pn_class" })],
        );
        expect(result).toEqual([]);
    });

    it("returns keys that exist in attributes but not in new fields", () => {
        const result = computeLostAttributeKeys(
            { dn: 50, valve_type: "ball", trim: "stellite" },
            [makeField({ field_key: "dn" })],
        );
        expect(result.sort()).toEqual(["trim", "valve_type"]);
    });

    it("returns all keys when new fields list is empty", () => {
        const result = computeLostAttributeKeys(
            { dn: 50, pn_class: "600LB" },
            [],
        );
        expect(result.sort()).toEqual(["dn", "pn_class"]);
    });

    it("returns empty when current attributes is empty", () => {
        const result = computeLostAttributeKeys(
            {},
            [makeField({ field_key: "dn" })],
        );
        expect(result).toEqual([]);
    });
});

// ── Pure helper: formatAttributeValue ─────────────────────────────────────────

describe("formatAttributeValue", () => {
    it("returns '—' for null/undefined/empty string", () => {
        const f = makeField();
        expect(formatAttributeValue(f, null)).toBe("—");
        expect(formatAttributeValue(f, undefined)).toBe("—");
        expect(formatAttributeValue(f, "")).toBe("—");
    });

    it("formats boolean as Evet/Hayır", () => {
        const f = makeField({ field_type: "boolean" });
        expect(formatAttributeValue(f, true)).toBe("Evet");
        expect(formatAttributeValue(f, false)).toBe("Hayır");
    });

    it("formats multiselect array joined with comma", () => {
        const f = makeField({ field_type: "multiselect" });
        expect(formatAttributeValue(f, ["API 6D", "EN 12516"])).toBe("API 6D, EN 12516");
    });

    it("returns '—' for empty multiselect array", () => {
        const f = makeField({ field_type: "multiselect" });
        expect(formatAttributeValue(f, [])).toBe("—");
    });

    it("formats number with unit when unit is set", () => {
        const f = makeField({ field_type: "number", unit: "mm" });
        expect(formatAttributeValue(f, 50)).toBe("50 mm");
    });

    it("formats number without unit when unit is null", () => {
        const f = makeField({ field_type: "number", unit: null });
        expect(formatAttributeValue(f, 1234)).toMatch(/^1\.?234$/);
    });

    it("formats text as-is", () => {
        const f = makeField({ field_type: "text", unit: null });
        expect(formatAttributeValue(f, "A105")).toBe("A105");
    });
});

// ── Source-regex regression locks ────────────────────────────────────────────

describe("Faz 2c — product detail page source", () => {
    it("loads product types via /api/product-types on mount", () => {
        expect(SOURCE).toMatch(/fetch\(\s*"\/api\/product-types\?includeInactive=1"\s*\)/);
    });

    it("loads active type fields via withFields=1 query", () => {
        expect(SOURCE).toMatch(/\?withFields=1/);
    });

    it("Genel tab includes 'Teknik Şablon' selector wired to handleTypeChange", () => {
        expect(SOURCE).toMatch(/Teknik Şablon/);
        expect(SOURCE).toMatch(/handleTypeChange/);
    });

    it("Teknik tab renders DynamicFieldEdit for each active field", () => {
        expect(SOURCE).toMatch(/DynamicFieldEdit/);
        expect(SOURCE).toMatch(/activeTypeFields\.map/);
    });

    it("Teknik tab shows empty state when no type selected and when no fields defined", () => {
        expect(SOURCE).toMatch(/teknik şablon seçilmemiş/);
        expect(SOURCE).toMatch(/tanımlı alan yok/);
    });

    it("handleSave body includes product_type_id and attributes", () => {
        expect(SOURCE).toMatch(/product_type_id:\s*editForm\.productTypeId\s*\|\|\s*null/);
        expect(SOURCE).toMatch(/attributes:\s*editForm\.attributes/);
    });

    it("renders type-change confirm modal with lostKeys", () => {
        expect(SOURCE).toMatch(/pendingTypeChange/);
        expect(SOURCE).toMatch(/lostKeys/);
        expect(SOURCE).toMatch(/Tip değiştiriliyor/);
    });

    it("DynamicFieldEdit is imported from shared component", () => {
        expect(SOURCE).toMatch(/from "@\/components\/products\/DynamicFieldEdit"/);
        expect(SOURCE).toMatch(/DynamicFieldEdit/);
    });

    it("setAttribute deletes empty values from attributes object", () => {
        expect(SOURCE).toMatch(/delete next\[key\]/);
    });

    it("handleTypeChange('') routes through pendingTypeChange when attributes exist (P2-002)", () => {
        expect(SOURCE).toMatch(/lostKeys\.length > 0/);
        expect(SOURCE).toMatch(/setPendingTypeChange.*newTypeId.*""/s);
    });
});

// ── P3-003: getMissingRequiredAttributes — edit page ─────────────────────────

describe("getMissingRequiredAttributes — product detail page", () => {
    it("returns empty when no required fields", () => {
        const fields = [makeField({ required: false })];
        expect(getMissingRequiredAttributes(fields, { dn: 50 })).toEqual([]);
    });

    it("returns label when required field is missing", () => {
        const fields = [makeField({ required: true })];
        expect(getMissingRequiredAttributes(fields, {})).toEqual(["DN"]);
    });

    it("returns label when required field value is empty string", () => {
        const fields = [makeField({ required: true })];
        expect(getMissingRequiredAttributes(fields, { dn: "" })).toEqual(["DN"]);
    });

    it("returns label when required multiselect is empty array", () => {
        const fields = [makeField({ required: true, field_type: "multiselect" })];
        expect(getMissingRequiredAttributes(fields, { dn: [] })).toEqual(["DN"]);
    });

    it("accepts non-empty multiselect as filled", () => {
        const fields = [makeField({ required: true, field_type: "multiselect" })];
        expect(getMissingRequiredAttributes(fields, { dn: ["API 6D"] })).toEqual([]);
    });

    it("returns all missing required labels", () => {
        const fields = [
            makeField({ field_key: "dn", label_tr: "DN", required: true }),
            makeField({ field_key: "pn", label_tr: "PN Sınıfı", required: true }),
        ];
        expect(getMissingRequiredAttributes(fields, {}).sort()).toEqual(["DN", "PN Sınıfı"]);
    });
});

// ── P3-003: handleSave validation source-regex ────────────────────────────────

describe("P3-003 — handleSave required attribute validation (source)", () => {
    it("exports getMissingRequiredAttributes from detail page", () => {
        expect(SOURCE).toMatch(/export function getMissingRequiredAttributes/);
    });

    it("handleSave calls getMissingRequiredAttributes with editable active fields", () => {
        expect(SOURCE).toMatch(/getMissingRequiredAttributes\(editableTypeFields,/);
    });

    it("handleSave shows toast with missing field names when required fields are empty", () => {
        expect(SOURCE).toMatch(/Zorunlu alanlar eksik/);
        expect(SOURCE).toMatch(/missingRequired\.join/);
    });
});
