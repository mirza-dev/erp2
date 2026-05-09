/**
 * G11 audit 5. tur Fix 1 — DataContext reorderSuggestions promisable bazlı.
 *
 * Önceki: shouldSuggestReorder({ available: p.available_now, ... }) →
 * quote'lu siparişler hesaba katılmıyordu, UI öneriyi kaçırıyordu.
 *
 * Yeni: shouldSuggestReorder({ available: p.promisable ?? p.available_now })
 * → backend (purchase-copilot route) ile semantik eşleşme.
 *
 * Bu testler kaynak dosyada doğru argument geçirildiğini regression olarak doğrular.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dataContextSource = readFileSync(
    resolve(process.cwd(), "src/lib/data-context.tsx"),
    "utf-8",
);

describe("data-context.tsx — reorderSuggestions promisable bazlı filter", () => {
    it("shouldSuggestReorder available alanı p.promisable ?? p.available_now ile çağrılır", () => {
        // Pattern: available: p.promisable ?? p.available_now
        // Whitespace tolerant
        const pattern = /available:\s*p\.promisable\s*\?\?\s*p\.available_now/;
        expect(dataContextSource).toMatch(pattern);
    });

    it("shouldSuggestReorder çıplak p.available_now (promisable atlanmış) çağrısı yok", () => {
        // reorderSuggestions block'unda p.available_now tek başına geçmemeli
        // (shouldSuggestReorder context'inde)
        // Eski pattern: available: p.available_now,
        const offending = dataContextSource.match(/available:\s*p\.available_now\s*,/);
        expect(offending).toBeNull();
    });
});
