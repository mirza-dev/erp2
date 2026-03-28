-- 012_excel_full_import.sql
-- Adds support for full Excel import: quotes, shipments, invoices, payments.
-- Also extends sales_orders, customers, products with new fields.

-- ── New Tables ────────────────────────────────────────────────

create table quotes (
    id              uuid        default gen_random_uuid() primary key,
    quote_number    text        not null unique,
    quote_date      date        not null,
    customer_id     uuid        references customers(id) on delete restrict,
    customer_code   text,
    currency        char(3)     not null default 'USD',
    incoterm        text,
    validity_days   integer,
    total_amount    numeric(15,2),
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table shipments (
    id              uuid        default gen_random_uuid() primary key,
    shipment_number text        not null unique,
    order_id        uuid        references sales_orders(id) on delete restrict,
    order_number    text,
    shipment_date   date        not null,
    transport_type  text,
    net_weight_kg   numeric(12,3),
    gross_weight_kg numeric(12,3),
    notes           text,
    created_at      timestamptz not null default now()
);

create table invoices (
    id              uuid        default gen_random_uuid() primary key,
    invoice_number  text        not null unique,
    invoice_date    date        not null,
    order_id        uuid        references sales_orders(id) on delete restrict,
    order_number    text,
    customer_id     uuid        references customers(id) on delete restrict,
    customer_code   text,
    currency        char(3)     not null default 'USD',
    amount          numeric(15,2) not null,
    due_date        date,
    status          text        not null default 'open'
                    check (status in ('open', 'partially_paid', 'paid', 'cancelled')),
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table payments (
    id              uuid        default gen_random_uuid() primary key,
    payment_number  text        not null unique,
    invoice_id      uuid        references invoices(id) on delete restrict,
    invoice_number  text,
    payment_date    date        not null,
    amount          numeric(15,2) not null,
    currency        char(3)     not null default 'USD',
    payment_method  text,
    notes           text,
    created_at      timestamptz not null default now()
);

-- ── Extend Existing Tables ────────────────────────────────────

alter table sales_orders
    add column if not exists incoterm               text,
    add column if not exists planned_shipment_date  date,
    add column if not exists quote_id               uuid references quotes(id) on delete set null,
    add column if not exists original_order_number  text;

alter table customers
    add column if not exists payment_terms_days     integer,
    add column if not exists default_incoterm       text,
    add column if not exists customer_code          text;

alter table products
    add column if not exists product_family         text,
    add column if not exists sub_category           text,
    add column if not exists sector_compatibility   text,
    add column if not exists cost_price             numeric(15,2),
    add column if not exists weight_kg              numeric(10,3);

-- Extend import_drafts entity_type check
alter table import_drafts
    drop constraint if exists import_drafts_entity_type_check;

alter table import_drafts
    add constraint import_drafts_entity_type_check
    check (entity_type in (
        'customer', 'product', 'order', 'order_line', 'stock',
        'quote', 'shipment', 'invoice', 'payment'
    ));

-- ── Indexes ───────────────────────────────────────────────────

create index if not exists idx_quotes_customer          on quotes(customer_id);
create index if not exists idx_quotes_number            on quotes(quote_number);
create index if not exists idx_shipments_order          on shipments(order_id);
create index if not exists idx_invoices_order           on invoices(order_id);
create index if not exists idx_invoices_customer        on invoices(customer_id);
create index if not exists idx_invoices_status          on invoices(status);
create index if not exists idx_payments_invoice         on payments(invoice_id);
create index if not exists idx_customers_code           on customers(customer_code);
create index if not exists idx_orders_original_number   on sales_orders(original_order_number);

-- ── Triggers ──────────────────────────────────────────────────

create trigger trg_quotes_updated_at
    before update on quotes
    for each row execute function update_updated_at();

create trigger trg_invoices_updated_at
    before update on invoices
    for each row execute function update_updated_at();
