/**
 * Faz 3a — Migration 061 schema regression locks.
 *
 * Source-regex (migration SQL'i çalışan DB'ye karşı koşamayız test ortamında).
 * Production'da migration apply edildiğinde schema bu kontratı sağlamalı.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SQL = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/061_import_documents.sql"),
    "utf8",
);

describe("Migration 061 — import_documents schema", () => {
    it("creates import_documents table", () => {
        expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS import_documents/);
    });

    it("has all required columns", () => {
        for (const col of [
            "id", "batch_id", "file_path", "file_name", "file_size",
            "mime_type", "classification", "status", "error_message",
            "classified_at", "created_by", "created_at",
        ]) {
            expect(SQL).toMatch(new RegExp(`\\b${col}\\b`));
        }
    });

    it("status CHECK constraint covers all 5 states", () => {
        for (const s of ["pending", "classifying", "classified", "error", "applied"]) {
            expect(SQL).toMatch(new RegExp(`'${s}'`));
        }
        expect(SQL).toMatch(/CHECK.*status.*IN/i);
    });

    it("batch_id FK with ON DELETE CASCADE", () => {
        expect(SQL).toMatch(/REFERENCES import_batches\(id\) ON DELETE CASCADE/);
    });

    it("created_by FK with ON DELETE SET NULL", () => {
        expect(SQL).toMatch(/REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
    });

    it("file_size > 0 CHECK", () => {
        expect(SQL).toMatch(/CHECK \(file_size > 0\)/);
    });

    it("indexes on batch_id and (status, created_at DESC)", () => {
        expect(SQL).toMatch(/idx_import_documents_batch/);
        expect(SQL).toMatch(/idx_import_documents_status_created/);
        expect(SQL).toMatch(/status, created_at DESC/);
    });

    it("RLS enabled + service_role policy", () => {
        expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/);
        expect(SQL).toMatch(/service_import_documents_all/);
        expect(SQL).toMatch(/auth\.role\(\) = 'service_role'/);
    });

    it("idempotent (IF NOT EXISTS) + ROLLBACK block", () => {
        expect(SQL).toMatch(/IF NOT EXISTS/);
        expect(SQL).toMatch(/ROLLBACK:/);
    });
});
