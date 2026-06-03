import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/084_excel_import_center.sql"),
    "utf8",
);

describe("Migration 084 — Excel/CSV import center", () => {
    it("column_mappings company_scope ile şirket-scope unique hafıza kurar", () => {
        expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS company_scope text NOT NULL DEFAULT 'default'/);
        expect(SQL).toMatch(/column_mappings_scope_normalized_entity_unique/);
        expect(SQL).toMatch(/UNIQUE \(company_scope, normalized, entity_type\)/);
    });

    it("import_drafts metadata alanları ve match_status constraint'i ekler", () => {
        for (const column of ["sheet_name", "row_number", "match_status", "match_confidence", "risk_flags", "field_approvals", "row_errors"]) {
            expect(SQL).toContain(column);
        }
        expect(SQL).toMatch(/match_status IN \('new', 'update', 'ambiguous', 'blocked', 'skipped'\)/);
    });

    it("product_vendor_links premium ilişki modelini ve unique pair guard'ını ekler", () => {
        expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS product_vendor_links/);
        expect(SQL).toMatch(/UNIQUE \(product_id, vendor_id\)/);
        expect(SQL).toMatch(/ALTER TABLE product_vendor_links ENABLE ROW LEVEL SECURITY/);
    });

    it("stok transferi için location balance ve record_stock_transfer RPC'si ekler", () => {
        expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS stock_location_balances/);
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION record_stock_transfer/);
        expect(SQL).toMatch(/'stock_transfer'/);
    });
});
