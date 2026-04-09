/**
 * Tests for shouldSuggestReorder (src/lib/stock-utils.ts)
 *
 * Kurallar:
 *   - !isActive → false (her durumda)
 *   - available <= min → true (backend purchase-service ile aligned: <= kullanır)
 *   - available > min AND orderDeadline ≤ 7 gün → true (Faz 4 proaktif değer)
 *   - available > min AND deadline > 7 gün veya null → false
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shouldSuggestReorder } from "@/lib/stock-utils";

// Sabit "bugün" → 2024-06-01 gece yarısı UTC (deterministik, ISO date hesabıyla tam hizalı)
const FIXED_NOW = new Date("2024-06-01T00:00:00Z").getTime();

function daysFromNow(days: number): string {
    return new Date(FIXED_NOW + days * 86_400_000).toISOString().slice(0, 10);
}

beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ── Temel Kurallar ────────────────────────────────────────────

describe("shouldSuggestReorder — temel kurallar", () => {
    it("!isActive → her koşulda false", () => {
        expect(shouldSuggestReorder({ isActive: false, available: 5, min: 10, orderDeadline: null })).toBe(false);
        // Stok kötü ama inactive → hâlâ false
        expect(shouldSuggestReorder({ isActive: false, available: 0, min: 10, orderDeadline: daysFromNow(2) })).toBe(false);
    });

    it("stok minimumun altında → true", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 5, min: 10, orderDeadline: null })).toBe(true);
    });

    it("stok == min (off-by-one fix: <= kullanılır) → true", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 10, min: 10, orderDeadline: null })).toBe(true);
    });

    it("stok yeterli, deadline yok → false", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10, orderDeadline: null })).toBe(false);
    });

    it("stok yeterli, orderDeadline undefined → false", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10 })).toBe(false);
    });
});

// ── Deadline Penceresi ────────────────────────────────────────

describe("shouldSuggestReorder — deadline penceresi (stok yeterli)", () => {
    it("deadline 5 gün → true (pencere içinde)", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10, orderDeadline: daysFromNow(5) })).toBe(true);
    });

    it("deadline tam 7 gün → true (boundary dahil)", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10, orderDeadline: daysFromNow(7) })).toBe(true);
    });

    it("deadline 8 gün → false (pencere dışı)", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10, orderDeadline: daysFromNow(8) })).toBe(false);
    });

    it("deadline 10 gün → false", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10, orderDeadline: daysFromNow(10) })).toBe(false);
    });

    it("deadline geçmişte (negatif gün) → true (acil)", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10, orderDeadline: daysFromNow(-3) })).toBe(true);
    });

    it("deadline bugün (0 gün) → true", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10, orderDeadline: daysFromNow(0) })).toBe(true);
    });
});

// ── Kombinasyonlar ────────────────────────────────────────────

describe("shouldSuggestReorder — stok + deadline kombinasyonları", () => {
    it("stok == min ve deadline > 7 gün → true (stok kuralı tetikler)", () => {
        expect(shouldSuggestReorder({ isActive: true, available: 10, min: 10, orderDeadline: daysFromNow(20) })).toBe(true);
    });

    it("stok > min ve deadline null string → false", () => {
        // orderDeadline string null ise (API'den null gelebilir)
        expect(shouldSuggestReorder({ isActive: true, available: 20, min: 10, orderDeadline: null })).toBe(false);
    });
});
