-- KokpitERP — Teknik Şablonlar premium modeli
-- ============================================================================
-- Faz 1:
--   - product_types.is_active
--   - product_type_fields.is_active
--   Güvenli silme = pasifleştirme. Eski ürün bağlantıları ve attributes verisi
--   korunur; yeni ürünlerde pasif şablon/alan seçilmez.
--
-- Faz 2:
--   - import_document_lines.extraction_evidence
--   AI import çıktısında teknik alan bazlı kanıt/snippet + güven metadata'sı
--   taşınır. Ürüne yazma kullanıcı onayıyla apply aşamasında olur.
-- ============================================================================

ALTER TABLE product_types
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE product_type_fields
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE import_document_lines
    ADD COLUMN IF NOT EXISTS extraction_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_product_types_active_sort
    ON product_types(is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_product_type_fields_active_sort
    ON product_type_fields(product_type_id, is_active, sort_order, created_at);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_product_type_fields_active_sort;
-- DROP INDEX IF EXISTS idx_product_types_active_sort;
-- ALTER TABLE import_document_lines DROP COLUMN IF EXISTS extraction_evidence;
-- ALTER TABLE product_type_fields DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE product_types DROP COLUMN IF EXISTS is_active;
