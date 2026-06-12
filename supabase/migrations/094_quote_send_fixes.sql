-- ============================================================================
-- Migration 094 — send_quote_and_create_pending_order düzeltmeleri
--                  (denetim Y4 + dış-rapor "iptal sonrası yeniden gönderilemez")
-- ============================================================================
-- 1) UNIQUE INDEX DÜZELTMESİ (dış raporun HAKLI çıktığı bulgu):
--    037'nin index'i quote_id NOT NULL olan TÜM satırları kapsıyordu — iptal
--    edilmiş sipariş de. Teklife bağlı sipariş elle iptal edilince RPC'nin
--    idempotency kontrolü (cancelled hariç) boş döner → yeni INSERT aynı
--    quote_id ile 23505 unique_violation'a çarpar → teklif bir daha
--    GÖNDERİLEMEZ. Index artık cancelled'ı dışlar: "teklif başına tek AKTİF
--    sipariş" invariant'ı korunur, iptal sonrası yeniden gönderim açılır.
--    (Eşzamanlı çift send zaten adım-1 quote FOR UPDATE kilidiyle serialize.)
--
-- 2) 088 REGRESYONLARI (denetim Y4):
--    a) order_lines INSERT'ine qli.description geri geldi (080 paritesi —
--       send yolunda satır açıklamaları kayboluyordu).
--    b) Quantity pre-check 078 paritesine çekildi: <= 0 VEYA tam-sayı-değil
--       (088 yalnız trunc bakıyordu; qty=0 satır ham CHECK hatasıyla düşerdi).
--
-- Geri kalan her şey 088 ile BİREBİR aynı (kilit sırası, lenient PDF/stok,
-- ROW_COUNT verify, audit, dönüş şekli). REVOKE/GRANT korunur.
-- ============================================================================

-- ── 1. Index: cancelled satırlar tekillik dışı ─────────────────────────────
DROP INDEX IF EXISTS uq_sales_orders_quote_id;
CREATE UNIQUE INDEX uq_sales_orders_quote_id
    ON sales_orders (quote_id)
    WHERE quote_id IS NOT NULL AND commercial_status <> 'cancelled';

-- ── 2. send_quote_and_create_pending_order (088 halefi) ────────────────────
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

    -- 4. Quantity pre-check — 078 paritesi (094 düzeltmesi: <= 0 da yakalanır).
    if exists (select 1 from quote_line_items
               where quote_id = p_quote_id
                 and (quantity <= 0 or quantity <> trunc(quantity))) then
        raise exception 'Quote line quantity must be a positive integer'
            using errcode = '22003';
    end if;

    -- 5. PDF arşiv lookup — LENIENT (088 ile aynı).
    select id into v_pdf from quote_pdf_archives
        where quote_id = p_quote_id order by revision_no desc limit 1;

    -- 6. Bekleyen sipariş — DONMUŞ totaller (recompute yok; teklif zaten 093
    --    makul-sapma kontrolünden geçmiş değerleri taşır).
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

    -- 7. Satırlar — 094 düzeltmesi: description kopyalanır (080 paritesi).
    insert into order_lines (
        order_id, product_id, product_name, product_sku, unit,
        quantity, unit_price, discount_pct, line_total, vat_rate, sort_order,
        description
    )
    select
        v_order_id, qli.product_id, p.name, p.sku, p.unit,
        qli.quantity::integer, qli.unit_price, 0, qli.line_total,
        v_quote.vat_rate,
        (row_number() over (order by qli.position))::integer - 1,
        qli.description
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

    -- 10. HARD rezervasyon (082 helper). Zero-stock'ta RAISE YOK (lenient).
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

-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_sales_orders_quote_id;
--   CREATE UNIQUE INDEX uq_sales_orders_quote_id ON sales_orders (quote_id) WHERE quote_id IS NOT NULL;
--   send_quote_and_create_pending_order → 088'deki bloğu yeniden çalıştır
