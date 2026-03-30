-- Migration 015: Product identity fields
-- Adds descriptive/identity columns to products for drawer display.
-- All fields are optional (NULL); no existing data is affected.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS material_quality   TEXT,
  ADD COLUMN IF NOT EXISTS origin_country     TEXT,
  ADD COLUMN IF NOT EXISTS production_site    TEXT,
  ADD COLUMN IF NOT EXISTS use_cases         TEXT,
  ADD COLUMN IF NOT EXISTS industries        TEXT,
  ADD COLUMN IF NOT EXISTS standards         TEXT,
  ADD COLUMN IF NOT EXISTS certifications    TEXT,
  ADD COLUMN IF NOT EXISTS product_notes     TEXT;
