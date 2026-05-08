/**
 * G11 — computeUrgencyLevel: urgencyPct → "critical" | "high" | "moderate"
 * Tek source-of-truth: rec metadata.urgencyLevel ile route severity hesabı arasında
 * tutarlı kalsın diye stock-utils.ts'e taşındı.
 */
import { describe, it, expect } from "vitest";
import { computeUrgencyLevel } from "@/lib/stock-utils";

describe("computeUrgencyLevel", () => {
    it("90% → critical", () => {
        expect(computeUrgencyLevel(90)).toBe("critical");
    });

    it("60% → high", () => {
        expect(computeUrgencyLevel(60)).toBe("high");
    });

    it("30% → moderate", () => {
        expect(computeUrgencyLevel(30)).toBe("moderate");
    });

    it("0% → moderate", () => {
        expect(computeUrgencyLevel(0)).toBe("moderate");
    });

    it("80 boundary → critical (>=80)", () => {
        expect(computeUrgencyLevel(80)).toBe("critical");
        expect(computeUrgencyLevel(79)).toBe("high");
    });

    it("50 boundary → high (>=50)", () => {
        expect(computeUrgencyLevel(50)).toBe("high");
        expect(computeUrgencyLevel(49)).toBe("moderate");
    });

    it("100 → critical", () => {
        expect(computeUrgencyLevel(100)).toBe("critical");
    });
});
