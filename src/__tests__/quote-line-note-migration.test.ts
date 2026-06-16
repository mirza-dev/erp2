/**
 * Migration 098 — teklif satırı bazlı serbest "Not" alanı.
 *
 * Yeni alan:
 *   - quote_line_items.note TEXT NULL (description'dan AYRI, saf açıklayıcı)
 *
 * + create_quote_with_lines / update_quote_with_lines RPC'leri 093 gövdeleriyle
 *   yeniden tanımlanır; tek fark INSERT'e note kolonu + NULLIF(ln->>'note','').
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/098_quote_line_note.sql"),
    "utf8",
);

describe("Migration 098 — quote_line_items.note", () => {
    it("quote_line_items tablosuna note TEXT NULL eklenir (idempotent)", () => {
        expect(SQL).toMatch(/ALTER TABLE quote_line_items\s+ADD COLUMN IF NOT EXISTS note text/i);
    });

    it("create_quote_with_lines RPC note'u line INSERT'ine yazar", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION create_quote_with_lines/i);
        // INSERT INTO quote_line_items (..., kg_manual_override, note)
        expect(SQL).toMatch(/INSERT INTO quote_line_items[\s\S]{0,400}kg_manual_override,\s*note/i);
        expect(SQL).toMatch(/NULLIF\(ln->>'note', ''\)/);
    });

    it("update_quote_with_lines RPC note'u line INSERT'ine yazar", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION update_quote_with_lines/i);
        // UPDATE quotes ... DELETE ... INSERT INTO quote_line_items (..., note)
        expect(SQL).toMatch(/UPDATE quotes[\s\S]{0,2500}INSERT INTO quote_line_items[\s\S]{0,400}note/i);
    });

    it("note saf açıklayıcı — line_total hesabı round(qty*price) ile birebir korunur (098 toplamı etkilemez)", () => {
        expect(SQL).toMatch(/round\(COALESCE\(\(ln->>'quantity'\)::numeric, 0\) \*\s*COALESCE\(\(ln->>'unit_price'\)::numeric, 0\), 2\)/);
        // note INSERT kolon listesinin SONUNDA — line_total formülünü değiştirmez
        expect(SQL).not.toMatch(/note[\s\S]{0,40}line_total/i);
    });

    it("ROLLBACK bloğu mevcut (DROP COLUMN IF EXISTS note)", () => {
        expect(SQL).toMatch(/-- ROLLBACK:/);
        expect(SQL).toMatch(/DROP COLUMN IF EXISTS note/);
    });
});

// ── Gate kayıtları ──────────────────────────────────────────────────────────

describe("Gate kayıtları — 098 izlenir", () => {
    const LINT_BASELINE = readFileSync(
        join(process.cwd(), "src/__tests__/gate/sql-lint-baseline.ts"),
        "utf8",
    );
    const MIG_SCRIPT = readFileSync(
        join(process.cwd(), "scripts/check-migrations.ts"),
        "utf8",
    );

    it("sql-lint-baseline RPC redefinition zincirine 098 eklenmiş", () => {
        // 099 turunda zincir "099" ile uzadı; 098 hâlâ zincirde olmalı.
        expect(LINT_BASELINE).toMatch(/create_quote_with_lines:\s*\[[^\]]*"098"[^\]]*\]/);
        expect(LINT_BASELINE).toMatch(/update_quote_with_lines:\s*\[[^\]]*"098"[^\]]*\]/);
    });

    it("check-migrations PROBES'a 098 (quote_line_items.note) eklenmiş", () => {
        expect(MIG_SCRIPT).toMatch(/"098":\s*\{\s*kind:\s*"column",\s*table:\s*"quote_line_items",\s*column:\s*"note"\s*\}/);
    });
});
