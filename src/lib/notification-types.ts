/**
 * Bildirim türleri — Bildirimler sekmesi + user_notification_preferences için
 * tek source of truth. Yeni tür eklemek için: bu listeye ekle, mevcut kullanıcılar
 * için default true/true otomatik (DB satırı yoksa default'a düşer).
 */
export const NOTIFICATION_TYPES = [
    {
        key: "stock_critical",
        label: "Kritik stok uyarıları",
        desc: "Stoğu sıfırlanan veya minimum altına düşen ürünler",
    },
    {
        key: "order_pending",
        label: "Sipariş onay bekliyor",
        desc: "Yeni siparişler onayınızı bekliyor",
    },
    {
        key: "sync_error",
        label: "Paraşüt sync hataları",
        desc: "Fatura veya müşteri sync sırasında oluşan hatalar",
    },
    {
        key: "order_shipped",
        label: "Sipariş sevk edildi",
        desc: "Sevkiyat tamamlandığında bilgi",
    },
] as const;

export type NotificationTypeKey = (typeof NOTIFICATION_TYPES)[number]["key"];

export const NOTIFICATION_TYPE_KEYS: ReadonlySet<string> = new Set(
    NOTIFICATION_TYPES.map(t => t.key)
);
