-- ============================================================
-- 048 — Vendors entity
-- pg_trgm extension (idempotent, B5), vendors tablo,
-- products.preferred_vendor_id FK kolon.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- B5

CREATE TABLE IF NOT EXISTS vendors (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 text NOT NULL CHECK (length(trim(name)) > 0),
    contact_email        text,
    contact_phone        text,
    contact_person       text,
    tax_number           text,
    address              text,
    currency             text NOT NULL DEFAULT 'TRY'
                              CHECK (currency IN ('TRY', 'USD', 'EUR')),
    payment_terms_days   integer CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0),
    lead_time_days       integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    notes                text,
    is_active            boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_active
    ON vendors(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm
    ON vendors USING gin (name gin_trgm_ops);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION vendors_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at
    BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION vendors_set_updated_at();

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS preferred_vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_preferred_vendor_id
    ON products(preferred_vendor_id) WHERE preferred_vendor_id IS NOT NULL;

-- ROLLBACK:
-- ALTER TABLE products DROP COLUMN IF EXISTS preferred_vendor_id;
-- DROP TABLE IF EXISTS vendors CASCADE;
-- DROP FUNCTION IF EXISTS vendors_set_updated_at();
-- DROP EXTENSION IF EXISTS pg_trgm;  -- yalnız bu migration eklediyse
