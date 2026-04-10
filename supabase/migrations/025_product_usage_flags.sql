-- Migration 025: Product usage flags (is_for_sales, is_for_purchase)
-- Adds two boolean columns to distinguish whether a product is used
-- in sales transactions, purchasing transactions, or both.
-- Existing products default to true for both (no data loss).

alter table products
    add column if not exists is_for_sales    boolean not null default true,
    add column if not exists is_for_purchase boolean not null default true;
