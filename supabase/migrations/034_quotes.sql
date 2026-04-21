-- ============================================================
-- Migration 034 — Quotes Schema Upgrade + Quote Line Items
-- Transforms the quotes table from migration 012 (customer_code,
-- incoterm, validity_days, total_amount) to the new schema
-- WITHOUT dropping the table — preserves existing rows and
-- sales_orders.quote_id FK relationships.
-- ============================================================

-- Otomatik teklif numarası: TKL-YYYY-NNN
create sequence if not exists quotes_number_seq;

create or replace function next_quote_number()
returns text language plpgsql as $$
declare
    yr  text := to_char(now(), 'YYYY');
    seq int;
begin
    seq := nextval('quotes_number_seq');
    return 'TKL-' || yr || '-' || lpad(seq::text, 3, '0');
end;
$$;

-- ── Alter quotes table in-place ──────────────────────────────────

-- New columns
alter table quotes add column if not exists status          text not null default 'draft';
alter table quotes add column if not exists customer_name   text not null default '';
alter table quotes add column if not exists customer_contact text;
alter table quotes add column if not exists customer_phone  text;
alter table quotes add column if not exists customer_email  text;
alter table quotes add column if not exists sales_rep       text;
alter table quotes add column if not exists sales_phone     text;
alter table quotes add column if not exists sales_email     text;
alter table quotes add column if not exists vat_rate        numeric(5,2) not null default 20;
alter table quotes add column if not exists subtotal        numeric(15,2) not null default 0;
alter table quotes add column if not exists vat_total       numeric(15,2) not null default 0;
alter table quotes add column if not exists grand_total     numeric(15,2) not null default 0;
alter table quotes add column if not exists sig_prepared    text;
alter table quotes add column if not exists sig_approved    text;
alter table quotes add column if not exists sig_manager     text;
alter table quotes add column if not exists valid_until     date;

-- Migrate data from old columns to new ones
-- customer_name: prefer customers.name (actual name) over customer_code (identifier like "PMT-001")
update quotes q set
    customer_name = coalesce(
        (select name from customers where id = q.customer_id),
        q.customer_code,
        ''
    ),
    grand_total   = coalesce(total_amount, 0),
    subtotal      = coalesce(total_amount, 0);

-- validity_days → valid_until (quote_date was NOT NULL in 012, safe to use)
update quotes
    set valid_until = (quote_date + (validity_days || ' days')::interval)::date
where validity_days is not null and quote_date is not null;

-- Drop old columns that no longer exist in the new schema
alter table quotes drop column if exists customer_code;
alter table quotes drop column if exists incoterm;
alter table quotes drop column if exists validity_days;
alter table quotes drop column if exists total_amount;

-- quote_date: allow NULL (was NOT NULL in 012)
alter table quotes alter column quote_date drop not null;

-- Sequence'i mevcut en yüksek TKL-YYYY-NNN numarasına ilerlet
-- Yoksa yeni insert eski numaralarla UNIQUE çakışır
do $$
declare v_max int;
begin
    select coalesce(max(
        case when quote_number ~ '^TKL-\d{4}-(\d+)$'
            then split_part(quote_number, '-', 3)::int
            else 0
        end
    ), 0)
    into v_max from quotes;
    if v_max > 0 then
        perform setval('quotes_number_seq', v_max);
    end if;
end;
$$;

-- quote_number: add auto-number default
alter table quotes alter column quote_number set default next_quote_number();

-- Status check constraint
do $$ begin
    alter table quotes add constraint quotes_status_check
        check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired'));
exception when duplicate_object then null;
end $$;

-- Customer FK: change from ON DELETE RESTRICT (012) to ON DELETE SET NULL
alter table quotes drop constraint if exists quotes_customer_id_fkey;
alter table quotes add constraint quotes_customer_id_fkey
    foreign key (customer_id) references customers(id) on delete set null;

-- ── Quote Line Items ─────────────────────────────────────────────

create table if not exists quote_line_items (
    id              uuid          default gen_random_uuid() primary key,
    quote_id        uuid          not null references quotes(id) on delete cascade,
    position        integer       not null default 0,
    product_id      uuid          references products(id) on delete set null,
    product_code    text          not null default '',
    lead_time       text,
    description     text          not null default '',
    quantity        numeric(12,4) not null default 0,
    unit_price      numeric(15,4) not null default 0,
    line_total      numeric(15,2) not null default 0,
    hs_code         text,
    weight_kg       numeric(10,3),
    created_at      timestamptz   not null default now()
);

create index if not exists quote_line_items_quote_id on quote_line_items(quote_id);

-- ── RLS ──────────────────────────────────────────────────────────
-- quotes RLS already enabled in migration 017; quote_line_items needs it
alter table quote_line_items enable row level security;

drop policy if exists "service_quotes_all" on quotes;
create policy "service_quotes_all" on quotes
    for all using (auth.role() = 'service_role');

drop policy if exists "service_quote_items_all" on quote_line_items;
create policy "service_quote_items_all" on quote_line_items
    for all using (auth.role() = 'service_role');
