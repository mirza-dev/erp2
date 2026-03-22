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
            return `${base} Günlük kullanım: ${dailyUsage} ${unit}/gün → ~${coverageDays} gün sonra tükenebilir.${ltPart}`;
        }
        return `${base} Günlük kullanım verisi yok — tükenme süresi hesaplanamıyor.`;
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
