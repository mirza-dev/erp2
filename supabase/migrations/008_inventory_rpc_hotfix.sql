-- KokpitERP — Inventory RPC Hotfix
-- Restores the 4 inventory RPCs that were missing from 007_rpc_hotfix.sql.
-- 007 consolidated 003+004 order RPCs but omitted the inventory-side RPCs.
-- This migration is idempotent (CREATE OR REPLACE / IF NOT EXISTS).
-- Safe to run even if 004 was already applied.
-- Run after 007_rpc_hotfix.sql

-- ════════════════════════════════════════════════════════════════
-- 1. Missing indexes for shortage resolution queries
-- ════════════════════════════════════════════════════════════════

create index if not exists idx_shortages_product_status
    on shortages(product_id, status) where status = 'open';

create index if not exists idx_shortages_order
    on shortages(order_id);


-- ════════════════════════════════════════════════════════════════
-- 2. record_stock_movement() RPC
--    Atomic: movement insert + on_hand update in one transaction
-- ════════════════════════════════════════════════════════════════

create or replace function record_stock_movement(
    p_product_id   uuid,
    p_movement_type text,
    p_quantity      integer,
    p_reference_type text default 'manual',
    p_reference_id  text default null,
    p_notes         text default null,
    p_source        text default 'ui'
)
returns jsonb as $$
declare
    v_product   record;
    v_new_on_hand integer;
    v_movement_id uuid;
begin
    -- Lock product row
    select * into v_product
    from products
    where id = p_product_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Ürün bulunamadı.');
    end if;

    if not v_product.is_active then
        return jsonb_build_object('success', false, 'error', 'Ürün aktif değil.');
    end if;

    -- Negative quantity guard: ensure on_hand won't go below 0
    if p_quantity < 0 and (v_product.on_hand + p_quantity) < 0 then
        return jsonb_build_object(
            'success', false,
            'error', format('Yetersiz stok. Mevcut: %s, istenen düşüş: %s', v_product.on_hand, abs(p_quantity))
        );
    end if;

    -- Calculate new on_hand
    v_new_on_hand := v_product.on_hand + p_quantity;

    -- Update product stock
    update products
    set on_hand = v_new_on_hand
    where id = p_product_id;

    -- Insert movement record
    insert into inventory_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, source)
    values (
        p_product_id,
        p_movement_type,
        p_quantity,
        p_reference_type,
        case when p_reference_id is not null then p_reference_id::uuid else null end,
        p_notes,
        p_source
    )
    returning id into v_movement_id;

    return jsonb_build_object(
        'success', true,
        'new_on_hand', v_new_on_hand,
        'movement_id', v_movement_id
    );
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 3. complete_production() RPC
--    All-or-nothing: BOM validation → component consumption →
--    finished good receipt → movements → production entry
-- ════════════════════════════════════════════════════════════════

create or replace function complete_production(
    p_product_id       uuid,
    p_produced_qty     integer,
    p_scrap_qty        integer default 0,
    p_waste_reason     text default null,
    p_production_date  date default current_date,
    p_notes            text default null,
    p_related_order_id uuid default null,
    p_entered_by       text default null
)
returns jsonb as $$
declare
    v_product     record;
    v_bom_row     record;
    v_comp        record;
    v_required    integer;
    v_shortages   jsonb := '[]'::jsonb;
    v_has_shortage boolean := false;
    v_new_on_hand integer;
    v_entry_id    uuid;
begin
    -- Validate input
    if p_produced_qty <= 0 then
        return jsonb_build_object('success', false, 'error', 'Üretim miktarı sıfırdan büyük olmalı.');
    end if;

    -- ── Phase 1: Validate & Lock ──────────────────────────────

    -- Lock finished product
    select * into v_product
    from products
    where id = p_product_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Bitmiş ürün bulunamadı.');
    end if;

    if not v_product.is_active then
        return jsonb_build_object('success', false, 'error', 'Ürün aktif değil.');
    end if;

    -- Lock all component products and check sufficiency
    for v_bom_row in
        select bom.*, p.name as component_name
        from bills_of_materials bom
        join products p on p.id = bom.component_product_id
        where bom.finished_product_id = p_product_id
        order by bom.component_product_id  -- deterministic lock order to prevent deadlocks
    loop
        -- Lock component
        select * into v_comp
        from products
        where id = v_bom_row.component_product_id
        for update;

        -- Conservative rounding: ceil for fractional BOM quantities
        v_required := ceil(v_bom_row.quantity * p_produced_qty)::integer;

        if (v_comp.on_hand - v_comp.reserved) < v_required then
            v_has_shortage := true;
            v_shortages := v_shortages || jsonb_build_object(
                'component_product_id', v_bom_row.component_product_id,
                'component_name', v_bom_row.component_name,
                'required_qty', v_required,
                'available_qty', v_comp.on_hand - v_comp.reserved
            );
        end if;
    end loop;

    -- If any shortage, abort without mutations
    if v_has_shortage then
        return jsonb_build_object(
            'success', false,
            'error', 'Yetersiz bileşen stoğu.',
            'shortages', v_shortages
        );
    end if;

    -- ── Phase 2: Mutate ───────────────────────────────────────

    -- Consume components
    for v_bom_row in
        select * from bills_of_materials
        where finished_product_id = p_product_id
        order by component_product_id
    loop
        v_required := ceil(v_bom_row.quantity * p_produced_qty)::integer;

        -- Deduct component on_hand
        update products
        set on_hand = on_hand - v_required
        where id = v_bom_row.component_product_id;

        -- Record consumption movement
        insert into inventory_movements (product_id, movement_type, quantity, reference_type, notes, source)
        values (
            v_bom_row.component_product_id,
            'production',
            -v_required,
            'production_entry',
            format('BOM tüketimi: %s x%s', v_product.name, p_produced_qty),
            'system'
        );
    end loop;

    -- Add finished product to stock
    v_new_on_hand := v_product.on_hand + p_produced_qty;

    update products
    set on_hand = v_new_on_hand
    where id = p_product_id;

    -- Record production receipt movement
    insert into inventory_movements (product_id, movement_type, quantity, reference_type, notes, source)
    values (
        p_product_id,
        'production',
        p_produced_qty,
        'production_entry',
        coalesce(p_notes, format('Üretim girişi: %s %s', p_produced_qty, v_product.unit)),
        'system'
    );

    -- Create production entry record
    insert into production_entries (
        product_id, product_name, product_sku, produced_qty,
        scrap_qty, waste_reason, production_date, notes,
        related_order_id, entered_by
    )
    values (
        p_product_id, v_product.name, v_product.sku, p_produced_qty,
        coalesce(p_scrap_qty, 0), p_waste_reason, p_production_date, p_notes,
        p_related_order_id, p_entered_by
    )
    returning id into v_entry_id;

    -- Audit log
    insert into audit_log (action, entity_type, entity_id, after_state, source)
    values (
        'production_completed',
        'production_entry',
        v_entry_id,
        jsonb_build_object(
            'product_id', p_product_id,
            'produced_qty', p_produced_qty,
            'new_on_hand', v_new_on_hand
        ),
        'system'
    );

    return jsonb_build_object(
        'success', true,
        'entry_id', v_entry_id,
        'new_on_hand', v_new_on_hand
    );
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 4. try_resolve_shortages(p_product_id) RPC
--    FIFO allocation of available stock to open shortages
-- ════════════════════════════════════════════════════════════════

create or replace function try_resolve_shortages(p_product_id uuid)
returns jsonb as $$
declare
    v_product       record;
    v_available     integer;
    v_shortage      record;
    v_can_allocate  integer;
    v_existing_res  record;
    v_resolved      integer := 0;
    v_partial       integer := 0;
    v_total_alloc   integer := 0;
    v_order_ids     uuid[] := '{}';
begin
    -- Lock the product
    select * into v_product
    from products
    where id = p_product_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Ürün bulunamadı.');
    end if;

    -- Calculate available stock
    v_available := v_product.on_hand - v_product.reserved;

    if v_available <= 0 then
        return jsonb_build_object(
            'success', true,
            'shortages_resolved', 0,
            'shortages_partially_resolved', 0,
            'total_allocated', 0
        );
    end if;

    -- Iterate open shortages in FIFO order
    -- Only for approved orders (not draft/cancelled)
    for v_shortage in
        select s.*
        from shortages s
        join sales_orders so on so.id = s.order_id
        where s.product_id = p_product_id
          and s.status = 'open'
          and so.commercial_status = 'approved'
        order by s.created_at asc
        for update of s
    loop
        if v_available <= 0 then
            exit;
        end if;

        v_can_allocate := least(v_available, v_shortage.shortage_qty);

        -- Check if a reservation already exists for this order line
        select * into v_existing_res
        from stock_reservations
        where order_line_id = v_shortage.order_line_id
          and order_id = v_shortage.order_id
          and status = 'open'
        for update;

        if found then
            -- Update existing reservation
            update stock_reservations
            set reserved_qty = reserved_qty + v_can_allocate
            where id = v_existing_res.id;
        else
            -- Create new reservation
            insert into stock_reservations (product_id, order_id, order_line_id, reserved_qty, status)
            values (p_product_id, v_shortage.order_id, v_shortage.order_line_id, v_can_allocate, 'open');
        end if;

        -- Increase product reserved
        update products
        set reserved = reserved + v_can_allocate
        where id = p_product_id;

        -- Record reservation_create movement
        insert into inventory_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, source)
        values (
            p_product_id,
            'reservation_create',
            v_can_allocate,
            'order',
            v_shortage.order_id,
            format('Shortage çözümü: %s birim ayrıldı', v_can_allocate),
            'system'
        );

        -- Update shortage
        if v_can_allocate >= v_shortage.shortage_qty then
            -- Fully resolved
            update shortages
            set status = 'resolved',
                shortage_qty = 0,
                resolved_at = now()
            where id = v_shortage.id;
            v_resolved := v_resolved + 1;
        else
            -- Partially resolved
            update shortages
            set shortage_qty = shortage_qty - v_can_allocate,
                available_qty = available_qty + v_can_allocate
            where id = v_shortage.id;
            v_partial := v_partial + 1;
        end if;

        v_total_alloc := v_total_alloc + v_can_allocate;
        v_available := v_available - v_can_allocate;

        -- Track affected order for fulfillment promotion
        if not (v_shortage.order_id = any(v_order_ids)) then
            v_order_ids := v_order_ids || v_shortage.order_id;
        end if;
    end loop;

    -- Check fulfillment promotion for affected orders
    -- If all shortages for an order are resolved → promote to 'allocated'
    declare
        v_oid uuid;
        v_open_count integer;
    begin
        foreach v_oid in array v_order_ids
        loop
            select count(*) into v_open_count
            from shortages
            where order_id = v_oid and status = 'open';

            if v_open_count = 0 then
                update sales_orders
                set fulfillment_status = 'allocated',
                    updated_at = now()
                where id = v_oid
                  and fulfillment_status = 'partially_allocated';

                if found then
                    insert into audit_log (action, entity_type, entity_id, before_state, after_state, source)
                    values (
                        'fulfillment_promoted',
                        'sales_order',
                        v_oid::text,
                        jsonb_build_object('fulfillment_status', 'partially_allocated'),
                        jsonb_build_object('fulfillment_status', 'allocated'),
                        'system'
                    );
                end if;
            end if;
        end loop;
    end;

    return jsonb_build_object(
        'success', true,
        'shortages_resolved', v_resolved,
        'shortages_partially_resolved', v_partial,
        'total_allocated', v_total_alloc
    );
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 5. reverse_production() RPC
--    Atomic: undo a production entry — decrease finished good,
--    restore component stocks, record movements, delete entry
-- ════════════════════════════════════════════════════════════════

create or replace function reverse_production(p_entry_id uuid)
returns jsonb as $$
declare
    v_entry     record;
    v_product   record;
    v_bom_row   record;
    v_restore   integer;
begin
    -- Find the production entry
    select * into v_entry
    from production_entries
    where id = p_entry_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Üretim kaydı bulunamadı.');
    end if;

    -- Lock finished product and check on_hand sufficiency
    select * into v_product
    from products
    where id = v_entry.product_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Bitmiş ürün bulunamadı.');
    end if;

    if v_product.on_hand < v_entry.produced_qty then
        return jsonb_build_object(
            'success', false,
            'error', format('Yetersiz stok. Mevcut: %s, geri alınacak: %s. Ürün zaten sevk edilmiş olabilir.',
                            v_product.on_hand, v_entry.produced_qty)
        );
    end if;

    -- Decrease finished product on_hand
    update products
    set on_hand = on_hand - v_entry.produced_qty
    where id = v_entry.product_id;

    -- Record negative movement for finished product
    insert into inventory_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, source)
    values (
        v_entry.product_id,
        'adjustment',
        -v_entry.produced_qty,
        'production_entry',
        v_entry.id,
        format('Üretim iptali: -%s %s', v_entry.produced_qty, v_product.unit),
        'system'
    );

    -- Restore BOM component stocks
    for v_bom_row in
        select bom.*, p.name as component_name
        from bills_of_materials bom
        join products p on p.id = bom.component_product_id
        where bom.finished_product_id = v_entry.product_id
        order by bom.component_product_id
    loop
        -- Lock component
        perform 1 from products where id = v_bom_row.component_product_id for update;

        v_restore := ceil(v_bom_row.quantity * v_entry.produced_qty)::integer;

        update products
        set on_hand = on_hand + v_restore
        where id = v_bom_row.component_product_id;

        -- Record positive movement for component
        insert into inventory_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, source)
        values (
            v_bom_row.component_product_id,
            'adjustment',
            v_restore,
            'production_entry',
            v_entry.id,
            format('Üretim iptali — bileşen iadesi: +%s %s', v_restore, v_bom_row.component_name),
            'system'
        );
    end loop;

    -- Delete the production entry
    delete from production_entries where id = p_entry_id;

    -- Audit log
    insert into audit_log (action, entity_type, entity_id, before_state, source)
    values (
        'production_reversed',
        'production_entry',
        p_entry_id,
        jsonb_build_object(
            'product_id', v_entry.product_id,
            'produced_qty', v_entry.produced_qty,
            'production_date', v_entry.production_date
        ),
        'ui'
    );

    return jsonb_build_object('success', true);
end;
$$ language plpgsql;
