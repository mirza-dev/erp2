/**
 * Tedarikçi detayı — saf toplama katmanı.
 *
 * A3 (2026-08-24): Tedarikçiler sayfası yalnız bir iletişim listesiydi; satırın
 * hiçbir detayı yoktu. Oysa satın alma kararının dayanağı olan veri ZATEN
 * tabloda duruyordu ama hiçbir ekranda gösterilmiyordu:
 *   · `product_vendor_links` — hangi ürünü veriyor, tedarikçi SKU'su, temin
 *     süresi, MOQ, tercih edilen mi, **RFQ'nin yazdığı son birim fiyat**
 *   · `purchase_orders` — bu tedarikçiye kaç PO, ne tutarda, en son ne zaman
 *
 * "Bu vanayı kimden, kaça alıyoruz?" sorusunun cevabı vardı ama sorulacak yer
 * yoktu. Saf tutulur (DB/React import etmez) → birim testi kolay.
 */

/** İptal edilmiş PO satın alma geçmişine sayılmaz. */
export const VENDOR_PO_EXCLUDED_STATUS = "cancelled";

export interface VendorPoSource {
    status: string;
    currency: string | null;
    grand_total: number | string | null;
    order_date: string | null;
}

export interface VendorPurchaseSummary {
    /** İptal HARİÇ PO adedi. */
    poCount: number;
    /**
     * Para birimi → toplam. Para birimleri ASLA toplanmaz (cariler ile aynı
     * kural, bkz. `@/lib/customer-stats`): bir tedarikçiden hem EUR hem USD
     * alınabilir ve bunları toplamak anlamsız bir sayı üretir.
     */
    totalByCurrency: Record<string, number>;
    /** En son (iptal olmayan) sipariş tarihi — yoksa null. */
    lastOrderDate: string | null;
}

export function emptyVendorPurchaseSummary(): VendorPurchaseSummary {
    return { poCount: 0, totalByCurrency: {}, lastOrderDate: null };
}

export function summarizeVendorPurchases(orders: VendorPoSource[]): VendorPurchaseSummary {
    const out = emptyVendorPurchaseSummary();
    for (const po of orders) {
        if (po.status === VENDOR_PO_EXCLUDED_STATUS) continue;
        out.poCount += 1;

        // null/undefined = "bilinmiyor" (RBAC redaction tutarı null'lar) — 0 DEĞİL.
        // `Number(null ?? 0)` yazsaydık redakte PO para birimi kovasını açar ve
        // panel "$0,00" gösterirdi; doğrusu tutarın hiç görünmemesi.
        if (po.grand_total != null && po.currency) {
            const amount = Number(po.grand_total);
            if (Number.isFinite(amount)) {
                out.totalByCurrency[po.currency] = (out.totalByCurrency[po.currency] ?? 0) + amount;
            }
        }
        if (po.order_date && (!out.lastOrderDate || po.order_date > out.lastOrderDate)) {
            out.lastOrderDate = po.order_date;
        }
    }
    return out;
}

export interface VendorSuppliedProduct {
    productId: string;
    sku: string;
    name: string;
    unit: string;
    vendorSku: string | null;
    leadTimeDays: number | null;
    moq: number | null;
    isPreferred: boolean;
    /** RFQ/award'ın yazdığı son bilinen fiyat. Yetkisizde null (redaction). */
    lastUnitPrice: number | null;
    lastPriceCurrency: string | null;
    lastPriceAt: string | null;
}

/**
 * Tedarik edilen ürünleri gösterim sırasına koyar: önce tercih edilenler,
 * sonra ada göre. Fiyatı olan/olmayan ayrımı YAPILMAZ — fiyatsız link de
 * "bu ürünü veriyor ama fiyatını bilmiyoruz" bilgisidir.
 */
export function sortVendorProducts(products: VendorSuppliedProduct[]): VendorSuppliedProduct[] {
    return products.toSorted((a, b) => {
        if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
        return a.name.localeCompare(b.name, "tr");
    });
}
