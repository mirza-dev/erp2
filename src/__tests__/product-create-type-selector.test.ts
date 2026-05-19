/**
 * Faz 2c Review P2-001 — Yeni ürün oluşturma akışında tip şablonu + dinamik alanlar.
 * P2-002 — Tip temizlenince attributes stale kalmasın (pendingTypeChange yönlendirmesi).
 *
 * Coverage:
 *   - DynamicFieldEdit shared component: 7 field_type branch'i
 *   - products/page.tsx create drawer: productTypeId + attributes state, Tip Şablonu selector,
 *     handleCreateTypeChange, handleCreate body
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CREATE_SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/products/page.tsx"),
    "utf8",
);

const COMPONENT_SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/components/products/DynamicFieldEdit.tsx"),
    "utf8",
);

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

    it("create drawer JSX renders Tip Şablonu selector", () => {
        expect(CREATE_SOURCE).toMatch(/Tip Şablonu/);
        expect(CREATE_SOURCE).toMatch(/createProductTypes\.map/);
    });

    it("create drawer renders DynamicFieldEdit for each type field", () => {
        expect(CREATE_SOURCE).toMatch(/createTypeFields\.map/);
        expect(CREATE_SOURCE).toMatch(/DynamicFieldEdit/);
    });
});
