-- ============================================================
-- 049 — Purchase Orders header + lines + recommendations junction
-- po_counters RLS (B6); po_number RPC üzerinden garanti (B2);
-- atomik create/replace RPC'ler (B3); junction tablo (M2).
-- ============================================================

CREATE TABLE IF NOT EXISTS po_counters (
    year     integer PRIMARY KEY,
    last_seq integer NOT NULL DEFAULT 0
);

ALTER TABLE po_counters ENABLE ROW LEVEL SECURITY;  -- B6

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_year integer := extract(year from now())::integer; v_seq integer;
BEGIN
    INSERT INTO po_counters (year, last_seq) VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_seq = po_counters.last_seq + 1
    RETURNING last_seq INTO v_seq;
    RETURN 'PO-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
END; $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number       text NOT NULL UNIQUE,    -- B2: RPC içinde üretilir
    vendor_id       uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    status          text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','confirmed',
                                            'partially_received','received','cancelled')),
    order_date      date NOT NULL DEFAULT CURRENT_DATE,
    expected_date   date,
    currency        text NOT NULL DEFAULT 'TRY'
                         CHECK (currency IN ('TRY','USD','EUR')),
    subtotal        numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    vat_rate        numeric(5,4)  NOT NULL DEFAULT 0.20 CHECK (vat_rate >= 0 AND vat_rate <= 1),
    vat_total       numeric(14,2) NOT NULL DEFAULT 0 CHECK (vat_total >= 0),
    grand_total     numeric(14,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
    notes           text,
    sent_at         timestamptz,
    confirmed_at    timestamptz,
    cancelled_at    timestamptz,
    cancel_reason   text,
    created_by      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_status_expected ON purchase_orders(status, expected_date);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_created ON purchase_orders(created_at DESC);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id           uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id      uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity        integer NOT NULL CHECK (quantity > 0),
    unit_price      numeric(14,4) NOT NULL CHECK (unit_price >= 0),
    discount_pct    numeric(5,2)  NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
    line_total      numeric(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
    received_qty    integer NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
    notes           text,
    CONSTRAINT chk_pol_received_le_qty CHECK (received_qty <= quantity)
);

CREATE INDEX IF NOT EXISTS idx_pol_po ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_pol_product ON purchase_order_lines(product_id);

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- ── M2: junction tablo recommendation ↔ po_line ─────────────
CREATE TABLE IF NOT EXISTS po_line_recommendations (
    po_line_id        uuid NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
    recommendation_id uuid NOT NULL REFERENCES ai_recommendations(id) ON DELETE RESTRICT,
    PRIMARY KEY (po_line_id, recommendation_id),
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_line_rec_rec ON po_line_recommendations(recommendation_id);

ALTER TABLE po_line_recommendations ENABLE ROW LEVEL SECURITY;

-- ── line_total trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION recompute_pol_line_total()
RETURNS TRIGGER AS $$
BEGIN
    NEW.line_total := round(
        NEW.quantity::numeric * NEW.unit_price * (1 - NEW.discount_pct / 100.0), 2);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pol_line_total ON purchase_order_lines;
CREATE TRIGGER trg_pol_line_total
    BEFORE INSERT OR UPDATE OF quantity, unit_price, discount_pct ON purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION recompute_pol_line_total();

CREATE OR REPLACE FUNCTION recompute_po_totals(p_po_id uuid)
RETURNS void AS $$
DECLARE v_subtotal numeric(14,2); v_vat_rate numeric(5,4);
        v_vat_total numeric(14,2); v_grand_total numeric(14,2);
BEGIN
    SELECT COALESCE(SUM(line_total),0) INTO v_subtotal
    FROM purchase_order_lines WHERE po_id = p_po_id;
    SELECT vat_rate INTO v_vat_rate FROM purchase_orders WHERE id = p_po_id;
    IF v_vat_rate IS NULL THEN v_vat_rate := 0.20; END IF;
    v_vat_total := round(v_subtotal * v_vat_rate, 2);
    v_grand_total := round(v_subtotal + v_vat_total, 2);
    UPDATE purchase_orders
    SET subtotal=v_subtotal, vat_total=v_vat_total, grand_total=v_grand_total, updated_at=now()
    WHERE id = p_po_id;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_pol_recompute_po_totals()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM recompute_po_totals(COALESCE(NEW.po_id, OLD.po_id));
    RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pol_after_change ON purchase_order_lines;
CREATE TRIGGER trg_pol_after_change
    AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION trg_pol_recompute_po_totals();

CREATE OR REPLACE FUNCTION purchase_orders_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_updated_at ON purchase_orders;
CREATE TRIGGER trg_po_updated_at
    BEFORE UPDATE ON purchase_orders FOR EACH ROW
    EXECUTE FUNCTION purchase_orders_set_updated_at();

-- ── B3: atomik create RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION create_purchase_order_with_lines(
    p_vendor_id uuid,
    p_expected_date date,
    p_currency text,
    p_notes text,
    p_lines jsonb,    -- [{product_id, quantity, unit_price, discount_pct, notes?, source_recommendation_ids?}]
    p_actor text
) RETURNS TABLE(po_id uuid, po_number text)
LANGUAGE plpgsql AS $$
DECLARE
    v_po_id uuid;
    v_po_number text;
    v_line jsonb;
    v_line_id uuid;
    v_rec_id uuid;
    v_vendor_active boolean;
BEGIN
    -- B4: vendor active check
    SELECT is_active INTO v_vendor_active FROM vendors WHERE id = p_vendor_id;
    IF NOT COALESCE(v_vendor_active, false) THEN
        RAISE EXCEPTION 'PO oluşturulamadı: vendor pasif veya bulunamadı';
    END IF;

    IF jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'PO oluşturulamadı: en az 1 line gerekli';
    END IF;

    v_po_number := generate_po_number();

    INSERT INTO purchase_orders (po_number, vendor_id, expected_date, currency, notes, created_by)
    VALUES (v_po_number, p_vendor_id, p_expected_date, p_currency, p_notes, p_actor)
    RETURNING id INTO v_po_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO purchase_order_lines (po_id, product_id, quantity, unit_price, discount_pct, notes)
        VALUES (
            v_po_id,
            (v_line->>'product_id')::uuid,
            (v_line->>'quantity')::integer,
            (v_line->>'unit_price')::numeric,
            COALESCE((v_line->>'discount_pct')::numeric, 0),
            v_line->>'notes'
        ) RETURNING id INTO v_line_id;

        IF v_line ? 'source_recommendation_ids' THEN
            FOR v_rec_id IN SELECT (jsonb_array_elements_text(v_line->'source_recommendation_ids'))::uuid LOOP
                INSERT INTO po_line_recommendations (po_line_id, recommendation_id)
                VALUES (v_line_id, v_rec_id)
                ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('po_created', 'purchase_order', v_po_id,
            jsonb_build_object('po_number', v_po_number, 'status', 'draft'), 'ui', p_actor);

    RETURN QUERY SELECT v_po_id, v_po_number;
END; $$;

-- ── B3: atomik replace lines RPC ─────────────────────────────
CREATE OR REPLACE FUNCTION replace_purchase_order_lines(
    p_po_id uuid, p_lines jsonb, p_actor text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_line jsonb;
    v_line_id uuid;
    v_rec_id uuid;
BEGIN
    SELECT status INTO v_status FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PO bulunamadı: %', p_po_id;
    END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'PO line replace edilemez (status=%); sadece draft', v_status;
    END IF;
    IF jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'PO için en az 1 line gerekli';
    END IF;

    DELETE FROM purchase_order_lines WHERE po_id = p_po_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO purchase_order_lines (po_id, product_id, quantity, unit_price, discount_pct, notes)
        VALUES (
            p_po_id,
            (v_line->>'product_id')::uuid,
            (v_line->>'quantity')::integer,
            (v_line->>'unit_price')::numeric,
            COALESCE((v_line->>'discount_pct')::numeric, 0),
            v_line->>'notes'
        ) RETURNING id INTO v_line_id;

        IF v_line ? 'source_recommendation_ids' THEN
            FOR v_rec_id IN SELECT (jsonb_array_elements_text(v_line->'source_recommendation_ids'))::uuid LOOP
                INSERT INTO po_line_recommendations (po_line_id, recommendation_id)
                VALUES (v_line_id, v_rec_id) ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('po_lines_replaced', 'purchase_order', p_po_id,
            jsonb_build_object('line_count', jsonb_array_length(p_lines)), 'ui', p_actor);
END; $$;

-- ROLLBACK:
-- DROP TABLE IF EXISTS po_line_recommendations CASCADE;
-- DROP TABLE IF EXISTS purchase_order_lines CASCADE;
-- DROP TABLE IF EXISTS purchase_orders CASCADE;
-- DROP TABLE IF EXISTS po_counters;
-- DROP FUNCTION IF EXISTS create_purchase_order_with_lines, replace_purchase_order_lines,
--                          generate_po_number, recompute_po_totals, recompute_pol_line_total,
--                          trg_pol_recompute_po_totals, purchase_orders_set_updated_at;
