-- Roven — reverse_production idempotency hardening (production review O1)
-- Bulgu: 2026-06-18 production denetimi (docs/audit/2026-06-18-production-review-bulgular.md).
--
-- Sorun: 008'deki reverse_production üretim kaydını FOR UPDATE OLMADAN okuyordu.
-- READ COMMITTED altında aynı entry_id'ye iki eşzamanlı DELETE (iki sekme / retry /
-- script) ikisi de v_entry'yi okuyup stok düşüşü + bileşen iadesini STALE v_entry
-- ile YAPIYORDU → on_hand 2× düşer, bileşenler 2× iade edilir, defter sessizce bozulur
-- (sondaki delete idempotent ama stok mutasyonları onun satır-sayısına bağlı değil).
--
-- Düzeltme: entry select'e `for update` eklendi → entry satır kilidi iki transaction'ı
-- serialize eder; kaybeden taraf re-read'de silinmiş satırı bulamaz ('not found') →
-- temiz reddedilir, stok yalnız BİR kez geri alınır. Gövdenin geri kalanı 008 ile birebir.
-- on_hand "zaten sevk edilmiş" guard'ı DELETE'ten önce çalıştığından korunur (yetersizse
-- hiç silinmez/mutasyon yapılmaz). Yeni kilit sırası (entry→product→component)
-- complete_production (product→component) ile ters-çift oluşturmaz → yeni deadlock yok.
--
-- CREATE OR REPLACE (idempotent). Geri-uyumlu, veri taşıma yok.

create or replace function reverse_production(p_entry_id uuid)
returns jsonb as $$
declare
    v_entry     record;
    v_product   record;
    v_bom_row   record;
    v_restore   integer;
begin
    -- Find + lock the production entry (idempotency: eşzamanlı reversal'ı serialize et;
    -- kaybeden taraf re-read'de silinmiş satırı bulamaz → çift stok ters-hareketi olmaz)
    select * into v_entry
    from production_entries
    where id = p_entry_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Üretim kaydı bulunamadı veya zaten geri alınmış.');
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
