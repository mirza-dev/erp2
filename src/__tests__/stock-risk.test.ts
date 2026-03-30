/**
 * Tests for computeStockRiskLevel — pure deterministic function, no mocks needed.
 */
import { describe, it, expect } from "vitest";
import { computeStockRiskLevel } from "@/lib/stock-utils";

// ─── Already in critical/warning range → "none" ───────────────────────────────

describe("computeStockRiskLevel — products already in critical/warning range", () => {
    it("available === min → 'none' (critical zone)", () => {
        const result = computeStockRiskLevel(10, 10, 5, 7);
        expect(result.riskLevel).toBe("none");
    });

    it("available < min → 'none' (critical zone)", () => {
        const result = computeStockRiskLevel(5, 10, 5, 7);
        expect(result.riskLevel).toBe("none");
    });

    it("available === ceil(min * 1.5) → 'none' (warning boundary)", () => {
        // min=10 → ceil(1.5*10) = 15
        const result = computeStockRiskLevel(15, 10, 5, 7);
        expect(result.riskLevel).toBe("none");
    });

    it("available just below warning threshold → 'none'", () => {
        // min=10 → threshold=15; available=14 is inside warning zone
        const result = computeStockRiskLevel(14, 10, 5, 7);
        expect(result.riskLevel).toBe("none");
    });
});

// ─── No daily usage data → "none" ────────────────────────────────────────────

describe("computeStockRiskLevel — no daily usage data", () => {
    it("dailyUsage null → 'none'", () => {
        const result = computeStockRiskLevel(100, 10, null, 7);
        expect(result.riskLevel).toBe("none");
    });

    it("dailyUsage undefined → 'none'", () => {
        const result = computeStockRiskLevel(100, 10, undefined, 7);
        expect(result.riskLevel).toBe("none");
    });

    it("dailyUsage 0 → 'none'", () => {
        const result = computeStockRiskLevel(100, 10, 0, 7);
        expect(result.riskLevel).toBe("none");
    });

    it("dailyUsage negative → 'none'", () => {
        const result = computeStockRiskLevel(100, 10, -1, 7);
        expect(result.riskLevel).toBe("none");
    });
});

// ─── coverage_risk ────────────────────────────────────────────────────────────

describe("computeStockRiskLevel — coverage_risk", () => {
    it("coverageDays < leadTimeDays → 'coverage_risk'", () => {
        // available=32, dailyUsage=5 → coverageDays = round(32/5) = 6; leadTimeDays=14
        const result = computeStockRiskLevel(32, 10, 5, 14);
        expect(result.riskLevel).toBe("coverage_risk");
    });

    it("reason includes coverageDays and leadTimeDays values", () => {
        const result = computeStockRiskLevel(32, 10, 5, 14);
        // coverageDays = round(32/5) = 6
        expect(result.reason).toContain("6");
        expect(result.reason).toContain("14");
    });

    it("coverageDays exactly equals leadTimeDays → NOT coverage_risk", () => {
        // available=50, dailyUsage=5 → coverageDays = round(50/5) = 10; leadTimeDays=10
        const result = computeStockRiskLevel(50, 10, 5, 10);
        // 10 is NOT < 10, so not coverage_risk; also 10 < 14 → approaching_critical
        expect(result.riskLevel).not.toBe("coverage_risk");
    });
});

// ─── approaching_critical ─────────────────────────────────────────────────────

describe("computeStockRiskLevel — approaching_critical", () => {
    it("coverageDays <= 14 with leadTimeDays null → 'approaching_critical'", () => {
        // available=40, dailyUsage=5 → coverageDays = round(40/5) = 8; no leadTimeDays
        const result = computeStockRiskLevel(40, 10, 5, null);
        expect(result.riskLevel).toBe("approaching_critical");
    });

    it("coverageDays === 14 → 'approaching_critical'", () => {
        // available=70, dailyUsage=5 → coverageDays = round(70/5) = 14
        const result = computeStockRiskLevel(70, 10, 5, null);
        expect(result.riskLevel).toBe("approaching_critical");
    });

    it("coverageDays just above leadTimeDays but <= 14 → 'approaching_critical'", () => {
        // coverageDays=10, leadTimeDays=7 → 10 >= 7 (not coverage_risk) but 10 <= 14
        const result = computeStockRiskLevel(50, 10, 5, 7);
        // round(50/5) = 10; 10 >= 7 → not coverage_risk; 10 <= 14 → approaching_critical
        expect(result.riskLevel).toBe("approaching_critical");
    });

    it("reason includes coverageDays value", () => {
        const result = computeStockRiskLevel(40, 10, 5, null);
        expect(result.reason).toContain("8");
    });
});

// ─── healthy — no risk ────────────────────────────────────────────────────────

describe("computeStockRiskLevel — healthy, no risk", () => {
    it("coverageDays > 30 and no leadTimeDays → 'none'", () => {
        // available=200, dailyUsage=5 → coverageDays = round(200/5) = 40
        const result = computeStockRiskLevel(200, 10, 5, null);
        expect(result.riskLevel).toBe("none");
    });

    it("coverageDays > 30 and coverageDays >= leadTimeDays → 'none'", () => {
        // coverageDays=40, leadTimeDays=14 → 40 >= 14 (not coverage_risk); 40 > 30 (not approaching)
        const result = computeStockRiskLevel(200, 10, 5, 14);
        expect(result.riskLevel).toBe("none");
    });

    it("coverageDays > 14 with large leadTimeDays but still >= leadTimeDays → 'none' is overridden by coverage_risk", () => {
        // Clarification: if coverageDays < leadTimeDays → coverage_risk regardless
        // coverageDays=20, leadTimeDays=30 → 20 < 30 → coverage_risk
        const result = computeStockRiskLevel(100, 10, 5, 30);
        expect(result.riskLevel).toBe("coverage_risk");
    });
});

// ─── priority: coverage_risk > approaching_critical ──────────────────────────

describe("computeStockRiskLevel — priority: coverage_risk wins over approaching_critical", () => {
    it("both conditions met → 'coverage_risk'", () => {
        // coverageDays=5 (< leadTimeDays=14 AND <= 14)
        // available=25, dailyUsage=5 → round(25/5) = 5; leadTimeDays=14
        const result = computeStockRiskLevel(25, 10, 5, 14);
        expect(result.riskLevel).toBe("coverage_risk");
    });

    it("coverage_risk wins when both would fire", () => {
        const result = computeStockRiskLevel(25, 10, 5, 14);
        expect(result.riskLevel).not.toBe("approaching_critical");
    });
});

// ─── result shape contract ────────────────────────────────────────────────────

describe("computeStockRiskLevel — result shape contract", () => {
    it("always returns all five fields", () => {
        const result = computeStockRiskLevel(100, 10, 5, 14);
        expect(Object.keys(result).sort()).toEqual(
            ["coverageDays", "dailyUsage", "leadTimeDays", "reason", "riskLevel"]
        );
    });

    it("riskLevel is always a valid StockRiskLevel string", () => {
        const valid = new Set(["none", "coverage_risk", "approaching_critical"]);
        const r1 = computeStockRiskLevel(100, 10, 5, 14);
        const r2 = computeStockRiskLevel(5, 10, 5, 14);
        const r3 = computeStockRiskLevel(100, 10, null, 14);
        expect(valid.has(r1.riskLevel)).toBe(true);
        expect(valid.has(r2.riskLevel)).toBe(true);
        expect(valid.has(r3.riskLevel)).toBe(true);
    });

    it("reason is always a string", () => {
        const r1 = computeStockRiskLevel(100, 10, 5, 14);
        const r2 = computeStockRiskLevel(5, 10, null, null);
        expect(typeof r1.reason).toBe("string");
        expect(typeof r2.reason).toBe("string");
    });

    it("when riskLevel is 'none', reason is empty string", () => {
        const result = computeStockRiskLevel(100, 10, null, null);
        expect(result.riskLevel).toBe("none");
        expect(result.reason).toBe("");
    });

    it("coverageDays is null when dailyUsage is null", () => {
        const result = computeStockRiskLevel(100, 10, null, null);
        expect(result.coverageDays).toBeNull();
    });

    it("leadTimeDays is preserved from input", () => {
        const result = computeStockRiskLevel(100, 10, null, 21);
        expect(result.leadTimeDays).toBe(21);
    });

    it("dailyUsage is preserved from input when null", () => {
        const result = computeStockRiskLevel(100, 10, null, null);
        expect(result.dailyUsage).toBeNull();
    });
});
