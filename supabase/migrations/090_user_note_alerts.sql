-- Migration 090: Kullanıcı notları / hatırlatmalar — Uyarılar sayfası.
-- Yeni alert tipi 'user_note' (source='ui' ile yazılır) + iki yeni kolon:
--   due_date   : opsiyonel hatırlatma tarihi (takvimde hedef gün; geçince
--                günlük scan severity'yi info→warning yükseltir)
--   created_by : oluşturan kullanıcının görünen adı (fullName || email snapshot)
ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check,
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical', 'stock_risk', 'purchase_recommended',
        'order_shortage', 'sync_issue',
        'order_deadline', 'quote_expired', 'overdue_shipment',
        'po_overdue', 'user_note'
    ));

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS created_by text;
