-- Migration 103: award_rfq_create_pos bütünlük sıkılaştırması (denetim O2 + D2).
--
-- O2 — mig.100 sürümü PO'yu istemciden gelen unit_price/quantity ile kuruyordu;
--   tedarikçinin kayıtlı teklifine (supplier_rfq_prices) karşı doğrulama yoktu →
--   audit-izi bütünlük açığı (kayıtlı 90 TRY iken PO 1 TRY'ye award edilebilir).
--   Çözüm: PO satırı SUNUCU-OTORİTER — quantity = supplier_rfq_lines.quantity,
--   unit_price = supplier_rfq_prices.unit_price (kayıtlı teklif). İstemcinin
--   gönderdiği price/qty YOK SAYILIR. Tedarikçi o kalemi fiyatlamadıysa (cell yok
--   veya unit_price NULL) → explicit RAISE (sessiz düşürme yok).
-- D2 — Aynı rfq_line_id birden çok award'da olamaz (iki tedarikçiye award → mükerrer
--   PO satırı). Payload'da yinelenen satır reddedilir.
--
-- Gövdenin geri kalanı (status guard, vendor-bazlı PO, is_awarded işaretleme,
-- awarded geçişi, audit) mig.100 ile birebir.
CREATE OR REPLACE FUNCTION award_rfq_create_pos(
    p_rfq_id uuid,
    p_awards jsonb,  -- [{rfq_line_id, vendor_id}] — price/qty SUNUCUDAN türetilir
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
    v_total integer;
    v_distinct integer;
BEGIN
    SELECT status, rfq_number INTO v_status, v_rfq_number FROM supplier_rfqs WHERE id = p_rfq_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RFQ bulunamadı: %', p_rfq_id; END IF;
    IF v_status <> 'sent' THEN
        RAISE EXCEPTION 'RFQ karara bağlanamaz (status=%); yalnız sent', v_status;
    END IF;
    IF jsonb_array_length(p_awards) = 0 THEN
        RAISE EXCEPTION 'En az 1 kazanan kalem gerekli';
    END IF;

    -- D2: aynı rfq_line_id birden çok kez award edilemez
    SELECT count(*), count(DISTINCT rl) INTO v_total, v_distinct
    FROM (SELECT (a->>'rfq_line_id') AS rl FROM jsonb_array_elements(p_awards) a) t;
    IF v_total <> v_distinct THEN
        RAISE EXCEPTION 'Aynı kalem birden çok tedarikçiye award edilemez (mükerrer rfq_line_id)';
    END IF;

    -- O2: her award bu RFQ'ya ait + tedarikçi o kalemi fiyatlamış mı? (explicit doğrulama)
    FOR v_award IN SELECT * FROM jsonb_array_elements(p_awards) LOOP
        PERFORM 1 FROM supplier_rfq_lines
        WHERE id = (v_award->>'rfq_line_id')::uuid AND rfq_id = p_rfq_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Award kalemi bu RFQ''ya ait değil: %', v_award->>'rfq_line_id';
        END IF;

        PERFORM 1
        FROM supplier_rfq_vendors sv
        JOIN supplier_rfq_prices sp ON sp.rfq_vendor_id = sv.id
        WHERE sv.rfq_id = p_rfq_id
          AND sv.vendor_id = (v_award->>'vendor_id')::uuid
          AND sp.rfq_line_id = (v_award->>'rfq_line_id')::uuid
          AND sp.unit_price IS NOT NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Tedarikçi bu kaleme fiyat vermedi, award edilemez (vendor=%, line=%)',
                v_award->>'vendor_id', v_award->>'rfq_line_id';
        END IF;
    END LOOP;

    FOR v_vid IN SELECT DISTINCT (a->>'vendor_id')::uuid FROM jsonb_array_elements(p_awards) a LOOP
        -- PO satırları SUNUCU-OTORİTER: qty = rfq_line.quantity, fiyat = kayıtlı teklif
        SELECT jsonb_agg(jsonb_build_object(
            'product_id', l.product_id,
            'quantity', l.quantity,
            'unit_price', sp.unit_price,
            'discount_pct', 0,
            'notes', 'RFQ ' || v_rfq_number
        ))
        INTO v_lines
        FROM jsonb_array_elements(p_awards) a
        JOIN supplier_rfq_lines l ON l.id = (a->>'rfq_line_id')::uuid AND l.rfq_id = p_rfq_id
        JOIN supplier_rfq_vendors sv ON sv.rfq_id = p_rfq_id AND sv.vendor_id = v_vid
        JOIN supplier_rfq_prices sp ON sp.rfq_vendor_id = sv.id AND sp.rfq_line_id = l.id
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

    -- kazanan hücreleri işaretle
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

-- ROLLBACK: mig.100 gövdesine dön (istemci price/qty + tekillik/teklif doğrulamasız).
