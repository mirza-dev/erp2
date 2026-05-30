/**
 * Teklif V7 Faz 7 — Migration 079 note_templates
 *
 * Tablo + kind CHECK + RLS + trigger + index + idempotent + seed (PMT std).
 * Master-plandaki 080 (quote_line_items.sort_order) KALICI DÜŞÜRÜLDÜ.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/079_note_templates.sql"),
    "utf8",
);

describe("Migration 079 — note_templates", () => {
    it("tabloyu idempotent yaratır", () => {
        expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS note_templates/);
        expect(SQL).toMatch(/id\s+uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    });

    it("kind CHECK 4 değer içerir", () => {
        expect(SQL).toMatch(/kind\s+text NOT NULL DEFAULT 'general'/);
        for (const k of ["notes", "delivery", "payment", "general"]) {
            expect(SQL).toMatch(new RegExp(`'${k}'`));
        }
    });

    it("title + body NOT NULL + non-empty CHECK", () => {
        expect(SQL).toMatch(/title\s+text NOT NULL CHECK \(length\(trim\(title\)\) > 0\)/);
        expect(SQL).toMatch(/body\s+text NOT NULL CHECK \(length\(trim\(body\)\) > 0\)/);
    });

    it("sort_order + is_active alanları", () => {
        expect(SQL).toMatch(/sort_order\s+integer NOT NULL DEFAULT 0/);
        expect(SQL).toMatch(/is_active\s+boolean NOT NULL DEFAULT true/);
    });

    it("kind+sort_order partial index (aktif)", () => {
        expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS idx_note_templates_kind_active/);
        expect(SQL).toMatch(/ON note_templates \(kind, sort_order\) WHERE is_active/);
    });

    it("RLS ENABLE + updated_at trigger", () => {
        expect(SQL).toMatch(/ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY/);
        expect(SQL).toMatch(/CREATE TRIGGER trg_note_templates_updated_at/);
        expect(SQL).toMatch(/note_templates_set_updated_at/);
    });

    it("seed: PMT standartları (delivery/payment/notes) + ON CONFLICT", () => {
        expect(SQL).toMatch(/INSERT INTO note_templates/);
        expect(SQL).toMatch(/İSTANBUL PMT DEPO TESLİMİ/);
        expect(SQL).toMatch(/%50 AVANS, %50 SEVKE HAZIR OLUNCA/);
        expect(SQL).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
        // 3 kind'ı da seed eder
        for (const k of ["'delivery'", "'payment'", "'notes'"]) {
            expect(SQL).toMatch(new RegExp(k));
        }
        // deterministik UUID (057 paterni, a-prefix node band)
        expect(SQL).toMatch(/00000000-0000-4000-8000-000000a0000\d/);
    });

    it("ROLLBACK bloğu içerir", () => {
        expect(SQL).toMatch(/-- ROLLBACK:/);
        expect(SQL).toMatch(/DROP TABLE IF EXISTS note_templates/);
    });
});
