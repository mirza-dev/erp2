-- 099_quote_line_unit.sql
-- Teklif satırı bazlı ölçü birimi (unit of measure).
--
-- PMT çok-tipli katalog sattığından her ürünün birimi farklı (adet, metre, kg,
-- m², takım, paket). quote_line_items'ta birim tutulmuyordu → teklif belgesinde
-- Miktar kolonu her satır için sabit "Adet" gösteriyordu. Bu migration nullable
-- `unit` kolonu ekler ve size_text (065) / note (098) ile birebir aynı "satıra
-- alan ekle" kalıbıyla taşır. Saf açıklayıcı/snapshot alan: line_total / subtotal
-- / grand_total hesaplarını ETKİLEMEZ.
--
-- products.unit zaten NOT NULL → form ürün seçilince oradan otomatik doldurur;
-- kullanıcı satır bazında düzenleyebilir.
--
-- Redefine edilen 4 RPC:
--   create_quote_with_lines  (098 halefi — INSERT'e unit + NULLIF)
--   update_quote_with_lines  (098 halefi — INSERT'e unit + NULLIF)
--   send_quote_and_create_pending_order (094 halefi — order_lines.unit
--       COALESCE(qli.unit, p.unit) ile teklif birimi öncelikli)
--   accept_quote_and_create_order (088 halefi — legacy draft yolunda aynı COALESCE)
-- Diğer her şey (toplamlar, rezervasyon, ROW_COUNT verify, audit, REVOKE/GRANT,
-- status flip) önceki gövdelerle BİREBİR korunur.

ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS unit text;

-- ── create_quote_with_lines (098 halefi — yalnız unit eklendi) ───────────────
CREATE OR REPLACE FUNCTION create_quote_with_lines(
    p_header jsonb,
    p_lines  jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_id uuid;
BEGIN
    PERFORM assert_quote_totals_sane(p_header, p_lines);

    INSERT INTO quotes (
        quote_number, status, customer_id, customer_name,
        customer_contact, customer_phone, customer_email, customer_address,
        sales_rep, sales_phone, sales_email,
        currency, vat_rate, subtotal, vat_total, grand_total, discount_amount,
        notes, sig_prepared, sig_approved, sig_manager,
        quote_date, valid_until,
        delivery_method, payment_method,
        seller_name, seller_phone, seller_email, seller_address,
        seller_tax_id, seller_website, seller_logo_url,
        updated_at
    ) VALUES (
        COALESCE(NULLIF(p_header->>'quote_number', ''), next_quote_number()),
        COALESCE(NULLIF(p_header->>'status', ''), 'draft'),
        NULLIF(p_header->>'customer_id', '')::uuid,
        COALESCE(p_header->>'customer_name', ''),
        NULLIF(p_header->>'customer_contact', ''),
        NULLIF(p_header->>'customer_phone', ''),
        NULLIF(p_header->>'customer_email', ''),
        NULLIF(p_header->>'customer_address', ''),
        NULLIF(p_header->>'sales_rep', ''),
        NULLIF(p_header->>'sales_phone', ''),
        NULLIF(p_header->>'sales_email', ''),
        COALESCE(NULLIF(p_header->>'currency', ''), 'USD'),
        COALESCE((p_header->>'vat_rate')::numeric,        20),
        COALESCE((p_header->>'subtotal')::numeric,         0),
        COALESCE((p_header->>'vat_total')::numeric,        0),
        COALESCE((p_header->>'grand_total')::numeric,      0),
        COALESCE((p_header->>'discount_amount')::numeric,  0),
        NULLIF(p_header->>'notes', ''),
        NULLIF(p_header->>'sig_prepared', ''),
        NULLIF(p_header->>'sig_approved', ''),
        NULLIF(p_header->>'sig_manager', ''),
        NULLIF(p_header->>'quote_date', '')::date,
        NULLIF(p_header->>'valid_until', '')::date,
        NULLIF(p_header->>'delivery_method', ''),
        NULLIF(p_header->>'payment_method', ''),
        NULLIF(p_header->>'seller_name', ''),
        NULLIF(p_header->>'seller_phone', ''),
        NULLIF(p_header->>'seller_email', ''),
        NULLIF(p_header->>'seller_address', ''),
        NULLIF(p_header->>'seller_tax_id', ''),
        NULLIF(p_header->>'seller_website', ''),
        NULLIF(p_header->>'seller_logo_url', ''),
        COALESCE((p_header->>'updated_at')::timestamptz, now())
    )
    RETURNING id INTO v_id;

    IF jsonb_array_length(p_lines) > 0 THEN
        INSERT INTO quote_line_items (
            quote_id, position, product_id, product_code,
            lead_time, description, quantity, unit_price,
            line_total, hs_code, weight_kg, size_text,
            unit_weight_kg, kg_manual_override, note, unit
        )
        SELECT
            v_id,
            (ln->>'position')::integer,
            NULLIF(ln->>'product_id', '')::uuid,
            COALESCE(ln->>'product_code', ''),
            NULLIF(ln->>'lead_time', ''),
            COALESCE(ln->>'description', ''),
            COALESCE((ln->>'quantity')::numeric,   0),
            COALESCE((ln->>'unit_price')::numeric, 0),
            round(COALESCE((ln->>'quantity')::numeric, 0) *
                  COALESCE((ln->>'unit_price')::numeric, 0), 2),
            NULLIF(ln->>'hs_code', ''),
            NULLIF(ln->>'weight_kg', '')::numeric,
            NULLIF(ln->>'size_text', ''),
            NULLIF(ln->>'unit_weight_kg', '')::numeric,
            COALESCE((ln->>'kg_manual_override')::boolean, false),
            NULLIF(ln->>'note', ''),
            NULLIF(ln->>'unit', '')
        FROM jsonb_array_elements(p_lines) AS ln;
    END IF;

    RETURN v_id;
END;
$$;

-- ── update_quote_with_lines (098 halefi — yalnız unit eklendi) ───────────────
CREATE OR REPLACE FUNCTION update_quote_with_lines(
    p_id     uuid,
    p_header jsonb,
    p_lines  jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF (SELECT status FROM quotes WHERE id = p_id) <> 'draft' THEN
        RAISE EXCEPTION 'Sadece taslak teklifler düzenlenebilir (status guard).'
            USING ERRCODE = '42501';
    END IF;

    PERFORM assert_quote_totals_sane(p_header, p_lines);

    UPDATE quotes SET
        customer_id      = NULLIF(p_header->>'customer_id', '')::uuid,
        customer_name    = COALESCE(p_header->>'customer_name', ''),
        customer_contact = NULLIF(p_header->>'customer_contact', ''),
        customer_phone   = NULLIF(p_header->>'customer_phone', ''),
        customer_email   = NULLIF(p_header->>'customer_email', ''),
        customer_address = NULLIF(p_header->>'customer_address', ''),
        sales_rep        = NULLIF(p_header->>'sales_rep', ''),
        sales_phone      = NULLIF(p_header->>'sales_phone', ''),
        sales_email      = NULLIF(p_header->>'sales_email', ''),
        currency         = COALESCE(NULLIF(p_header->>'currency', ''), 'USD'),
        vat_rate         = COALESCE((p_header->>'vat_rate')::numeric,       20),
        subtotal         = COALESCE((p_header->>'subtotal')::numeric,        0),
        vat_total        = COALESCE((p_header->>'vat_total')::numeric,       0),
        grand_total      = COALESCE((p_header->>'grand_total')::numeric,     0),
        discount_amount  = COALESCE((p_header->>'discount_amount')::numeric, 0),
        notes            = NULLIF(p_header->>'notes', ''),
        sig_prepared     = NULLIF(p_header->>'sig_prepared', ''),
        sig_approved     = NULLIF(p_header->>'sig_approved', ''),
        sig_manager      = NULLIF(p_header->>'sig_manager', ''),
        quote_date       = NULLIF(p_header->>'quote_date', '')::date,
        valid_until      = NULLIF(p_header->>'valid_until', '')::date,
        delivery_method  = NULLIF(p_header->>'delivery_method', ''),
        payment_method   = NULLIF(p_header->>'payment_method', ''),
        seller_name      = NULLIF(p_header->>'seller_name', ''),
        seller_phone     = NULLIF(p_header->>'seller_phone', ''),
        seller_email     = NULLIF(p_header->>'seller_email', ''),
        seller_address   = NULLIF(p_header->>'seller_address', ''),
        seller_tax_id    = NULLIF(p_header->>'seller_tax_id', ''),
        seller_website   = NULLIF(p_header->>'seller_website', ''),
        seller_logo_url  = NULLIF(p_header->>'seller_logo_url', ''),
        updated_at       = COALESCE((p_header->>'updated_at')::timestamptz, now())
    WHERE id = p_id;

    DELETE FROM quote_line_items WHERE quote_id = p_id;

    IF jsonb_array_length(p_lines) > 0 THEN
        INSERT INTO quote_line_items (
            quote_id, position, product_id, product_code,
            lead_time, description, quantity, unit_price,
            line_total, hs_code, weight_kg, size_text,
            unit_weight_kg, kg_manual_override, note, unit
        )
        SELECT
            p_id,
            (ln->>'position')::integer,
            NULLIF(ln->>'product_id', '')::uuid,
            COALESCE(ln->>'product_code', ''),
            NULLIF(ln->>'lead_time', ''),
            COALESCE(ln->>'description', ''),
            COALESCE((ln->>'quantity')::numeric,   0),
            COALESCE((ln->>'unit_price')::numeric, 0),
            round(COALESCE((ln->>'quantity')::numeric, 0) *
                  COALESCE((ln->>'unit_price')::numeric, 0), 2),
            NULLIF(ln->>'hs_code', ''),
            NULLIF(ln->>'weight_kg', '')::numeric,
            NULLIF(ln->>'size_text', ''),
            NULLIF(ln->>'unit_weight_kg', '')::numeric,
            COALESCE((ln->>'kg_manual_override')::boolean, false),
            NULLIF(ln->>'note', ''),
            NULLIF(ln->>'unit', '')
        FROM jsonb_array_elements(p_lines) AS ln;
    END IF;
END;
$$;

-- ── send_quote_and_create_pending_order (094 halefi — order_lines.unit) ──────
--   TEK fark: order_lines.unit = coalesce(nullif(qli.unit,''), p.unit) (teklif
--   satırının birimi öncelikli; boşsa ürün master birimi). Geri kalan 094 ile
--   birebir (description kopyalama, qty<=0 pre-check, lenient PDF/stok, rezerve).
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
    select * into v_quote from quotes where id = p_quote_id for update;
    if not found then
        raise exception 'Quote not found: %', p_quote_id using errcode = 'P0002';
    end if;

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

    if v_quote.status <> 'sent' then
        raise exception 'Quote status % cannot create pending order (must be sent)', v_quote.status
            using errcode = '42501';
    end if;

    if exists (select 1 from quote_line_items
               where quote_id = p_quote_id and product_id is null) then
        raise exception 'Quote line(s) have null product_id (product deleted after send)'
            using errcode = '23502';
    end if;

    if exists (select 1 from quote_line_items
               where quote_id = p_quote_id
                 and (quantity <= 0 or quantity <> trunc(quantity))) then
        raise exception 'Quote line quantity must be a positive integer'
            using errcode = '22003';
    end if;

    select id into v_pdf from quote_pdf_archives
        where quote_id = p_quote_id order by revision_no desc limit 1;

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

    insert into order_lines (
        order_id, product_id, product_name, product_sku, unit,
        quantity, unit_price, discount_pct, line_total, vat_rate, sort_order,
        description
    )
    select
        v_order_id, qli.product_id, p.name, p.sku,
        coalesce(nullif(qli.unit, ''), p.unit),
        qli.quantity::integer, qli.unit_price, 0, qli.line_total,
        v_quote.vat_rate,
        (row_number() over (order by qli.position))::integer - 1,
        qli.description
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

    v_alloc := allocate_order_lines(v_order_id);
    update sales_orders
        set fulfillment_status = v_alloc->>'fulfillment_status', updated_at = now()
        where id = v_order_id;

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

-- ── accept_quote_and_create_order (088 halefi — legacy yolunda order_lines.unit)
--   Yeni akışta accept genelde bağlı pending siparişi approve_order ile onaylar
--   (yeni satır INSERT etmez → birim send'te zaten taşındı). LEGACY yol (feature
--   öncesi bağlı sipariş yok) draft sipariş yaratır → orada da COALESCE uygulanır.
--   Geri kalan 088 ile birebir.
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
    select * into v_quote from quotes where id = p_quote_id for update;
    if not found then
        raise exception 'Quote not found: %', p_quote_id using errcode = 'P0002';
    end if;

    select * into v_existing
        from sales_orders
        where quote_id = p_quote_id and commercial_status <> 'cancelled'
        limit 1;

    if found then
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

    -- LEGACY yol (bağlı sipariş yok): eski 077 davranışı, 'draft' sipariş yarat.
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
        v_order_id, qli.product_id, p.name, p.sku,
        coalesce(nullif(qli.unit, ''), p.unit),
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

-- ROLLBACK:
--   ALTER TABLE quote_line_items DROP COLUMN IF EXISTS unit;
--   create/update_quote_with_lines → 098'deki blokları yeniden çalıştır.
--   send_quote_and_create_pending_order → 094'teki bloğu yeniden çalıştır.
--   accept_quote_and_create_order → 088'deki bloğu yeniden çalıştır.
