/**
 * Faz 6 (V7) — Migration 077 drift-guard.
 * sales_orders 4 yeni kolon + accept_quote_and_create_order atomik RPC sözleşmesi.
 * DB-side davranış (FOR UPDATE/RAISE/ROW_COUNT) yalnız manuel smoke'ta tam doğrulanır;
 * bu test SQL'in kritik invariant'larını kilitler (drift-guard).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/077_quotes_accept_order.sql"),
    "utf8",
);

describe("Migration 077 — sales_orders meta kolonları (V7-A9)", () => {
    it("4 yeni kolon ADD COLUMN IF NOT EXISTS", () => {
        expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS discount_amount\s+numeric/);
        expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS vat_rate\s+numeric/);
        expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS source_quote_revision_no\s+integer/);
        expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS quote_pdf_archive_id\s+uuid REFERENCES quote_pdf_archives\(id\) ON DELETE SET NULL/);
    });
});

describe("Migration 077 — accept_quote_and_create_order RPC sözleşmesi", () => {
    it("imza (p_quote_id uuid, p_actor uuid) + CREATE OR REPLACE", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION accept_quote_and_create_order\(p_quote_id uuid, p_actor uuid\)/);
    });
    it("quote FOR UPDATE kilidi (idempotency + yarış)", () => {
        expect(SQL).toMatch(/FROM quotes WHERE id = p_quote_id FOR UPDATE/);
    });
    it("idempotency: mevcut sipariş varsa already:true döner", () => {
        expect(SQL).toMatch(/FROM sales_orders WHERE quote_id = p_quote_id/);
        expect(SQL).toMatch(/'already',\s*true/);
    });
    it("status guard sent|accepted dışı → 42501", () => {
        expect(SQL).toMatch(/status NOT IN \('sent', 'accepted'\)/);
        expect(SQL).toMatch(/ERRCODE = '42501'/);
    });
    it("null product_id pre-check → 23502 (V7-A8)", () => {
        expect(SQL).toMatch(/product_id IS NULL/);
        expect(SQL).toMatch(/ERRCODE = '23502'/);
    });
    it("qty pre-check 22003 mevcut (V7-A11) — pozitiflik 078'de güçlendirildi", () => {
        // 077 dosyası küsürat kontrolü içerir; `quantity <= 0` eki 078'de
        // (quotes-accept-order-fix-migration.test.ts). Burada 077'nin literal
        // içeriği doğrulanır (apply edilen base).
        expect(SQL).toMatch(/quantity <> trunc\(quantity\)/);
        expect(SQL).toMatch(/ERRCODE = '22003'/);
    });
    it("arşiv NULL defansif RAISE → 23514 (V7-A5 bypass koruması)", () => {
        expect(SQL).toMatch(/FROM quote_pdf_archives\s+WHERE quote_id = p_quote_id ORDER BY revision_no DESC LIMIT 1/);
        expect(SQL).toMatch(/v_pdf IS NULL THEN[\s\S]*ERRCODE = '23514'/);
    });
    it("order INSERT — donmuş totaller kopyalanır + customer LEFT JOIN", () => {
        expect(SQL).toMatch(/q\.subtotal, q\.discount_amount, q\.vat_rate, q\.vat_total, q\.grand_total/);
        expect(SQL).toMatch(/LEFT JOIN customers c ON c\.id = q\.customer_id/);
        expect(SQL).toMatch(/'draft', 'unallocated'/);
        expect(SQL).toMatch(/q\.revision_no, v_pdf/);
        expect(SQL).toMatch(/generate_order_number\(\)/);
    });
    it("order_lines INSERT — master product JOIN + vat_rate snapshot (V7-A3/A7/A8)", () => {
        expect(SQL).toMatch(/INSERT INTO order_lines/);
        expect(SQL).toMatch(/JOIN products p ON p\.id = qli\.product_id/);
        expect(SQL).toMatch(/p\.name, p\.sku, p\.unit/);
        expect(SQL).toMatch(/v_quote\.vat_rate/);
    });
    it("ROW_COUNT verify → mismatch RAISE (V7-A8)", () => {
        expect(SQL).toMatch(/GET DIAGNOSTICS v_inserted = ROW_COUNT/);
        expect(SQL).toMatch(/v_inserted <> v_expected/);
    });
    it("item_count = v_inserted (V7-A10)", () => {
        expect(SQL).toMatch(/UPDATE sales_orders SET item_count = v_inserted/);
    });
    it("quote flip sent→accepted (no-op if accepted)", () => {
        expect(SQL).toMatch(/UPDATE quotes SET status = 'accepted'[\s\S]*WHERE id = p_quote_id AND status = 'sent'/);
    });
    it("audit_log insert (domain §13.1, source ui, actor)", () => {
        expect(SQL).toMatch(/INSERT INTO audit_log/);
        expect(SQL).toMatch(/'quote_accepted_order_created'/);
        expect(SQL).toMatch(/p_actor::text/);
    });
    it("V7-A1 SECURITY INVOKER (DEFINER YOK) + REVOKE/GRANT", () => {
        expect(SQL).not.toMatch(/SECURITY DEFINER/);
        expect(SQL).toMatch(/REVOKE ALL ON FUNCTION accept_quote_and_create_order\(uuid, uuid\) FROM public, anon, authenticated/);
        expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION accept_quote_and_create_order\(uuid, uuid\) TO service_role/);
    });
    it("ROLLBACK bloğu (DROP FUNCTION + DROP COLUMN)", () => {
        expect(SQL).toMatch(/-- DROP FUNCTION IF EXISTS accept_quote_and_create_order\(uuid, uuid\)/);
        expect(SQL).toMatch(/-- ALTER TABLE sales_orders/);
    });
});
