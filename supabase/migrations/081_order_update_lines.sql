-- KokpitERP — Faz 2 (Satış Siparişleri): Taslak sipariş düzenleme RPC
-- ============================================================================
-- İhtiyaç: oluşturulduktan sonra taslak siparişlerin müşteri/kalem/not/teklif
-- vadesi değiştirilemiyordu (yalnız statü geçişi vardı). Bu RPC, PO
-- replace_purchase_order_lines paterniyle atomik header+lines replace yapar.
--
-- Tasarım kararları:
--  - YALNIZCA status='draft' düzenlenebilir (FOR UPDATE lock + guard). Onaylı/
--    bekleyen/iptal/sevk siparişler dokunulamaz — rezervasyon/Paraşüt yan etkisi
--    yok (draft'ta hiç rezervasyon/sync olmamıştır).
--  - Totaller SUNUCU TARAFINDA yeniden hesaplanır (line_total'lerden) — tek
--    doğru kaynak, client spoof edemez. sales_orders'ta totals trigger YOK
--    (Faz 6'da doğrulandı) → RPC hesaplar. Türk fatura standardı (Faz 6):
--    Ara Toplam → İskonto → KDV Matrahı → KDV(%vat_rate) → Genel Toplam.
--  - discount_amount + vat_rate KORUNUR (mevcut satırdan okunur). Form ile
--    yaratılan draft'ta discount=0, vat_rate=20 → KDV %20 ile tutarlı.
--  - order_number / commercial_status / fulfillment_status / created_by /
--    quote_id / parasut_* alanları DOKUNULMAZ. updated_at trigger ile güncellenir.
--  - audit_log 'order_lines_replaced' (actor ile).
-- ============================================================================

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
    v_subtotal      numeric(15,2);
    v_taxable       numeric(15,2);
    v_vat_total     numeric(15,2);
    v_grand_total   numeric(15,2);
BEGIN
    -- Satırı kilitle + mevcut discount/vat_rate'i oku (totaller bunlarla hesaplanır)
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

    -- Satırları değiştir
    DELETE FROM order_lines WHERE order_id = p_order_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
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
            (v_line->>'unit_price')::numeric,
            COALESCE((v_line->>'discount_pct')::numeric, 0),
            (v_line->>'line_total')::numeric,
            v_idx
        );
        v_idx := v_idx + 1;
    END LOOP;

    -- Totalleri sunucu tarafında yeniden hesapla (line_total'lerden)
    SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
      FROM order_lines WHERE order_id = p_order_id;
    v_taxable     := GREATEST(v_subtotal - v_discount, 0);
    v_vat_total   := round(v_taxable * v_vat_rate / 100, 2);
    v_grand_total := round(v_taxable + v_vat_total, 2);

    -- Header güncelle (yalnız düzenlenebilir alanlar; statü/numara/parasut dokunulmaz)
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

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS update_order_with_lines(uuid, jsonb, jsonb, text);
