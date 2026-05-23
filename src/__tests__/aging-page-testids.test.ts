/**
 * Faz 3d Review aging (2026-05-23) — E2E stability source-regex locks.
 *
 * `tests/aging.spec.ts` 2 fail veriyordu:
 *   - Tab tıklama testleri `getByText(/imalat eskimesi/i)` ile çakışma riski
 *     (label + subtitle aynı satırda render).
 *   - `/45 gün/i` regex tablo hücrelerindeki `{daysWaiting} gün` ile strict
 *     mode'da fail oluyordu (seed'e bağlı). Avg bekleme süresi 45 olursa
 *     ek bir element daha → kesin fail.
 *
 * Fix:
 *   - REPORT_TABS button'lara `data-testid="aging-report-tab-{key}"`.
 *   - Eşik referansı div'ine `role="note"` + `data-testid="aging-threshold-hint"`.
 *
 * Bu test'ler gelecekte biri testid'i kaldırırsa veya yapıyı bozarsa erken
 * yakalar (E2E koşmadan).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/products/aging/page.tsx"),
    "utf8",
);

describe("Aging page — E2E stability locks", () => {
    it("Report tab button'larına data-testid eklendi (manufactured + commercial)", () => {
        expect(SOURCE).toMatch(/data-testid=\{`aging-report-tab-\$\{tab\.key\}`\}/);
        // REPORT_TABS iki tip içerir: manufactured, commercial
        expect(SOURCE).toMatch(/key:\s*"manufactured"/);
        expect(SOURCE).toMatch(/key:\s*"commercial"/);
    });

    it("Eşik referansı div'ine role='note' + data-testid='aging-threshold-hint' eklendi", () => {
        expect(SOURCE).toMatch(/role="note"[\s\S]{0,100}data-testid="aging-threshold-hint"/);
        // İçeriğin THRESHOLDS[reportType] olduğu doğrulanır
        expect(SOURCE).toMatch(/data-testid="aging-threshold-hint"[\s\S]{0,200}THRESHOLDS\[reportType\]/);
    });

    it("THRESHOLDS metni 45 gün referansı içerir (eşik tutarlılığı)", () => {
        // /45 gün/i regex'i E2E'de bu metne match olur
        expect(SOURCE).toMatch(/Aktif:\s*<\s*45 gün/);
    });
});
