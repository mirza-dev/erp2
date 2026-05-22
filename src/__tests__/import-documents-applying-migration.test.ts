/**
 * Faz 3c Review 3.tur — Migration 064 import_documents.status 'applying'
 *
 * Atomik CAS apply lock için ara state ('classified' → 'applying' → 'applied'
 * veya rollback 'classified'). Faz 8 (Sprint B G3) import_batches paterni.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/064_import_documents_applying_status.sql"),
    "utf8",
);

describe("Migration 064 — import_documents 'applying' status", () => {
    it("drops old CHECK constraint (idempotent)", () => {
        expect(SQL).toMatch(/ALTER TABLE import_documents DROP CONSTRAINT IF EXISTS import_documents_status_check/);
    });

    it("adds new CHECK constraint with 'applying' included", () => {
        expect(SQL).toMatch(/ADD CONSTRAINT import_documents_status_check/);
        expect(SQL).toMatch(/'applying'/);
        // Tüm önceki state'ler korunur (geriye uyumlu)
        for (const s of ["pending", "classifying", "classified", "error", "applied"]) {
            expect(SQL).toMatch(new RegExp(`'${s}'`));
        }
    });

    it("includes ROLLBACK SQL comment block (geri alınabilir)", () => {
        expect(SQL).toMatch(/-- ROLLBACK:/);
        // Rollback eski CHECK constraint'i geri kurar (applying çıkarılır)
        expect(SQL).toMatch(/ROLLBACK[\s\S]*ALTER TABLE import_documents DROP CONSTRAINT[\s\S]*ADD CONSTRAINT/);
    });

    it("dokümante eder — neden 'applying' eklendi (race koruması)", () => {
        // Migration başlığı race fix gerekçesini açıklar
        expect(SQL).toMatch(/race|Race|atomic|atomik|claim/i);
    });
});
