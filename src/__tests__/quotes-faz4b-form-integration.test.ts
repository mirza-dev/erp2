/**
 * Faz 4b (2026-05-25) — QuoteForm auto-build description integration.
 *
 * Pure helper davranışı `quote-description-builder.test.ts`'te kapsamlı
 * doğrulanır. Bu dosya QuoteForm.tsx içindeki entegrasyon noktalarını
 * source-regex ile kilitler — patern silinirse / drift ederse test fail.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
    "utf8",
);

describe("QuoteForm Faz 4b integration — auto-build description + dirty tracking", () => {
    it("buildQuoteLineDescription helper'ı import edilir", () => {
        expect(SOURCE).toMatch(
            /import\s*\{\s*buildQuoteLineDescription\s*\}\s*from\s*["']@\/lib\/quote-description-builder["']/,
        );
    });

    it("descDirtyRowIds state'i useState<Set<number>>(new Set()) ile init", () => {
        expect(SOURCE).toMatch(
            /const\s*\[\s*descDirtyRowIds\s*,\s*setDescDirtyRowIds\s*\]\s*=\s*useState<Set<number>>\(\s*new Set\(\)\s*\)/,
        );
    });

    it("handleSelectProduct dirty guard + helper çağrısı içerir", () => {
        // const handleSelectProduct = ... → !descDirtyRowIds.has(rowId) → buildQuoteLineDescription(p)
        expect(SOURCE).toMatch(
            /const handleSelectProduct[\s\S]{0,800}!descDirtyRowIds\.has\(rowId\)[\s\S]{0,300}buildQuoteLineDescription\(p\)/,
        );
    });

    it("description input onChange dirty Set'e rowId ekler (immutable Set update)", () => {
        // setDescDirtyRowIds(prev => prev.has(row.id) ? prev : new Set(prev).add(row.id))
        expect(SOURCE).toMatch(
            /setDescDirtyRowIds\(prev\s*=>\s*prev\.has\(row\.id\)\s*\?\s*prev\s*:\s*new Set\(prev\)\.add\(row\.id\)\)/,
        );
    });

    it("initialData hydration tüm satırları dirty Set'e ekler (DB desc'leri korunur)", () => {
        // mapped.map(r => r.id) tüm rowId'leri Set'e
        expect(SOURCE).toMatch(
            /setDescDirtyRowIds\(new Set\(mapped\.map\(r\s*=>\s*r\.id\)\)\)/,
        );
    });

    it("localStorage hydration non-empty desc'li satırları dirty Set'e koyar", () => {
        // restored.filter(r => r.desc.trim().length > 0).map(r => r.id)
        expect(SOURCE).toMatch(
            /restored\.filter\(r\s*=>\s*r\.desc\.trim\(\)\.length\s*>\s*0\)\.map\(r\s*=>\s*r\.id\)/,
        );
    });
});
