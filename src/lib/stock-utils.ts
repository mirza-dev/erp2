/**
 * Shared stock risk utilities — used by alert-service, purchase-service,
 * alerts page, and purchase/suggested page.
 */

// ── Coverage Days ────────────────────────────────────────────

/** Days of stock remaining. Returns null if dailyUsage is unknown or zero. */
export function computeCoverageDays(available: number, dailyUsage?: number | null): number | null {
    if (!dailyUsage || dailyUsage <= 0) return null;
    return Math.round(available / dailyUsage);
}

// ── Lead Time Demand ─────────────────────────────────────────

/** Demand during supplier lead time. Returns null if either input is unknown. */
export function computeLeadTimeDemand(
    dailyUsage: number | null | undefined,
    leadTimeDays: number | null | undefined
): number | null {
    if (!dailyUsage || dailyUsage <= 0) return null;
    if (!leadTimeDays || leadTimeDays <= 0) return null;
    return Math.ceil(dailyUsage * leadTimeDays);
}

// ── Target Stock ─────────────────────────────────────────────

export interface TargetStockResult {
    target: number;
    formula: "lead_time" | "fallback";
    leadTimeDemand: number | null;
    safetyStock: number;
}

/**
 * Compute target stock level.
 * - Lead-time formula (veri var): demand_during_lead_time + safety_stock (= min)
 * - Fallback (veri yok): min × 2
 */
export function computeTargetStock(
    min: number,
    dailyUsage: number | null | undefined,
    leadTimeDays: number | null | undefined
): TargetStockResult {
    const leadTimeDemand = computeLeadTimeDemand(dailyUsage, leadTimeDays);

    if (leadTimeDemand !== null) {
        return {
            target: leadTimeDemand + min,
            formula: "lead_time",
            leadTimeDemand,
            safetyStock: min,
        };
    }

    return {
        target: min * 2,
        formula: "fallback",
        leadTimeDemand: null,
        safetyStock: min,
    };
}

// ── Urgency ──────────────────────────────────────────────────

/** Urgency %: (1 - available/min) * 100, clamped 0–100. */
export function computeUrgencyPct(available: number, min: number): number {
    if (min <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - available / min) * 100)));
}

// ── Color helpers (CSS variable strings) ─────────────────────

export function daysColor(days: number | null): string {
    if (days === null) return "var(--warning-text)";
    if (days <= 7) return "var(--danger-text)";
    if (days <= 14) return "var(--warning-text)";
    return "var(--text-secondary)";
}

export function daysBg(days: number | null): string {
    if (days === null) return "var(--warning-bg)";
    if (days <= 7) return "var(--danger-bg)";
    if (days <= 14) return "var(--warning-bg)";
    return "var(--bg-tertiary)";
}

// ── Risk Inputs ──────────────────────────────────────────────

export interface StockRiskInputs {
    available: number;
    min: number;
    dailyUsage: number | null;
    coverageDays: number | null;
    leadTimeDays: number | null;
    unit: string;
}

// ── Description Builders ─────────────────────────────────────

export function buildStockAlertDescription(
    inputs: StockRiskInputs,
    severity: "critical" | "warning"
): string {
    const { available, min, dailyUsage, coverageDays, leadTimeDays, unit } = inputs;

    if (severity === "critical") {
        const base = `Mevcut stok ${available} ${unit} (min: ${min}).`;
        if (dailyUsage && coverageDays !== null) {
            const ltPart = leadTimeDays ? ` Tedarik süresi: ${leadTimeDays} gün.` : "";
            return `${base} Günlük kullanım: ${dailyUsage} ${unit}/gün → ~${coverageDays} günlük stok kaldı.${ltPart}`;
        }
        return `${base} Günlük kullanım verisi yok.`;
    }

    // warning
    const threshold = Math.ceil(min * 1.5);
    const base = `Stok ${available} ${unit}, uyarı eşiğine (${threshold}) yaklaşıyor.`;
    if (dailyUsage && coverageDays !== null) {
        const ltPart = leadTimeDays ? ` Tedarik süresi: ${leadTimeDays} gün.` : "";
        return `${base} Günlük kullanım: ${dailyUsage} ${unit}/gün → ~${coverageDays} gün kaldı.${ltPart}`;
    }
    return base;
}

// ── Stock Risk Level ──────────────────────────────────────────

export type StockRiskLevel = "none" | "coverage_risk" | "approaching_critical";

export interface StockRiskComputation {
    riskLevel: StockRiskLevel;
    coverageDays: number | null;
    leadTimeDays: number | null;
    dailyUsage: number | null;
    reason: string;        // iç/ham — metadata'ya yazılır, AI'a gönderilir
    displayReason: string; // kısa, müşteri dili — drawer'da gösterilir
}

/**
 * Compute forward-looking risk level for a product.
 * Only applies to products ABOVE the deterministic alert threshold (available > ceil(min * 1.5)).
 * Returns "none" for products already handled by the alert system.
 */
export function computeStockRiskLevel(
    available: number,
    min: number,
    dailyUsage: number | null | undefined,
    leadTimeDays: number | null | undefined,
): StockRiskComputation {
    const noRisk = (coverageDays: number | null = null): StockRiskComputation => ({
        riskLevel: "none",
        coverageDays,
        leadTimeDays: leadTimeDays ?? null,
        dailyUsage: dailyUsage ?? null,
        reason: "",
        displayReason: "",
    });

    // Step 1: Already in deterministic alert zone — alert-service handles these
    if (available <= Math.ceil(min * 1.5)) return noRisk();

    // Step 2: No daily usage data — no fake certainty
    if (!dailyUsage || dailyUsage <= 0) return noRisk();

    // Step 3: Compute coverage days
    const coverageDays = computeCoverageDays(available, dailyUsage);

    // Step 4: coverage_risk — priority over approaching_critical
    if (coverageDays !== null && leadTimeDays && leadTimeDays > 0 && coverageDays < leadTimeDays) {
        return {
            riskLevel: "coverage_risk",
            coverageDays,
            leadTimeDays: leadTimeDays ?? null,
            dailyUsage: dailyUsage ?? null,
            reason: `Kalan stok (~${coverageDays} gün) tedarik süresinden (${leadTimeDays} gün) kısa.`,
            displayReason: `~${coverageDays} günlük stok var, yeni sipariş ${leadTimeDays} gün sürer.`,
        };
    }

    // Step 5: approaching_critical
    if (coverageDays !== null && coverageDays <= 30) {
        return {
            riskLevel: "approaching_critical",
            coverageDays,
            leadTimeDays: leadTimeDays ?? null,
            dailyUsage: dailyUsage ?? null,
            reason: `Mevcut tüketim hızıyla ~${coverageDays} gün içinde kritik seviyeye düşebilir.`,
            displayReason: `~${coverageDays} gün içinde stok kritik seviyeye düşebilir.`,
        };
    }

    // Step 6: Default — no risk
    return noRisk(coverageDays);
}

export function buildPurchaseDescription(
    inputs: StockRiskInputs & {
        suggestQty: number;
        moq: number;
        preferredVendor: string | null;
        targetStock: number;
        formula: "lead_time" | "fallback";
        leadTimeDemand: number | null;
    }
): string {
    const {
        available, min, dailyUsage, coverageDays, leadTimeDays, unit,
        suggestQty, moq, preferredVendor, targetStock,
        formula, leadTimeDemand,
    } = inputs;

    const parts: string[] = [];
    parts.push(`Stok ${available}/${min} (min).`);

    if (dailyUsage && coverageDays !== null) {
        parts.push(`Günlük kullanım ${dailyUsage} → ~${coverageDays} gün kaldı.`);
    }

    if (formula === "lead_time" && leadTimeDemand !== null && leadTimeDays) {
        parts.push(
            `Hedef: ${targetStock} (tedarik ${leadTimeDays} gün × ${dailyUsage}/gün = ${leadTimeDemand} + emniyet ${min}).`
        );
    } else {
        parts.push(`Hedef: ${targetStock} (2×min — tedarik süresi bilinmiyor).`);
    }

    parts.push(`MOQ: ${moq}.`);

    if (preferredVendor) {
        parts.push(`Tedarikçi: ${preferredVendor}.`);
    }

    parts.push(`Önerilen sipariş: ${suggestQty} ${unit}.`);

    return parts.join(" ");
}

// ── Date Utilities ───────────────────────────────────────────

/**
 * Format a UTC timestamp as YYYY-MM-DD using local timezone.
 * Avoids the UTC-midnight drift that toISOString() causes for UTC+ zones
 * (e.g., at 00:30 Istanbul, toISOString() returns yesterday's UTC date).
 */
function localISODate(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * How many calendar days from today (local timezone) to the given ISO date.
 *
 * Uses local date components — toISOString() gives UTC, which at local midnight
 * (00:00–02:59 in UTC+3 zones) reports the previous day → 1-day off.
 */
export function dateDaysFromToday(isoDate: string): number {
    const todayStr = localISODate(Date.now());
    const todayMs = new Date(todayStr).getTime();
    return Math.round((new Date(isoDate).getTime() - todayMs) / 86_400_000);
}

// ── Order Deadline ───────────────────────────────────────────

const SAFETY_BUFFER_DAYS = 7;

export interface OrderDeadlineResult {
    stockoutDate:  string | null;   // ISO date (YYYY-MM-DD)
    orderDeadline: string | null;   // ISO date (YYYY-MM-DD)
}

/**
 * Kaç gün sonra stok tükenir ve en geç ne zaman sipariş verilmeli?
 *
 * stockout_date  = today + floor(promisable / daily_usage)
 * order_deadline = stockout_date - lead_time_days - SAFETY_BUFFER_DAYS (7)
 *
 * daily_usage null/0  → her iki alan null
 * lead_time_days null → stockoutDate hesaplanır, orderDeadline null
 * promisable ≤ 0      → stockout bugün veya geçmişte → deadline negatif
 */
export function computeOrderDeadline(
    promisable: number,
    dailyUsage:   number | null | undefined,
    leadTimeDays: number | null | undefined,
): OrderDeadlineResult {
    if (!dailyUsage || dailyUsage <= 0) return { stockoutDate: null, orderDeadline: null };

    const stockoutDays = Math.floor(promisable / dailyUsage);
    const stockoutDate = localISODate(Date.now() + stockoutDays * 86_400_000);

    if (!leadTimeDays || leadTimeDays <= 0) return { stockoutDate, orderDeadline: null };

    const orderDeadline = localISODate(Date.now() + (stockoutDays - leadTimeDays - SAFETY_BUFFER_DAYS) * 86_400_000);
    return { stockoutDate, orderDeadline };
}

// ── Reorder Suggestion Filter ────────────────────────────────

const REORDER_DEADLINE_WINDOW_DAYS = 7;

/**
 * Bir ürünün satın alma önerileri havuzuna girip girmeyeceğini belirler.
 *
 *   - Aktif olmalı
 *   - Stok minimumun altında veya eşit (backend purchase-service ile aligned: <=)
 *   - VEYA sipariş son tarihi ≤ 7 gün içinde (stok yeterli olsa bile proaktif sipariş gerek)
 */
export function shouldSuggestReorder(args: {
    isActive: boolean;
    available: number;
    min: number;
    orderDeadline?: string | null;
}): boolean {
    if (!args.isActive) return false;
    if (args.available <= args.min) return true;
    if (args.orderDeadline) {
        if (dateDaysFromToday(args.orderDeadline) <= REORDER_DEADLINE_WINDOW_DAYS) return true;
    }
    return false;
}

// ── Status Badge ──────────────────────────────────────────────

export interface StatusBadge {
    label: string;
    cls: string;
}

/**
 * Product status badge. Priority: Tükendi > Kritik > Düşük > Riskli > Hazır.
 * "Düşük" eşiği (min * 2) backend warning eşiğinden (ceil(min * 1.5)) kasıtlı olarak geniştir.
 */
export function getStatusBadge(available: number, min: number, hasRisk?: boolean): StatusBadge {
    if (available === 0) return { label: "Tükendi", cls: "badge-danger" };
    if (available <= min) return { label: "Kritik", cls: "badge-danger" };
    if (available <= min * 2) return { label: "Düşük", cls: "badge-warning" };
    if (hasRisk) return { label: "Riskli", cls: "badge-info" };
    return { label: "Hazır", cls: "badge-success" };
}
