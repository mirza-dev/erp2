-- ============================================================
-- Migration 065 — Faz 4a: Teklif modülü PMT brand alanları
--
-- Plan §466 (MODUL_REVIZE_PLAN.md): Teklif PDF'i PMT brand'ine uygun
-- hale getirilirken yeni alanlar gerekir:
--   - quotes.delivery_method (TEKLİF formunda "Teslimat Şekli")
--     Örnek: "İSTANBUL PMT DEPO TESLİMİ / EXWORKS PMT İSTANBUL DEPO"
--   - quotes.payment_method (TEKLİF formunda "Ödeme Şekli")
--     Örnek: "%50 AVANS, %50 SEVKE HAZIR OLUNCA"
--   - quote_line_items.size_text (TEKLİF formunda "Ölçü / Size" kolonu)
--     Örnek: "3/4''", "DN50", "8\""
--
-- Tüm alanlar TEXT NULL (PMT operatörü serbest text ile doldurur;
-- ileride select-with-suggestions UI'a yükseltilebilir).
--
-- Auto-build description ve PDF brand rewrite Faz 4b/4c'de gelir;
-- bu migration sadece DB altyapısı + RPC sözleşme genişlemesi.
-- ============================================================

ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS delivery_method text,
    ADD COLUMN IF NOT EXISTS payment_method  text;

ALTER TABLE quote_line_items
    ADD COLUMN IF NOT EXISTS size_text text;

-- ──────────────────────────────────────────────────────────────
-- RPC'leri yeniden tanımla (035 → şimdi yeni alanları da ele alır).
-- coalesce(nullif(p_header->>'x', ''))  paterni: empty string → NULL.
-- ──────────────────────────────────────────────────────────────

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
        customer_contact, customer_phone, customer_email,
        sales_rep, sales_phone, sales_email,
        currency, vat_rate, subtotal, vat_total, grand_total,
        notes, sig_prepared, sig_approved, sig_manager,
        quote_date, valid_until,
        delivery_method, payment_method,
        updated_at
    ) VALUES (
        COALESCE(NULLIF(p_header->>'quote_number', ''), next_quote_number()),
        COALESCE(NULLIF(p_header->>'status', ''), 'draft'),
        NULLIF(p_header->>'customer_id', '')::uuid,
        COALESCE(p_header->>'customer_name', ''),
        NULLIF(p_header->>'customer_contact', ''),
        NULLIF(p_header->>'customer_phone', ''),
        NULLIF(p_header->>'customer_email', ''),
        NULLIF(p_header->>'sales_rep', ''),
        NULLIF(p_header->>'sales_phone', ''),
        NULLIF(p_header->>'sales_email', ''),
        COALESCE(NULLIF(p_header->>'currency', ''), 'USD'),
        COALESCE((p_header->>'vat_rate')::numeric,   20),
        COALESCE((p_header->>'subtotal')::numeric,    0),
        COALESCE((p_header->>'vat_total')::numeric,   0),
        COALESCE((p_header->>'grand_total')::numeric, 0),
        NULLIF(p_header->>'notes', ''),
        NULLIF(p_header->>'sig_prepared', ''),
        NULLIF(p_header->>'sig_approved', ''),
        NULLIF(p_header->>'sig_manager', ''),
        NULLIF(p_header->>'quote_date', '')::date,
        NULLIF(p_header->>'valid_until', '')::date,
        NULLIF(p_header->>'delivery_method', ''),
        NULLIF(p_header->>'payment_method', ''),
        COALESCE((p_header->>'updated_at')::timestamptz, now())
    )
    RETURNING id INTO v_id;

    IF jsonb_array_length(p_lines) > 0 THEN
        INSERT INTO quote_line_items (
            quote_id, position, product_id, product_code,
            lead_time, description, quantity, unit_price,
            line_total, hs_code, weight_kg, size_text
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
            NULLIF(ln->>'size_text', '')
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
    UPDATE quotes SET
        customer_id      = NULLIF(p_header->>'customer_id', '')::uuid,
        customer_name    = COALESCE(p_header->>'customer_name', ''),
        customer_contact = NULLIF(p_header->>'customer_contact', ''),
        customer_phone   = NULLIF(p_header->>'customer_phone', ''),
        customer_email   = NULLIF(p_header->>'customer_email', ''),
        sales_rep        = NULLIF(p_header->>'sales_rep', ''),
        sales_phone      = NULLIF(p_header->>'sales_phone', ''),
        sales_email      = NULLIF(p_header->>'sales_email', ''),
        currency         = COALESCE(NULLIF(p_header->>'currency', ''), 'USD'),
        vat_rate         = COALESCE((p_header->>'vat_rate')::numeric,   20),
        subtotal         = COALESCE((p_header->>'subtotal')::numeric,    0),
        vat_total        = COALESCE((p_header->>'vat_total')::numeric,   0),
        grand_total      = COALESCE((p_header->>'grand_total')::numeric, 0),
        notes            = NULLIF(p_header->>'notes', ''),
        sig_prepared     = NULLIF(p_header->>'sig_prepared', ''),
        sig_approved     = NULLIF(p_header->>'sig_approved', ''),
        sig_manager      = NULLIF(p_header->>'sig_manager', ''),
        quote_date       = NULLIF(p_header->>'quote_date', '')::date,
        valid_until      = NULLIF(p_header->>'valid_until', '')::date,
        delivery_method  = NULLIF(p_header->>'delivery_method', ''),
        payment_method   = NULLIF(p_header->>'payment_method', ''),
        updated_at       = COALESCE((p_header->>'updated_at')::timestamptz, now())
    WHERE id = p_id;

    DELETE FROM quote_line_items WHERE quote_id = p_id;

    IF jsonb_array_length(p_lines) > 0 THEN
        INSERT INTO quote_line_items (
            quote_id, position, product_id, product_code,
            lead_time, description, quantity, unit_price,
            line_total, hs_code, weight_kg, size_text
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
            NULLIF(ln->>'size_text', '')
        FROM jsonb_array_elements(p_lines) AS ln;
    END IF;
END;
$$;

-- ROLLBACK:
-- ALTER TABLE quotes DROP COLUMN IF EXISTS delivery_method;
-- ALTER TABLE quotes DROP COLUMN IF EXISTS payment_method;
-- ALTER TABLE quote_line_items DROP COLUMN IF EXISTS size_text;
-- (RPC'leri 035 versiyonuna geri al: ilgili migration dosyasını yeniden çalıştır.)
