/**
 * Tests for computeOrderDeadline (src/lib/stock-utils.ts)
 *
 * Formül:
 *   stockout_date  = today + floor(promisable / daily_usage)
 *   order_deadline = stockout_date - lead_time_days - 7 (SAFETY_BUFFER_DAYS)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeOrderDeadline } from "@/lib/stock-utils";

// Sabit "bugün" → 2024-01-15 (zorla deterministik)
const FIXED_NOW = new Date("2024-01-15T12:00:00Z").getTime();

beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ── daily_usage guard ─────────────────────────────────────────

describe("computeOrderDeadline — daily_usage guard", () => {
    it("daily_usage null → her iki alan null", () => {
        const r = computeOrderDeadline(100, null, 30);
        expect(r.stockoutDate).toBeNull();
        expect(r.orderDeadline).toBeNull();
    });

    it("daily_usage 0 → her iki alan null", () => {
        const r = computeOrderDeadline(100, 0, 30);
        expect(r.stockoutDate).toBeNull();
        expect(r.orderDeadline).toBeNull();
    });

    it("daily_usage undefined → her iki alan null", () => {
        const r = computeOrderDeadline(100, undefined, 30);
        expect(r.stockoutDate).toBeNull();
        expect(r.orderDeadline).toBeNull();
    });
});

// ── lead_time_days guard ──────────────────────────────────────

describe("computeOrderDeadline — lead_time_days guard", () => {
    it("lead_time_days null → stockoutDate hesaplanır, orderDeadline null", () => {
        // promisable=100, daily_usage=10 → stockout 10 gün sonra = 2024-01-25
        const r = computeOrderDeadline(100, 10, null);
        expect(r.stockoutDate).toBe("2024-01-25");
        expect(r.orderDeadline).toBeNull();
    });

    it("lead_time_days 0 → stockoutDate hesaplanır, orderDeadline null", () => {
        const r = computeOrderDeadline(100, 10, 0);
        expect(r.stockoutDate).toBe("2024-01-25");
        expect(r.orderDeadline).toBeNull();
    });
});

// ── stockout_date hesabı ──────────────────────────────────────

describe("computeOrderDeadline — stockoutDate", () => {
    it("promisable=100, daily_usage=10 → stockout 10 gün sonra (2024-01-25)", () => {
        const { stockoutDate } = computeOrderDeadline(100, 10, 30);
        expect(stockoutDate).toBe("2024-01-25");
    });

    it("promisable=0 → stockout bugün (2024-01-15)", () => {
        const { stockoutDate } = computeOrderDeadline(0, 10, 30);
        expect(stockoutDate).toBe("2024-01-15");
    });

    it("promisable negatif → stockout geçmişte", () => {
        // -50 / 10 = -5 gün → 2024-01-10
        const { stockoutDate } = computeOrderDeadline(-50, 10, 30);
        expect(stockoutDate).toBe("2024-01-10");
    });

    it("floor uygulanır — 15/10 = 1 gün (1.5 değil)", () => {
        const { stockoutDate } = computeOrderDeadline(15, 10, 30);
        expect(stockoutDate).toBe("2024-01-16");
    });
});

// ── order_deadline hesabı ─────────────────────────────────────

describe("computeOrderDeadline — orderDeadline", () => {
    it("promisable=100, daily_usage=10, lead=30 → deadline 10-30-7 = -27 gün önce (geçmişte)", () => {
        // stockout_days=10, deadline_days = 10-30-7 = -27 → 2024-01-15 - 27 = 2023-12-19
        const { orderDeadline } = computeOrderDeadline(100, 10, 30);
        expect(orderDeadline).toBe("2023-12-19");
    });

    it("SAFETY_BUFFER_DAYS = 7 etkisi: lead=0 iken deadline = stockout - 7", () => {
        // lead_time_days=1, promisable=80, daily_usage=10 → stockout_days=8
        // deadline_days = 8 - 1 - 7 = 0 → bugün (2024-01-15)
        const { orderDeadline } = computeOrderDeadline(80, 10, 1);
        expect(orderDeadline).toBe("2024-01-15");
    });

    it("deadline gelecekte — promisable yeterince büyük", () => {
        // promisable=500, daily_usage=10 → stockout_days=50
        // deadline_days = 50 - 30 - 7 = 13 → 2024-01-28
        const { orderDeadline } = computeOrderDeadline(500, 10, 30);
        expect(orderDeadline).toBe("2024-01-28");
    });
});
