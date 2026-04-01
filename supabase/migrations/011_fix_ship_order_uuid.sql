-- 011_fix_ship_order_uuid.sql
-- Fix: inventory_movements.reference_id is uuid type.
-- Migration 007 had p_order_id::text which caused type mismatch error on shipment.

create or replace function ship_order_full(p_order_id uuid)
returns jsonb as $$
declare
    v_order record;
    v_res   record;
    v_line  record;
begin
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

    for v_line in
        select ol.*, sr.reserved_qty, sr.id as reservation_id
        from order_lines ol
        join stock_reservations sr on sr.order_line_id = ol.id and sr.order_id = p_order_id and sr.status = 'open'
        where ol.order_id = p_order_id
        order by ol.sort_order
    loop
        update products
        set on_hand  = greatest(0, on_hand - v_line.quantity),
            reserved = greatest(0, reserved - v_line.reserved_qty)
        where id = v_line.product_id;

        -- FIX: was p_order_id::text, but reference_id column is uuid
        -- HEALTH DIAGNOSTIC DEPENDENCY: Bu yorum satırı migration 016'daki
        -- check_migration_011_applied() fonksiyonu tarafından fix marker olarak
        -- kullanılmaktadır. Bu yorumu değiştirmeyin veya silmeyin.
        insert into inventory_movements (product_id, movement_type, quantity, reference_type, reference_id, source)
        values (v_line.product_id, 'shipment', -v_line.quantity, 'order', p_order_id, 'ui');
    end loop;

    update stock_reservations
    set status = 'shipped', released_at = now()
    where order_id = p_order_id and status = 'open';

    update shortages
    set status = 'resolved', resolved_at = now()
    where order_id = p_order_id and status = 'open';

    update sales_orders
    set fulfillment_status = 'shipped',
        updated_at         = now()
    where id = p_order_id;

    -- audit_log.entity_id is text, so ::text cast here is correct
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
