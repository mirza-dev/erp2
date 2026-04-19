/**
 * Tests for shouldSuggestReorder (src/lib/stock-utils.ts)
 *
 * Kurallar:
 *   - !isActive → false (her durumda)
 *   - !isForPurchase → false (satın almaya uygun değil)
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
        expect(shouldSuggestReorder({ isActive: false, productType: "commercial", available: 5, min: 10, orderDeadline: null })).toBe(false);
        // Stok kötü ama inactive → hâlâ false
        expect(shouldSuggestReorder({ isActive: false, productType: "commercial", available: 0, min: 10, orderDeadline: daysFromNow(2) })).toBe(false);
    });

    it("stok minimumun altında → true", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 5, min: 10, orderDeadline: null })).toBe(true);
    });

    it("stok == min (off-by-one fix: <= kullanılır) → true", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 10, min: 10, orderDeadline: null })).toBe(true);
    });

    it("stok yeterli, deadline yok → false", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: null })).toBe(false);
    });

    it("stok yeterli, orderDeadline undefined → false", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10 })).toBe(false);
    });

    it("productType manufactured → stok kritik olsa bile false", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "manufactured", available: 0, min: 10, orderDeadline: null })).toBe(false);
    });

    it("productType manufactured → deadline yakın olsa bile false", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "manufactured", available: 20, min: 10, orderDeadline: daysFromNow(2) })).toBe(false);
    });
});

// ── Deadline Penceresi ────────────────────────────────────────

describe("shouldSuggestReorder — deadline penceresi (stok yeterli)", () => {
    it("deadline 5 gün → true (pencere içinde)", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: daysFromNow(5) })).toBe(true);
    });

    it("deadline tam 7 gün → true (boundary dahil)", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: daysFromNow(7) })).toBe(true);
    });

    it("deadline 8 gün → false (pencere dışı)", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: daysFromNow(8) })).toBe(false);
    });

    it("deadline 10 gün → false", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: daysFromNow(10) })).toBe(false);
    });

    it("deadline geçmişte (negatif gün) → true (acil)", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: daysFromNow(-3) })).toBe(true);
    });

    it("deadline bugün (0 gün) → true", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: daysFromNow(0) })).toBe(true);
    });
});

// ── Kombinasyonlar ────────────────────────────────────────────

describe("shouldSuggestReorder — stok + deadline kombinasyonları", () => {
    it("stok == min ve deadline > 7 gün → true (stok kuralı tetikler)", () => {
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 10, min: 10, orderDeadline: daysFromNow(20) })).toBe(true);
    });

    it("stok > min ve deadline null string → false", () => {
        // orderDeadline string null ise (API'den null gelebilir)
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: null })).toBe(false);
    });
});

// ── Timezone Drift Regression ─────────────────────────────────
// UTC+ saat diliminde (TRT +3) öğlen deadline bugünse true döner.

describe("shouldSuggestReorder — timezone drift (TRT noon)", () => {
    it("bugün olan deadline saat 12:00 TRT'de (09:00 UTC) → true", () => {
        const noon = new Date("2024-06-01T09:00:00Z").getTime(); // 12:00 TRT
        vi.spyOn(Date, "now").mockReturnValue(noon);
        // deadline = "2024-06-01" → dateDaysFromToday = 0 → ≤ 7 → true
        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: "2024-06-01" })).toBe(true);
    });

    // 00:00–02:59 penceresi: yerel bugünden 7 gün sonrası deadline → true döner.
    // Eski kod (UTC gün): deadline = yerel_bugün+7, ama UTC bugün = yerel_dün → daysLeft=8 → false (yanlış!)
    it("00:30 yerel saat — yerel bugünden 7 gün sonrası deadline → true", () => {
        // 1 Haziran 2024 00:30 Istanbul = 31 Mayıs 2024 21:30 UTC
        const istanbul0030 = new Date("2024-05-31T21:30:00Z").getTime();
        vi.spyOn(Date, "now").mockReturnValue(istanbul0030);

        // "yerel bugün" + 7 gün
        const d = new Date(istanbul0030);
        const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const sevenDaysLater = new Date(new Date(localToday).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

        expect(shouldSuggestReorder({ isActive: true, productType: "commercial", available: 20, min: 10, orderDeadline: sevenDaysLater })).toBe(true);
        // TZ=Europe/Istanbul: localToday="2024-06-01", sevenDaysLater="2024-06-08" → daysLeft=7 → true ✓
        //   Eski kod: UTC bugün="2024-05-31", daysLeft("2024-06-08")=8 → false (yanlış!)
        // TZ=UTC: localToday="2024-05-31", sevenDaysLater="2024-06-07" → daysLeft=7 → true ✓
    });
});
