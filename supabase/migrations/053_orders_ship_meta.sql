-- Migration 053: Sevkiyat meta alanları (tracking + carrier)
-- Faz 7: overdue_shipment alert drawer inline ship form için.
-- Opsiyonel (nullable) — eski satırlar etkilenmez.

alter table public.sales_orders
    add column if not exists shipment_tracking_number text,
    add column if not exists shipment_carrier        text;

-- ROLLBACK:
-- alter table public.sales_orders drop column if exists shipment_carrier;
-- alter table public.sales_orders drop column if exists shipment_tracking_number;
