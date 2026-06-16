-- ============================================================
-- 100 — Tedarikçi Fiyat Talebi (RFQ) → Karşılaştırma → Satın Alma Siparişi
-- Satın alma tarafında "fiyat araştırması": tedarikçilerden fiyat iste, kim ne
-- kadar verdi yan yana karşılaştır, kazananı PO'ya çevir.
--
-- Odoo modeli: RFQ esasen bir taslak PO'dur; karara bağlanınca mevcut
-- create_purchase_order_with_lines (049) RPC'siyle gerçek PO(lar) doğar.
--
-- Desenler: 049 (po_counters/generate/atomik RPC/audit_log/trigger),
-- 075/076 (arşiv tablosu + private bucket), 084 (product_vendor_links).
-- Tek dosya, idempotent (IF NOT EXISTS / CREATE OR REPLACE). RLS açık.
-- ============================================================

-- ── RFQ numara sayacı (po_counters deseni) ───────────────────
CREATE TABLE IF NOT EXISTS rfq_counters (
    year     integer PRIMARY KEY,
    last_seq integer NOT NULL DEFAULT 0
);
ALTER TABLE rfq_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION generate_rfq_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_year integer := extract(year from now())::integer; v_seq integer;
BEGIN
    INSERT INTO rfq_counters (year, last_seq) VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_seq = rfq_counters.last_seq + 1
    RETURNING last_seq INTO v_seq;
    RETURN 'RFQ-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
END; $$;

-- ── Başlık ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_rfqs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_number      text NOT NULL UNIQUE,   -- RPC içinde üretilir
    title           text,
    status          text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','awarded','cancelled')),
    rfq_date        date NOT NULL DEFAULT CURRENT_DATE,
    due_date        date,                   -- yanıt son tarihi
    currency        text NOT NULL DEFAULT 'TRY'
                         CHECK (currency IN ('TRY','USD','EUR')),
    notes           text,
    sent_at         timestamptz,
    awarded_at      timestamptz,
    cancelled_at    timestamptz,
    cancel_reason   text,
    created_by      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rfq_status ON supplier_rfqs(status, due_date);
CREATE INDEX IF NOT EXISTS idx_rfq_created ON supplier_rfqs(created_at DESC);
ALTER TABLE supplier_rfqs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION supplier_rfqs_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_supplier_rfqs_updated_at ON supplier_rfqs;
CREATE TRIGGER trg_supplier_rfqs_updated_at
    BEFORE UPDATE ON supplier_rfqs FOR EACH ROW
    EXECUTE FUNCTION supplier_rfqs_set_updated_at();

-- ── İstenen kalemler (fiyat YOK; talep) ──────────────────────
CREATE TABLE IF NOT EXISTS supplier_rfq_lines (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id          uuid NOT NULL REFERENCES supplier_rfqs(id) ON DELETE CASCADE,
    position        integer NOT NULL DEFAULT 0,
    product_id      uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_code    text,
    description     text,
    quantity        integer NOT NULL CHECK (quantity > 0),
    unit            text,
    target_date     date,
    notes           text
);
CREATE INDEX IF NOT EXISTS idx_rfq_lines_rfq ON supplier_rfq_lines(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_lines_product ON supplier_rfq_lines(product_id);
ALTER TABLE supplier_rfq_lines ENABLE ROW LEVEL SECURITY;

-- ── Davet edilen tedarikçiler + gönderim/yanıt takibi ────────
CREATE TABLE IF NOT EXISTS supplier_rfq_vendors (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id          uuid NOT NULL REFERENCES supplier_rfqs(id) ON DELETE CASCADE,
    vendor_id       uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    status          text NOT NULL DEFAULT 'invited'
                         CHECK (status IN ('invited','sent','responded','declined','no_response')),
    sent_at         timestamptz,
    responded_at    timestamptz,
    currency        text NOT NULL DEFAULT 'TRY'
                         CHECK (currency IN ('TRY','USD','EUR')),
    valid_until     date,
    lead_time_days  integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    notes           text,
    UNIQUE (rfq_id, vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_rfq_vendors_rfq ON supplier_rfq_vendors(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_vendors_vendor ON supplier_rfq_vendors(vendor_id);
ALTER TABLE supplier_rfq_vendors ENABLE ROW LEVEL SECURITY;

-- ── Karşılaştırma matrisi hücreleri (tedarikçi × kalem → fiyat) ─
CREATE TABLE IF NOT EXISTS supplier_rfq_prices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_vendor_id   uuid NOT NULL REFERENCES supplier_rfq_vendors(id) ON DELETE CASCADE,
    rfq_line_id     uuid NOT NULL REFERENCES supplier_rfq_lines(id) ON DELETE CASCADE,
    unit_price      numeric(14,4) CHECK (unit_price IS NULL OR unit_price >= 0),  -- NULL = teklif vermedi
    lead_time_days  integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    moq             integer CHECK (moq IS NULL OR moq >= 0),
    notes           text,
    is_awarded      boolean NOT NULL DEFAULT false,
    UNIQUE (rfq_vendor_id, rfq_line_id)
);
CREATE INDEX IF NOT EXISTS idx_rfq_prices_vendor ON supplier_rfq_prices(rfq_vendor_id);
CREATE INDEX IF NOT EXISTS idx_rfq_prices_line ON supplier_rfq_prices(rfq_line_id);
ALTER TABLE supplier_rfq_prices ENABLE ROW LEVEL SECURITY;

-- ── Boylamsal tedarikçi fiyat geçmişi ("kimde ne kadar") ─────
CREATE TABLE IF NOT EXISTS supplier_price_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    vendor_id       uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    unit_price      numeric(14,4) NOT NULL CHECK (unit_price >= 0),
    currency        text NOT NULL DEFAULT 'TRY',
    source_rfq_id   uuid REFERENCES supplier_rfqs(id) ON DELETE SET NULL,
    recorded_at     date NOT NULL DEFAULT CURRENT_DATE,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sph_product_vendor ON supplier_price_history(product_id, vendor_id, recorded_at DESC);
ALTER TABLE supplier_price_history ENABLE ROW LEVEL SECURITY;

-- ── Gönderim anı PDF/HTML arşivi (tedarikçi başına) — 075 deseni ─
CREATE TABLE IF NOT EXISTS supplier_rfq_archives (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id          uuid NOT NULL REFERENCES supplier_rfqs(id) ON DELETE CASCADE,
    vendor_id       uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    file_path       text NOT NULL CHECK (length(trim(file_path)) > 0),
    content_hash    text NOT NULL,
    byte_size       int NOT NULL CHECK (byte_size > 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rfq_archive_vendor ON supplier_rfq_archives(rfq_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_rfq_archive_rfq ON supplier_rfq_archives(rfq_id);
ALTER TABLE supplier_rfq_archives ENABLE ROW LEVEL SECURITY;

-- ── product_vendor_links: son bilinen tedarikçi fiyatı (084 ALTER) ─
ALTER TABLE product_vendor_links
    ADD COLUMN IF NOT EXISTS last_unit_price     numeric(14,4),
    ADD COLUMN IF NOT EXISTS last_price_currency text,
    ADD COLUMN IF NOT EXISTS last_price_at       date;

-- ── RLS politikaları (service_role; 075/076 deseni) ──────────
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'rfq_counters','supplier_rfqs','supplier_rfq_lines','supplier_rfq_vendors',
        'supplier_rfq_prices','supplier_price_history','supplier_rfq_archives'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "service_%1$s_all" ON %1$s', t);
        EXECUTE format(
            'CREATE POLICY "service_%1$s_all" ON %1$s FOR ALL USING (auth.role() = ''service_role'')', t);
    END LOOP;
END $$;

-- ============================================================
-- RPC'ler
-- ============================================================

-- ── Atomik oluştur: başlık + satırlar + davet vendorlar ──────
CREATE OR REPLACE FUNCTION create_rfq_with_lines(
    p_header jsonb,      -- {title, due_date, currency, notes, rfq_date?}
    p_lines jsonb,       -- [{product_id, product_code, description, quantity, unit, target_date, notes}]
    p_vendor_ids jsonb,  -- ["<vendor_uuid>", ...]
    p_actor text
) RETURNS TABLE(rfq_id uuid, rfq_number text)
LANGUAGE plpgsql AS $$
DECLARE
    v_id uuid;
    v_number text;
    v_line jsonb;
    v_pos integer := 0;
    v_vid uuid;
BEGIN
    IF jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'RFQ oluşturulamadı: en az 1 kalem gerekli';
    END IF;
    IF jsonb_array_length(p_vendor_ids) = 0 THEN
        RAISE EXCEPTION 'RFQ oluşturulamadı: en az 1 tedarikçi gerekli';
    END IF;

    v_number := generate_rfq_number();

    INSERT INTO supplier_rfqs (rfq_number, title, due_date, currency, notes, rfq_date, created_by)
    VALUES (
        v_number,
        p_header->>'title',
        NULLIF(p_header->>'due_date','')::date,
        COALESCE(NULLIF(p_header->>'currency',''), 'TRY'),
        p_header->>'notes',
        COALESCE(NULLIF(p_header->>'rfq_date','')::date, CURRENT_DATE),
        p_actor
    ) RETURNING id INTO v_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO supplier_rfq_lines (rfq_id, position, product_id, product_code, description, quantity, unit, target_date, notes)
        VALUES (
            v_id, v_pos,
            (v_line->>'product_id')::uuid,
            v_line->>'product_code',
            v_line->>'description',
            (v_line->>'quantity')::integer,
            NULLIF(v_line->>'unit',''),
            NULLIF(v_line->>'target_date','')::date,
            v_line->>'notes'
        );
        v_pos := v_pos + 1;
    END LOOP;

    FOR v_vid IN SELECT (jsonb_array_elements_text(p_vendor_ids))::uuid LOOP
        INSERT INTO supplier_rfq_vendors (rfq_id, vendor_id, currency)
        VALUES (v_id, v_vid, COALESCE((SELECT currency FROM vendors WHERE id = v_vid), 'TRY'))
        ON CONFLICT (rfq_id, vendor_id) DO NOTHING;
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('rfq_created', 'supplier_rfq', v_id,
            jsonb_build_object('rfq_number', v_number, 'status', 'draft'), 'ui', p_actor);

    RETURN QUERY SELECT v_id, v_number;
END; $$;

-- ── Atomik güncelle (yalnız draft): satır + vendor setini replace ─
CREATE OR REPLACE FUNCTION update_rfq_with_lines(
    p_id uuid, p_header jsonb, p_lines jsonb, p_vendor_ids jsonb, p_actor text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_line jsonb;
    v_pos integer := 0;
    v_vid uuid;
BEGIN
    SELECT status INTO v_status FROM supplier_rfqs WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ bulunamadı: %', p_id; END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'RFQ düzenlenemez (status=%); yalnız draft', v_status;
    END IF;
    IF jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'RFQ için en az 1 kalem gerekli';
    END IF;
    IF jsonb_array_length(p_vendor_ids) = 0 THEN
        RAISE EXCEPTION 'RFQ için en az 1 tedarikçi gerekli';
    END IF;

    UPDATE supplier_rfqs SET
        title    = p_header->>'title',
        due_date = NULLIF(p_header->>'due_date','')::date,
        currency = COALESCE(NULLIF(p_header->>'currency',''), currency),
        notes    = p_header->>'notes',
        rfq_date = COALESCE(NULLIF(p_header->>'rfq_date','')::date, rfq_date)
    WHERE id = p_id;

    DELETE FROM supplier_rfq_lines WHERE rfq_id = p_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO supplier_rfq_lines (rfq_id, position, product_id, product_code, description, quantity, unit, target_date, notes)
        VALUES (
            p_id, v_pos,
            (v_line->>'product_id')::uuid,
            v_line->>'product_code',
            v_line->>'description',
            (v_line->>'quantity')::integer,
            NULLIF(v_line->>'unit',''),
            NULLIF(v_line->>'target_date','')::date,
            v_line->>'notes'
        );
        v_pos := v_pos + 1;
    END LOOP;

    -- vendor setini hizala (draft'ta fiyat yok → CASCADE ile güvenli)
    DELETE FROM supplier_rfq_vendors
    WHERE rfq_id = p_id
      AND vendor_id NOT IN (SELECT (jsonb_array_elements_text(p_vendor_ids))::uuid);
    FOR v_vid IN SELECT (jsonb_array_elements_text(p_vendor_ids))::uuid LOOP
        INSERT INTO supplier_rfq_vendors (rfq_id, vendor_id, currency)
        VALUES (p_id, v_vid, COALESCE((SELECT currency FROM vendors WHERE id = v_vid), 'TRY'))
        ON CONFLICT (rfq_id, vendor_id) DO NOTHING;
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('rfq_updated', 'supplier_rfq', p_id,
            jsonb_build_object('line_count', jsonb_array_length(p_lines),
                               'vendor_count', jsonb_array_length(p_vendor_ids)), 'ui', p_actor);
END; $$;

-- ── Gönder: draft → sent (davet vendorları sent) ─────────────
CREATE OR REPLACE FUNCTION mark_rfq_sent(p_rfq_id uuid, p_actor text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
    SELECT status INTO v_status FROM supplier_rfqs WHERE id = p_rfq_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ bulunamadı: %', p_rfq_id; END IF;
    IF v_status NOT IN ('draft','sent') THEN
        RAISE EXCEPTION 'RFQ gönderilemez (status=%)', v_status;
    END IF;

    UPDATE supplier_rfqs SET status = 'sent', sent_at = COALESCE(sent_at, now())
    WHERE id = p_rfq_id;

    UPDATE supplier_rfq_vendors
    SET status = 'sent', sent_at = COALESCE(sent_at, now())
    WHERE rfq_id = p_rfq_id AND status = 'invited';

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('rfq_sent', 'supplier_rfq', p_rfq_id,
            jsonb_build_object('status', 'sent'), 'ui', p_actor);
END; $$;

-- ── Tedarikçi yanıtı: fiyatları kaydet (idempotent replace) ──
CREATE OR REPLACE FUNCTION upsert_rfq_vendor_quote(
    p_rfq_vendor_id uuid,
    p_header jsonb,   -- {currency, valid_until, lead_time_days, notes, status?}
    p_prices jsonb,   -- [{rfq_line_id, unit_price, lead_time_days, moq, notes}]
    p_actor text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_rfq_id uuid;
    v_vendor_id uuid;
    v_currency text;
    v_price jsonb;
    v_line_id uuid;
    v_product_id uuid;
    v_unit_price numeric(14,4);
BEGIN
    SELECT rfq_id, vendor_id INTO v_rfq_id, v_vendor_id
    FROM supplier_rfq_vendors WHERE id = p_rfq_vendor_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ tedarikçisi bulunamadı: %', p_rfq_vendor_id; END IF;

    v_currency := COALESCE(NULLIF(p_header->>'currency',''),
                           (SELECT currency FROM supplier_rfq_vendors WHERE id = p_rfq_vendor_id), 'TRY');

    UPDATE supplier_rfq_vendors SET
        currency       = v_currency,
        valid_until    = NULLIF(p_header->>'valid_until','')::date,
        lead_time_days = NULLIF(p_header->>'lead_time_days','')::integer,
        notes          = p_header->>'notes',
        status         = COALESCE(NULLIF(p_header->>'status',''), 'responded'),
        responded_at   = now()
    WHERE id = p_rfq_vendor_id;

    -- replace: bu tedarikçinin tüm hücrelerini sil, yeniden yaz
    DELETE FROM supplier_rfq_prices WHERE rfq_vendor_id = p_rfq_vendor_id;

    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
        v_line_id := (v_price->>'rfq_line_id')::uuid;
        v_unit_price := NULLIF(v_price->>'unit_price','')::numeric;

        INSERT INTO supplier_rfq_prices (rfq_vendor_id, rfq_line_id, unit_price, lead_time_days, moq, notes)
        VALUES (
            p_rfq_vendor_id, v_line_id, v_unit_price,
            NULLIF(v_price->>'lead_time_days','')::integer,
            NULLIF(v_price->>'moq','')::integer,
            v_price->>'notes'
        );

        IF v_unit_price IS NOT NULL THEN
            SELECT product_id INTO v_product_id FROM supplier_rfq_lines WHERE id = v_line_id;
            INSERT INTO supplier_price_history (product_id, vendor_id, unit_price, currency, source_rfq_id)
            VALUES (v_product_id, v_vendor_id, v_unit_price, v_currency, v_rfq_id);

            INSERT INTO product_vendor_links (product_id, vendor_id, last_unit_price, last_price_currency, last_price_at)
            VALUES (v_product_id, v_vendor_id, v_unit_price, v_currency, CURRENT_DATE)
            ON CONFLICT (product_id, vendor_id) DO UPDATE
            SET last_unit_price = EXCLUDED.last_unit_price,
                last_price_currency = EXCLUDED.last_price_currency,
                last_price_at = EXCLUDED.last_price_at;
        END IF;
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('rfq_vendor_quoted', 'supplier_rfq', v_rfq_id,
            jsonb_build_object('vendor_id', v_vendor_id, 'price_count', jsonb_array_length(p_prices)), 'ui', p_actor);
END; $$;

-- ── Karara bağla → vendor başına PO oluştur ──────────────────
CREATE OR REPLACE FUNCTION award_rfq_create_pos(
    p_rfq_id uuid,
    p_awards jsonb,  -- [{rfq_line_id, vendor_id, quantity, unit_price, discount_pct?}]
    p_actor text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_rfq_number text;
    v_vid uuid;
    v_lines jsonb;
    v_currency text;
    v_po_id uuid;
    v_po_number text;
    v_result jsonb := '[]'::jsonb;
    v_award jsonb;
    v_rfq_vendor_id uuid;
BEGIN
    SELECT status, rfq_number INTO v_status, v_rfq_number FROM supplier_rfqs WHERE id = p_rfq_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ bulunamadı: %', p_rfq_id; END IF;
    IF v_status <> 'sent' THEN
        RAISE EXCEPTION 'RFQ karara bağlanamaz (status=%); yalnız sent', v_status;
    END IF;
    IF jsonb_array_length(p_awards) = 0 THEN
        RAISE EXCEPTION 'En az 1 kazanan kalem gerekli';
    END IF;

    FOR v_vid IN SELECT DISTINCT (a->>'vendor_id')::uuid FROM jsonb_array_elements(p_awards) a LOOP
        -- bu tedarikçinin kazandığı satırlardan PO line'ları kur
        SELECT jsonb_agg(jsonb_build_object(
            'product_id', l.product_id,
            'quantity', (a->>'quantity')::integer,
            'unit_price', (a->>'unit_price')::numeric,
            'discount_pct', COALESCE((a->>'discount_pct')::numeric, 0),
            'notes', 'RFQ ' || v_rfq_number
        ))
        INTO v_lines
        FROM jsonb_array_elements(p_awards) a
        JOIN supplier_rfq_lines l ON l.id = (a->>'rfq_line_id')::uuid
        WHERE (a->>'vendor_id')::uuid = v_vid;

        v_currency := COALESCE(
            (SELECT currency FROM supplier_rfq_vendors WHERE rfq_id = p_rfq_id AND vendor_id = v_vid),
            (SELECT currency FROM supplier_rfqs WHERE id = p_rfq_id), 'TRY');

        SELECT po_id, po_number INTO v_po_id, v_po_number
        FROM create_purchase_order_with_lines(
            v_vid, NULL, v_currency,
            'RFQ ' || v_rfq_number || ' karar', v_lines, p_actor);

        v_result := v_result || jsonb_build_object(
            'vendor_id', v_vid, 'po_id', v_po_id, 'po_number', v_po_number);
    END LOOP;

    -- kazanan hücreleri işaretle + onaylı fiyatı geçmişe yaz
    FOR v_award IN SELECT * FROM jsonb_array_elements(p_awards) LOOP
        v_vid := (v_award->>'vendor_id')::uuid;
        SELECT id INTO v_rfq_vendor_id FROM supplier_rfq_vendors
        WHERE rfq_id = p_rfq_id AND vendor_id = v_vid;

        UPDATE supplier_rfq_prices SET is_awarded = true
        WHERE rfq_vendor_id = v_rfq_vendor_id
          AND rfq_line_id = (v_award->>'rfq_line_id')::uuid;
    END LOOP;

    UPDATE supplier_rfqs SET status = 'awarded', awarded_at = now() WHERE id = p_rfq_id;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('rfq_awarded', 'supplier_rfq', p_rfq_id,
            jsonb_build_object('status', 'awarded', 'pos', v_result), 'ui', p_actor);

    RETURN v_result;
END; $$;

-- ── İptal ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_rfq(p_rfq_id uuid, p_reason text, p_actor text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
    SELECT status INTO v_status FROM supplier_rfqs WHERE id = p_rfq_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ bulunamadı: %', p_rfq_id; END IF;
    IF v_status = 'awarded' THEN
        RAISE EXCEPTION 'Karara bağlanmış RFQ iptal edilemez';
    END IF;
    UPDATE supplier_rfqs
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
    WHERE id = p_rfq_id;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('rfq_cancelled', 'supplier_rfq', p_rfq_id,
            jsonb_build_object('status', 'cancelled', 'reason', p_reason), 'ui', p_actor);
END; $$;

-- ── Storage bucket: rfq-pdfs (076 deseni; private, text/html) ─
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rfq-pdfs', 'rfq-pdfs', false, 5242880, ARRAY['text/html'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "rfq_pdfs_service_all" ON storage.objects;
CREATE POLICY "rfq_pdfs_service_all" ON storage.objects
    FOR ALL USING (bucket_id = 'rfq-pdfs' AND auth.role() = 'service_role');

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS cancel_rfq, award_rfq_create_pos, upsert_rfq_vendor_quote,
--   mark_rfq_sent, update_rfq_with_lines, create_rfq_with_lines, generate_rfq_number;
-- ALTER TABLE product_vendor_links DROP COLUMN IF EXISTS last_unit_price,
--   DROP COLUMN IF EXISTS last_price_currency, DROP COLUMN IF EXISTS last_price_at;
-- DROP TABLE IF EXISTS supplier_rfq_archives, supplier_price_history, supplier_rfq_prices,
--   supplier_rfq_vendors, supplier_rfq_lines, supplier_rfqs, rfq_counters CASCADE;
-- DELETE FROM storage.buckets WHERE id = 'rfq-pdfs';
