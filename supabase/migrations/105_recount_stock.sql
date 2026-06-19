-- KokpitERP — Migration 105: recount_stock() RPC
-- ════════════════════════════════════════════════════════════════
-- Atomik fiziksel stok sayımı: kilitli ürün satırında MUTLAK on_hand
-- ataması + farkı (delta) inventory_movements'a kaydeder.
--
-- D-O1 (2026-06 stok defteri denetimi):
--   import-service stok sayımı eskiden JS tarafında
--   `delta = counted - prod.on_hand` hesaplıyordu; `prod.on_hand` okuması
--   `record_stock_movement` transaction'ının DIŞINDAYDI. Araya eşzamanlı bir
--   dış hareket girerse RPC delta'yı güncel on_hand'e ekler → nihai
--   `on_hand ≠ sayılan değer` (lost update). Stok sayımı otoriter olmalı.
--
--   recount_stock satırı `for update` ile kilitler, delta'yı transaction
--   içinde hesaplar ve on_hand'i mutlak sayılan değere atar — drift yok.
--   (record_stock_movement gövdesinin kalıbı esas alındı.)
-- Run after 104.
-- ════════════════════════════════════════════════════════════════

create or replace function recount_stock(
    p_product_id  uuid,
    p_counted_qty integer,
    p_notes       text default null,
    p_actor       text default null
)
returns jsonb as $$
declare
    v_product     record;
    v_delta       integer;
    v_movement_id uuid;
begin
    -- Sayım negatif olamaz
    if p_counted_qty is null or p_counted_qty < 0 then
        return jsonb_build_object('success', false, 'error', 'Stok sayımı negatif olamaz.');
    end if;

    -- Ürün satırını kilitle (eşzamanlı harekete karşı)
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

    v_delta := p_counted_qty - v_product.on_hand;

    -- Fark yoksa no-op (hareket kaydı oluşturma)
    if v_delta = 0 then
        return jsonb_build_object(
            'success', true,
            'new_on_hand', p_counted_qty,
            'delta', 0
        );
    end if;

    -- on_hand'i mutlak sayılan değere ata (satır kilitli → güvenli)
    update products
    set on_hand = p_counted_qty
    where id = p_product_id;

    -- Delta hareketini kaydet (denetim izi)
    insert into inventory_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, source, created_by)
    values (
        p_product_id,
        case when v_delta > 0 then 'receipt' else 'adjustment' end,
        v_delta,
        'import',
        null,
        p_notes,
        'ui',
        p_actor
    )
    returning id into v_movement_id;

    return jsonb_build_object(
        'success', true,
        'new_on_hand', p_counted_qty,
        'delta', v_delta,
        'movement_id', v_movement_id
    );
end;
$$ language plpgsql;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS recount_stock(uuid, integer, text, text);
