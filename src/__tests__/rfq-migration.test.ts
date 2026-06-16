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

describe("migration 102 — create_rfq_with_lines ambiguity (42702) fix", () => {
    const FIX = readFileSync(join(process.cwd(), "supabase/migrations/102_rfq_create_ambiguous_fix.sql"), "utf8");
    // Yorum satırları (açıklamada eski ON CONFLICT alıntılanıyor) hariç, yalnız kod.
    const CODE = FIX.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
    it("create_rfq_with_lines yeniden tanımlanır", () => {
        expect(FIX).toMatch(/create or replace function create_rfq_with_lines/i);
    });
    it("ambiguity kaynağı ON CONFLICT (rfq_id ...) KOD'dan KALDIRILDI", () => {
        expect(CODE).not.toMatch(/on conflict/i);
    });
    it("yinelenen vendor_id için DISTINCT kullanılır", () => {
        expect(FIX).toMatch(/select distinct \(jsonb_array_elements_text\(p_vendor_ids\)\)/i);
    });
});

describe("migration 103 — award_rfq_create_pos bütünlük (O2 + D2)", () => {
    const A = readFileSync(join(process.cwd(), "supabase/migrations/103_rfq_award_integrity.sql"), "utf8");
    it("award_rfq_create_pos yeniden tanımlanır", () => {
        expect(A).toMatch(/create or replace function award_rfq_create_pos/i);
    });
    it("D2: mükerrer rfq_line_id reddedilir (count vs distinct)", () => {
        expect(A).toMatch(/count\(distinct rl\)/i);
        expect(A).toMatch(/mükerrer rfq_line_id/i);
    });
    it("O2: tedarikçi fiyatlamadıysa explicit RAISE (sessiz düşürme yok)", () => {
        expect(A).toMatch(/fiyat vermedi, award edilemez/i);
        expect(A).toMatch(/sp\.unit_price is not null/i);
    });
    it("O2: PO satırı sunucu-otoriter (kayıtlı sp.unit_price + l.quantity)", () => {
        expect(A).toMatch(/'unit_price',\s*sp\.unit_price/);
        expect(A).toMatch(/'quantity',\s*l\.quantity/);
    });
});
