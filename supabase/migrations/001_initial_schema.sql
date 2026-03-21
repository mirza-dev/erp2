-- ============================================================
-- KokpitERP — Initial Schema
-- Follows domain-rules.md
-- ============================================================

-- ── customers ────────────────────────────────────────────────

create table customers (
    id          uuid        default gen_random_uuid() primary key,
    name        text        not null,
    email       text,
    phone       text,
    address     text,
    tax_number  text,
    tax_office  text,
    country     char(2),
    currency    char(3)     not null default 'USD',
    notes       text,
    is_active   boolean     not null default true,
    total_orders   integer  not null default 0,
    total_revenue  numeric(15,2) not null default 0,
    last_order_date date,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    created_by  text
);

-- ── products ─────────────────────────────────────────────────

create table products (
    id               uuid    default gen_random_uuid() primary key,
    name             text    not null,
    sku              text    not null unique,
    category         text,
    unit             text    not null,
    price            numeric(15,2),
    currency         char(3) not null default 'USD',
    -- inventory balance (projection updated in same transaction as movements)
    on_hand          integer not null default 0 check (on_hand >= 0),
    reserved         integer not null default 0 check (reserved >= 0),
    -- available_now = on_hand - reserved (computed in queries; not a generated column
    -- to avoid complexity with partial reservations)
    min_stock_level  integer not null default 0,
    is_active        boolean not null default true,
    product_type     text    not null default 'finished'
                     check (product_type in ('finished', 'raw_material')),
    warehouse        text,
    reorder_qty      integer,
    preferred_vendor text,
    daily_usage      numeric(10,2),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- ── bills_of_materials ───────────────────────────────────────
-- Domain rule §8.2: finished good production requires a BOM

create table bills_of_materials (
    id                   uuid    default gen_random_uuid() primary key,
    finished_product_id  uuid    not null references products(id) on delete cascade,
    component_product_id uuid    not null references products(id) on delete restrict,
    quantity             numeric(10,4) not null check (quantity > 0),
    unit                 text,
    notes                text,
    created_at           timestamptz not null default now(),
    constraint bom_unique unique (finished_product_id, component_product_id),
    constraint bom_no_self_ref check (finished_product_id <> component_product_id)
);

-- ── sales_orders ─────────────────────────────────────────────
-- Domain rule §4.1: dual-axis status model

create table sales_orders (
    id                  uuid    default gen_random_uuid() primary key,
    order_number        text    not null unique,
    customer_id         uuid    references customers(id) on delete restrict,
    -- denormalized customer fields for display without joins
    customer_name       text    not null,
    customer_email      text,
    customer_country    char(2),
    customer_tax_office text,
    customer_tax_number text,
    -- dual-axis status (domain-rules §4.1)
    commercial_status   text    not null default 'draft'
                        check (commercial_status in ('draft', 'pending_approval', 'approved', 'cancelled')),
    fulfillment_status  text    not null default 'unallocated'
                        check (fulfillment_status in ('unallocated', 'partially_allocated', 'allocated', 'partially_shipped', 'shipped')),
    currency            char(3) not null default 'USD',
    subtotal            numeric(15,2) not null default 0,
    vat_total           numeric(15,2) not null default 0,
    grand_total         numeric(15,2) not null default 0,
    notes               text,
    item_count          integer not null default 0,
    -- Paraşüt integration (authoritative in Paraşüt, synced here)
    parasut_invoice_id  text,
    parasut_sent_at     timestamptz,
    parasut_error       text,
    -- audit
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    created_by          text,
    -- ai metadata (domain-rules §11.3)
    ai_confidence       numeric(5,2),
    ai_reason           text,
    ai_model_version    text
);

-- ── order_lines ──────────────────────────────────────────────

create table order_lines (
    id           uuid    default gen_random_uuid() primary key,
    order_id     uuid    not null references sales_orders(id) on delete cascade,
    product_id   uuid    not null references products(id) on delete restrict,
    product_name text    not null,
    product_sku  text    not null,
    unit         text    not null,
    quantity     integer not null check (quantity > 0),
    unit_price   numeric(15,2) not null check (unit_price >= 0),
    discount_pct numeric(5,2)  not null default 0
                 check (discount_pct >= 0 and discount_pct <= 100),
    line_total   numeric(15,2) not null,
    sort_order   integer not null default 0
);

-- ── stock_reservations ───────────────────────────────────────
-- Domain rule §5.1: hard reservation only on 'approved' orders

create table stock_reservations (
    id           uuid    default gen_random_uuid() primary key,
    product_id   uuid    not null references products(id) on delete restrict,
    order_id     uuid    not null references sales_orders(id) on delete cascade,
    order_line_id uuid   not null references order_lines(id) on delete cascade,
    reserved_qty integer not null check (reserved_qty > 0),
    status       text    not null default 'open'
                 check (status in ('open', 'shipped', 'released')),
    created_at   timestamptz not null default now(),
    released_at  timestamptz
);

-- ── shortages ────────────────────────────────────────────────

create table shortages (
    id             uuid    default gen_random_uuid() primary key,
    order_id       uuid    not null references sales_orders(id) on delete cascade,
    order_line_id  uuid    not null references order_lines(id) on delete cascade,
    product_id     uuid    not null references products(id) on delete restrict,
    requested_qty  integer not null,
    available_qty  integer not null,
    shortage_qty   integer not null,
    status         text    not null default 'open'
                   check (status in ('open', 'resolved', 'cancelled')),
    resolved_at    timestamptz,
    created_at     timestamptz not null default now()
);

-- ── inventory_movements ──────────────────────────────────────
-- Authoritative record of all stock changes

create table inventory_movements (
    id             uuid    default gen_random_uuid() primary key,
    product_id     uuid    not null references products(id) on delete restrict,
    movement_type  text    not null
                   check (movement_type in (
                       'production', 'shipment', 'receipt', 'adjustment',
                       'reservation_create', 'reservation_release'
                   )),
    quantity       integer not null,  -- positive = stock in, negative = stock out
    reference_type text    check (reference_type in ('order', 'production_entry', 'import', 'manual')),
    reference_id   uuid,
    notes          text,
    occurred_at    timestamptz not null default now(),
    created_by     text,
    source         text    not null default 'ui'
                   check (source in ('ui', 'system', 'ai', 'integration'))
);

-- ── production_entries ───────────────────────────────────────

create table production_entries (
    id              uuid    default gen_random_uuid() primary key,
    product_id      uuid    not null references products(id) on delete restrict,
    product_name    text    not null,
    product_sku     text    not null,
    produced_qty    integer not null check (produced_qty > 0),
    scrap_qty       integer not null default 0 check (scrap_qty >= 0),
    waste_reason    text,
    production_date date    not null default current_date,
    entered_by      text,
    notes           text,
    -- optional link to a sales order for shortage resolution (domain-rules §8.5)
    related_order_id uuid   references sales_orders(id),
    created_at      timestamptz not null default now()
);

-- ── alerts ───────────────────────────────────────────────────
-- Domain rule §12.3: alert lifecycle (open → acknowledged → resolved | dismissed)

create table alerts (
    id                  uuid    default gen_random_uuid() primary key,
    type                text    not null
                        check (type in (
                            'stock_critical', 'stock_risk', 'purchase_recommended',
                            'order_shortage', 'sync_issue', 'import_review_required'
                        )),
    severity            text    not null default 'warning'
                        check (severity in ('critical', 'warning', 'info')),
    title               text    not null,
    description         text,
    entity_type         text,   -- 'product', 'order', etc.
    entity_id           uuid,
    -- lifecycle
    status              text    not null default 'open'
                        check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
    acknowledged_at     timestamptz,
    resolved_at         timestamptz,
    dismissed_at        timestamptz,
    resolution_reason   text,   -- 'purchase_order_created', 'stock_received', 'order_cancelled', 'manual_dismiss'
    -- ai enrichment (domain-rules §11.3)
    ai_confidence       numeric(5,2),
    ai_reason           text,
    ai_model_version    text,
    ai_inputs_summary   jsonb,
    created_at          timestamptz not null default now(),
    source              text    not null default 'system'
                        check (source in ('system', 'ai', 'ui'))
);

-- ── import_batches ───────────────────────────────────────────

create table import_batches (
    id           uuid    default gen_random_uuid() primary key,
    file_name    text,
    file_size    integer,
    status       text    not null default 'pending'
                 check (status in ('pending', 'processing', 'review', 'confirmed', 'failed')),
    parse_result jsonb,
    confidence   numeric(5,2),
    created_by   text,
    created_at   timestamptz not null default now(),
    confirmed_at timestamptz
);

-- ── import_drafts ────────────────────────────────────────────

create table import_drafts (
    id                uuid    default gen_random_uuid() primary key,
    batch_id          uuid    not null references import_batches(id) on delete cascade,
    entity_type       text    not null check (entity_type in ('customer', 'product', 'order')),
    raw_data          jsonb,
    parsed_data       jsonb,
    matched_entity_id uuid,
    confidence        numeric(5,2),
    ai_reason         text,
    unmatched_fields  jsonb,
    user_corrections  jsonb,
    status            text    not null default 'pending'
                      check (status in ('pending', 'confirmed', 'rejected', 'merged')),
    created_at        timestamptz not null default now()
);

-- ── integration_sync_logs ────────────────────────────────────
-- Domain rule §10.4

create table integration_sync_logs (
    id            uuid    default gen_random_uuid() primary key,
    entity_type   text    not null,
    entity_id     uuid,
    direction     text    not null check (direction in ('push', 'pull')),
    status        text    not null check (status in ('success', 'error', 'pending', 'retrying')),
    external_id   text,
    error_message text,
    retry_count   integer not null default 0,
    requested_at  timestamptz not null default now(),
    completed_at  timestamptz,
    source        text    not null default 'system'
                  check (source in ('ui', 'system', 'scheduled'))
);

-- ── audit_log ────────────────────────────────────────────────
-- Domain rule §13: all state-changing operations produce an audit entry

create table audit_log (
    id           uuid    default gen_random_uuid() primary key,
    actor        text,
    action       text    not null,
    entity_type  text    not null,
    entity_id    uuid,
    before_state jsonb,
    after_state  jsonb,
    occurred_at  timestamptz not null default now(),
    source       text    not null default 'ui'
                 check (source in ('ui', 'system', 'ai', 'integration'))
);

-- ── indexes ──────────────────────────────────────────────────

create index idx_products_sku              on products(sku);
create index idx_products_type             on products(product_type);
create index idx_products_active           on products(is_active);
create index idx_products_stock            on products(on_hand, reserved);

create index idx_sales_orders_customer     on sales_orders(customer_id);
create index idx_sales_orders_commercial   on sales_orders(commercial_status);
create index idx_sales_orders_fulfillment  on sales_orders(fulfillment_status);
create index idx_sales_orders_created_at   on sales_orders(created_at desc);

create index idx_order_lines_order         on order_lines(order_id);
create index idx_order_lines_product       on order_lines(product_id);

create index idx_reservations_product      on stock_reservations(product_id);
create index idx_reservations_order        on stock_reservations(order_id);
create index idx_reservations_status       on stock_reservations(status);

create index idx_movements_product         on inventory_movements(product_id);
create index idx_movements_occurred_at     on inventory_movements(occurred_at desc);

create index idx_alerts_status             on alerts(status);
create index idx_alerts_severity           on alerts(severity);
create index idx_alerts_entity             on alerts(entity_type, entity_id);

create index idx_audit_entity              on audit_log(entity_type, entity_id);
create index idx_audit_occurred_at         on audit_log(occurred_at desc);

-- ── updated_at trigger ───────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger trg_customers_updated_at
    before update on customers
    for each row execute function update_updated_at();

create trigger trg_products_updated_at
    before update on products
    for each row execute function update_updated_at();

create trigger trg_sales_orders_updated_at
    before update on sales_orders
    for each row execute function update_updated_at();
