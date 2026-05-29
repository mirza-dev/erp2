-- ============================================================
-- Migration 071 — Faz 3: create/update_quote_with_lines iskonto payload
--                          + update draft guard (V3-A6)
--
-- 069 versiyonu TAM REWRITE DEĞİL — 27 header alanı + Faz1a alanları
-- (customer_address, seller_*, unit_weight_kg, kg_manual_override) aynen
-- korunur; tek eklenti: header discount_amount (→ 070 kolonu).
--
-- V3-A6 draft guard: update_quote_with_lines yalnız draft teklifi günceller.
--   Route zaten status != 'draft' → 409 ön-kapısı koyuyor ([id]/route.ts:80);
--   RPC guard caller-bypass / manuel SQL'e karşı SON SAVUNMA (belt-and-suspenders).
--   create_* guard'sız — yeni kayıt.
--
-- V7-A1: SECURITY DEFINER YOK (LANGUAGE plpgsql default = INVOKER; 036 kararı).
-- V7-A2: tüm date/uuid/numeric/boolean cast'ler NULLIF/COALESCE ile sarılı.
-- ============================================================

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
            COALESCE((ln->>'line_total')::numeric, 0),
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

CREATE OR REPLACE FUNCTION update_quote_with_lines(
    p_id     uuid,
    p_header jsonb,
    p_lines  jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- V3-A6 draft guard (belt-and-suspenders): yalnız taslak güncellenebilir.
    IF (SELECT status FROM quotes WHERE id = p_id) <> 'draft' THEN
        RAISE EXCEPTION 'Sadece taslak teklifler düzenlenebilir (status guard).'
            USING ERRCODE = '42501';
    END IF;

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
            COALESCE((ln->>'line_total')::numeric, 0),
            NULLIF(ln->>'hs_code', ''),
            NULLIF(ln->>'weight_kg', '')::numeric,
            NULLIF(ln->>'size_text', ''),
            NULLIF(ln->>'unit_weight_kg', '')::numeric,
            COALESCE((ln->>'kg_manual_override')::boolean, false)
        FROM jsonb_array_elements(p_lines) AS ln;
    END IF;
END;
$$;

-- ROLLBACK: RPC'leri 069 versiyonuna geri al (069_quotes_rpc_payload_ext.sql
-- içindeki CREATE OR REPLACE bloklarını yeniden çalıştır — discount_amount kolonu
-- + draft guard kalkar) + 070'in discount_amount kolonunu DROP et.
