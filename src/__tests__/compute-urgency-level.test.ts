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

describe("computeUrgencyLevel — lead-time aware (Fix 4)", () => {
    it("cov=20, lead=45 → critical (lead-time risk: stok tedarikten kısa)", () => {
        // Sprint A computeStockRiskLevel ile aynı semantik
        expect(computeUrgencyLevel(20, 45)).toBe("critical");
    });

    it("cov=20, lead=14 → moderate (cov >= lead, normal threshold uygulanır)", () => {
        expect(computeUrgencyLevel(20, 14)).toBe("moderate");
    });

    it("cov=10, lead=null → high (lead bilgisi yok, normal threshold)", () => {
        expect(computeUrgencyLevel(10, null)).toBe("high");
    });

    it("cov=10, lead=undefined → high (default davranış)", () => {
        expect(computeUrgencyLevel(10)).toBe("high");
    });

    it("cov=10, lead=5 → high (cov >= lead, threshold)", () => {
        expect(computeUrgencyLevel(10, 5)).toBe("high");
    });

    it("cov=10, lead=10 → high (cov >= lead → strict less-than ile critical değil)", () => {
        // Boundary: coverageDays < leadTimeDays kuralı strict (`<`, `<=` değil)
        expect(computeUrgencyLevel(10, 10)).toBe("high");
    });

    it("cov=9, lead=10 → critical (cov < lead)", () => {
        expect(computeUrgencyLevel(9, 10)).toBe("critical");
    });

    it("cov=null, lead=45 → moderate (veri eksik olduğunda lead-time risk hesaplanamaz)", () => {
        expect(computeUrgencyLevel(null, 45)).toBe("moderate");
    });

    it("cov=20, lead=0 → moderate (lead=0 geçersiz, lead-time check pas geçilir)", () => {
        expect(computeUrgencyLevel(20, 0)).toBe("moderate");
    });

    it("cov=5, lead=0 → critical (cov < 7, lead-time check pas, normal threshold)", () => {
        expect(computeUrgencyLevel(5, 0)).toBe("critical");
    });
});
