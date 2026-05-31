/**
 * Faz 8d — Migration 080 order_lines.description + mapper.
 * accept RPC = 078 gövdesi BİREBİR + tek delta (description). Migration testi
 * TÜM accept invariant'larını source-assert eder → botched reprodüksiyon yakalanır.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapOrderDetail } from "@/lib/api-mappers";
import type { SalesOrderWithLines } from "@/lib/database.types";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/080_order_lines_description.sql"),
    "utf8",
);

describe("Migration 080 — order_lines.description", () => {
    it("order_lines'a nullable description kolonu (idempotent)", () => {
        expect(SQL).toMatch(/ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS description text/);
    });

    it("DELTA: accept RPC order_lines INSERT'üne description + SELECT'e qli.description", () => {
        // INSERT kolon listesinde description
        expect(SQL).toMatch(/INSERT INTO order_lines \([\s\S]*?description[\s\S]*?\)/);
        // SELECT'te qli.description (master p.name KORUNUR — description ayrı alan)
        expect(SQL).toMatch(/qli\.description/);
        expect(SQL).toMatch(/p\.name, p\.sku, p\.unit/); // product master kimliği değişmedi
    });

    // Botched reprodüksiyon koruması: TÜM mevcut accept invariant'ları korunmalı.
    it("accept invariant'ları korunur (FOR UPDATE / status guard / null / qty / ROW_COUNT / item_count / vat_rate / customers JOIN / audit / REVOKE)", () => {
        expect(SQL).toMatch(/FOR UPDATE/);
        expect(SQL).toMatch(/status NOT IN \('sent', 'accepted'\)[\s\S]*?42501/);
        expect(SQL).toMatch(/product_id IS NULL[\s\S]*?23502/);
        expect(SQL).toMatch(/quantity <= 0 OR quantity <> trunc\(quantity\)[\s\S]*?22003/);
        expect(SQL).toMatch(/quote_pdf_archive[\s\S]*?23514/);
        expect(SQL).toMatch(/GET DIAGNOSTICS v_inserted = ROW_COUNT/);
        expect(SQL).toMatch(/v_inserted <> v_expected/);
        expect(SQL).toMatch(/UPDATE sales_orders SET item_count = v_inserted/);
        expect(SQL).toMatch(/v_quote\.vat_rate/);
        expect(SQL).toMatch(/LEFT JOIN customers c/);
        expect(SQL).toMatch(/quote_accepted_order_created/);
        expect(SQL).toMatch(/REVOKE ALL ON FUNCTION accept_quote_and_create_order\(uuid, uuid\) FROM public, anon, authenticated/);
        expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION accept_quote_and_create_order\(uuid, uuid\) TO service_role/);
    });

    it("CREATE OR REPLACE (signature stable, DROP yok) + ROLLBACK bloğu", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION accept_quote_and_create_order\(p_quote_id uuid, p_actor uuid\)/);
        expect(SQL).not.toMatch(/DROP FUNCTION accept_quote_and_create_order/);
        expect(SQL).toMatch(/ROLLBACK/);
        expect(SQL).toMatch(/DROP COLUMN IF EXISTS description/);
    });
});

describe("mapOrderLine — description round-trip", () => {
    function makeOrderRow(lineDescription: string | null): SalesOrderWithLines {
        return {
            id: "o-1", order_number: "ORD-2026-0001", customer_id: null, customer_name: "ACME",
            customer_email: null, customer_country: null, customer_tax_office: null, customer_tax_number: null,
            commercial_status: "draft", fulfillment_status: "unallocated", currency: "TRY",
            subtotal: 100, discount_amount: 0, vat_rate: 20, vat_total: 20, grand_total: 120,
            notes: null, item_count: 1, created_by: null, created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z", quote_id: null, quote_valid_until: null,
            source_quote_revision_no: null, quote_pdf_archive_id: null,
            shipment_tracking_number: null, shipment_carrier: null, shipped_at: null,
            parasut_invoice_id: null, parasut_sent_at: null, parasut_error: null,
            parasut_step: null, parasut_retry_count: null,
            lines: [{
                id: "ol-1", order_id: "o-1", product_id: "p-1", product_name: "Gate Valve",
                product_sku: "KV-1", unit: "adet", quantity: 2, unit_price: 50, discount_pct: 0,
                line_total: 100, sort_order: 0, vat_rate: 20, description: lineDescription,
            }],
        } as unknown as SalesOrderWithLines;
    }

    it("description dolu → OrderLineItem.description taşınır", () => {
        const d = mapOrderDetail(makeOrderRow("GATE VALVE A105 GÖVDE, CLASS 600 SW"));
        expect(d.lines[0].description).toBe("GATE VALVE A105 GÖVDE, CLASS 600 SW");
    });

    it("description null → null", () => {
        const d = mapOrderDetail(makeOrderRow(null));
        expect(d.lines[0].description).toBeNull();
    });
});
