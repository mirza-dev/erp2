-- Add overdue_shipment alert type
ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check,
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical', 'stock_risk', 'purchase_recommended',
        'order_shortage', 'sync_issue', 'import_review_required',
        'order_deadline', 'quote_expired', 'overdue_shipment'
    ));
