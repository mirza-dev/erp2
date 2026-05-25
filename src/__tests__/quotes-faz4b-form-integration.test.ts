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

    it("localStorage hydration backward-compat fallback: non-empty desc → dirty (saved.descDirty yoksa)", () => {
        // Eski payload yolu — saved.descDirty undefined → r.desc.trim().length > 0 filter
        expect(SOURCE).toMatch(
            /restored\.forEach\(r\s*=>\s*\{\s*if\s*\(r\.desc\.trim\(\)\.length\s*>\s*0\)\s*dirtyIds\.add\(r\.id\)/,
        );
    });

    // ── Review 1 (2026-05-25) — 3 bulgu kapatma ─────────────────────────────

    it("Review P2-A: clearAll dirty Set'i de sıfırlar (yeni satırlarda auto-build çalışır)", () => {
        // clearAll fonksiyonu içinde setDescDirtyRowIds(new Set()) çağrısı
        expect(SOURCE).toMatch(
            /function\s+clearAll\(\)[\s\S]{0,500}setDescDirtyRowIds\(new Set\(\)\)/,
        );
    });

    it("Review P2-B: autoSave teklif_v3'e descDirty index-aligned boolean[] yazar", () => {
        // const descDirty = rows.map(r => descDirtyRowIds.has(r.id))
        expect(SOURCE).toMatch(
            /const descDirty\s*=\s*rows\.map\(r\s*=>\s*descDirtyRowIds\.has\(r\.id\)\)/,
        );
        // setItem JSON.stringify({ currency, rows, descDirty })
        expect(SOURCE).toMatch(
            /setItem\("teklif_v3",\s*JSON\.stringify\(\{\s*currency,\s*rows,\s*descDirty\s*\}\)\)/,
        );
    });

    it("Review P2-B: restore Array.isArray(saved.descDirty) ile yeni payload'ı tanır", () => {
        // if (Array.isArray(saved.descDirty)) → restored.forEach((r, i) => if (saved.descDirty[i]) dirtyIds.add(r.id))
        expect(SOURCE).toMatch(
            /if\s*\(\s*Array\.isArray\(saved\.descDirty\)\s*\)[\s\S]{0,300}saved\.descDirty\[i\]/,
        );
    });

    it("Review P2-B: autoSave useCallback dep array'inde descDirtyRowIds var (stale closure önlenir)", () => {
        // autoSave deps son satırına eklenmiş (sig3Title sonrasında)
        expect(SOURCE).toMatch(
            /sig3Title\s*,\s*\n?\s*descDirtyRowIds\]\)/,
        );
    });
});
