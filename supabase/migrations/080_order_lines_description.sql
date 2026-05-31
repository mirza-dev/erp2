-- ============================================================
-- 080 — Faz 8d: order_lines.description (teklif satır açıklaması taşınır)
-- order_lines'a nullable `description` kolonu + accept RPC qli.description'ı
-- order_lines.description'a taşır. product_name = master p.name KALIR (V7-A8);
-- description = teklif satırının serbest açıklaması (örn. auto-build
-- "GATE VALVE A105 GÖVDE, CLASS 600 SW, SS TRİM"), accept'te kaybolmasın.
-- accept_quote_and_create_order = 078 gövdesi BİREBİR + tek delta (description).
-- Signature stable → CREATE OR REPLACE (DROP yok). İdempotent.
-- ============================================================

ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS description text;

CREATE OR REPLACE FUNCTION accept_quote_and_create_order(p_quote_id uuid, p_actor uuid)
RETURNS jsonb AS $$
DECLARE
    v_quote        quotes%ROWTYPE;
    v_existing     sales_orders%ROWTYPE;
    v_order_id     uuid;
    v_order_number text;
    v_pdf          uuid;
    v_inserted     integer;
    v_expected     integer;
BEGIN
    -- 1. Quote kilidi (idempotency + eşzamanlı accept serialize)
    SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id USING ERRCODE = 'P0002';
    END IF;

    -- 2a. Idempotency: bu teklif için sipariş zaten varsa onu döndür (already)
    SELECT * INTO v_existing FROM sales_orders WHERE quote_id = p_quote_id LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'order_id', v_existing.id,
            'order_number', v_existing.order_number,
            'already', true
        );
    END IF;

    -- 2b. Status guard: yalnız sent veya (legacy) accepted sipariş üretir.
    IF v_quote.status NOT IN ('sent', 'accepted') THEN
        RAISE EXCEPTION 'Quote status % cannot be accepted to order', v_quote.status
            USING ERRCODE = '42501';
    END IF;

    -- 3. Null product_id hard check (V7-A8 — send sonrası ürün silinmiş; SET NULL).
    IF EXISTS (SELECT 1 FROM quote_line_items
               WHERE quote_id = p_quote_id AND product_id IS NULL) THEN
        RAISE EXCEPTION 'Quote line(s) have null product_id (product deleted after send)'
            USING ERRCODE = '23502';
    END IF;

    -- 4. Quantity POZİTİF TAM SAYI hard check (V7-A11 + 078 Bulgu fix).
    IF EXISTS (SELECT 1 FROM quote_line_items
               WHERE quote_id = p_quote_id
                 AND (quantity <= 0 OR quantity <> trunc(quantity))) THEN
        RAISE EXCEPTION 'Quote line quantity must be a positive integer'
            USING ERRCODE = '22003';
    END IF;

    -- 5. PDF arşiv lookup (V7-A5 defansif).
    SELECT id INTO v_pdf FROM quote_pdf_archives
        WHERE quote_id = p_quote_id ORDER BY revision_no DESC LIMIT 1;
    IF v_pdf IS NULL THEN
        RAISE EXCEPTION 'Quote has no PDF archive (recover route bypassed)'
            USING ERRCODE = '23514', DETAIL = 'quote_id:' || p_quote_id::text;
    END IF;

    -- 6. Taslak sipariş — DONMUŞ totaller kopyalanır (recompute YOK).
    INSERT INTO sales_orders (
        order_number, customer_id, customer_name, customer_email,
        customer_country, customer_tax_office, customer_tax_number,
        commercial_status, fulfillment_status, currency,
        subtotal, discount_amount, vat_rate, vat_total, grand_total,
        notes, item_count, created_by, quote_id, quote_valid_until,
        source_quote_revision_no, quote_pdf_archive_id
    )
    SELECT
        generate_order_number(), q.customer_id, q.customer_name,
        COALESCE(q.customer_email, c.email),
        c.country, c.tax_office, c.tax_number,
        'draft', 'unallocated', q.currency,
        q.subtotal, q.discount_amount, q.vat_rate, q.vat_total, q.grand_total,
        q.notes, 0, p_actor::text, q.id, q.valid_until,
        q.revision_no, v_pdf
    FROM quotes q
    LEFT JOIN customers c ON c.id = q.customer_id
    WHERE q.id = p_quote_id
    RETURNING id, order_number INTO v_order_id, v_order_number;

    -- 7. Satırlar — V7-A3 vat_rate header'dan, V7-A8 master product (name/sku/unit).
    --    Faz 8d DELTA: + description = qli.description (teklif satır açıklaması).
    INSERT INTO order_lines (
        order_id, product_id, product_name, product_sku, unit,
        quantity, unit_price, discount_pct, line_total, vat_rate, sort_order,
        description
    )
    SELECT
        v_order_id, qli.product_id, p.name, p.sku, p.unit,
        qli.quantity::integer, qli.unit_price, 0, qli.line_total,
        v_quote.vat_rate,
        (row_number() OVER (ORDER BY qli.position))::integer - 1,
        qli.description
    FROM quote_line_items qli
    JOIN products p ON p.id = qli.product_id
    WHERE qli.quote_id = p_quote_id;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- 8. ROW_COUNT verify (V7-A8): JOIN sessiz drop → ROLLBACK.
    SELECT count(*) INTO v_expected FROM quote_line_items WHERE quote_id = p_quote_id;
    IF v_inserted <> v_expected THEN
        RAISE EXCEPTION 'Order line count mismatch: % inserted, % expected (silent JOIN drop)',
            v_inserted, v_expected;
    END IF;

    -- 9. item_count (V7-A10).
    UPDATE sales_orders SET item_count = v_inserted WHERE id = v_order_id;

    -- 10. Quote → accepted (sent ise flip; accepted ise no-op).
    UPDATE quotes SET status = 'accepted', updated_at = now()
        WHERE id = p_quote_id AND status = 'sent';

    -- 11. Audit (domain §13.1).
    INSERT INTO audit_log (actor, action, entity_type, entity_id, after_state, source)
    VALUES (
        p_actor::text, 'quote_accepted_order_created', 'quote', p_quote_id,
        jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                           'item_count', v_inserted),
        'ui'
    );

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'already', false
    );
END;
$$ LANGUAGE plpgsql;

-- V7-A1: SECURITY INVOKER (default).
REVOKE ALL ON FUNCTION accept_quote_and_create_order(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_quote_and_create_order(uuid, uuid) TO service_role;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- ALTER TABLE order_lines DROP COLUMN IF EXISTS description;
-- 078_quotes_accept_order_qty_fix.sql'i yeniden çalıştır (RPC'yi description'sız
-- sürüme geri döndürür; CREATE OR REPLACE, signature aynı).
