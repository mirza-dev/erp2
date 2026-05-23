/**
 * Faz 4a (2026-05-23) — Migration 065 quotes PMT brand alanları.
 *
 * Yeni alanlar:
 *   - quotes.delivery_method TEXT NULL
 *   - quotes.payment_method  TEXT NULL
 *   - quote_line_items.size_text TEXT NULL
 *
 * + create_quote_with_lines / update_quote_with_lines RPC'leri yeniden
 * tanımlanır (yeni alanları header/line jsonb'den okur).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/065_quotes_faz4a_delivery_payment_size.sql"),
    "utf8",
);

describe("Migration 065 — quotes Faz 4a alan ekleme", () => {
    it("quotes tablosuna delivery_method TEXT NULL eklenir (idempotent)", () => {
        expect(SQL).toMatch(/ALTER TABLE quotes\s+ADD COLUMN IF NOT EXISTS delivery_method text/i);
    });

    it("quotes tablosuna payment_method TEXT NULL eklenir (idempotent)", () => {
        expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS payment_method\s+text/i);
    });

    it("quote_line_items tablosuna size_text TEXT NULL eklenir (idempotent)", () => {
        expect(SQL).toMatch(/ALTER TABLE quote_line_items\s+ADD COLUMN IF NOT EXISTS size_text text/i);
    });

    it("create_quote_with_lines RPC delivery_method + payment_method header'a yazar", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION create_quote_with_lines/i);
        // INSERT INTO quotes (..., delivery_method, payment_method, ...)
        expect(SQL).toMatch(/INSERT INTO quotes[\s\S]{0,500}delivery_method,\s*payment_method/i);
        // NULLIF empty string handling
        expect(SQL).toMatch(/NULLIF\(p_header->>'delivery_method', ''\)/);
        expect(SQL).toMatch(/NULLIF\(p_header->>'payment_method', ''\)/);
    });

    it("create_quote_with_lines RPC size_text line'a yazar", () => {
        // INSERT INTO quote_line_items (..., size_text)
        expect(SQL).toMatch(/INSERT INTO quote_line_items[\s\S]{0,400}size_text/i);
        expect(SQL).toMatch(/NULLIF\(ln->>'size_text', ''\)/);
    });

    it("update_quote_with_lines RPC tüm 3 yeni alanı handle eder", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION update_quote_with_lines/i);
        // UPDATE quotes SET ..., delivery_method = NULLIF(...), payment_method = NULLIF(...)
        expect(SQL).toMatch(/UPDATE quotes SET[\s\S]{0,1500}delivery_method\s*=\s*NULLIF/i);
        expect(SQL).toMatch(/payment_method\s*=\s*NULLIF/i);
        // Line INSERT'inde size_text
        expect(SQL).toMatch(/UPDATE quotes[\s\S]{0,2000}INSERT INTO quote_line_items[\s\S]{0,400}size_text/i);
    });

    it("ROLLBACK bloğu mevcut (DROP COLUMN IF EXISTS)", () => {
        expect(SQL).toMatch(/-- ROLLBACK:/);
        expect(SQL).toMatch(/DROP COLUMN IF EXISTS delivery_method/);
        expect(SQL).toMatch(/DROP COLUMN IF EXISTS payment_method/);
        expect(SQL).toMatch(/DROP COLUMN IF EXISTS size_text/);
    });
});
