-- ============================================================
-- 056 — Dynamic Product Type System
-- product_types tablosu (tip tanımları)
-- product_type_fields tablosu (her tipin alan şeması)
-- products.product_type_id (FK, nullable — geriye uyumluluk)
-- products.attributes JSONB (dinamik alan değerleri)
-- RLS service_role (proje paterni); idempotent
-- ============================================================

-- ── product_types ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_types (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    description  text,
    icon         text,
    sort_order   integer NOT NULL DEFAULT 0,
    is_system    boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_types_sort
    ON product_types(sort_order);

ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION product_types_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_types_updated_at ON product_types;
CREATE TRIGGER trg_product_types_updated_at
    BEFORE UPDATE ON product_types FOR EACH ROW EXECUTE FUNCTION product_types_set_updated_at();

-- ── product_type_fields ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_type_fields (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_type_id  uuid NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
    field_key        text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]*$'),
    label_tr         text NOT NULL CHECK (length(trim(label_tr)) > 0),
    label_en         text,
    field_type       text NOT NULL CHECK (field_type IN
                          ('text', 'number', 'select', 'multiselect', 'date', 'boolean', 'longtext')),
    unit             text,
    options          jsonb,
    required         boolean NOT NULL DEFAULT false,
    placeholder      text,
    help_text        text,
    sort_order       integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_type_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_product_type_fields_type_sort
    ON product_type_fields(product_type_id, sort_order);

ALTER TABLE product_type_fields ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION product_type_fields_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_type_fields_updated_at ON product_type_fields;
CREATE TRIGGER trg_product_type_fields_updated_at
    BEFORE UPDATE ON product_type_fields FOR EACH ROW EXECUTE FUNCTION product_type_fields_set_updated_at();

-- ── products.product_type_id + attributes ──────────────────────
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS product_type_id uuid REFERENCES product_types(id) ON DELETE SET NULL;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_product_type_id
    ON products(product_type_id) WHERE product_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_attributes
    ON products USING gin(attributes);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_products_attributes;
-- DROP INDEX IF EXISTS idx_products_product_type_id;
-- ALTER TABLE products DROP COLUMN IF EXISTS attributes;
-- ALTER TABLE products DROP COLUMN IF EXISTS product_type_id;
-- DROP TABLE IF EXISTS product_type_fields CASCADE;
-- DROP TABLE IF EXISTS product_types CASCADE;
-- DROP FUNCTION IF EXISTS product_types_set_updated_at();
-- DROP FUNCTION IF EXISTS product_type_fields_set_updated_at();
