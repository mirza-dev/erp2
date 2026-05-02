export interface OrderTotalsItem {
    id: string;
    costPrice: number | null;
    price: number | null;
    currency: string;
    suggestQty: number;
    decidedStatus?: string;
    decidedQty?: number;
}

export interface OrderTotalsResult {
    totalsByCurrency: Map<string, { total: number; accepted: number }>;
    currencyEntries: Array<[string, { total: number; accepted: number }]>;
    isSingleCurrency: boolean;
    primaryCurrency: string;
    primaryTotal: number;
    primaryAccepted: number;
    missingPriceCount: number;
}

/**
 * Groups order cost estimates by currency, respecting edited quantities and
 * accepted decisions. Products with no unit price are counted separately.
 * TRY is sorted first so single-currency UX remains unchanged.
 */
export function computeOrderTotals(items: OrderTotalsItem[]): OrderTotalsResult {
    const totalsByCurrency = new Map<string, { total: number; accepted: number }>();
    let missingPriceCount = 0;

    for (const item of items) {
        const qty = item.decidedStatus === "edited" && item.decidedQty != null
            ? item.decidedQty
            : item.suggestQty;
        const unitPrice = item.costPrice ?? item.price ?? null;
        if (unitPrice === null) {
            missingPriceCount++;
            continue;
        }
        const currency = item.currency || "TRY";
        const lineCost = qty * unitPrice;
        const bucket = totalsByCurrency.get(currency) ?? { total: 0, accepted: 0 };
        bucket.total += lineCost;
        if (item.decidedStatus === "accepted") bucket.accepted += lineCost;
        totalsByCurrency.set(currency, bucket);
    }

    const currencyEntries = [...totalsByCurrency.entries()].sort(
        (a, b) => (a[0] === "TRY" ? -1 : b[0] === "TRY" ? 1 : a[0].localeCompare(b[0]))
    );
    const isSingleCurrency = currencyEntries.length <= 1;
    const primaryCurrency = currencyEntries[0]?.[0] ?? "TRY";
    const primaryTotal = currencyEntries[0]?.[1].total ?? 0;
    const primaryAccepted = currencyEntries[0]?.[1].accepted ?? 0;

    return { totalsByCurrency, currencyEntries, isSingleCurrency, primaryCurrency, primaryTotal, primaryAccepted, missingPriceCount };
}

/**
 * Mutation sonrası loadAiData çağrısını 300ms (default) gecikmeyle planlar.
 * Aynı timer ref'i ile birden fazla çağrı: önceki timer iptal edilir, sadece son
 * planlama çalışır (debounce). 4 handler arasında duplicate edilen pattern'in
 * tek noktada tutulması için extract.
 */
export function scheduleRefetchAfterMutation(
    timerRef: { current: ReturnType<typeof setTimeout> | undefined },
    loadFn: () => void,
    delayMs = 300,
): void {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(loadFn, delayMs);
}

/**
 * Demo modda /api/ai/purchase-copilot POST middleware tarafından 403 veriyor.
 * UI da çağrı yapmadan önce kısa devre yapmalı (gereksiz network + sessiz toast'tan
 * kaçınma). Bu helper karar mantığını tek noktada tutar; loadAiData içinde
 * if (shouldSkipAiFetch(isDemo)) return; pattern'iyle kullanılır.
 */
export function shouldSkipAiFetch(isDemo: boolean): boolean {
    return isDemo;
}
