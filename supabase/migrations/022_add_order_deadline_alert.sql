-- Migration 022: alerts.type CHECK kısıtına 'order_deadline' eklendi
-- Faz 4 — Sipariş Son Tarihi alert tipi

ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check,
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical',
        'stock_risk',
        'purchase_recommended',
        'order_shortage',
        'sync_issue',
        'import_review_required',
        'order_deadline'
    ));
