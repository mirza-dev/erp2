-- Migration 101: alerts.type CHECK kısıtına 'rfq_response_due' eklendi.
-- Yanıt son tarihi (due_date) geçmiş, hâlâ yanıtlamayan tedarikçisi olan gönderilmiş
-- (sent) RFQ'lar için yeni uyarı tipi (po_overdue deseni). entity_type='supplier_rfq'
-- (alerts.entity_type kısıtsız → migration gerektirmez).
ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check,
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical', 'stock_risk', 'purchase_recommended',
        'order_shortage', 'sync_issue',
        'order_deadline', 'quote_expired', 'overdue_shipment',
        'po_overdue', 'rfq_response_due'
    ));
