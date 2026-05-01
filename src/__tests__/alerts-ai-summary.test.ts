/**
 * Sprint A G7 — ai-summary-labels.ts yardımcısı doğru etiketleri sağlıyor.
 *
 * Plan kriteri: "AI uyarılarında 'Neden öneriliyor?' şeffaflığı"
 * Stok uyarılarında kullanılan ai_inputs_summary alan adlarının Türkçe
 * karşılıkları ve ops-summary metriklerinin etiketleri tanımlı olmalı.
 */
import { describe, it, expect } from "vitest";
import { AI_SUMMARY_LABELS } from "@/lib/ai-summary-labels";

const STOCK_ALERT_KEYS = [
    "available", "min", "dailyUsage", "coverageDays", "leadTimeDays", "unit",
] as const;

const OPS_SUMMARY_KEYS = [
    "criticalStockCount", "warningStockCount", "atRiskCount",
    "pendingOrderCount", "approvedOrderCount", "highRiskOrderCount", "openAlertCount",
] as const;

describe("AI_SUMMARY_LABELS — stok uyarısı alanları", () => {
    it.each(STOCK_ALERT_KEYS)("%s için Türkçe etiket tanımlı ve boş değil", (key) => {
        expect(AI_SUMMARY_LABELS[key]).toBeDefined();
        expect(AI_SUMMARY_LABELS[key].length).toBeGreaterThan(0);
    });
});

describe("AI_SUMMARY_LABELS — ops-summary metrikleri", () => {
    it.each(OPS_SUMMARY_KEYS)("%s için Türkçe etiket tanımlı ve boş değil", (key) => {
        expect(AI_SUMMARY_LABELS[key]).toBeDefined();
        expect(AI_SUMMARY_LABELS[key].length).toBeGreaterThan(0);
    });
});

describe("AI_SUMMARY_LABELS — tüm değerler string", () => {
    it("her etiket değeri string türünde", () => {
        for (const [, label] of Object.entries(AI_SUMMARY_LABELS)) {
            expect(typeof label).toBe("string");
        }
    });
});
