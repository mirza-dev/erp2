-- ============================================================================
-- Migration 093 — Finansal bütünlük: toplamlar sunucuda (denetim K2, 2026-06)
-- ============================================================================
-- Bulgu: order/quote RPC'leri header toplamlarını ve line_total'ı İSTEMCİDEN
-- olduğu gibi alıyordu → API'ye doğrudan istekle "qty=100, price=100,
-- line_total=1, grand_total=1" yazdırılabiliyordu (rapor K2).
--
-- Karar (kullanıcı onaylı):
--  - SİPARİŞ RPC'leri (create_order_with_lines 023 halefi, update_order_with_lines
--    081 halefi): satır ve header toplamları SIFIRDAN sunucuda hesaplanır;
--    istemcinin gönderdiği subtotal/vat_total/grand_total/line_total YOK SAYILIR.
--    Sipariş formunda elle toplam girme özelliği zaten yok → davranış değişmez.
--  - TEKLİF RPC'leri (create/update_quote_with_lines 071 halefi): elle override
--    özelliği KORUNUR (ovSub/ovVat/ovGrand meşru); sunucu yalnız MAKUL-SAPMA
--    kontrolü yapar: |verilen − hesaplanan| > GREATEST(hesaplanan*0.05, 100)
--    → exception. Teklif satır toplamı da sunucuda hesaplanır (satır override
--    özelliği yok; qty*price birebir aynı sonucu verir).
--
-- Formül (081 ile aynı, Türk fatura standardı):
--   line_total = round(qty * price * (1 - coalesce(disc_pct,0)/100), 2)
--   subtotal   = Σ line_total;  taxable = greatest(subtotal - discount, 0)
--   vat        = round(taxable * vat_rate/100, 2);  grand = round(taxable + vat, 2)
--
-- SECURITY DEFINER YOK — dört fonksiyon da INVOKER kalır (071 V7-A1 / 036 kararı).
-- ============================================================================

-- ── 1) create_order_with_lines (023 halefi) ────────────────────────────────
CREATE OR REPLACE FUNCTION create_order_with_lines(p_header jsonb, p_lines jsonb)
RETURNS jsonb AS $$
DECLARE
    v_order_number text;
    v_order_id     uuid;
    v_line         jsonb;
    v_idx          integer := 0;
    v_qty          numeric;
    v_price        numeric;
    v_disc_pct     numeric;
    v_line_total   numeric(15,2);
    v_subtotal     numeric(15,2) := 0;
    v_discount     numeric(15,2);
    v_vat_rate     numeric(5,2);
    v_taxable      numeric(15,2);
    v_vat_total    numeric(15,2);
    v_grand_total  numeric(15,2);
BEGIN
    v_order_number := generate_order_number();
    v_discount := COALESCE((p_header->>'discount_amount')::numeric, 0);
    v_vat_rate := COALESCE((p_header->>'vat_rate')::numeric, 20);

    -- Önce toplamları hesapla (K2: istemci toplamları YOK SAYILIR)
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_qty      := COALESCE((v_line->>'quantity')::numeric, 0);
        v_price    := COALESCE((v_line->>'unit_price')::numeric, 0);
        v_disc_pct := COALESCE((v_line->>'discount_pct')::numeric, 0);
        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Satır miktarı 0''dan büyük olmalı (satır %)', v_idx + 1;
        END IF;
        IF v_price < 0 THEN
            RAISE EXCEPTION 'Birim fiyat negatif olamaz (satır %)', v_idx + 1;
        END IF;
        v_subtotal := v_subtotal + round(v_qty * v_price * (1 - v_disc_pct / 100), 2);
        v_idx := v_idx + 1;
    END LOOP;

    v_taxable     := GREATEST(v_subtotal - v_discount, 0);
    v_vat_total   := round(v_taxable * v_vat_rate / 100, 2);
    v_grand_total := round(v_taxable + v_vat_total, 2);

    INSERT INTO sales_orders (
        order_number,
        customer_id,
        customer_name,
        customer_email,
        customer_country,
        customer_tax_office,
        customer_tax_number,
        commercial_status,
        fulfillment_status,
        currency,
        subtotal,
        vat_total,
        grand_total,
        discount_amount,
        vat_rate,
        notes,
        item_count,
        created_by,
        incoterm,
        planned_shipment_date,
        quote_id,
        original_order_number,
        quote_valid_until
    ) VALUES (
        v_order_number,
        (p_header->>'customer_id')::uuid,
        p_header->>'customer_name',
        p_header->>'customer_email',
        p_header->>'customer_country',
        p_header->>'customer_tax_office',
        p_header->>'customer_tax_number',
        p_header->>'commercial_status',
        'unallocated',
        p_header->>'currency',
        v_subtotal,
        v_vat_total,
        v_grand_total,
        v_discount,
        v_vat_rate,
        p_header->>'notes',
        jsonb_array_length(p_lines),
        p_header->>'created_by',
        p_header->>'incoterm',
        (p_header->>'planned_shipment_date')::date,
        (p_header->>'quote_id')::uuid,
        p_header->>'original_order_number',
        (p_header->>'quote_valid_until')::date
    ) RETURNING id INTO v_order_id;

    v_idx := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_qty      := COALESCE((v_line->>'quantity')::numeric, 0);
        v_price    := COALESCE((v_line->>'unit_price')::numeric, 0);
        v_disc_pct := COALESCE((v_line->>'discount_pct')::numeric, 0);
        v_line_total := round(v_qty * v_price * (1 - v_disc_pct / 100), 2);
        INSERT INTO order_lines (
            order_id,
            product_id,
            product_name,
            product_sku,
            unit,
            quantity,
            unit_price,
            discount_pct,
            line_total,
            sort_order
        ) VALUES (
            v_order_id,
            (v_line->>'product_id')::uuid,
            v_line->>'product_name',
            v_line->>'product_sku',
            v_line->>'unit',
            (v_line->>'quantity')::integer,
            v_price,
            v_disc_pct,
            v_line_total,
            v_idx
        );
        v_idx := v_idx + 1;
    END LOOP;

    RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$ LANGUAGE plpgsql;

-- ── 2) update_order_with_lines (081 halefi) ────────────────────────────────
-- Tek değişiklik: line_total istemciden alınmaz, sunucuda hesaplanır
-- (081 header'ı zaten SUM(line_total)'dan hesaplıyordu — zincirin kör noktası
-- client line_total'dı). + qty<=0 guard'ı.
CREATE OR REPLACE FUNCTION update_order_with_lines(
    p_order_id uuid,
    p_header   jsonb,
    p_lines    jsonb,
    p_actor    text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_status        text;
    v_discount      numeric(15,2);
    v_vat_rate      numeric(5,2);
    v_line          jsonb;
    v_idx           integer := 0;
    v_qty           numeric;
    v_price         numeric;
    v_disc_pct      numeric;
    v_subtotal      numeric(15,2);
    v_taxable       numeric(15,2);
    v_vat_total     numeric(15,2);
    v_grand_total   numeric(15,2);
BEGIN
    SELECT commercial_status, COALESCE(discount_amount, 0), COALESCE(vat_rate, 20)
      INTO v_status, v_discount, v_vat_rate
      FROM sales_orders
     WHERE id = p_order_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sipariş bulunamadı: %', p_order_id;
    END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'Yalnızca taslak siparişler düzenlenebilir (durum=%)', v_status;
    END IF;
    IF jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'Sipariş için en az 1 kalem gerekli';
    END IF;

    DELETE FROM order_lines WHERE order_id = p_order_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_qty      := COALESCE((v_line->>'quantity')::numeric, 0);
        v_price    := COALESCE((v_line->>'unit_price')::numeric, 0);
        v_disc_pct := COALESCE((v_line->>'discount_pct')::numeric, 0);
        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Satır miktarı 0''dan büyük olmalı (satır %)', v_idx + 1;
        END IF;
        INSERT INTO order_lines (
            order_id, product_id, product_name, product_sku, unit,
            quantity, unit_price, discount_pct, line_total, sort_order
        ) VALUES (
            p_order_id,
            (v_line->>'product_id')::uuid,
            v_line->>'product_name',
            v_line->>'product_sku',
            v_line->>'unit',
            (v_line->>'quantity')::integer,
            v_price,
            v_disc_pct,
            round(v_qty * v_price * (1 - v_disc_pct / 100), 2),
            v_idx
        );
        v_idx := v_idx + 1;
    END LOOP;

    SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
      FROM order_lines WHERE order_id = p_order_id;
    v_taxable     := GREATEST(v_subtotal - v_discount, 0);
    v_vat_total   := round(v_taxable * v_vat_rate / 100, 2);
    v_grand_total := round(v_taxable + v_vat_total, 2);

    UPDATE sales_orders SET
        customer_id         = (p_header->>'customer_id')::uuid,
        customer_name       = p_header->>'customer_name',
        customer_email      = p_header->>'customer_email',
        customer_country    = p_header->>'customer_country',
        customer_tax_office = p_header->>'customer_tax_office',
        customer_tax_number = p_header->>'customer_tax_number',
        currency            = p_header->>'currency',
        notes               = p_header->>'notes',
        quote_valid_until   = NULLIF(p_header->>'quote_valid_until', '')::date,
        subtotal            = v_subtotal,
        vat_total           = v_vat_total,
        grand_total         = v_grand_total,
        item_count          = jsonb_array_length(p_lines)
    WHERE id = p_order_id;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('order_lines_replaced', 'sales_order', p_order_id,
            jsonb_build_object(
                'line_count', jsonb_array_length(p_lines),
                'subtotal', v_subtotal,
                'grand_total', v_grand_total
            ), 'ui', p_actor);

    RETURN jsonb_build_object('order_id', p_order_id, 'item_count', jsonb_array_length(p_lines));
END; $$;

-- ── 3) Teklif makul-sapma kontrolü (ortak yardımcı) ────────────────────────
-- Override KORUNUR; yalnız absürt sapma reddedilir.
CREATE OR REPLACE FUNCTION assert_quote_totals_sane(p_header jsonb, p_lines jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_computed_sub  numeric(15,2);
    v_provided_sub  numeric(15,2);
    v_discount      numeric(15,2);
    v_vat_rate      numeric(5,2);
    v_computed_gr   numeric(15,2);
    v_provided_gr   numeric(15,2);
    v_tol           numeric(15,2);
BEGIN
    SELECT COALESCE(SUM(round(
               COALESCE((ln->>'quantity')::numeric, 0) *
               COALESCE((ln->>'unit_price')::numeric, 0), 2)), 0)
      INTO v_computed_sub
      FROM jsonb_array_elements(p_lines) AS ln;

    v_provided_sub := COALESCE((p_header->>'subtotal')::numeric, 0);
    v_discount     := COALESCE((p_header->>'discount_amount')::numeric, 0);
    v_vat_rate     := COALESCE((p_header->>'vat_rate')::numeric, 20);
    v_provided_gr  := COALESCE((p_header->>'grand_total')::numeric, 0);

    v_tol := GREATEST(v_computed_sub * 0.05, 100);
    IF abs(v_provided_sub - v_computed_sub) > v_tol THEN
        RAISE EXCEPTION 'Teklif ara toplamı satırlardan hesaplananla uyuşmuyor (verilen %, hesaplanan %)',
            v_provided_sub, v_computed_sub;
    END IF;

    v_computed_gr := round(GREATEST(v_provided_sub - v_discount, 0) * (1 + v_vat_rate / 100), 2);
    v_tol := GREATEST(v_computed_gr * 0.05, 100);
    IF abs(v_provided_gr - v_computed_gr) > v_tol THEN
        RAISE EXCEPTION 'Teklif genel toplamı hesaplananla uyuşmuyor (verilen %, hesaplanan %)',
            v_provided_gr, v_computed_gr;
    END IF;
END; $$;

-- ── 4) create_quote_with_lines (071 halefi) ────────────────────────────────
-- 071'den fark: (a) başta assert_quote_totals_sane, (b) satır line_total
-- sunucuda round(qty*price,2) — gerisi birebir aynı.
CREATE OR REPLACE FUNCTION create_quote_with_lines(
    p_header jsonb,
    p_lines  jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_id uuid;
BEGIN
    PERFORM assert_quote_totals_sane(p_header, p_lines);

    INSERT INTO quotes (
        quote_number, status, customer_id, customer_name,
        customer_contact, customer_phone, customer_email, customer_address,
        sales_rep, sales_phone, sales_email,
        currency, vat_rate, subtotal, vat_total, grand_total, discount_amount,
        notes, sig_prepared, sig_approved, sig_manager,
        quote_date, valid_until,
        delivery_method, payment_method,
        seller_name, seller_phone, seller_email, seller_address,
        seller_tax_id, seller_website, seller_logo_url,
        updated_at
    ) VALUES (
        COALESCE(NULLIF(p_header->>'quote_number', ''), next_quote_number()),
        COALESCE(NULLIF(p_header->>'status', ''), 'draft'),
        NULLIF(p_header->>'customer_id', '')::uuid,
        COALESCE(p_header->>'customer_name', ''),
        NULLIF(p_header->>'customer_contact', ''),
        NULLIF(p_header->>'customer_phone', ''),
        NULLIF(p_header->>'customer_email', ''),
        NULLIF(p_header->>'customer_address', ''),
        NULLIF(p_header->>'sales_rep', ''),
        NULLIF(p_header->>'sales_phone', ''),
        NULLIF(p_header->>'sales_email', ''),
        COALESCE(NULLIF(p_header->>'currency', ''), 'USD'),
        COALESCE((p_header->>'vat_rate')::numeric,        20),
        COALESCE((p_header->>'subtotal')::numeric,         0),
        COALESCE((p_header->>'vat_total')::numeric,        0),
        COALESCE((p_header->>'grand_total')::numeric,      0),
        COALESCE((p_header->>'discount_amount')::numeric,  0),
        NULLIF(p_header->>'notes', ''),
        NULLIF(p_header->>'sig_prepared', ''),
        NULLIF(p_header->>'sig_approved', ''),
        NULLIF(p_header->>'sig_manager', ''),
        NULLIF(p_header->>'quote_date', '')::date,
        NULLIF(p_header->>'valid_until', '')::date,
        NULLIF(p_header->>'delivery_method', ''),
        NULLIF(p_header->>'payment_method', ''),
        NULLIF(p_header->>'seller_name', ''),
        NULLIF(p_header->>'seller_phone', ''),
        NULLIF(p_header->>'seller_email', ''),
        NULLIF(p_header->>'seller_address', ''),
        NULLIF(p_header->>'seller_tax_id', ''),
        NULLIF(p_header->>'seller_website', ''),
        NULLIF(p_header->>'seller_logo_url', ''),
        COALESCE((p_header->>'updated_at')::timestamptz, now())
    )
    RETURNING id INTO v_id;

    IF jsonb_array_length(p_lines) > 0 THEN
        INSERT INTO quote_line_items (
            quote_id, position, product_id, product_code,
            lead_time, description, quantity, unit_price,
            line_total, hs_code, weight_kg, size_text,
            unit_weight_kg, kg_manual_override
        )
        SELECT
            v_id,
            (ln->>'position')::integer,
            NULLIF(ln->>'product_id', '')::uuid,
            COALESCE(ln->>'product_code', ''),
            NULLIF(ln->>'lead_time', ''),
            COALESCE(ln->>'description', ''),
            COALESCE((ln->>'quantity')::numeric,   0),
            COALESCE((ln->>'unit_price')::numeric, 0),
            round(COALESCE((ln->>'quantity')::numeric, 0) *
                  COALESCE((ln->>'unit_price')::numeric, 0), 2),
            NULLIF(ln->>'hs_code', ''),
            NULLIF(ln->>'weight_kg', '')::numeric,
            NULLIF(ln->>'size_text', ''),
            NULLIF(ln->>'unit_weight_kg', '')::numeric,
            COALESCE((ln->>'kg_manual_override')::boolean, false)
        FROM jsonb_array_elements(p_lines) AS ln;
    END IF;

    RETURN v_id;
END;
$$;

-- ── 5) update_quote_with_lines (071 halefi) ────────────────────────────────
CREATE OR REPLACE FUNCTION update_quote_with_lines(
    p_id     uuid,
    p_header jsonb,
    p_lines  jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF (SELECT status FROM quotes WHERE id = p_id) <> 'draft' THEN
        RAISE EXCEPTION 'Sadece taslak teklifler düzenlenebilir (status guard).'
            USING ERRCODE = '42501';
    END IF;

    PERFORM assert_quote_totals_sane(p_header, p_lines);

    UPDATE quotes SET
        customer_id      = NULLIF(p_header->>'customer_id', '')::uuid,
        customer_name    = COALESCE(p_header->>'customer_name', ''),
        customer_contact = NULLIF(p_header->>'customer_contact', ''),
        customer_phone   = NULLIF(p_header->>'customer_phone', ''),
        customer_email   = NULLIF(p_header->>'customer_email', ''),
        customer_address = NULLIF(p_header->>'customer_address', ''),
        sales_rep        = NULLIF(p_header->>'sales_rep', ''),
        sales_phone      = NULLIF(p_header->>'sales_phone', ''),
        sales_email      = NULLIF(p_header->>'sales_email', ''),
        currency         = COALESCE(NULLIF(p_header->>'currency', ''), 'USD'),
        vat_rate         = COALESCE((p_header->>'vat_rate')::numeric,       20),
        subtotal         = COALESCE((p_header->>'subtotal')::numeric,        0),
        vat_total        = COALESCE((p_header->>'vat_total')::numeric,       0),
        grand_total      = COALESCE((p_header->>'grand_total')::numeric,     0),
        discount_amount  = COALESCE((p_header->>'discount_amount')::numeric, 0),
        notes            = NULLIF(p_header->>'notes', ''),
        sig_prepared     = NULLIF(p_header->>'sig_prepared', ''),
        sig_approved     = NULLIF(p_header->>'sig_approved', ''),
        sig_manager      = NULLIF(p_header->>'sig_manager', ''),
        quote_date       = NULLIF(p_header->>'quote_date', '')::date,
        valid_until      = NULLIF(p_header->>'valid_until', '')::date,
        delivery_method  = NULLIF(p_header->>'delivery_method', ''),
        payment_method   = NULLIF(p_header->>'payment_method', ''),
        seller_name      = NULLIF(p_header->>'seller_name', ''),
        seller_phone     = NULLIF(p_header->>'seller_phone', ''),
        seller_email     = NULLIF(p_header->>'seller_email', ''),
        seller_address   = NULLIF(p_header->>'seller_address', ''),
        seller_tax_id    = NULLIF(p_header->>'seller_tax_id', ''),
        seller_website   = NULLIF(p_header->>'seller_website', ''),
        seller_logo_url  = NULLIF(p_header->>'seller_logo_url', ''),
        updated_at       = COALESCE((p_header->>'updated_at')::timestamptz, now())
    WHERE id = p_id;

    DELETE FROM quote_line_items WHERE quote_id = p_id;

    IF jsonb_array_length(p_lines) > 0 THEN
        INSERT INTO quote_line_items (
            quote_id, position, product_id, product_code,
            lead_time, description, quantity, unit_price,
            line_total, hs_code, weight_kg, size_text,
            unit_weight_kg, kg_manual_override
        )
        SELECT
            p_id,
            (ln->>'position')::integer,
            NULLIF(ln->>'product_id', '')::uuid,
            COALESCE(ln->>'product_code', ''),
            NULLIF(ln->>'lead_time', ''),
            COALESCE(ln->>'description', ''),
            COALESCE((ln->>'quantity')::numeric,   0),
            COALESCE((ln->>'unit_price')::numeric, 0),
            round(COALESCE((ln->>'quantity')::numeric, 0) *
                  COALESCE((ln->>'unit_price')::numeric, 0), 2),
            NULLIF(ln->>'hs_code', ''),
            NULLIF(ln->>'weight_kg', '')::numeric,
            NULLIF(ln->>'size_text', ''),
            NULLIF(ln->>'unit_weight_kg', '')::numeric,
            COALESCE((ln->>'kg_manual_override')::boolean, false)
        FROM jsonb_array_elements(p_lines) AS ln;
    END IF;
END;
$$;

-- ROLLBACK:
--   create_order_with_lines  → 023'teki bloğu yeniden çalıştır
--   update_order_with_lines  → 081'deki bloğu yeniden çalıştır
--   create/update_quote_with_lines → 071'deki blokları yeniden çalıştır
--   DROP FUNCTION IF EXISTS assert_quote_totals_sane(jsonb, jsonb);
