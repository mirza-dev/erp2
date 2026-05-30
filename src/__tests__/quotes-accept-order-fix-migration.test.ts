/**
 * Faz 6 Bulgular — Migration 078 drift-guard (accept RPC qty pre-check fix).
 * 077'yi CREATE OR REPLACE eder; TEK değişiklik: quantity pre-check pozitiflik.
 * Live davranış 078'dir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/078_quotes_accept_order_qty_fix.sql"),
    "utf8",
);

describe("Migration 078 — accept RPC qty pozitiflik fix", () => {
    it("CREATE OR REPLACE accept_quote_and_create_order (077 override)", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION accept_quote_and_create_order\(p_quote_id uuid, p_actor uuid\)/);
    });
    it("qty pre-check artık quantity <= 0 OR <> trunc → 22003", () => {
        expect(SQL).toMatch(/quantity <= 0 OR quantity <> trunc\(quantity\)/);
        expect(SQL).toMatch(/positive integer/i);
        expect(SQL).toMatch(/ERRCODE = '22003'/);
    });
    it("kalan kritik invariant'lar korunur (FOR UPDATE, JOIN products, ROW_COUNT, item_count, audit)", () => {
        expect(SQL).toMatch(/FROM quotes WHERE id = p_quote_id FOR UPDATE/);
        expect(SQL).toMatch(/JOIN products p ON p\.id = qli\.product_id/);
        expect(SQL).toMatch(/GET DIAGNOSTICS v_inserted = ROW_COUNT/);
        expect(SQL).toMatch(/item_count = v_inserted/);
        expect(SQL).toMatch(/'quote_accepted_order_created'/);
    });
    it("kolon ALTER YOK (077'de yapıldı) + SECURITY DEFINER YOK + REVOKE/GRANT", () => {
        expect(SQL).not.toMatch(/ADD COLUMN/);
        expect(SQL).not.toMatch(/SECURITY DEFINER/);
        expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION accept_quote_and_create_order\(uuid, uuid\) TO service_role/);
    });
});
