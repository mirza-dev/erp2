-- ============================================================
-- 063 — Faz 3b Review: import_document_lines.product_type_id
--
-- Faz 3b'de extraction sırasında belirlenen ürün tipini (catalog'un
-- suggested_product_type_id veya kullanıcı override'ı) satıra persist
-- eder. 3c apply aşamasında "yeni ürün hangi tipte yaratılacak?"
-- belirsizliğini ortadan kaldırır.
--
-- NULL'a izinli — eski satırlar (062'den) + tip belirlenmeyen
-- (datasheet override yok + classification suggested_product_type_id
-- null) durumlar için. 3c apply fallback: kullanıcıdan tip iste.
-- ============================================================

ALTER TABLE import_document_lines
    ADD COLUMN IF NOT EXISTS product_type_id uuid NULL
        REFERENCES product_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_idl_product_type
    ON import_document_lines(product_type_id);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_idl_product_type;
-- ALTER TABLE import_document_lines DROP COLUMN IF EXISTS product_type_id;
