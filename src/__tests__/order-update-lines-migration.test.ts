/**
 * Migration 081 — update_order_with_lines RPC (taslak sipariş düzenleme).
 * Source-regress: draft guard + FOR UPDATE + sunucu-tarafı totals + audit + ROLLBACK.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/081_order_update_lines.sql"),
    "utf8",
);

describe("Migration 081 — update_order_with_lines", () => {
    it("fonksiyon imzası (p_order_id, p_header, p_lines, p_actor)", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION update_order_with_lines\(/);
        expect(SQL).toMatch(/p_order_id uuid/);
        expect(SQL).toMatch(/p_header\s+jsonb/);
        expect(SQL).toMatch(/p_lines\s+jsonb/);
        expect(SQL).toMatch(/p_actor\s+text/);
    });

    it("FOR UPDATE row lock + draft guard (RAISE)", () => {
        expect(SQL).toMatch(/FOR UPDATE/);
        expect(SQL).toMatch(/v_status <> 'draft'/);
        expect(SQL).toMatch(/Yalnızca taslak siparişler düzenlenebilir/);
    });

    it("en az 1 kalem guard + bulunamadı RAISE", () => {
        expect(SQL).toMatch(/jsonb_array_length\(p_lines\) = 0/);
        expect(SQL).toMatch(/Sipariş bulunamadı/);
    });

    it("satırları DELETE + yeniden INSERT (sort_order)", () => {
        expect(SQL).toMatch(/DELETE FROM order_lines WHERE order_id = p_order_id/);
        expect(SQL).toMatch(/INSERT INTO order_lines/);
        expect(SQL).toMatch(/sort_order/);
    });

    it("totaller sunucu tarafında yeniden hesaplanır (discount + vat_rate korunur)", () => {
        expect(SQL).toMatch(/SUM\(line_total\)/);
        expect(SQL).toMatch(/v_taxable\s*:=\s*GREATEST\(v_subtotal - v_discount, 0\)/);
        expect(SQL).toMatch(/v_vat_total\s*:=\s*round\(v_taxable \* v_vat_rate \/ 100, 2\)/);
        expect(SQL).toMatch(/COALESCE\(discount_amount, 0\)/);
        expect(SQL).toMatch(/COALESCE\(vat_rate, 20\)/);
    });

    it("statü / numara / parasut alanlarına DOKUNMAZ (UPDATE listesinde yok)", () => {
        expect(SQL).not.toMatch(/UPDATE sales_orders SET[\s\S]*commercial_status\s*=/);
        expect(SQL).not.toMatch(/UPDATE sales_orders SET[\s\S]*order_number\s*=/);
        expect(SQL).not.toMatch(/UPDATE sales_orders SET[\s\S]*parasut_/);
    });

    it("quote_valid_until NULLIF guard (boş string → NULL)", () => {
        expect(SQL).toMatch(/NULLIF\(p_header->>'quote_valid_until', ''\)::date/);
    });

    it("audit_log 'order_lines_replaced' (actor ile)", () => {
        expect(SQL).toMatch(/INSERT INTO audit_log/);
        expect(SQL).toMatch(/'order_lines_replaced'/);
        expect(SQL).toMatch(/p_actor/);
    });

    it("ROLLBACK bloğu var", () => {
        expect(SQL).toMatch(/ROLLBACK:/);
        expect(SQL).toMatch(/DROP FUNCTION IF EXISTS update_order_with_lines/);
    });
});
