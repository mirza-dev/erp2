-- KokpitERP — Order Domain RPCs
-- Atomic order lifecycle operations: approval with partial allocation,
-- shipment, cancellation, and concurrency-safe order number generation.
-- Run after 002_stock_rpc_functions.sql

-- ════════════════════════════════════════════════════════════════
-- 1. order_counters table + generate_order_number() RPC
-- ════════════════════════════════════════════════════════════════

create table if not exists order_counters (
    year integer primary key,
    last_seq integer not null default 0
);

create or replace function generate_order_number()
returns text as $$
declare
    v_year integer := extract(year from now())::integer;
    v_seq  integer;
begin
    insert into order_counters (year, last_seq) values (v_year, 1)
    on conflict (year) do update set last_seq = order_counters.last_seq + 1
    returning last_seq into v_seq;

    return 'ORD-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 2. approve_order_with_allocation() RPC
--    §4.4: line-by-line partial allocation + shortage records
-- ════════════════════════════════════════════════════════════════

create or replace function approve_order_with_allocation(p_order_id uuid)
returns jsonb as $$
declare
    v_order         record;
    v_line          record;
    v_product       record;
    v_available     integer;
    v_reservable    integer;
    v_shortage_qty  integer;
    v_total_requested integer := 0;
    v_total_reserved  integer := 0;
    v_shortages     jsonb := '[]'::jsonb;
    v_fulfillment   text;
begin
    -- Lock the order
    select * into v_order
    from sales_orders
    where id = p_order_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Sipariş bulunamadı.');
    end if;

    if v_order.commercial_status <> 'pending_approval' then
        return jsonb_build_object('success', false, 'error',
            format('''%s'' durumundan onaylamaya geçilemez.', v_order.commercial_status));
    end if;

    -- Process each line
    for v_line in
        select * from order_lines where order_id = p_order_id order by sort_order
    loop
        -- Lock the product row
        select * into v_product
        from products
        where id = v_line.product_id
        for update;

        if not found then
            return jsonb_build_object('success', false, 'error',
                format('Ürün bulunamadı: %s', v_line.product_name));
        end if;

        v_available  := v_product.on_hand - v_product.reserved;
        v_reservable := least(greatest(v_available, 0), v_line.quantity);
        v_shortage_qty := v_line.quantity - v_reservable;

        v_total_requested := v_total_requested + v_line.quantity;

        -- Reserve what we can
        if v_reservable > 0 then
            update products
            set reserved = reserved + v_reservable
            where id = v_line.product_id;

            insert into stock_reservations (product_id, order_id, order_line_id, reserved_qty, status)
            values (v_line.product_id, p_order_id, v_line.id, v_reservable, 'open');

            v_total_reserved := v_total_reserved + v_reservable;
        end if;

        -- Record shortage if any
        if v_shortage_qty > 0 then
            insert into shortages (order_id, order_line_id, product_id, requested_qty, available_qty, shortage_qty, status)
            values (p_order_id, v_line.id, v_line.product_id, v_line.quantity, v_reservable, v_shortage_qty, 'open');

            v_shortages := v_shortages || jsonb_build_object(
                'product_name', v_line.product_name,
                'requested', v_line.quantity,
                'reserved', v_reservable,
                'shortage', v_shortage_qty
            );
        end if;
    end loop;

    -- Zero-stock guard: if nothing could be reserved at all, reject
    if v_total_reserved = 0 then
        return jsonb_build_object('success', false, 'error', 'Hiçbir satır için yeterli stok yok.');
    end if;

    -- Determine fulfillment status
    if v_total_reserved < v_total_requested then
        v_fulfillment := 'partially_allocated';
    else
        v_fulfillment := 'allocated';
    end if;

    -- Update order
    update sales_orders
    set commercial_status  = 'approved',
        fulfillment_status = v_fulfillment,
        updated_at         = now()
    where id = p_order_id;

    -- Audit log
    insert into audit_log (action, entity_type, entity_id, before_state, after_state, source)
    values (
        'order_approved',
        'sales_order',
        p_order_id::text,
        jsonb_build_object('commercial_status', v_order.commercial_status, 'fulfillment_status', v_order.fulfillment_status),
        jsonb_build_object('commercial_status', 'approved', 'fulfillment_status', v_fulfillment),
        'ui'
    );

    return jsonb_build_object(
        'success', true,
        'fulfillment_status', v_fulfillment,
        'shortages', v_shortages
    );
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 3. ship_order_full() RPC
--    Full shipment — only for fully allocated orders
-- ════════════════════════════════════════════════════════════════

create or replace function ship_order_full(p_order_id uuid)
returns jsonb as $$
declare
    v_order   record;
    v_res     record;
    v_line    record;
begin
    -- Lock the order
    select * into v_order
    from sales_orders
    where id = p_order_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Sipariş bulunamadı.');
    end if;

    if v_order.commercial_status <> 'approved' then
        return jsonb_build_object('success', false, 'error', 'Yalnızca onaylı sipariş sevk edilebilir.');
    end if;

    if v_order.fulfillment_status <> 'allocated' then
        return jsonb_build_object('success', false, 'error', 'Eksik stok tamamlanmadan sevk edilemez.');
    end if;

    -- Process each line: deduct on_hand, release reserved, record movement
    for v_line in
        select ol.*, sr.reserved_qty, sr.id as reservation_id
        from order_lines ol
        join stock_reservations sr on sr.order_line_id = ol.id and sr.order_id = p_order_id and sr.status = 'open'
        where ol.order_id = p_order_id
        order by ol.sort_order
    loop
        -- Deduct on_hand by shipped quantity (line quantity)
        update products
        set on_hand  = greatest(0, on_hand - v_line.quantity),
            reserved = greatest(0, reserved - v_line.reserved_qty)
        where id = v_line.product_id;

        -- Record inventory movement
        insert into inventory_movements (product_id, movement_type, quantity, reference_type, reference_id, source)
        values (v_line.product_id, 'shipment', -v_line.quantity, 'order', p_order_id::text, 'ui');
    end loop;

    -- Mark all reservations as shipped
    update stock_reservations
    set status = 'shipped', released_at = now()
    where order_id = p_order_id and status = 'open';

    -- Resolve any open shortages (shouldn't exist for fully allocated, but safety)
    update shortages
    set status = 'resolved', resolved_at = now()
    where order_id = p_order_id and status = 'open';

    -- Update order
    update sales_orders
    set fulfillment_status = 'shipped',
        updated_at         = now()
    where id = p_order_id;

    -- Audit log
    insert into audit_log (action, entity_type, entity_id, before_state, after_state, source)
    values (
        'order_shipped',
        'sales_order',
        p_order_id::text,
        jsonb_build_object('fulfillment_status', v_order.fulfillment_status),
        jsonb_build_object('fulfillment_status', 'shipped'),
        'ui'
    );

    return jsonb_build_object('success', true);
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 4. cancel_order() RPC
--    §4.5: release reservations + cancel shortages + guard shipped
-- ════════════════════════════════════════════════════════════════

create or replace function cancel_order(p_order_id uuid)
returns jsonb as $$
declare
    v_order record;
    v_res   record;
begin
    -- Lock the order
    select * into v_order
    from sales_orders
    where id = p_order_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Sipariş bulunamadı.');
    end if;

    -- Commercial status guard
    if v_order.commercial_status not in ('draft', 'pending_approval', 'approved') then
        return jsonb_build_object('success', false, 'error',
            format('''%s'' durumundan iptal edilemez.', v_order.commercial_status));
    end if;

    -- Fulfillment guard: shipped or partially_shipped cannot be cancelled
    if v_order.fulfillment_status in ('partially_shipped', 'shipped') then
        return jsonb_build_object('success', false, 'error', 'Sevkiyat başlamış sipariş iptal edilemez.');
    end if;

    -- Release open reservations
    for v_res in
        select * from stock_reservations
        where order_id = p_order_id and status = 'open'
    loop
        update products
        set reserved = greatest(0, reserved - v_res.reserved_qty)
        where id = v_res.product_id;
    end loop;

    update stock_reservations
    set status = 'released', released_at = now()
    where order_id = p_order_id and status = 'open';

    -- Cancel open shortages
    update shortages
    set status = 'cancelled'
    where order_id = p_order_id and status = 'open';

    -- Update order
    update sales_orders
    set commercial_status  = 'cancelled',
        fulfillment_status = 'unallocated',
        updated_at         = now()
    where id = p_order_id;

    -- Audit log
    insert into audit_log (action, entity_type, entity_id, before_state, after_state, source)
    values (
        'order_cancelled',
        'sales_order',
        p_order_id::text,
        jsonb_build_object('commercial_status', v_order.commercial_status, 'fulfillment_status', v_order.fulfillment_status),
        jsonb_build_object('commercial_status', 'cancelled', 'fulfillment_status', 'unallocated'),
        'ui'
    );

    return jsonb_build_object('success', true);
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 5. Fix increment_reserved guard: cap at on_hand
-- ════════════════════════════════════════════════════════════════

create or replace function increment_reserved(p_product_id uuid, p_qty integer)
returns void as $$
begin
    update products
    set reserved = least(on_hand, reserved + p_qty)
    where id = p_product_id;

    if not found then
        raise exception 'Product not found: %', p_product_id;
    end if;
end;
$$ language plpgsql;
