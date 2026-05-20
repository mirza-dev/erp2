-- ============================================================
-- 062 — Import Document Lines (Faz 3b)
--
-- Faz 3a'da classify edilen import_documents satırlarından AI
-- ekstraksiyonu ile çıkarılan ürün satırları.
--
-- extraction_type:
--   'product'             — catalog/datasheet'ten her bir ürün satırı
--   'certificate_target'  — sertifika/uygunluk belgesinin atfedildiği ürün (tek satır)
--
-- match_action lifecycle:
--   pending → matched | new_product | skipped | reviewed
--   (reviewed = kullanıcının onayladığı match/new/skip kararı kilitli)
--
-- Re-extract: dbReplaceLinesForDocument DELETE + INSERT atomik
-- yapar; CASCADE document silinince satırları da temizler.
--
-- products için pg_trgm indexleri burada eklenir — matcher'ın
-- fuzzy name/sku aramasını GIN trigram ile hızlandırır.
-- pg_trgm extension'ı Migration 048 (vendors) ile zaten enable.
-- ============================================================

CREATE TABLE IF NOT EXISTS import_document_lines (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id          uuid NOT NULL REFERENCES import_documents(id) ON DELETE CASCADE,
    line_number          integer NOT NULL CHECK (line_number > 0),
    extraction_type      text NOT NULL
                         CHECK (extraction_type IN ('product','certificate_target')),
    extracted_name       text NULL,
    extracted_sku        text NULL,
    extracted_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    candidate_matches    jsonb NOT NULL DEFAULT '[]'::jsonb,
    matched_product_id   uuid NULL REFERENCES products(id) ON DELETE SET NULL,
    match_confidence     numeric(5,2) NULL CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 100)),
    match_action         text NOT NULL DEFAULT 'pending'
                         CHECK (match_action IN ('pending','matched','new_product','skipped','reviewed')),
    extracted_at         timestamptz NOT NULL DEFAULT now(),
    reviewed_at          timestamptz NULL,
    reviewed_by          uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE (document_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_idl_document
    ON import_document_lines(document_id);

CREATE INDEX IF NOT EXISTS idx_idl_action
    ON import_document_lines(match_action, extracted_at DESC);

ALTER TABLE import_document_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_import_document_lines_all" ON import_document_lines;
CREATE POLICY "service_import_document_lines_all" ON import_document_lines
    FOR ALL USING (auth.role() = 'service_role');

-- products için fuzzy match indexleri (pg_trgm Migration 048'de enable edildi)
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
    ON products USING gin (name gin_trgm_ops)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
    ON products USING gin (sku gin_trgm_ops)
    WHERE is_active = true;

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_products_sku_trgm;
-- DROP INDEX IF EXISTS idx_products_name_trgm;
-- DROP POLICY IF EXISTS "service_import_document_lines_all" ON import_document_lines;
-- DROP INDEX IF EXISTS idx_idl_action;
-- DROP INDEX IF EXISTS idx_idl_document;
-- DROP TABLE IF EXISTS import_document_lines CASCADE;
