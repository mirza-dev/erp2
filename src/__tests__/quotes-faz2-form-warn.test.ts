/**
 * Teklif V7 — Faz 2 QuoteForm GTİP soft warn + qty input nudge (source-regex).
 *
 * V3-A1: ürün/fiyatı olan ama HS boş satırlar için formda non-blocking uyarı.
 * Kritik: uyarı hiçbir butonu disable ETMEMELİ (soft kalmalı). V7-A11 UI nudge:
 * qty input min="1" step="1".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
    "utf8",
);

describe("QuoteForm Faz 2 — GTİP soft warn (V3-A1)", () => {
    it("findMissingHsLines @/lib/quote-validation'tan import edilir", () => {
        expect(SOURCE).toMatch(/import\s*\{\s*findMissingHsLines\s*\}\s*from\s*"@\/lib\/quote-validation"/);
    });

    it("missingHsLines derived (rows.map → findMissingHsLines)", () => {
        expect(SOURCE).toMatch(/const missingHsLines = findMissingHsLines\(rows\.map\(/);
    });

    it("derived map product_id/unit_price/quantity/hs_code alanlarını taşır", () => {
        expect(SOURCE).toMatch(
            /findMissingHsLines\(rows\.map\(r => \(\{[\s\S]{0,200}product_id:[\s\S]{0,120}unit_price:[\s\S]{0,120}quantity:[\s\S]{0,120}hs_code:/,
        );
    });

    it("inline uyarı role='status' + warning-text + koşullu render", () => {
        expect(SOURCE).toMatch(/missingHsLines\.length > 0 &&/);
        expect(SOURCE).toMatch(/role="status"/);
        expect(SOURCE).toMatch(/var\(--warning-text\)/);
    });

    it("uyarı metni gönderimi engellemediğini belirtir", () => {
        expect(SOURCE).toMatch(/GTİP kodu eksik[\s\S]{0,60}engellemez/);
    });

    it("REGRESSION: GTİP soft kalır — hiçbir buton missingHsLines ile disable EDİLMEZ", () => {
        expect(SOURCE).not.toMatch(/disabled=\{[^}]*missingHs/i);
    });
});

describe("QuoteForm Faz 2 — qty input nudge (V7-A11)", () => {
    it("adet input min='1' step='1' (eski min='0' step='any' değil)", () => {
        expect(SOURCE).toMatch(/aria-label=\{`Satır \$\{idx \+ 1\} adet`\}[\s\S]{0,160}min="1" step="1"/);
    });
});
