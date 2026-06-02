/**
 * Faz 2c Review P2-001 — Yeni ürün oluşturma akışında tip şablonu + dinamik alanlar.
 * P2-002 — Tip temizlenince attributes stale kalmasın (pendingTypeChange yönlendirmesi).
 * P3-003 — getMissingRequiredAttributes zorunlu alan validasyonu.
 * P3-005 — createTypeFieldsError: fetch başarısız olursa hata banner'ı.
 *
 * Coverage:
 *   - DynamicFieldEdit shared component: 7 field_type branch'i
 *   - products/page.tsx create drawer: productTypeId + attributes state, Teknik Şablon selector,
 *     handleCreateTypeChange, handleCreate body
 *   - getMissingRequiredAttributes pure helper: gerçek mantık testleri
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getMissingRequiredAttributes } from "@/app/dashboard/products/page";
import type { ProductTypeFieldRow } from "@/lib/database.types";

const CREATE_SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/products/page.tsx"),
    "utf8",
);

const COMPONENT_SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/components/products/DynamicFieldEdit.tsx"),
    "utf8",
);

// ── Pure helper: getMissingRequiredAttributes ─────────────────────────────────

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

describe("getMissingRequiredAttributes", () => {
    it("returns empty when no fields are required", () => {
        const fields = [makeField({ required: false }), makeField({ field_key: "pn", label_tr: "PN", required: false })];
        expect(getMissingRequiredAttributes(fields, { dn: 50, pn: "600LB" })).toEqual([]);
    });

    it("returns empty when all required fields are filled", () => {
        const fields = [
            makeField({ required: true }),
            makeField({ field_key: "pn", label_tr: "PN", required: true }),
        ];
        expect(getMissingRequiredAttributes(fields, { dn: 50, pn: "600LB" })).toEqual([]);
    });

    it("returns label of missing required field when value is undefined", () => {
        const fields = [makeField({ required: true })];
        expect(getMissingRequiredAttributes(fields, {})).toEqual(["DN"]);
    });

    it("returns label when value is empty string", () => {
        const fields = [makeField({ required: true })];
        expect(getMissingRequiredAttributes(fields, { dn: "" })).toEqual(["DN"]);
    });

    it("returns label when value is null", () => {
        const fields = [makeField({ required: true })];
        expect(getMissingRequiredAttributes(fields, { dn: null })).toEqual(["DN"]);
    });

    it("returns label for empty multiselect array", () => {
        const fields = [makeField({ required: true, field_type: "multiselect" })];
        expect(getMissingRequiredAttributes(fields, { dn: [] })).toEqual(["DN"]);
    });

    it("does not return label for non-empty multiselect array", () => {
        const fields = [makeField({ required: true, field_type: "multiselect" })];
        expect(getMissingRequiredAttributes(fields, { dn: ["API 6D"] })).toEqual([]);
    });

    it("returns multiple missing labels", () => {
        const fields = [
            makeField({ field_key: "dn", label_tr: "DN", required: true }),
            makeField({ field_key: "pn", label_tr: "PN Sınıfı", required: true }),
            makeField({ field_key: "mat", label_tr: "Malzeme", required: false }),
        ];
        const result = getMissingRequiredAttributes(fields, {});
        expect(result.sort()).toEqual(["DN", "PN Sınıfı"]);
    });

    it("returns empty array when fields list is empty", () => {
        expect(getMissingRequiredAttributes([], { dn: 50 })).toEqual([]);
    });
});

// ── Shared DynamicFieldEdit component ─────────────────────────────────────────

describe("DynamicFieldEdit shared component — 7 field_type branches", () => {
    it("handles boolean field type", () => {
        expect(COMPONENT_SOURCE).toMatch(/field_type === "boolean"/);
    });

    it("handles select field type", () => {
        expect(COMPONENT_SOURCE).toMatch(/field_type === "select"/);
    });

    it("handles multiselect field type", () => {
        expect(COMPONENT_SOURCE).toMatch(/field_type === "multiselect"/);
    });

    it("handles longtext field type", () => {
        expect(COMPONENT_SOURCE).toMatch(/field_type === "longtext"/);
    });

    it("handles number field type with unit suffix", () => {
        expect(COMPONENT_SOURCE).toMatch(/field_type === "number"/);
        expect(COMPONENT_SOURCE).toMatch(/field\.unit/);
    });

    it("handles date field type", () => {
        expect(COMPONENT_SOURCE).toMatch(/field_type === "date"/);
    });

    it("exports DynamicFieldEdit and FieldEdit", () => {
        expect(COMPONENT_SOURCE).toMatch(/export function DynamicFieldEdit/);
        expect(COMPONENT_SOURCE).toMatch(/export function FieldEdit/);
    });
});

// ── Create drawer — P2-001 regression locks ───────────────────────────────────

describe("Faz 2c Review P2-001 — create drawer type selector source", () => {
    it("imports DynamicFieldEdit from shared component", () => {
        expect(CREATE_SOURCE).toMatch(/from "@\/components\/products\/DynamicFieldEdit"/);
    });

    it("createForm state includes productTypeId field", () => {
        expect(CREATE_SOURCE).toMatch(/productTypeId:\s*""/);
    });

    it("createForm state includes attributes field", () => {
        expect(CREATE_SOURCE).toMatch(/attributes:\s*\{\}/);
    });

    it("handleCreateTypeChange function defined", () => {
        expect(CREATE_SOURCE).toMatch(/handleCreateTypeChange/);
    });

    it("handleCreate body includes product_type_id", () => {
        expect(CREATE_SOURCE).toMatch(/product_type_id:\s*createForm\.productTypeId/);
    });

    it("handleCreate body includes attributes", () => {
        expect(CREATE_SOURCE).toMatch(/attributes:.*createForm\.attributes/s);
    });

    it("create drawer JSX renders Teknik Şablon selector", () => {
        expect(CREATE_SOURCE).toMatch(/Teknik Şablon/);
        expect(CREATE_SOURCE).toMatch(/createProductTypes\.map/);
    });

    it("create drawer renders DynamicFieldEdit for each type field", () => {
        expect(CREATE_SOURCE).toMatch(/createTypeFields\.map/);
        expect(CREATE_SOURCE).toMatch(/DynamicFieldEdit/);
    });
});

// ── P3-003: required validation in handleCreate ───────────────────────────────

describe("P3-003 — handleCreate required attribute validation", () => {
    it("exports getMissingRequiredAttributes pure helper", () => {
        expect(CREATE_SOURCE).toMatch(/export function getMissingRequiredAttributes/);
    });

    it("handleCreate calls getMissingRequiredAttributes before submitting", () => {
        expect(CREATE_SOURCE).toMatch(/getMissingRequiredAttributes\(createTypeFields,\s*createForm\.attributes\)/);
    });

    it("handleCreate shows toast with missing field names when required fields are empty", () => {
        expect(CREATE_SOURCE).toMatch(/Zorunlu alanlar eksik/);
        expect(CREATE_SOURCE).toMatch(/missingRequired\.join/);
    });
});

// ── P3-005: fetch error handling in create drawer ────────────────────────────

describe("P3-005 — createTypeFieldsError fetch failure banner", () => {
    it("createTypeFieldsError state is defined", () => {
        expect(CREATE_SOURCE).toMatch(/createTypeFieldsError/);
        expect(CREATE_SOURCE).toMatch(/setCreateTypeFieldsError/);
    });

    it("handleCreateTypeChange sets error on failed fetch (!res.ok branch)", () => {
        expect(CREATE_SOURCE).toMatch(/setCreateTypeFieldsError\("Alan şablonu yüklenemedi/);
    });

    it("handleCreateTypeChange clears error when a new type is selected", () => {
        expect(CREATE_SOURCE).toMatch(/setCreateTypeFieldsError\(null\)/);
    });

    it("JSX renders error banner with role=alert when createTypeFieldsError is set", () => {
        expect(CREATE_SOURCE).toMatch(/createTypeFieldsError/);
        expect(CREATE_SOURCE).toMatch(/role="alert"/);
    });
});
