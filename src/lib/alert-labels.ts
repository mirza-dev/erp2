import type { AlertType } from "@/lib/database.types";

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
    stock_critical:       "Kritik Stok",
    stock_risk:           "Stok Uyarısı",
    order_shortage:       "Sipariş Eksik",
    purchase_recommended: "Satın Alma Önerisi",
    quote_expired:        "Teklif Süresi Geçti",
    overdue_shipment:     "Geciken Sevkiyat",
    order_deadline:       "Sipariş Teslim Riski",
    sync_issue:           "Paraşüt Senkron Hatası",
    po_overdue:           "Geciken Tedarik",
    user_note:            "Not",
};
