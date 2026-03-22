-- 006_lead_time.sql
-- Add lead_time_days for lead-time-aware purchase planning (Faz 6)

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS lead_time_days integer
    CHECK (lead_time_days IS NULL OR lead_time_days >= 0);

COMMENT ON COLUMN products.lead_time_days IS
    'Supplier lead time in calendar days. NULL = unknown. Used by purchase suggestion engine.';
