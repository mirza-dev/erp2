-- KokpitERP — Atomic order creation RPC
-- Fixes orphan-order risk: previously dbCreateOrder did two separate
-- INSERT calls (header, then lines). If lines failed the header stayed
-- committed. This function wraps both in a single PL/pgSQL body so
-- Postgres rolls everything back on any error.
-- Run after 017_enable_rls.sql

create or replace function create_order_with_lines(p_header jsonb, p_lines jsonb)
returns jsonb as $$
declare
    v_order_number text;
    v_order_id     uuid;
    v_line         jsonb;
    v_idx          integer := 0;
begin
    -- Concurrency-safe order number (uses order_counters row-lock)
    v_order_number := generate_order_number();

    insert into sales_orders (
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
        original_order_number
    ) values (
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
        p_header->>'original_order_number'
    ) returning id into v_order_id;

    for v_line in select * from jsonb_array_elements(p_lines) loop
        insert into order_lines (
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
        ) values (
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
    end loop;

    return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
end;
$$ language plpgsql;
