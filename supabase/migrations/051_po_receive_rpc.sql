-- ============================================================
-- 051 — PO mal kabul RPC (atomik kısmi kabul + commitment senkronu)
-- B1: purchase_commitments.received_qty senkronize edilir.
-- inventory_movements.reference_type = 'purchase_order' eklenir.
-- ============================================================

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reference_type_check
    CHECK (reference_type IS NULL OR reference_type IN
        ('order','production_entry','import','manual','purchase_order'));

CREATE OR REPLACE FUNCTION receive_po_lines(
    p_po_id uuid, p_lines jsonb, p_actor text DEFAULT 'system'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_input  jsonb;
    v_qty    integer;
    v_line_id uuid;
    v_line   record;
    v_total_lines integer;
    v_full_received_lines integer;
    v_partial_received_lines integer;
    v_po_status text;
    v_new_received_qty integer;
BEGIN
    SELECT status INTO v_po_status FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO bulunamadı: %', p_po_id; END IF;
    IF v_po_status NOT IN ('confirmed','partially_received') THEN
        RAISE EXCEPTION 'PO mal kabul edilemez (status=%)', v_po_status;
    END IF;

    FOR v_input IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_line_id := (v_input->>'line_id')::uuid;
        v_qty     := (v_input->>'qty')::integer;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Geçersiz miktar (line=%, qty=%)', v_line_id, v_qty;
        END IF;

        SELECT id, po_id, product_id, quantity, received_qty INTO v_line
        FROM purchase_order_lines WHERE id = v_line_id AND po_id = p_po_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PO line bulunamadı veya farklı PO''ya ait: %', v_line_id;
        END IF;

        v_new_received_qty := v_line.received_qty + v_qty;
        IF v_new_received_qty > v_line.quantity THEN
            RAISE EXCEPTION
                'Aşırı kabul: line %, sipariş=%s, daha önce kabul=%s, şimdi=%s',
                v_line_id, v_line.quantity, v_line.received_qty, v_qty;
        END IF;

        UPDATE purchase_order_lines SET received_qty = v_new_received_qty WHERE id = v_line_id;
        UPDATE products SET on_hand = on_hand + v_qty WHERE id = v_line.product_id;

        INSERT INTO inventory_movements (
            product_id, movement_type, quantity,
            reference_type, reference_id, notes, source, created_by
        ) VALUES (
            v_line.product_id, 'receipt', v_qty,
            'purchase_order', v_line_id,
            format('PO mal kabul: %s adet (PO line %s)', v_qty, v_line_id),
            'system', p_actor
        );

        -- B1: commitment received_qty senkronu (kısmi/tam ortak)
        UPDATE purchase_commitments
        SET received_qty = v_new_received_qty,
            status = CASE WHEN v_new_received_qty = v_line.quantity THEN 'received' ELSE 'pending' END,
            received_at = CASE WHEN v_new_received_qty = v_line.quantity THEN now() ELSE received_at END
        WHERE po_line_id = v_line_id;
    END LOOP;

    -- PO header status auto-update
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE received_qty = quantity),
        COUNT(*) FILTER (WHERE received_qty > 0 AND received_qty < quantity)
    INTO v_total_lines, v_full_received_lines, v_partial_received_lines
    FROM purchase_order_lines WHERE po_id = p_po_id;

    IF v_full_received_lines = v_total_lines AND v_total_lines > 0 THEN
        UPDATE purchase_orders SET status='received' WHERE id = p_po_id;
        INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
        VALUES ('po_fully_received', 'purchase_order', p_po_id,
                jsonb_build_object('status', 'received'), 'system', p_actor);
    ELSIF v_full_received_lines > 0 OR v_partial_received_lines > 0 THEN
        UPDATE purchase_orders SET status='partially_received' WHERE id = p_po_id;
        INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, actor)
        VALUES ('po_partially_received', 'purchase_order', p_po_id,
                jsonb_build_object('status', 'partially_received'), 'system', p_actor);
    END IF;
END; $$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS receive_po_lines;
-- ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;
-- ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reference_type_check
--     CHECK (reference_type IS NULL OR reference_type IN ('order','production_entry','import','manual'));
