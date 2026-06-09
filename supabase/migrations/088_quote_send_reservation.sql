-- ============================================================
-- 088 — Teklif gönderilince stok rezervasyonu (Bekleyen sipariş)
-- ============================================================
-- İhtiyaç (ürün sahibi kararı): teklif GÖNDERİLDİĞİNDE (sent) stok hard rezerve
-- edilmeli ki iki satışçı aynı stoğu paralel teklif edip oversell yaratmasın.
-- Mevcut model: teklif draft→sent hiç stok etkisi yapmıyordu; sipariş yalnız
-- KABUL'de (077) 'draft' yaratılıyordu → gönderilmiş ama kabul edilmemiş teklif
-- hiçbir yerde stok tutmuyordu.
--
-- Yeni birleşik yaşam döngüsü (teklif ↔ bağlı sipariş):
--   sent     → pending_approval sipariş YARAT + allocate_order_lines (HARD rezerve)
--   accepted → bağlı pending siparişi approve_order ile 'approved' yap (light teyit)
--   rejected → bağlı siparişi cancel_order ile iptal (rezerv release)
--   expired  → (cron) bağlı siparişi iptal
--   revised  → bağlı siparişi iptal (revizyon supersede eder)
--
-- domain-rules.md §4.4/§5.1 uzantısı: rezervasyon "taahhüt" anında oluşur —
-- gönderilmiş teklif VEYA onaya gönderilmiş sipariş.
--
-- Reuse: allocate_order_lines (082), approve_order (082), cancel_order (003).
-- İdempotent + ROLLBACK (alt).
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. send_quote_and_create_pending_order() — sent teklif → Bekliyor sipariş + rezerve
--    077'nin teklif→sipariş dönüşüm gövdesi; FARKLAR:
--      - commercial_status = 'pending_approval' (draft değil)
--      - allocate_order_lines çağrılır (HARD rezerve)
--      - ZERO-STOCK'ta RAISE ETMEZ (submit_order_for_approval'dan farkı): teklif
--        stoğu olmayan/üretilecek ürünü de kapsayabilir → ne ayrılırsa ayrılır,
--        kalan shortage olur, teklif yine gönderilir.
--      - PDF arşiv LENIENT (NULL olabilir): arşiv send'te non-fatal üretilir.
--    Servis quote'u önce 'sent'e flip eder, sonra bunu çağırır (status guard = sent).
-- ════════════════════════════════════════════════════════════════

create or replace function send_quote_and_create_pending_order(p_quote_id uuid, p_actor uuid)
returns jsonb as $$
declare
    v_quote        quotes%ROWTYPE;
    v_existing     sales_orders%ROWTYPE;
    v_order_id     uuid;
    v_order_number text;
    v_pdf          uuid;
    v_inserted     integer;
    v_expected     integer;
    v_alloc        jsonb;
begin
    -- 1. Quote kilidi (idempotency + eşzamanlı send serialize)
    select * into v_quote from quotes where id = p_quote_id for update;
    if not found then
        raise exception 'Quote not found: %', p_quote_id using errcode = 'P0002';
    end if;

    -- 2a. İdempotency: bu teklif için CANCELLED OLMAYAN sipariş zaten varsa onu döndür.
    select * into v_existing
        from sales_orders
        where quote_id = p_quote_id and commercial_status <> 'cancelled'
        limit 1;
    if found then
        return jsonb_build_object(
            'order_id', v_existing.id,
            'order_number', v_existing.order_number,
            'already', true,
            'shortages', '[]'::jsonb,
            'total_reserved', 0,
            'total_requested', 0
        );
    end if;

    -- 2b. Status guard: yalnız gönderilmiş teklif (servis önce 'sent'e flip eder).
    if v_quote.status <> 'sent' then
        raise exception 'Quote status % cannot create pending order (must be sent)', v_quote.status
            using errcode = '42501';
    end if;

    -- 3. Null product_id hard check (077 §3 ile aynı).
    if exists (select 1 from quote_line_items
               where quote_id = p_quote_id and product_id is null) then
        raise exception 'Quote line(s) have null product_id (product deleted after send)'
            using errcode = '23502';
    end if;

    -- 4. Quantity tam sayı hard check (077 §4 ile aynı).
    if exists (select 1 from quote_line_items
               where quote_id = p_quote_id and quantity <> trunc(quantity)) then
        raise exception 'Quote line quantity must be an integer'
            using errcode = '22003';
    end if;

    -- 5. PDF arşiv lookup — LENIENT (077'den fark: NULL'da RAISE YOK; arşiv send'te
    --    non-fatal üretilir, accept/approve'da recover/generate telafi eder).
    select id into v_pdf from quote_pdf_archives
        where quote_id = p_quote_id order by revision_no desc limit 1;

    -- 6. Bekleyen sipariş — DONMUŞ totaller (recompute yok). commercial='pending_approval'.
    insert into sales_orders (
        order_number, customer_id, customer_name, customer_email,
        customer_country, customer_tax_office, customer_tax_number,
        commercial_status, fulfillment_status, currency,
        subtotal, discount_amount, vat_rate, vat_total, grand_total,
        notes, item_count, created_by, quote_id, quote_valid_until,
        source_quote_revision_no, quote_pdf_archive_id
    )
    select
        generate_order_number(), q.customer_id, q.customer_name,
        coalesce(q.customer_email, c.email),
        c.country, c.tax_office, c.tax_number,
        'pending_approval', 'unallocated', q.currency,
        q.subtotal, q.discount_amount, q.vat_rate, q.vat_total, q.grand_total,
        q.notes, 0, p_actor::text, q.id, q.valid_until,
        q.revision_no, v_pdf
    from quotes q
    left join customers c on c.id = q.customer_id
    where q.id = p_quote_id
    returning id, order_number into v_order_id, v_order_number;

    -- 7. Satırlar (077 §7 ile birebir).
    insert into order_lines (
        order_id, product_id, product_name, product_sku, unit,
        quantity, unit_price, discount_pct, line_total, vat_rate, sort_order
    )
    select
        v_order_id, qli.product_id, p.name, p.sku, p.unit,
        qli.quantity::integer, qli.unit_price, 0, qli.line_total,
        v_quote.vat_rate,
        (row_number() over (order by qli.position))::integer - 1
    from quote_line_items qli
    join products p on p.id = qli.product_id
    where qli.quote_id = p_quote_id;

    get diagnostics v_inserted = row_count;

    -- 8. ROW_COUNT verify (sessiz JOIN drop → ROLLBACK).
    select count(*) into v_expected from quote_line_items where quote_id = p_quote_id;
    if v_inserted <> v_expected then
        raise exception 'Order line count mismatch: % inserted, % expected (silent JOIN drop)',
            v_inserted, v_expected;
    end if;

    -- 9. item_count.
    update sales_orders set item_count = v_inserted where id = v_order_id;

    -- 10. HARD rezervasyon (082 helper). Zero-stock'ta RAISE YOK (lenient) →
    --     ne ayrılırsa ayrılır, kalan shortage. fulfillment_status güncellenir.
    v_alloc := allocate_order_lines(v_order_id);
    update sales_orders
        set fulfillment_status = v_alloc->>'fulfillment_status', updated_at = now()
        where id = v_order_id;

    -- 11. Audit.
    insert into audit_log (actor, action, entity_type, entity_id, after_state, source)
    values (
        p_actor::text, 'quote_sent_order_reserved', 'quote', p_quote_id,
        jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                           'item_count', v_inserted,
                           'total_reserved', v_alloc->'total_reserved'),
        'ui'
    );

    return jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'already', false,
        'shortages', v_alloc->'shortages',
        'total_reserved', v_alloc->'total_reserved',
        'total_requested', v_alloc->'total_requested'
    );
end;
$$ language plpgsql;

revoke all on function send_quote_and_create_pending_order(uuid, uuid) from public, anon, authenticated;
grant execute on function send_quote_and_create_pending_order(uuid, uuid) to service_role;


-- ════════════════════════════════════════════════════════════════
-- 2. accept_quote_and_create_order() — REVİZE (077'yi değiştirir)
--    Yeni akışta sipariş send'te zaten yaratıldı (pending_approval). Accept artık:
--      - bağlı CANCELLED-olmayan sipariş VARSA → approve_order ile 'approved' yap
--        (pending→approved light teyit; rezerv send'te alındı). Yeni sipariş YOK.
--      - YOKSA (feature öncesi legacy / hiç order yok) → eski 077 yolu: 'draft'
--        sipariş yarat (geriye uyumlu).
--    Her iki yolda quote → accepted.
-- ════════════════════════════════════════════════════════════════

create or replace function accept_quote_and_create_order(p_quote_id uuid, p_actor uuid)
returns jsonb as $$
declare
    v_quote        quotes%ROWTYPE;
    v_existing     sales_orders%ROWTYPE;
    v_order_id     uuid;
    v_order_number text;
    v_pdf          uuid;
    v_inserted     integer;
    v_expected     integer;
begin
    -- 1. Quote kilidi.
    select * into v_quote from quotes where id = p_quote_id for update;
    if not found then
        raise exception 'Quote not found: %', p_quote_id using errcode = 'P0002';
    end if;

    -- 2. Bağlı sipariş (cancelled olmayan) — send'te yaratılmış olabilir.
    select * into v_existing
        from sales_orders
        where quote_id = p_quote_id and commercial_status <> 'cancelled'
        limit 1;

    if found then
        -- Send-yaratımı pending sipariş → 'approved' (light teyit; reserve korunur,
        -- legacy unallocated ise approve_order kendi allocate eder). approved/draft
        -- ise dokunma (idempotent).
        if v_existing.commercial_status = 'pending_approval' then
            perform approve_order(v_existing.id);
        end if;

        update quotes set status = 'accepted', updated_at = now()
            where id = p_quote_id and status = 'sent';

        insert into audit_log (actor, action, entity_type, entity_id, after_state, source)
        values (
            p_actor::text, 'quote_accepted_order_approved', 'quote', p_quote_id,
            jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number),
            'ui'
        );

        return jsonb_build_object(
            'order_id', v_existing.id,
            'order_number', v_existing.order_number,
            'already', true
        );
    end if;

    -- 3. LEGACY yol (bağlı sipariş yok — feature öncesi gönderilmiş teklif):
    --    eski 077 davranışı, 'draft' sipariş yarat.
    if v_quote.status not in ('sent', 'accepted') then
        raise exception 'Quote status % cannot be accepted to order', v_quote.status
            using errcode = '42501';
    end if;

    if exists (select 1 from quote_line_items
               where quote_id = p_quote_id and product_id is null) then
        raise exception 'Quote line(s) have null product_id (product deleted after send)'
            using errcode = '23502';
    end if;

    if exists (select 1 from quote_line_items
               where quote_id = p_quote_id and quantity <> trunc(quantity)) then
        raise exception 'Quote line quantity must be an integer'
            using errcode = '22003';
    end if;

    select id into v_pdf from quote_pdf_archives
        where quote_id = p_quote_id order by revision_no desc limit 1;
    if v_pdf is null then
        raise exception 'Quote has no PDF archive (recover route bypassed)'
            using errcode = '23514', detail = 'quote_id:' || p_quote_id::text;
    end if;

    insert into sales_orders (
        order_number, customer_id, customer_name, customer_email,
        customer_country, customer_tax_office, customer_tax_number,
        commercial_status, fulfillment_status, currency,
        subtotal, discount_amount, vat_rate, vat_total, grand_total,
        notes, item_count, created_by, quote_id, quote_valid_until,
        source_quote_revision_no, quote_pdf_archive_id
    )
    select
        generate_order_number(), q.customer_id, q.customer_name,
        coalesce(q.customer_email, c.email),
        c.country, c.tax_office, c.tax_number,
        'draft', 'unallocated', q.currency,
        q.subtotal, q.discount_amount, q.vat_rate, q.vat_total, q.grand_total,
        q.notes, 0, p_actor::text, q.id, q.valid_until,
        q.revision_no, v_pdf
    from quotes q
    left join customers c on c.id = q.customer_id
    where q.id = p_quote_id
    returning id, order_number into v_order_id, v_order_number;

    insert into order_lines (
        order_id, product_id, product_name, product_sku, unit,
        quantity, unit_price, discount_pct, line_total, vat_rate, sort_order
    )
    select
        v_order_id, qli.product_id, p.name, p.sku, p.unit,
        qli.quantity::integer, qli.unit_price, 0, qli.line_total,
        v_quote.vat_rate,
        (row_number() over (order by qli.position))::integer - 1
    from quote_line_items qli
    join products p on p.id = qli.product_id
    where qli.quote_id = p_quote_id;

    get diagnostics v_inserted = row_count;

    select count(*) into v_expected from quote_line_items where quote_id = p_quote_id;
    if v_inserted <> v_expected then
        raise exception 'Order line count mismatch: % inserted, % expected (silent JOIN drop)',
            v_inserted, v_expected;
    end if;

    update sales_orders set item_count = v_inserted where id = v_order_id;

    update quotes set status = 'accepted', updated_at = now()
        where id = p_quote_id and status = 'sent';

    insert into audit_log (actor, action, entity_type, entity_id, after_state, source)
    values (
        p_actor::text, 'quote_accepted_order_created', 'quote', p_quote_id,
        jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                           'item_count', v_inserted),
        'ui'
    );

    return jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'already', false
    );
end;
$$ language plpgsql;

revoke all on function accept_quote_and_create_order(uuid, uuid) from public, anon, authenticated;
grant execute on function accept_quote_and_create_order(uuid, uuid) to service_role;


-- ════════════════════════════════════════════════════════════════
-- 3. cancel_quote_linked_order() — teklife bağlı bekleyen siparişi iptal et
--    reject/expire/revise yollarından çağrılır → rezerv release (cancel_order reuse).
--    Bağlı (cancelled olmayan) sipariş yoksa no-op (success, no_order).
-- ════════════════════════════════════════════════════════════════

create or replace function cancel_quote_linked_order(p_quote_id uuid)
returns jsonb as $$
declare
    v_order_id uuid;
    v_res      jsonb;
begin
    select id into v_order_id
        from sales_orders
        where quote_id = p_quote_id and commercial_status <> 'cancelled'
        order by created_at desc
        limit 1;

    if v_order_id is null then
        return jsonb_build_object('success', true, 'no_order', true);
    end if;

    v_res := cancel_order(v_order_id);   -- rezerv release + shortage cancel + status
    return v_res || jsonb_build_object('order_id', v_order_id);
end;
$$ language plpgsql;

revoke all on function cancel_quote_linked_order(uuid) from public, anon, authenticated;
grant execute on function cancel_quote_linked_order(uuid) to service_role;


-- ============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS send_quote_and_create_pending_order(uuid, uuid);
-- DROP FUNCTION IF EXISTS cancel_quote_linked_order(uuid);
-- -- accept_quote_and_create_order(uuid, uuid) için 077'deki gövdeyi yeniden uygula
-- --   (DROP + 077 CREATE) — bu migration onu değiştirdi.
-- -- Send'te yaratılmış pending siparişleri geri almak için ilgili teklifleri
-- --   reddet/iptal et (cancel_order rezervleri release eder).
-- ============================================================================
