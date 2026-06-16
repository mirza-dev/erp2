/**
 * Teklif belgesi tablo başlık cilası (2026-06-16):
 *  - Tüm başlıklar ORTALI (HTML + PDF)
 *  - PDF header hücre kenarlığı KALDIRILDI (mavi band üzerinde yeşil/cyan
 *    antialiasing saçağı veriyordu)
 *  - HTML başlık nowrap kaldırıldı (uzun başlık sarılır, taşmaz)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HTML = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/components/QuoteDocument.tsx"), "utf8");
const PDF = readFileSync(join(process.cwd(), "src/lib/quote-pdf/QuotePdfDocument.tsx"), "utf8");

describe("PDF (QuotePdfDocument) — başlık ortalı + kenarlıksız", () => {
    it("Th tüm başlıkları ortalar (alignItems center, align prop yok)", () => {
        expect(PDF).toMatch(/function Th\(\{ label, width, grow \}/);
        expect(PDF).toMatch(/alignItems:\s*"center"\s*\}\}>/);
    });
    it("header satırında hiçbir Th align prop'u kalmadı", () => {
        expect(PDF).not.toMatch(/<Th[^>]*align=/);
    });
    it("S.th kenarlık içermez (yeşil saçak kaynağı kaldırıldı)", () => {
        expect(PDF).toMatch(/th:\s*\{[^}]*\}/);
        expect(PDF).not.toMatch(/th:\s*\{[^}]*borderColor:\s*"rgba\(255,255,255/);
    });
});

describe("HTML (QuoteDocument) — başlık ortalı + sarılabilir", () => {
    it("thStyle textAlign center + whiteSpace normal (nowrap değil)", () => {
        expect(HTML).toMatch(/textAlign:\s*"center"\s*as const,\s*\n\s*verticalAlign/);
        expect(HTML).toMatch(/whiteSpace:\s*"normal"\s*as const/);
    });
    it("hiçbir th hücresinde textAlign right/center override kalmadı", () => {
        // thead th'leri yalnız width override eder; textAlign override edilmez
        expect(HTML).not.toMatch(/\.\.\.thStyle,\s*width:[^}]*textAlign:/);
    });
});
