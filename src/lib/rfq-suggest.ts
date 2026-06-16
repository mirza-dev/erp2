/**
 * RFQ tedarikçi önerisi — saf yardımcı (UI'dan bağımsız, test edilebilir).
 * Seçilen ürünleri tedarik eden tedarikçileri (`product_vendor_links`) önerir +
 * son bilinen fiyatlarını taşır. Öneri yoksa boş harita → form tüm aktif
 * tedarikçileri gösterir (davranış değişmez).
 */

export interface VendorLinkLite {
    product_id: string;
    vendor_id: string;
    last_unit_price: number | null;
    last_price_currency: string | null;
}

export interface VendorSuggestion {
    /** Seçili ürünlerden kaçını bu tedarikçi tedarik ediyor. */
    coveredProducts: number;
    /** Temsilî son fiyat (varsa; en az bir non-null link). */
    lastUnitPrice: number | null;
    lastPriceCurrency: string | null;
}

export function suggestVendorsForProducts(
    links: VendorLinkLite[],
    productIds: string[],
): Map<string, VendorSuggestion> {
    const wanted = new Set(productIds);
    const out = new Map<string, VendorSuggestion>();
    // Aynı (vendor) için birden çok ürün linki olabilir → coveredProducts ürün-bazlı dedup.
    const seenPair = new Set<string>();
    for (const l of links) {
        if (!wanted.has(l.product_id)) continue;
        const cur = out.get(l.vendor_id) ?? { coveredProducts: 0, lastUnitPrice: null, lastPriceCurrency: null };
        const pairKey = `${l.vendor_id}:${l.product_id}`;
        if (!seenPair.has(pairKey)) {
            seenPair.add(pairKey);
            cur.coveredProducts += 1;
        }
        if (cur.lastUnitPrice == null && l.last_unit_price != null) {
            cur.lastUnitPrice = l.last_unit_price;
            cur.lastPriceCurrency = l.last_price_currency;
        }
        out.set(l.vendor_id, cur);
    }
    return out;
}
