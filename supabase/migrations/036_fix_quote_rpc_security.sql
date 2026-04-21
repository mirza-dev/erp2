-- ============================================================
-- Migration 036 — Quote RPC'lerden security definer kaldır
-- 035 security definer ile uygulandıysa bu migration düzeltir.
-- CREATE OR REPLACE olduğu için idempotent.
-- ============================================================

create or replace function create_quote_with_lines(
    p_header jsonb,
    p_lines  jsonb
)
returns uuid
language plpgsql
as $$
declare
    v_id uuid;
begin
    insert into quotes (
        quote_number, status, customer_id, customer_name,
        customer_contact, customer_phone, customer_email,
        sales_rep, sales_phone, sales_email,
        currency, vat_rate, subtotal, vat_total, grand_total,
        notes, sig_prepared, sig_approved, sig_manager,
        quote_date, valid_until, updated_at
    ) values (
        coalesce(nullif(p_header->>'quote_number', ''), next_quote_number()),
        coalesce(nullif(p_header->>'status', ''), 'draft'),
        nullif(p_header->>'customer_id', '')::uuid,
        coalesce(p_header->>'customer_name', ''),
        nullif(p_header->>'customer_contact', ''),
        nullif(p_header->>'customer_phone', ''),
        nullif(p_header->>'customer_email', ''),
        nullif(p_header->>'sales_rep', ''),
        nullif(p_header->>'sales_phone', ''),
        nullif(p_header->>'sales_email', ''),
        coalesce(nullif(p_header->>'currency', ''), 'USD'),
        coalesce((p_header->>'vat_rate')::numeric,   20),
        coalesce((p_header->>'subtotal')::numeric,    0),
        coalesce((p_header->>'vat_total')::numeric,   0),
        coalesce((p_header->>'grand_total')::numeric, 0),
        nullif(p_header->>'notes', ''),
        nullif(p_header->>'sig_prepared', ''),
        nullif(p_header->>'sig_approved', ''),
        nullif(p_header->>'sig_manager', ''),
        nullif(p_header->>'quote_date', '')::date,
        nullif(p_header->>'valid_until', '')::date,
        coalesce((p_header->>'updated_at')::timestamptz, now())
    )
    returning id into v_id;

    if jsonb_array_length(p_lines) > 0 then
        insert into quote_line_items (
            quote_id, position, product_id, product_code,
            lead_time, description, quantity, unit_price,
            line_total, hs_code, weight_kg
        )
        select
            v_id,
            (ln->>'position')::integer,
            nullif(ln->>'product_id', '')::uuid,
            coalesce(ln->>'product_code', ''),
            nullif(ln->>'lead_time', ''),
            coalesce(ln->>'description', ''),
            coalesce((ln->>'quantity')::numeric,   0),
            coalesce((ln->>'unit_price')::numeric, 0),
            coalesce((ln->>'line_total')::numeric, 0),
            nullif(ln->>'hs_code', ''),
            nullif(ln->>'weight_kg', '')::numeric
        from jsonb_array_elements(p_lines) as ln;
    end if;

    return v_id;
end;
$$;

create or replace function update_quote_with_lines(
    p_id     uuid,
    p_header jsonb,
    p_lines  jsonb
)
returns void
language plpgsql
as $$
begin
    update quotes set
        customer_id      = nullif(p_header->>'customer_id', '')::uuid,
        customer_name    = coalesce(p_header->>'customer_name', ''),
        customer_contact = nullif(p_header->>'customer_contact', ''),
        customer_phone   = nullif(p_header->>'customer_phone', ''),
        customer_email   = nullif(p_header->>'customer_email', ''),
        sales_rep        = nullif(p_header->>'sales_rep', ''),
        sales_phone      = nullif(p_header->>'sales_phone', ''),
        sales_email      = nullif(p_header->>'sales_email', ''),
        currency         = coalesce(nullif(p_header->>'currency', ''), 'USD'),
        vat_rate         = coalesce((p_header->>'vat_rate')::numeric,   20),
        subtotal         = coalesce((p_header->>'subtotal')::numeric,    0),
        vat_total        = coalesce((p_header->>'vat_total')::numeric,   0),
        grand_total      = coalesce((p_header->>'grand_total')::numeric, 0),
        notes            = nullif(p_header->>'notes', ''),
        sig_prepared     = nullif(p_header->>'sig_prepared', ''),
        sig_approved     = nullif(p_header->>'sig_approved', ''),
        sig_manager      = nullif(p_header->>'sig_manager', ''),
        quote_date       = nullif(p_header->>'quote_date', '')::date,
        valid_until      = nullif(p_header->>'valid_until', '')::date,
        updated_at       = coalesce((p_header->>'updated_at')::timestamptz, now())
    where id = p_id;

    delete from quote_line_items where quote_id = p_id;

    if jsonb_array_length(p_lines) > 0 then
        insert into quote_line_items (
            quote_id, position, product_id, product_code,
            lead_time, description, quantity, unit_price,
            line_total, hs_code, weight_kg
        )
        select
            p_id,
            (ln->>'position')::integer,
            nullif(ln->>'product_id', '')::uuid,
            coalesce(ln->>'product_code', ''),
            nullif(ln->>'lead_time', ''),
            coalesce(ln->>'description', ''),
            coalesce((ln->>'quantity')::numeric,   0),
            coalesce((ln->>'unit_price')::numeric, 0),
            coalesce((ln->>'line_total')::numeric, 0),
            nullif(ln->>'hs_code', ''),
            nullif(ln->>'weight_kg', '')::numeric
        from jsonb_array_elements(p_lines) as ln;
    end if;
end;
$$;
