/**
 * Cari sipariş / gelir sayaçları — OKUMA ANINDA hesaplanır (saf katman).
 *
 * `customers.total_orders` · `total_revenue` · `last_order_date` kolonları
 * migration 001'den beri VAR ama hiçbir yerde GÜNCELLENMİYORDU: yalnız cari
 * oluşturulurken 0/0/null yazılıyor, sonra hiç dokunulmuyordu. Sonuç — Cariler
 * sayfası, siparişleri olan cariler dahil, her satırda ömür boyu
 * "0 sipariş · 0,00 gelir" gösteriyordu (2026-08-24 tespiti).
 *
 * Tetikleyici/denormalizasyon yerine okuma anında toplama seçildi:
 *   • drift imkânsız — tek doğruluk kaynağı `sales_orders`
 *   • migration gerekmez, geçmiş veri geriye dönük DOĞRU görünür
 *   • iptal/geri alma otomatik yansır
 *
 * Bu modül saf tutulur (DB/React import etmez) → birim testi kolay.
 */

/**
 * Ciroya sayılan sipariş durumu. `dashboard-view-model.ts` içindeki
 * `isRevenueOrder` ile BİREBİR aynı kural — Cariler sayfası ile Dashboard
 * ciro rakamı çelişmesin.
 *
 * `pending_approval` bilinçli HARİÇ: mig.088'den beri gönderilen her teklif
 * pending sipariş yaratır; kabul edilmemiş teklif ciroya sayılmamalı.
 */
export const CUSTOMER_REVENUE_STATUS = "approved";

export interface CustomerOrderStats {
    /** Ciroya sayılan (approved) sipariş adedi. */
    orderCount: number;
    /**
     * Para birimi → toplam. Para birimleri ASLA toplanmaz: bir cari hem EUR
     * hem USD sipariş verebilir (canlı veride mevcut) ve bunları toplamak
     * anlamsız bir sayı üretir.
     */
    revenueByCurrency: Record<string, number>;
    /** Ciroya sayılan en son siparişin tarihi (ISO) — yoksa null. */
    lastOrderDate: string | null;
}

/** Toplama için gereken minimum sipariş alanları (snake_case = DB satırı). */
export interface CustomerStatSourceOrder {
    customer_id: string | null;
    commercial_status: string;
    grand_total: number | string | null;
    currency: string | null;
    created_at: string;
}

export function emptyCustomerOrderStats(): CustomerOrderStats {
    return { orderCount: 0, revenueByCurrency: {}, lastOrderDate: null };
}

/**
 * Sipariş satırlarını cari bazında toplar. Yalnız `approved` siparişler sayılır;
 * `customer_id` boş satırlar atlanır (cariye bağlanamaz).
 */
export function aggregateCustomerOrderStats(
    orders: CustomerStatSourceOrder[],
): Map<string, CustomerOrderStats> {
    const out = new Map<string, CustomerOrderStats>();
    for (const o of orders) {
        if (!o.customer_id) continue;
        if (o.commercial_status !== CUSTOMER_REVENUE_STATUS) continue;

        let stats = out.get(o.customer_id);
        if (!stats) {
            stats = emptyCustomerOrderStats();
            out.set(o.customer_id, stats);
        }
        stats.orderCount += 1;

        // grand_total PostgREST'ten numeric → string gelebilir; NaN toplama kirletmesin.
        // null = "bilinmiyor", 0 DEĞİL: bu yol siparişleri ham okur (redaction
        // sonra, cari satırında olur) ama semantik `vendor-detail` ile aynı
        // tutulur — null'ı 0 saymak olmayan bir tutar uydurur.
        if (o.grand_total != null && o.currency) {
            const amount = Number(o.grand_total);
            if (Number.isFinite(amount)) {
                stats.revenueByCurrency[o.currency] =
                    (stats.revenueByCurrency[o.currency] ?? 0) + amount;
            }
        }
        if (!stats.lastOrderDate || o.created_at > stats.lastOrderDate) {
            stats.lastOrderDate = o.created_at;
        }
    }
    return out;
}

export interface RevenueDisplay {
    /** Cari kendi para biriminde toplam (yoksa 0). */
    amount: number;
    currency: string;
    /** Cari para birimi DIŞINDAKİ tutarlar — tutardan büyüğe göre sıralı. */
    others: { currency: string; amount: number }[];
}

/**
 * Gösterim için birincil tutarı seçer: cari kendi para birimindeki toplam
 * birincildir (o para biriminde hiç sipariş yoksa bile 0 olarak), diğerleri
 * `others` altında DÜRÜSTÇE ayrı durur — üst üste toplanmaz.
 */
export function primaryRevenue(
    revenueByCurrency: Record<string, number>,
    preferredCurrency: string,
): RevenueDisplay {
    const others = Object.entries(revenueByCurrency)
        .filter(([cur]) => cur !== preferredCurrency)
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => b.amount - a.amount);
    return {
        amount: revenueByCurrency[preferredCurrency] ?? 0,
        currency: preferredCurrency,
        others,
    };
}
