/**
 * Teklif Faz 1a — Migration 066-069 (DB foundation).
 *
 * 066: products.hs_code + size_text (V4-B3 master alanlar)
 * 067: quotes.customer_address + seller_* (7) (V4-A2, V4-A3)
 * 068: quote_line_items.unit_weight_kg + kg_manual_override (V3-B5, V4-A7)
 * 069: create/update_quote_with_lines payload extension
 *      (V7-A1 SECURITY INVOKER korunur, V7-A2 NULLIF guard'lar korunur,
 *       customer_id korunur, mevcut delivery/payment/size aynen kalır)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");

const SQL066 = read("066_products_hs_size.sql");
const SQL067 = read("067_quotes_customer_address_seller.sql");
const SQL068 = read("068_quote_line_items_unit_weight.sql");
const SQL069 = read("069_quotes_rpc_payload_ext.sql");
// Yorum satırları DEFINER/INVOKER'dan bahsedebilir; gerçek kodu kontrol et.
const SQL069_CODE = SQL069.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");

describe("Migration 066 — products GTİP + ölçü", () => {
    it("products.hs_code + size_text idempotent eklenir (TEXT NULL)", () => {
        expect(SQL066).toMatch(/ALTER TABLE products[\s\S]{0,120}ADD COLUMN IF NOT EXISTS hs_code\s+text/i);
        expect(SQL066).toMatch(/ADD COLUMN IF NOT EXISTS size_text\s+text/i);
    });
    it("ROLLBACK bloğu mevcut", () => {
        expect(SQL066).toMatch(/-- ROLLBACK:/);
        expect(SQL066).toMatch(/DROP COLUMN IF EXISTS hs_code/);
        expect(SQL066).toMatch(/DROP COLUMN IF EXISTS size_text/);
    });
});

describe("Migration 067 — quotes müşteri adresi + satıcı snapshot", () => {
    it("customer_address eklenir", () => {
        expect(SQL067).toMatch(/ALTER TABLE quotes[\s\S]{0,200}ADD COLUMN IF NOT EXISTS customer_address\s+text/i);
    });
    it("7 seller_* alanı eklenir", () => {
        for (const col of ["seller_name", "seller_phone", "seller_email", "seller_address", "seller_tax_id", "seller_website", "seller_logo_url"]) {
            expect(SQL067).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s+text`, "i"));
        }
    });
    it("ROLLBACK 8 kolonu DROP eder", () => {
        expect(SQL067).toMatch(/-- ROLLBACK:/);
        for (const col of ["customer_address", "seller_name", "seller_logo_url"]) {
            expect(SQL067).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}`));
        }
    });
});

describe("Migration 068 — satır birim ağırlık + override", () => {
    it("unit_weight_kg numeric + kg_manual_override boolean DEFAULT false", () => {
        expect(SQL068).toMatch(/ADD COLUMN IF NOT EXISTS unit_weight_kg\s+numeric/i);
        expect(SQL068).toMatch(/ADD COLUMN IF NOT EXISTS kg_manual_override\s+boolean NOT NULL DEFAULT false/i);
    });
    it("mevcut weight_kg silinmez (sadece ADD COLUMN)", () => {
        expect(SQL068).not.toMatch(/DROP COLUMN IF EXISTS weight_kg/);
    });
});

describe("Migration 069 — RPC payload extension", () => {
    it("V7-A1: SECURITY DEFINER YOK (INVOKER default korunur)", () => {
        expect(SQL069_CODE).not.toMatch(/SECURITY DEFINER/i);
        expect(SQL069).toMatch(/CREATE OR REPLACE FUNCTION create_quote_with_lines/i);
        expect(SQL069).toMatch(/CREATE OR REPLACE FUNCTION update_quote_with_lines/i);
    });
    it("V7-A2: NULLIF guard'lar korunur (quote_date, customer_id)", () => {
        expect(SQL069).toMatch(/NULLIF\(p_header->>'quote_date', ''\)::date/);
        expect(SQL069).toMatch(/NULLIF\(p_header->>'customer_id', ''\)::uuid/);
    });
    it("header'a customer_address + 7 seller_* NULLIF ile yazılır", () => {
        expect(SQL069).toMatch(/NULLIF\(p_header->>'customer_address', ''\)/);
        for (const col of ["seller_name", "seller_phone", "seller_email", "seller_address", "seller_tax_id", "seller_website", "seller_logo_url"]) {
            expect(SQL069).toMatch(new RegExp(`NULLIF\\(p_header->>'${col}', ''\\)`));
        }
    });
    it("line'a unit_weight_kg + kg_manual_override yazılır", () => {
        expect(SQL069).toMatch(/NULLIF\(ln->>'unit_weight_kg', ''\)::numeric/);
        expect(SQL069).toMatch(/COALESCE\(\(ln->>'kg_manual_override'\)::boolean, false\)/);
    });
    it("mevcut delivery/payment/size alanları korunur (V6-A4 regression)", () => {
        expect(SQL069).toMatch(/NULLIF\(p_header->>'delivery_method', ''\)/);
        expect(SQL069).toMatch(/NULLIF\(p_header->>'payment_method', ''\)/);
        expect(SQL069).toMatch(/NULLIF\(ln->>'size_text', ''\)/);
    });
});
