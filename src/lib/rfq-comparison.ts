/**
 * RFQ karşılaştırma — saf yardımcılar (UI'dan bağımsız, test edilebilir).
 *
 * "Kim ne kadar verdi" matrisinde satır başına en iyi (en ucuz) tedarikçiyi bulur.
 * Tedarikçiler farklı para biriminde teklif verebilir → karşılaştırma ortak baz
 * para birimine (varsayılan TRY) çevrilmiş değerle yapılır; ekranda orijinal gösterilir.
 */

/** currency → 1 birimin baz para birimi (TRY) karşılığı. Örn. {TRY:1, USD:34, EUR:37}. */
export type RateMap = Record<string, number>;

/** Tutarı baz para birimine çevir. Kur yoksa 1 (çeviri yapılmaz) — defansif. */
export function toBase(amount: number, currency: string, rates: RateMap): number {
    const rate = rates[currency];
    return amount * (Number.isFinite(rate) && rate! > 0 ? rate! : 1);
}

export interface PriceCell {
    vendorId: string;
    unitPrice: number | null;
    currency: string;
}

export interface BestPick {
    vendorId: string;
    unitPrice: number;
    currency: string;
    converted: number;
}

/**
 * Bir kalem için verilen hücrelerden en ucuzunu seç (baz çevrili). Hiç fiyat yoksa
 * null. Eşitlikte ilk gelen kazanır (deterministik). null fiyat = "teklif vermedi"
 * → atlanır.
 */
export function bestCellForLine(cells: PriceCell[], rates: RateMap): BestPick | null {
    let best: BestPick | null = null;
    for (const c of cells) {
        if (c.unitPrice == null) continue;
        const converted = toBase(c.unitPrice, c.currency, rates);
        if (best === null || converted < best.converted) {
            best = { vendorId: c.vendorId, unitPrice: c.unitPrice, currency: c.currency, converted };
        }
    }
    return best;
}

export interface ComparisonLine {
    rfqLineId: string;
    cells: PriceCell[];
}

/** rfqLineId → o satırın en iyi (en ucuz) tedarikçisi. Fiyatsız satır haritada yer almaz. */
export function bestVendorPerLine(lines: ComparisonLine[], rates: RateMap): Map<string, BestPick> {
    const out = new Map<string, BestPick>();
    for (const line of lines) {
        const best = bestCellForLine(line.cells, rates);
        if (best) out.set(line.rfqLineId, best);
    }
    return out;
}
