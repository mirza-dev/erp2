/**
 * G11 — computeUrgencyLevel: coverageDays → "critical" | "high" | "moderate"
 *
 * Tek source-of-truth: AI rozeti (`aiUrgencyLevel`) ve diff-merge level
 * karşılaştırması daima coverage-based bu kuralı kullanır.
 *   - critical: coverageDays < 7
 *   - high:     coverageDays 7-14
 *   - moderate: coverageDays > 14, veya null (veri yok)
 */
import { describe, it, expect } from "vitest";
import { computeUrgencyLevel } from "@/lib/stock-utils";

describe("computeUrgencyLevel (coverage-based)", () => {
    it("null coverage → moderate (veri yok)", () => {
        expect(computeUrgencyLevel(null)).toBe("moderate");
    });

    it("0 gün → critical", () => {
        expect(computeUrgencyLevel(0)).toBe("critical");
    });

    it("3 gün → critical", () => {
        expect(computeUrgencyLevel(3)).toBe("critical");
    });

    it("6 gün → critical (boundary < 7)", () => {
        expect(computeUrgencyLevel(6)).toBe("critical");
    });

    it("7 gün → high (boundary, 7'den itibaren high başlar)", () => {
        expect(computeUrgencyLevel(7)).toBe("high");
    });

    it("10 gün → high", () => {
        expect(computeUrgencyLevel(10)).toBe("high");
    });

    it("14 gün → high (boundary, 14 dahil)", () => {
        expect(computeUrgencyLevel(14)).toBe("high");
    });

    it("15 gün → moderate (14'ten sonra moderate)", () => {
        expect(computeUrgencyLevel(15)).toBe("moderate");
    });

    it("30 gün → moderate", () => {
        expect(computeUrgencyLevel(30)).toBe("moderate");
    });
});
