-- Migration 019: Concurrency Hardening
-- Büyük veri + çoklu kullanıcı dayanıklılığı için DB seviyesi kısıtlar.

-- ── 1A: Data Cleanup ────────────────────────────────────────────

-- reserved > on_hand varsa cap'le (CHECK constraint öncesi)
UPDATE products SET reserved = on_hand WHERE reserved > on_hand;

-- Duplicate aktif alert'leri dismiss et (en eskisini tut)
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY type, entity_id ORDER BY created_at ASC) AS rn
    FROM alerts
    WHERE status IN ('open', 'acknowledged')
      AND entity_id IS NOT NULL
)
UPDATE alerts
SET status = 'dismissed',
    dismissed_at = now(),
    resolution_reason = 'dedup_migration'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Duplicate open shortage'ları cancel et (en eskisini tut)
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY order_line_id, product_id ORDER BY created_at ASC) AS rn
    FROM shortages
    WHERE status = 'open'
)
UPDATE shortages
SET status = 'cancelled'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 1B: CHECK Constraint ────────────────────────────────────────

ALTER TABLE products
ADD CONSTRAINT chk_reserved_lte_on_hand CHECK (reserved <= on_hand);

-- ── 1C: Alert Dedup Unique Index ────────────────────────────────

CREATE UNIQUE INDEX idx_alerts_active_dedup
ON alerts (type, entity_id)
WHERE status IN ('open', 'acknowledged')
  AND entity_id IS NOT NULL;

-- ── 1D: Shortage Dedup Unique Index ─────────────────────────────

CREATE UNIQUE INDEX idx_shortages_open_dedup
ON shortages (order_line_id, product_id)
WHERE status = 'open';

-- ── 1E: Advisory Lock RPCs ──────────────────────────────────────

CREATE OR REPLACE FUNCTION try_acquire_scan_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT pg_try_advisory_lock(hashtext('alert_scan'));
$$;

CREATE OR REPLACE FUNCTION release_scan_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM pg_advisory_unlock(hashtext('alert_scan'));
END;
$$;

CREATE OR REPLACE FUNCTION try_acquire_ai_suggest_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT pg_try_advisory_lock(hashtext('ai_suggest'));
$$;

CREATE OR REPLACE FUNCTION release_ai_suggest_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM pg_advisory_unlock(hashtext('ai_suggest'));
END;
$$;
