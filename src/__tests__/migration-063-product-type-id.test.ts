/**
 * Faz 3b Review — Migration 063 schema lock.
 *
 * import_document_lines.product_type_id kolonu + FK + index.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SQL = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/063_import_document_lines_product_type.sql"),
    "utf8",
);

describe("Migration 063 — product_type_id column", () => {
    it("ALTER TABLE adds product_type_id (idempotent)", () => {
        expect(SQL).toMatch(/ALTER TABLE import_document_lines/);
        expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS product_type_id/);
    });

    it("FK product_types(id) ON DELETE SET NULL", () => {
        expect(SQL).toMatch(/REFERENCES product_types\(id\) ON DELETE SET NULL/);
    });

    it("column is uuid NULL (not NOT NULL — eski satırlar/migration_excel fallback)", () => {
        expect(SQL).toMatch(/uuid NULL/);
    });

    it("index idx_idl_product_type", () => {
        expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS idx_idl_product_type/);
        expect(SQL).toMatch(/import_document_lines\(product_type_id\)/);
    });

    it("ROLLBACK block present", () => {
        expect(SQL).toMatch(/ROLLBACK:/);
        expect(SQL).toMatch(/DROP COLUMN IF EXISTS product_type_id/);
    });
});
