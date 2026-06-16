-- Migration 102: create_rfq_with_lines — "column reference rfq_id is ambiguous" (42702) fix.
--
-- mig.100'deki create_rfq_with_lines `RETURNS TABLE(rfq_id uuid, rfq_number text)` →
-- OUT parametresi `rfq_id`, tedarikçi INSERT'indeki `ON CONFLICT (rfq_id, vendor_id)`
-- kolon-çıkarımı (index inference) ile çakışıyordu (INSERT hedef kolon listesi sorun
-- değil; yalnız ON CONFLICT inference). PO RPC bu sorunu `ON CONFLICT DO NOTHING`
-- (listesiz) ile yaşamıyor.
--
-- Çözüm: yeni RFQ'da tedarikçi satırları HİÇ yoktu → çakışma yalnız girdi dizisindeki
-- yinelenen vendor_id'lerden gelebilir → `SELECT DISTINCT` + düz INSERT (ON CONFLICT
-- kaldırıldı). Gövdenin geri kalanı mig.100 ile birebir aynı.
CREATE OR REPLACE FUNCTION create_rfq_with_lines(
    p_header jsonb,
    p_lines jsonb,
    p_vendor_ids jsonb,
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

    -- DISTINCT → girdideki yinelenen vendor_id'ler tek satır; yeni RFQ'da mevcut
    -- tedarikçi satırı olmadığından ON CONFLICT'e gerek yok (ambiguity kaynağıydı).
    FOR v_vid IN SELECT DISTINCT (jsonb_array_elements_text(p_vendor_ids))::uuid LOOP
        INSERT INTO supplier_rfq_vendors (rfq_id, vendor_id, currency)
        VALUES (v_id, v_vid, COALESCE((SELECT currency FROM vendors WHERE id = v_vid), 'TRY'));
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('rfq_created', 'supplier_rfq', v_id,
            jsonb_build_object('rfq_number', v_number, 'status', 'draft'), 'ui', p_actor);

    RETURN QUERY SELECT v_id, v_number;
END; $$;

-- ROLLBACK: (mig.100 gövdesine dön — ON CONFLICT'li sürüm)
