-- ============================================================
-- Migration 034 — Quotes + Quote Line Items
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

create table quotes (
    id              uuid         default gen_random_uuid() primary key,
    quote_number    text         not null unique default next_quote_number(),
    status          text         not null default 'draft'
                    check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),

    -- Müşteri — nullable FK + denormalize snapshot
    customer_id     uuid         references customers(id) on delete set null,
    customer_name   text         not null default '',
    customer_contact text,
    customer_phone  text,
    customer_email  text,

    -- Satış temsilcisi
    sales_rep       text,
    sales_phone     text,
    sales_email     text,

    -- Para / vergi
    currency        char(3)      not null default 'USD',
    vat_rate        numeric(5,2) not null default 20,

    -- Toplamlar (override edilebilir — form'dan gelir, DB'de saklanır)
    subtotal        numeric(15,2) not null default 0,
    vat_total       numeric(15,2) not null default 0,
    grand_total     numeric(15,2) not null default 0,

    -- Meta
    notes           text,
    sig_prepared    text,
    sig_approved    text,
    sig_manager     text,
    quote_date      date,
    valid_until     date,

    created_at      timestamptz  not null default now(),
    updated_at      timestamptz  not null default now()
);

create table quote_line_items (
    id              uuid          default gen_random_uuid() primary key,
    quote_id        uuid          not null references quotes(id) on delete cascade,
    position        integer       not null default 0,

    -- Ürün — nullable FK + serbest metin fallback
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

create index quote_line_items_quote_id on quote_line_items(quote_id);

-- RLS
alter table quotes enable row level security;
alter table quote_line_items enable row level security;

create policy "service_quotes_all" on quotes
    for all using (auth.role() = 'service_role');

create policy "service_quote_items_all" on quote_line_items
    for all using (auth.role() = 'service_role');
