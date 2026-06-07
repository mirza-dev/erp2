-- ============================================================
-- 085 — Faz A: import_document_lines.extracted_core_fields
--
-- AI katalog/datasheet extraction'ında çıkarılan ürün-tipinden
-- bağımsız "core" master-data alanlarını (kategori, malzeme, menşei,
-- standart, sertifika, ağırlık, tedarik süresi vb.) satıra persist eder.
-- 3c apply aşamasında ürün kartına (yeni veya eşleşen) yazılır.
--
-- `extracted_attributes`'tan AYRI: attributes ürün-tipi şablon
-- field_key'leriyle sınırlı; core_fields IMPORT_CORE_PRODUCT_FIELDS
-- (sabit ürün kolonları) whitelist'i ile sınırlı. Finansal alanlar
-- (price/cost_price) ve stok (on_hand) bu objede TUTULMAZ.
--
-- DEFAULT '{}' — eski satırlar (062/063) ve core çıkmayan satırlar için.
-- ============================================================

ALTER TABLE import_document_lines
    ADD COLUMN IF NOT EXISTS extracted_core_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ROLLBACK:
-- ALTER TABLE import_document_lines DROP COLUMN IF EXISTS extracted_core_fields;
