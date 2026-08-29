import type { PurchaseOrderStatus } from "@/lib/database.types";

/** ISO tarih (YYYY-MM-DD) -> tr-TR (DD.MM.YYYY). null -> "—". UTC midnight gün kayması önlenir. */
export function formatExpectedDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00Z").toLocaleDateString("tr-TR");
}

/** PO iptal edilebilir mi? Toplu iptal seçimi yalnız bunları kapsar. */
export function isPoCancellable(po: { status: PurchaseOrderStatus }): boolean {
    return !["received", "cancelled"].includes(po.status);
}

/**
 * Satın alma aktivite kaydı etiketleri.
 *
 * KOBİ-sim D4: PO geçmişinde ham kod görünüyordu — `po_fully_received` + çıplak
 * UUID. Sebep basit: RPC `po_fully_received` yazıyor (`051_po_receive_rpc.sql`)
 * ama sayfadaki sözlükte `po_received` vardı; eşleşmeyen kod olduğu gibi
 * basılıyordu. Sözlük burada tekilleştirildi ki bir sonraki eklemede sayfa
 * kodu ile migration yeniden ayrışmasın.
 *
 * Anahtarlar `audit_log.action` değerleridir — migration'larda geçen tüm
 * `po_*` eylemleri kapsanır.
 */
export const PO_ACTION_LABELS: Record<string, string> = {
    po_created:             "Sipariş oluşturuldu",
    po_sent:                "Tedarikçiye gönderildi",
    po_confirmed:           "Onaylandı",
    po_partially_received:  "Kısmi mal kabul yapıldı",
    po_fully_received:      "Mal kabul tamamlandı",
    po_received:            "Tamamen alındı",          // tarihsel kayıtlar
    po_cancelled:           "İptal edildi",
    po_revised:             "Taslağa geri alındı (revize)",
    po_lines_replaced:      "Satırlar güncellendi",
};

/** Bilinmeyen eylem kodunu kullanıcıya ham göstermek yerine okunur hâle getirir. */
export function poActionLabel(action: string): string {
    return PO_ACTION_LABELS[action] ?? action.replace(/^po_/, "").replace(/_/g, " ");
}

/**
 * Aktivite satırındaki "kim" alanı.
 *
 * D4: `actor` bazen çıplak UUID oluyordu (sistem/RPC yazımları). UUID kullanıcıya
 * hiçbir şey anlatmaz; okunur bir ad yoksa "Sistem" denir.
 */
const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function poActorLabel(actor: string | null | undefined): string | null {
    if (!actor) return null;
    const t = actor.trim();
    if (!t || t === "system" || UUID_ONLY.test(t)) return "Sistem";
    return t;
}
