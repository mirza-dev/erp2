-- ============================================================
-- 052 — confirm_po + cancel_po (B4 boş PO + inactive vendor guard)
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_po(
    p_po_id uuid, p_actor text DEFAULT 'system'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_expected date;
    v_vendor_id uuid;
    v_vendor_name text;
    v_vendor_active boolean;
    v_line record;
BEGIN
    SELECT po.status, po.expected_date, po.vendor_id INTO v_status, v_expected, v_vendor_id
    FROM purchase_orders po WHERE po.id = p_po_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'PO bulunamadı: %', p_po_id; END IF;
    IF v_status NOT IN ('draft','sent') THEN
        RAISE EXCEPTION 'PO confirm edilemez (status=%); draft veya sent olmalı', v_status;
    END IF;
    IF v_expected IS NULL THEN
        RAISE EXCEPTION 'PO confirm için expected_date zorunludur';
    END IF;

    -- B4: boş PO guard
    IF NOT EXISTS (SELECT 1 FROM purchase_order_lines WHERE po_id = p_po_id) THEN
        RAISE EXCEPTION 'PO confirm edilemez: en az 1 line gerekli';
    END IF;

    -- B4: vendor active guard
    SELECT name, is_active INTO v_vendor_name, v_vendor_active
    FROM vendors WHERE id = v_vendor_id;
    IF NOT COALESCE(v_vendor_active, false) THEN
        RAISE EXCEPTION 'PO confirm edilemez: vendor pasif veya bulunamadı';
    END IF;

    UPDATE purchase_orders SET status='confirmed', confirmed_at=now() WHERE id = p_po_id;

    -- Her line için commitment (idempotent unique index ile çift insert engellenir)
    FOR v_line IN SELECT id, product_id, quantity FROM purchase_order_lines WHERE po_id = p_po_id LOOP
        INSERT INTO purchase_commitments (
            product_id, quantity, expected_date, supplier_name, notes, status, po_line_id, received_qty
        ) VALUES (
            v_line.product_id, v_line.quantity, v_expected, v_vendor_name,
            format('PO %s', p_po_id), 'pending', v_line.id, 0
        ) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('po_confirmed', 'purchase_order', p_po_id,
            jsonb_build_object('status','confirmed'), 'ui', p_actor);
END; $$;

CREATE OR REPLACE FUNCTION cancel_po(
    p_po_id uuid, p_reason text, p_actor text DEFAULT 'system'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
    SELECT status INTO v_status FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO bulunamadı: %', p_po_id; END IF;
    IF v_status IN ('received','cancelled') THEN
        RAISE EXCEPTION 'PO iptal edilemez (status=%)', v_status;
    END IF;

    UPDATE purchase_orders
    SET status='cancelled', cancelled_at=now(), cancel_reason=p_reason
    WHERE id = p_po_id;

    -- Pending commitments cancel; received olanlar dokunulmaz (B1 partial-receive korunur)
    UPDATE purchase_commitments
    SET status='cancelled'
    WHERE po_line_id IN (SELECT id FROM purchase_order_lines WHERE po_id = p_po_id)
      AND status = 'pending';

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
    VALUES ('po_cancelled','purchase_order', p_po_id,
            jsonb_build_object('status','cancelled','reason',p_reason), 'ui', p_actor);
END; $$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS confirm_po, cancel_po;
