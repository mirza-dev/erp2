-- ============================================================
-- 059 — Product Batches (Faz 2a)
-- product_batches: heat_no/batch_date/initial_qty/remaining_qty + sertifika linki
-- FK: certificate_attachment_id → product_attachments(id) ON DELETE SET NULL
-- RLS service_role; idempotent
-- ============================================================

CREATE TABLE IF NOT EXISTS product_batches (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id                  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    heat_no                     text NOT NULL CHECK (length(trim(heat_no)) > 0),
    batch_date                  date,
    initial_qty                 numeric NOT NULL CHECK (initial_qty > 0),
    remaining_qty               numeric NOT NULL CHECK (remaining_qty >= 0),
    certificate_attachment_id   uuid REFERENCES product_attachments(id) ON DELETE SET NULL,
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CHECK (remaining_qty <= initial_qty)
);

CREATE INDEX IF NOT EXISTS idx_batches_product
    ON product_batches(product_id);

CREATE INDEX IF NOT EXISTS idx_batches_product_date
    ON product_batches(product_id, batch_date DESC NULLS LAST);

ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_product_batches_all" ON product_batches;
CREATE POLICY "service_product_batches_all" ON product_batches
    FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION product_batches_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_batches_updated_at ON product_batches;
CREATE TRIGGER trg_product_batches_updated_at
    BEFORE UPDATE ON product_batches FOR EACH ROW EXECUTE FUNCTION product_batches_set_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_product_batches_updated_at ON product_batches;
-- DROP FUNCTION IF EXISTS product_batches_set_updated_at();
-- DROP POLICY IF EXISTS "service_product_batches_all" ON product_batches;
-- DROP INDEX IF EXISTS idx_batches_product_date;
-- DROP INDEX IF EXISTS idx_batches_product;
-- DROP TABLE IF EXISTS product_batches CASCADE;
