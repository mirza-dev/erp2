-- Remove dead alert type 'import_review_required' from DB CHECK constraint.
-- The value was removed from the AlertType TS union in Sprint A (G10) but the
-- DB constraint still accepted it. After this migration the column is tighter.
ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check,
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical', 'stock_risk', 'purchase_recommended',
        'order_shortage', 'sync_issue',
        'order_deadline', 'quote_expired', 'overdue_shipment'
    ));
