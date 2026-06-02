-- KokpitERP — Faz 3 (Satış Siparişleri): Hard rezervasyonu 'pending_approval'a taşı
-- ============================================================================
-- İhtiyaç (ürün sahibi kararı): rezervasyon, sipariş ONAYLANDIĞINDA değil,
-- ONAYA GÖNDERİLDİĞİNDE (Taslak → Bekliyor) oluşmalı. Böylece müşteriye teklif
-- verilirken stok kilitlenir, bekleyen siparişler için aşırı-satış olmaz.
--
-- Eski akış:  Taslak → (Onaya Gönder, no-op) → Bekliyor → (Onayla, REZERVE) → Onaylı
-- Yeni akış:  Taslak → (Onaya Gönder, REZERVE) → Bekliyor → (Onayla, light) → Onaylı
--
-- Tasarım: allocation mantığı tek helper'a (allocate_order_lines) çıkarıldı;
-- üç çağıran: submit_order_for_approval (draft→pending), approve_order (pending→
-- approved, legacy fallback), ve backfill (mevcut rezervsiz pending siparişler).
--
-- domain-rules.md §5.1 BİLİNÇLİ DEĞİŞİR: rezervasyon artık pending_approval'da.
-- §3 quoted formülü (products.ts) draft-only'e indirilir (çift sayma önlenir).
--
-- cancel_order (007) DEĞİŞMEZ — guard zaten draft/pending/approved kapsar,
-- açık rezervleri release eder (pending artık rezervli → doğru çözülür).
-- ship_order_full (007) DEĞİŞMEZ — 'approved' guard korunur (önce onayla, sonra sevk).
-- ============================================================================


-- ════════════════════════════════════════════════════════════════
-- 1. allocate_order_lines() — saf rezervasyon (commercial_status'a DOKUNMAZ)
--    007_rpc_hotfix.sql:70-139 allocation gövdesinin birebir taşınması.
--    Çağıran order satırını FOR UPDATE kilitlemiş olmalı.
--    Döner: { total_requested, total_reserved, fulfillment_status, shortages }
-- ════════════════════════════════════════════════════════════════

create or replace function allocate_order_lines(p_order_id uuid)
returns jsonb as $$
declare
    v_line            record;
    v_product         record;
    v_available       integer;
    v_reservable      integer;
    v_shortage_qty    integer;
    v_total_requested integer := 0;
    v_total_reserved  integer := 0;
    v_shortages       jsonb := '[]'::jsonb;
    v_fulfillment     text;
begin
    for v_line in
        select * from order_lines where order_id = p_order_id order by sort_order
    loop
        -- Lock the product row
        select * into v_product
        from products
        where id = v_line.product_id
        for update;

        if not found then
            raise exception 'Ürün bulunamadı: %', v_line.product_name;
        end if;

        v_available    := v_product.on_hand - v_product.reserved;
        v_reservable   := least(greatest(v_available, 0), v_line.quantity);
        v_shortage_qty := v_line.quantity - v_reservable;

        v_total_requested := v_total_requested + v_line.quantity;

        if v_reservable > 0 then
            update products
            set reserved = reserved + v_reservable
            where id = v_line.product_id;

            insert into stock_reservations (product_id, order_id, order_line_id, reserved_qty, status)
            values (v_line.product_id, p_order_id, v_line.id, v_reservable, 'open');

            insert into inventory_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, source)
            values (
                v_line.product_id,
                'reservation_create',
                v_reservable,
                'order',
                p_order_id,
                format('Sipariş onaya gönderildi: %s birim ayrıldı', v_reservable),
                'system'
            );

            v_total_reserved := v_total_reserved + v_reservable;
        end if;

        if v_shortage_qty > 0 then
            insert into shortages (order_id, order_line_id, product_id, requested_qty, available_qty, shortage_qty, status)
            values (p_order_id, v_line.id, v_line.product_id, v_line.quantity, v_reservable, v_shortage_qty, 'open');

            v_shortages := v_shortages || jsonb_build_object(
                'product_name', v_line.product_name,
                'requested',    v_line.quantity,
                'reserved',     v_reservable,
                'shortage',     v_shortage_qty
            );
        end if;
    end loop;

    if v_total_reserved < v_total_requested then
        v_fulfillment := 'partially_allocated';
    else
        v_fulfillment := 'allocated';
    end if;

    return jsonb_build_object(
        'total_requested',   v_total_requested,
        'total_reserved',    v_total_reserved,
        'fulfillment_status', v_fulfillment,
        'shortages',         v_shortages
    );
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 2. submit_order_for_approval() — Taslak → Bekliyor + HARD rezervasyon
--    Eski approve_order_with_allocation'ın yeni konumu (sadece guard + hedef
--    statü farklı). Zero-stock guard korunur (hiç rezerve edilemezse reddet).
-- ════════════════════════════════════════════════════════════════

create or replace function submit_order_for_approval(p_order_id uuid)
returns jsonb as $$
declare
    v_order       record;
    v_alloc       jsonb;
    v_fulfillment text;
begin
    select * into v_order from sales_orders where id = p_order_id for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Sipariş bulunamadı.');
    end if;

    if v_order.commercial_status <> 'draft' then
        return jsonb_build_object('success', false, 'error',
            format('''%s'' durumundan onaya gönderilemez.', v_order.commercial_status));
    end if;

    v_alloc := allocate_order_lines(p_order_id);

    -- Zero-stock guard: hiçbir satır için stok ayrılamadıysa reddet (rollback)
    if (v_alloc->>'total_reserved')::integer = 0 then
        raise exception 'Hiçbir satır için yeterli stok yok.';
    end if;

    v_fulfillment := v_alloc->>'fulfillment_status';

    update sales_orders
    set commercial_status  = 'pending_approval',
        fulfillment_status = v_fulfillment,
        updated_at         = now()
    where id = p_order_id;

    insert into audit_log (action, entity_type, entity_id, before_state, after_state, source)
    values (
        'order_submitted_for_approval',
        'sales_order',
        p_order_id::text,
        jsonb_build_object('commercial_status', v_order.commercial_status, 'fulfillment_status', v_order.fulfillment_status),
        jsonb_build_object('commercial_status', 'pending_approval', 'fulfillment_status', v_fulfillment),
        'ui'
    );

    return jsonb_build_object(
        'success',            true,
        'fulfillment_status', v_fulfillment,
        'shortages',          v_alloc->'shortages'
    );
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 3. approve_order() — Bekliyor → Onaylı (light ticari teyit)
--    Rezervasyon zaten pending'de yapıldı → sadece statü flip.
--    Legacy fallback: eski akıştan kalan rezervsiz (fulfillment='unallocated')
--    pending siparişlerde allocation burada (best-effort) çalışır.
-- ════════════════════════════════════════════════════════════════

create or replace function approve_order(p_order_id uuid)
returns jsonb as $$
declare
    v_order       record;
    v_alloc       jsonb;
    v_fulfillment text;
    v_shortages   jsonb := '[]'::jsonb;
begin
    select * into v_order from sales_orders where id = p_order_id for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Sipariş bulunamadı.');
    end if;

    if v_order.commercial_status <> 'pending_approval' then
        return jsonb_build_object('success', false, 'error',
            format('''%s'' durumundan onaylamaya geçilemez.', v_order.commercial_status));
    end if;

    v_fulfillment := v_order.fulfillment_status;

    -- Legacy pending (rezervsiz): allocation'ı şimdi yap
    if v_order.fulfillment_status = 'unallocated' then
        v_alloc := allocate_order_lines(p_order_id);
        if (v_alloc->>'total_reserved')::integer = 0 then
            return jsonb_build_object('success', false, 'error', 'Hiçbir satır için yeterli stok yok.');
        end if;
        v_fulfillment := v_alloc->>'fulfillment_status';
        v_shortages   := v_alloc->'shortages';
    end if;

    update sales_orders
    set commercial_status  = 'approved',
        fulfillment_status = v_fulfillment,
        updated_at         = now()
    where id = p_order_id;

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
        'success',            true,
        'fulfillment_status', v_fulfillment,
        'shortages',          v_shortages
    );
end;
$$ language plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 4. Backfill — mevcut rezervsiz pending_approval siparişler
--    quoted=draft değişikliğiyle birlikte legacy pending demand'inin
--    kaybolmasını önler. Best-effort: zero-stock'ta REDDETME (mevcut sipariş
--    bozulmaz; ne ayrılabiliyorsa ayrılır, kalan shortage olur).
-- ════════════════════════════════════════════════════════════════

do $$
declare
    v_ord   record;
    v_alloc jsonb;
begin
    for v_ord in
        select so.id
        from sales_orders so
        where so.commercial_status = 'pending_approval'
          and not exists (
              select 1 from stock_reservations sr
              where sr.order_id = so.id and sr.status = 'open'
          )
    loop
        v_alloc := allocate_order_lines(v_ord.id);
        update sales_orders
        set fulfillment_status = v_alloc->>'fulfillment_status',
            updated_at = now()
        where id = v_ord.id;
    end loop;
end $$;


-- ============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS submit_order_for_approval(uuid);
-- DROP FUNCTION IF EXISTS approve_order(uuid);
-- DROP FUNCTION IF EXISTS allocate_order_lines(uuid);
-- -- Not: eski approve_order_with_allocation(uuid) hiç düşürülmedi (007'de durur).
-- -- Rezervasyonları geri almak için pending siparişleri iptal/yeniden değerlendir.
-- ============================================================================
