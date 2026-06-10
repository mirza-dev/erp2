-- Migration 089: alerts.type CHECK kısıtına 'po_overdue' eklendi.
-- Beklenen teslim tarihi geçen açık satınalma siparişleri için yeni uyarı tipi
-- (satış tarafındaki overdue_shipment'ın tedarik karşılığı).
ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check,
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical', 'stock_risk', 'purchase_recommended',
        'order_shortage', 'sync_issue',
        'order_deadline', 'quote_expired', 'overdue_shipment',
        'po_overdue'
    ));
