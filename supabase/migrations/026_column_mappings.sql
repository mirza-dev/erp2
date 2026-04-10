-- Migration 026: Column mapping memory table
-- Stores learned column name → ERP field mappings per entity type.
-- On first import: AI detects → saved here.
-- On subsequent imports: matched from memory (no AI call needed).

create table if not exists column_mappings (
    id               uuid primary key default gen_random_uuid(),
    source_column    text not null,
    normalized       text not null,         -- trim().toLowerCase(), spaces→_
    entity_type      text not null,
    target_field     text not null,         -- ERP field name (sku, name, price, etc.)
    usage_count      integer not null default 1,
    success_count    integer not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (normalized, entity_type)
);

create index if not exists idx_colmap_lookup on column_mappings (normalized, entity_type);
