-- ============================================================
-- 039_parasut_integration_prep.sql
-- Paraşüt entegrasyonu altyapısı:
--   • OAuth token singleton tablosu (lease + CAS)
--   • customers / products / order_lines yeni alanlar
--   • sales_orders step-based sync + crash recovery alanları
--   • integration_sync_logs ek alanlar
--   • Claim/release RPCs (SECURITY DEFINER, service_role only)
-- ============================================================

-- ── 1. OAuth token singleton tablosu ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parasut_oauth_tokens (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    singleton_key       text        NOT NULL DEFAULT 'default' UNIQUE
                                    CHECK (singleton_key = 'default'),
    access_token        text        NOT NULL,
    refresh_token       text        NOT NULL,
    expires_at          timestamptz NOT NULL,
    refresh_lock_until  timestamptz,
    refresh_lock_owner  uuid,
    token_version       integer     NOT NULL DEFAULT 0,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parasut_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- Hiçbir policy → sadece service_role erişebilir.

-- ── 2. Customers — Paraşüt contact sync + irsaliye alanları ──────────────────

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS parasut_contact_id    text,
    ADD COLUMN IF NOT EXISTS parasut_synced_at     timestamptz,
    ADD COLUMN IF NOT EXISTS city                  text,
    ADD COLUMN IF NOT EXISTS district              text;

CREATE UNIQUE INDEX IF NOT EXISTS customers_parasut_contact_unique
    ON customers (parasut_contact_id)
    WHERE parasut_contact_id IS NOT NULL;

-- ── 3. Products — Paraşüt product sync ───────────────────────────────────────

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS parasut_product_id    text,
    ADD COLUMN IF NOT EXISTS parasut_synced_at     timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS products_parasut_product_unique
    ON products (parasut_product_id)
    WHERE parasut_product_id IS NOT NULL;

-- ── 4. Order lines — vat_rate ─────────────────────────────────────────────────
-- Paraşüt detail.vat_rate zorunlu; satır bazında doğru oran.
-- Mevcut satırlar %20 ile migrate edilir (domain default).

ALTER TABLE order_lines
    ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 20;

-- ── 5. Sales orders — step-based Paraşüt sync alanları ───────────────────────
-- NOT: parasut_invoice_id, parasut_sent_at, parasut_error migration 001'de mevcut.
-- Bu migration onları tekrar eklemez.

-- Sevk tarihi (shipped transition anında set edilir; shipment_date kaynağı)
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS shipped_at                             timestamptz;

-- Invoice numbering (deterministik)
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS parasut_invoice_series                 text,
    ADD COLUMN IF NOT EXISTS parasut_invoice_number_int             bigint,
    ADD COLUMN IF NOT EXISTS parasut_invoice_no                     text;

-- Invoice step alanları (parasut_error global; step-specific ek alanlar)
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS parasut_invoice_error                  text,
    ADD COLUMN IF NOT EXISTS parasut_invoice_synced_at              timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_invoice_create_attempted_at    timestamptz;

-- Shipment document
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS parasut_shipment_document_id           text,
    ADD COLUMN IF NOT EXISTS parasut_shipment_synced_at             timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_shipment_error                 text,
    ADD COLUMN IF NOT EXISTS parasut_shipment_create_attempted_at   timestamptz;

-- E-belge
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS parasut_invoice_type                   text,
    ADD COLUMN IF NOT EXISTS parasut_trackable_job_id               text,
    ADD COLUMN IF NOT EXISTS parasut_e_document_id                  text,
    ADD COLUMN IF NOT EXISTS parasut_e_document_status              text,
    ADD COLUMN IF NOT EXISTS parasut_e_document_error               text,
    ADD COLUMN IF NOT EXISTS parasut_e_document_create_attempted_at timestamptz;

-- Step pointer + retry alanları
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS parasut_step                           text,
    ADD COLUMN IF NOT EXISTS parasut_error_kind                     text,
    ADD COLUMN IF NOT EXISTS parasut_retry_count                    integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS parasut_next_retry_at                  timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_last_failed_step               text;

-- Claim/lease
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS parasut_sync_lock_until                timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_sync_lock_owner                uuid;

-- CHECK constraints (kontrollü enum)
DO $$ BEGIN
    ALTER TABLE sales_orders
        ADD CONSTRAINT chk_parasut_step
        CHECK (parasut_step IS NULL OR parasut_step IN
               ('contact','product','shipment','invoice','edoc','done'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE sales_orders
        ADD CONSTRAINT chk_parasut_error_kind
        CHECK (parasut_error_kind IS NULL OR parasut_error_kind IN
               ('auth','validation','rate_limit','server','network','not_found'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE sales_orders
        ADD CONSTRAINT chk_parasut_invoice_type
        CHECK (parasut_invoice_type IS NULL OR parasut_invoice_type IN
               ('e_invoice','e_archive','manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE sales_orders
        ADD CONSTRAINT chk_parasut_e_document_status
        CHECK (parasut_e_document_status IS NULL OR parasut_e_document_status IN
               ('running','done','error','skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partial unique indexes (duplicate protection)
CREATE UNIQUE INDEX IF NOT EXISTS orders_parasut_invoice_unique
    ON sales_orders (parasut_invoice_id)
    WHERE parasut_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_parasut_shipment_unique
    ON sales_orders (parasut_shipment_document_id)
    WHERE parasut_shipment_document_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_parasut_edoc_unique
    ON sales_orders (parasut_e_document_id)
    WHERE parasut_e_document_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_parasut_trackable_unique
    ON sales_orders (parasut_trackable_job_id)
    WHERE parasut_trackable_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_parasut_series_number_unique
    ON sales_orders (parasut_invoice_series, parasut_invoice_number_int)
    WHERE parasut_invoice_series IS NOT NULL AND parasut_invoice_number_int IS NOT NULL;

-- CRON retry index (CRON query ile birebir uyumlu)
CREATE INDEX IF NOT EXISTS idx_orders_parasut_retry
    ON sales_orders (parasut_next_retry_at)
    WHERE parasut_step IS NOT NULL
      AND parasut_step != 'done'
      AND (parasut_error_kind IS NULL OR parasut_error_kind NOT IN ('validation','auth'));

-- ── 6. Integration sync logs — ek alanlar ────────────────────────────────────

ALTER TABLE integration_sync_logs
    ADD COLUMN IF NOT EXISTS error_kind text,
    ADD COLUMN IF NOT EXISTS step       text,
    ADD COLUMN IF NOT EXISTS metadata   jsonb;

-- ── 7. Claim / release RPCs (SECURITY DEFINER, service_role only) ─────────────

CREATE OR REPLACE FUNCTION parasut_claim_sync(
    p_order_id  uuid,
    p_owner     uuid,
    p_lease_secs int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated integer;
BEGIN
    UPDATE sales_orders
    SET parasut_sync_lock_until = now() + make_interval(secs => p_lease_secs),
        parasut_sync_lock_owner = p_owner
    WHERE id = p_order_id
      AND commercial_status  = 'approved'
      AND fulfillment_status = 'shipped'
      AND (parasut_step IS NULL OR parasut_step != 'done')
      AND (parasut_sync_lock_until IS NULL OR parasut_sync_lock_until < now());
    GET DIAGNOSTICS updated = ROW_COUNT;
    RETURN updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION parasut_release_sync(
    p_order_id uuid,
    p_owner    uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE sales_orders
    SET parasut_sync_lock_until = NULL,
        parasut_sync_lock_owner = NULL
    WHERE id = p_order_id
      AND parasut_sync_lock_owner = p_owner;
$$;

REVOKE ALL ON FUNCTION parasut_claim_sync(uuid, uuid, int)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION parasut_release_sync(uuid, uuid)     FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION parasut_claim_sync(uuid, uuid, int)  TO service_role;
GRANT EXECUTE ON FUNCTION parasut_release_sync(uuid, uuid)     TO service_role;

-- ── Staging smoke test (migration apply sonrası elle çalıştırılır) ────────────
--
-- 1. service_role başarılı:
--    SELECT parasut_claim_sync('00000000-0000-0000-0000-000000000001'::uuid,
--                               gen_random_uuid(), 300);
--    → true veya false döner (permission error OLMAMALI)
--
-- 2. anon / authenticated erişim engeli:
--    -- psql'de anon role ile bağlan veya Supabase anonKey kullan:
--    SELECT parasut_claim_sync('00000000-0000-0000-0000-000000000001'::uuid,
--                               gen_random_uuid(), 300);
--    → "permission denied for function parasut_claim_sync" hatası BEKLENIR
--
--    SELECT parasut_release_sync('00000000-0000-0000-0000-000000000001'::uuid,
--                                 gen_random_uuid());
--    → "permission denied for function parasut_release_sync" hatası BEKLENIR
--
-- Not: Bu test gerçek DB bağlantısı gerektirir; unit test altyapısı kapsamı dışındadır.
-- Faz 12 sandbox gate'inden önce staging'de doğrulanmalıdır.
