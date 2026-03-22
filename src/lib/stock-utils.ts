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
    unit: string;
}

// ── Description Builders ─────────────────────────────────────

export function buildStockAlertDescription(
    inputs: StockRiskInputs,
    severity: "critical" | "warning"
): string {
    const { available, min, dailyUsage, coverageDays, unit } = inputs;

    if (severity === "critical") {
        const base = `Mevcut stok ${available} ${unit} (min: ${min}).`;
        if (dailyUsage && coverageDays !== null) {
            return `${base} Günlük kullanım: ${dailyUsage} ${unit}/gün → ~${coverageDays} gün sonra tükenebilir.`;
        }
        return `${base} Günlük kullanım verisi yok — tükenme süresi hesaplanamıyor.`;
    }

    // warning
    const threshold = Math.ceil(min * 1.5);
    const base = `Stok ${available} ${unit}, uyarı eşiğine (${threshold}) yaklaşıyor.`;
    if (dailyUsage && coverageDays !== null) {
        return `${base} Günlük kullanım: ${dailyUsage} ${unit}/gün → ~${coverageDays} gün kaldı.`;
    }
    return base;
}

export function buildPurchaseDescription(
    inputs: StockRiskInputs & {
        suggestQty: number;
        moq: number;
        preferredVendor: string | null;
        targetStock: number;
    }
): string {
    const { available, min, dailyUsage, coverageDays, unit, suggestQty, moq, preferredVendor, targetStock } = inputs;

    const parts: string[] = [];
    parts.push(`Stok ${available}/${min} (min).`);

    if (dailyUsage && coverageDays !== null) {
        parts.push(`Günlük kullanım ${dailyUsage} → ~${coverageDays} gün kaldı.`);
    }

    parts.push(`Hedef: ${targetStock} (2×min). MOQ: ${moq}.`);

    if (preferredVendor) {
        parts.push(`Tedarikçi: ${preferredVendor}.`);
    }

    parts.push(`Önerilen sipariş: ${suggestQty} ${unit}.`);

    return parts.join(" ");
}
