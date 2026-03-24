import { describe, it, expect } from "vitest";
import {
  computeCoverageDays,
  computeLeadTimeDemand,
  computeTargetStock,
  computeUrgencyPct,
  daysColor,
  daysBg,
} from "@/lib/stock-utils";

// ── computeCoverageDays ──────────────────────────────────────

describe("computeCoverageDays", () => {
  it("returns days rounded to nearest integer", () => {
    expect(computeCoverageDays(100, 10)).toBe(10);
    expect(computeCoverageDays(15, 4)).toBe(4); // 3.75 → 4
  });

  it("returns null when dailyUsage is zero", () => {
    expect(computeCoverageDays(100, 0)).toBeNull();
  });

  it("returns null when dailyUsage is undefined", () => {
    expect(computeCoverageDays(100, undefined)).toBeNull();
  });

  it("returns null when dailyUsage is null", () => {
    expect(computeCoverageDays(100, null)).toBeNull();
  });

  it("returns 0 when available is 0", () => {
    expect(computeCoverageDays(0, 10)).toBe(0);
  });
});

// ── computeLeadTimeDemand ────────────────────────────────────

describe("computeLeadTimeDemand", () => {
  it("returns ceiled demand during lead time", () => {
    expect(computeLeadTimeDemand(10, 3)).toBe(30);
    expect(computeLeadTimeDemand(3.5, 4)).toBe(14); // 14.0 exact
    expect(computeLeadTimeDemand(3.3, 4)).toBe(14); // 13.2 → ceil → 14
  });

  it("returns null when dailyUsage is null or zero", () => {
    expect(computeLeadTimeDemand(null, 5)).toBeNull();
    expect(computeLeadTimeDemand(0, 5)).toBeNull();
  });

  it("returns null when leadTimeDays is null or zero", () => {
    expect(computeLeadTimeDemand(10, null)).toBeNull();
    expect(computeLeadTimeDemand(10, 0)).toBeNull();
  });
});

// ── computeTargetStock ───────────────────────────────────────

describe("computeTargetStock", () => {
  it("uses lead_time formula when both dailyUsage and leadTimeDays are known", () => {
    const result = computeTargetStock(20, 5, 10);
    expect(result.formula).toBe("lead_time");
    expect(result.leadTimeDemand).toBe(50); // 5 × 10
    expect(result.safetyStock).toBe(20);
    expect(result.target).toBe(70); // 50 + 20
  });

  it("falls back to min×2 when dailyUsage is unknown", () => {
    const result = computeTargetStock(20, null, 10);
    expect(result.formula).toBe("fallback");
    expect(result.target).toBe(40);
    expect(result.leadTimeDemand).toBeNull();
  });

  it("falls back to min×2 when leadTimeDays is unknown", () => {
    const result = computeTargetStock(20, 5, null);
    expect(result.formula).toBe("fallback");
    expect(result.target).toBe(40);
  });
});

// ── computeUrgencyPct ────────────────────────────────────────

describe("computeUrgencyPct", () => {
  it("returns 0 when available equals min", () => {
    expect(computeUrgencyPct(10, 10)).toBe(0);
  });

  it("returns 100 when available is 0 and min > 0", () => {
    expect(computeUrgencyPct(0, 10)).toBe(100);
  });

  it("returns 50 when available is half of min", () => {
    expect(computeUrgencyPct(5, 10)).toBe(50);
  });

  it("returns 0 when min is 0 (avoid division by zero)", () => {
    expect(computeUrgencyPct(5, 0)).toBe(0);
  });

  it("clamps to 100 when available is negative", () => {
    expect(computeUrgencyPct(-5, 10)).toBe(100);
  });

  it("clamps to 0 when available exceeds min", () => {
    expect(computeUrgencyPct(20, 10)).toBe(0);
  });
});

// ── daysColor ────────────────────────────────────────────────

describe("daysColor", () => {
  it("returns danger color for ≤7 days", () => {
    expect(daysColor(0)).toBe("var(--danger-text)");
    expect(daysColor(7)).toBe("var(--danger-text)");
  });

  it("returns warning color for 8–14 days", () => {
    expect(daysColor(8)).toBe("var(--warning-text)");
    expect(daysColor(14)).toBe("var(--warning-text)");
  });

  it("returns secondary color for >14 days", () => {
    expect(daysColor(15)).toBe("var(--text-secondary)");
    expect(daysColor(100)).toBe("var(--text-secondary)");
  });

  it("returns warning color when days is null (unknown)", () => {
    expect(daysColor(null)).toBe("var(--warning-text)");
  });
});

// ── daysBg ───────────────────────────────────────────────────

describe("daysBg", () => {
  it("returns danger bg for ≤7 days", () => {
    expect(daysBg(3)).toBe("var(--danger-bg)");
  });

  it("returns warning bg for 8–14 days", () => {
    expect(daysBg(10)).toBe("var(--warning-bg)");
  });

  it("returns tertiary bg for >14 days", () => {
    expect(daysBg(30)).toBe("var(--bg-tertiary)");
  });

  it("returns warning bg when null", () => {
    expect(daysBg(null)).toBe("var(--warning-bg)");
  });
});
