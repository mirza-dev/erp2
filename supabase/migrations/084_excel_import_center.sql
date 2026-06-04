-- ============================================================
-- 084 — Excel/CSV Toplu Aktarım Merkezi
-- - company-scoped column mapping memory
-- - import draft review metadata
-- - product/vendor relationship links
-- - optional stock location balances + transfer RPC
-- ============================================================

-- 1) Column mapping memory: future-proof company scope.
ALTER TABLE column_mappings
    ADD COLUMN IF NOT EXISTS company_scope text NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS idx_colmap_lookup;
ALTER TABLE column_mappings
    DROP CONSTRAINT IF EXISTS column_mappings_normalized_entity_type_key;

ALTER TABLE column_mappings
    ADD CONSTRAINT column_mappings_scope_normalized_entity_unique
    UNIQUE (company_scope, normalized, entity_type);

CREATE INDEX IF NOT EXISTS idx_colmap_lookup
    ON column_mappings (company_scope, normalized, entity_type);

-- 2) Draft review metadata. All defaults are conservative/backward-compatible.
ALTER TABLE import_drafts
    ADD COLUMN IF NOT EXISTS sheet_name text,
    ADD COLUMN IF NOT EXISTS row_number integer,
    ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'new',
    ADD COLUMN IF NOT EXISTS match_confidence numeric(5,2),
    ADD COLUMN IF NOT EXISTS risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS field_approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS row_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE import_drafts
    DROP CONSTRAINT IF EXISTS import_drafts_match_status_check;

ALTER TABLE import_drafts
    ADD CONSTRAINT import_drafts_match_status_check
    CHECK (match_status IN ('new', 'update', 'ambiguous', 'blocked', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_import_drafts_batch_sheet_row
    ON import_drafts (batch_id, sheet_name, row_number);

-- 3) Product/vendor relationship model.
CREATE TABLE IF NOT EXISTS product_vendor_links (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    vendor_id       uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    vendor_sku      text,
    lead_time_days  integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    moq             integer CHECK (moq IS NULL OR moq >= 0),
    is_preferred    boolean NOT NULL DEFAULT false,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_product_vendor_links_product
    ON product_vendor_links(product_id);

CREATE INDEX IF NOT EXISTS idx_product_vendor_links_vendor
    ON product_vendor_links(vendor_id);

ALTER TABLE product_vendor_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION product_vendor_links_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_vendor_links_updated_at ON product_vendor_links;
CREATE TRIGGER trg_product_vendor_links_updated_at
    BEFORE UPDATE ON product_vendor_links FOR EACH ROW
    EXECUTE FUNCTION product_vendor_links_set_updated_at();

-- 4) Optional location balances + transfer RPC.
CREATE TABLE IF NOT EXISTS stock_location_balances (
    product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location    text NOT NULL CHECK (length(trim(location)) > 0),
    quantity    integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, location)
);

ALTER TABLE stock_location_balances ENABLE ROW LEVEL SECURITY;

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reference_type_check
    CHECK (reference_type IS NULL OR reference_type IN
        ('order','production_entry','import','manual','purchase_order','stock_transfer'));

CREATE OR REPLACE FUNCTION record_stock_transfer(
    p_product_id uuid,
    p_quantity integer,
    p_from_location text,
    p_to_location text,
    p_notes text DEFAULT null,
    p_actor text DEFAULT null
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_from_qty integer;
    v_transfer_id uuid := gen_random_uuid();
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Geçersiz transfer miktarı: %', p_quantity;
    END IF;
    IF p_from_location IS NULL OR length(trim(p_from_location)) = 0
       OR p_to_location IS NULL OR length(trim(p_to_location)) = 0 THEN
        RAISE EXCEPTION 'Transfer için çıkış ve giriş lokasyonu zorunludur.';
    END IF;
    IF trim(p_from_location) = trim(p_to_location) THEN
        RAISE EXCEPTION 'Transfer lokasyonları aynı olamaz.';
    END IF;

    SELECT quantity INTO v_from_qty
    FROM stock_location_balances
    WHERE product_id = p_product_id AND location = trim(p_from_location)
    FOR UPDATE;

    IF NOT FOUND OR v_from_qty < p_quantity THEN
        RAISE EXCEPTION 'Çıkış lokasyonunda yeterli stok yok.';
    END IF;

    UPDATE stock_location_balances
    SET quantity = quantity - p_quantity, updated_at = now()
    WHERE product_id = p_product_id AND location = trim(p_from_location);

    INSERT INTO stock_location_balances (product_id, location, quantity)
    VALUES (p_product_id, trim(p_to_location), p_quantity)
    ON CONFLICT (product_id, location)
    DO UPDATE SET quantity = stock_location_balances.quantity + excluded.quantity,
                  updated_at = now();

    INSERT INTO inventory_movements (
        product_id, movement_type, quantity, reference_type, reference_id, notes, source, created_by
    ) VALUES (
        p_product_id, 'adjustment', -p_quantity, 'stock_transfer', v_transfer_id,
        coalesce(p_notes, 'Stok transfer çıkış') || ' — ' || trim(p_from_location) || ' → ' || trim(p_to_location),
        'ui', p_actor
    ), (
        p_product_id, 'adjustment', p_quantity, 'stock_transfer', v_transfer_id,
        coalesce(p_notes, 'Stok transfer giriş') || ' — ' || trim(p_from_location) || ' → ' || trim(p_to_location),
        'ui', p_actor
    );

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES (
        'stock_transfer_imported',
        'product',
        p_product_id,
        jsonb_build_object(
            'transfer_id', v_transfer_id,
            'quantity', p_quantity,
            'from_location', trim(p_from_location),
            'to_location', trim(p_to_location)
        ),
        'ui',
        p_actor
    );

    RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END; $$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS record_stock_transfer;
-- DROP TABLE IF EXISTS stock_location_balances;
-- DROP TABLE IF EXISTS product_vendor_links;
-- ALTER TABLE import_drafts
--   DROP COLUMN IF EXISTS sheet_name,
--   DROP COLUMN IF EXISTS row_number,
--   DROP COLUMN IF EXISTS match_status,
--   DROP COLUMN IF EXISTS match_confidence,
--   DROP COLUMN IF EXISTS risk_flags,
--   DROP COLUMN IF EXISTS field_approvals,
--   DROP COLUMN IF EXISTS row_errors;
-- ALTER TABLE column_mappings DROP COLUMN IF EXISTS company_scope;
