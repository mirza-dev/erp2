/**
 * Faz 3b — Migration 062 schema regression locks.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SQL = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/062_import_document_lines.sql"),
    "utf8",
);

describe("Migration 062 — import_document_lines schema", () => {
    it("creates import_document_lines table", () => {
        expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS import_document_lines/);
    });

    it("has all required columns", () => {
        for (const col of [
            "id", "document_id", "line_number", "extraction_type",
            "extracted_name", "extracted_sku", "extracted_attributes",
            "candidate_matches", "matched_product_id", "match_confidence",
            "match_action", "extracted_at", "reviewed_at", "reviewed_by",
        ]) {
            expect(SQL).toMatch(new RegExp(`\\b${col}\\b`));
        }
    });

    it("extraction_type CHECK covers 2 values", () => {
        expect(SQL).toMatch(/'product'/);
        expect(SQL).toMatch(/'certificate_target'/);
        expect(SQL).toMatch(/CHECK.*extraction_type.*IN/i);
    });

    it("match_action CHECK covers all 5 states", () => {
        for (const s of ["pending", "matched", "new_product", "skipped", "reviewed"]) {
            expect(SQL).toMatch(new RegExp(`'${s}'`));
        }
    });

    it("document_id FK with ON DELETE CASCADE", () => {
        expect(SQL).toMatch(/REFERENCES import_documents\(id\) ON DELETE CASCADE/);
    });

    it("matched_product_id FK with ON DELETE SET NULL", () => {
        expect(SQL).toMatch(/REFERENCES products\(id\) ON DELETE SET NULL/);
    });

    it("match_confidence range check 0-100", () => {
        expect(SQL).toMatch(/match_confidence.*0.*100/s);
    });

    it("UNIQUE (document_id, line_number)", () => {
        expect(SQL).toMatch(/UNIQUE \(document_id, line_number\)/);
    });

    it("indexes on document_id and (match_action, extracted_at DESC)", () => {
        expect(SQL).toMatch(/idx_idl_document/);
        expect(SQL).toMatch(/idx_idl_action/);
        expect(SQL).toMatch(/match_action, extracted_at DESC/);
    });

    it("pg_trgm indexes on products(name, sku) WHERE is_active", () => {
        expect(SQL).toMatch(/idx_products_name_trgm/);
        expect(SQL).toMatch(/idx_products_sku_trgm/);
        expect(SQL).toMatch(/USING gin .*gin_trgm_ops/);
        expect(SQL).toMatch(/WHERE is_active = true/);
    });

    it("RLS enabled + service_role policy", () => {
        expect(SQL).toMatch(/ALTER TABLE import_document_lines ENABLE ROW LEVEL SECURITY/);
        expect(SQL).toMatch(/service_import_document_lines_all/);
    });

    it("ROLLBACK block present", () => {
        expect(SQL).toMatch(/ROLLBACK:/);
        expect(SQL).toMatch(/DROP TABLE IF EXISTS import_document_lines/);
    });
});
