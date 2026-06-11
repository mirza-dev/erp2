-- ============================================================
-- 092 — Calendar notes
-- Uyarı yaşam döngüsünden bağımsız kişisel / şirket takvim notları.
-- Eski alerts.type='user_note' kayıtları kayıpsız şirket notuna taşınır
-- ve artık uyarı sayaçlarına / tarama davranışına dahil edilmez.
-- ============================================================

CREATE TABLE IF NOT EXISTS calendar_notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title           text NOT NULL
                      CHECK (length(trim(title)) > 0 AND length(trim(title)) <= 200),
    description     text
                      CHECK (description IS NULL OR length(description) <= 2000),
    note_date       date NOT NULL,
    note_time       time,
    visibility      text NOT NULL DEFAULT 'personal'
                      CHECK (visibility IN ('personal', 'company')),
    owner_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_label     text,
    legacy_alert_id uuid UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_notes_date
    ON calendar_notes(note_date, note_time);
CREATE INDEX IF NOT EXISTS idx_calendar_notes_owner
    ON calendar_notes(owner_id, note_date);

ALTER TABLE calendar_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_calendar_notes_all" ON calendar_notes;
CREATE POLICY "service_calendar_notes_all" ON calendar_notes
    FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION calendar_notes_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calendar_notes_updated_at ON calendar_notes;
CREATE TRIGGER trg_calendar_notes_updated_at
    BEFORE UPDATE ON calendar_notes FOR EACH ROW EXECUTE FUNCTION calendar_notes_set_updated_at();

-- Eski user_note satırlarında gerçek kullanıcı ID'si yoktur. Sahiplik tahmin
-- edilmez: owner_id NULL kalır; owner_label yalnız gösterim snapshot'ıdır.
INSERT INTO calendar_notes (
    title, description, note_date, note_time, visibility,
    owner_id, owner_label, legacy_alert_id, created_at, updated_at
)
SELECT
    a.title,
    a.description,
    COALESCE(a.due_date, (a.created_at AT TIME ZONE 'Europe/Istanbul')::date),
    NULL,
    'company',
    NULL,
    a.created_by,
    a.id,
    a.created_at,
    a.created_at
FROM alerts a
WHERE a.type = 'user_note'
ON CONFLICT (legacy_alert_id) DO NOTHING;

DELETE FROM alerts WHERE type = 'user_note';

ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check,
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical', 'stock_risk', 'purchase_recommended',
        'order_shortage', 'sync_issue',
        'order_deadline', 'quote_expired', 'overdue_shipment',
        'po_overdue'
    ));

-- ROLLBACK NOTU:
-- Takvim notları uyarı semantiğine geri çevrilmemelidir. Gerekirse tablo
-- yedeği alınarak manuel veri dönüşümü yapılmalıdır.
