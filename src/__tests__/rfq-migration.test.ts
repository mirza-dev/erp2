import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/100_supplier_rfq.sql"), "utf8");

describe("migration 100 — RFQ şeması", () => {
    it("altı RFQ tablosu + sayaç tanımlanır", () => {
        for (const t of [
            "rfq_counters", "supplier_rfqs", "supplier_rfq_lines", "supplier_rfq_vendors",
            "supplier_rfq_prices", "supplier_price_history", "supplier_rfq_archives",
        ]) {
            expect(SQL).toMatch(new RegExp(`create table if not exists ${t}`, "i"));
        }
    });

    it("product_vendor_links son-fiyat kolonları eklenir (ALTER)", () => {
        expect(SQL).toMatch(/alter table product_vendor_links/i);
        expect(SQL).toMatch(/add column if not exists last_unit_price/i);
    });

    it("generate_rfq_number RFQ-YYYY-NNNN üretir", () => {
        expect(SQL).toMatch(/create or replace function generate_rfq_number/i);
        expect(SQL).toMatch(/'RFQ-'/);
    });

    it("award RPC mevcut PO oluşturma RPC'sini çağırır (Odoo: RFQ→PO)", () => {
        expect(SQL).toMatch(/create or replace function award_rfq_create_pos/i);
        expect(SQL).toMatch(/create_purchase_order_with_lines\(/i);
    });

    it("vendor yanıtı price_history + product_vendor_links son-fiyatı yazar", () => {
        expect(SQL).toMatch(/create or replace function upsert_rfq_vendor_quote/i);
        expect(SQL).toMatch(/insert into supplier_price_history/i);
        expect(SQL).toMatch(/insert into product_vendor_links[\s\S]{0,200}on conflict \(product_id, vendor_id\) do update/i);
    });

    it("private rfq-pdfs bucket oluşturulur", () => {
        expect(SQL).toMatch(/'rfq-pdfs'/);
        expect(SQL).toMatch(/storage\.buckets/i);
    });

    it("status CHECK yaşam döngüsü: draft|sent|awarded|cancelled", () => {
        expect(SQL).toMatch(/status[\s\S]{0,80}'draft','sent','awarded','cancelled'/i);
    });
});
