-- KokpitERP — Faz 6: Teklif Süresi & Auto-expire
-- Adds quote_valid_until to sales_orders, quote_expired alert type,
-- and updates create_order_with_lines RPC to include the new column.

-- 1) Teklif geçerlilik tarihi — nullable, no DB default (frontend sets default +14d)
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS quote_valid_until date;

-- 2) quote_expired alert tipi — CHECK constraint genişletiliyor
ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical',
        'stock_risk',
        'purchase_recommended',
        'order_shortage',
        'sync_issue',
        'import_review_required',
        'order_deadline',
        'quote_expired'
    ));

-- 3) create_order_with_lines RPC — quote_valid_until eklendi
--    RPC INSERT sütunları açıkça listeli; yoksa NULL kalır, yeni alan eklemek zorunlu.
CREATE OR REPLACE FUNCTION create_order_with_lines(p_header jsonb, p_lines jsonb)
RETURNS jsonb AS $$
DECLARE
    v_order_number text;
    v_order_id     uuid;
    v_line         jsonb;
    v_idx          integer := 0;
BEGIN
    v_order_number := generate_order_number();

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
        (p_header->>'subtotal')::numeric,
        (p_header->>'vat_total')::numeric,
        (p_header->>'grand_total')::numeric,
        p_header->>'notes',
        jsonb_array_length(p_lines),
        p_header->>'created_by',
        p_header->>'incoterm',
        (p_header->>'planned_shipment_date')::date,
        (p_header->>'quote_id')::uuid,
        p_header->>'original_order_number',
        (p_header->>'quote_valid_until')::date
    ) RETURNING id INTO v_order_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
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
            (v_line->>'unit_price')::numeric,
            (v_line->>'discount_pct')::numeric,
            (v_line->>'line_total')::numeric,
            v_idx
        );
        v_idx := v_idx + 1;
    END LOOP;

    RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$ LANGUAGE plpgsql;
