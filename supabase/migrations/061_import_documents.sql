-- ============================================================
-- 061 — Import Documents (Faz 3a)
--
-- AI document classifier için yüklenen dosyaların ana tablosu.
-- Her dosya bir satır; 'classification' jsonb'sinde AI sınıflandırma
-- sonucu (document_type, confidence, language, summary,
-- suggested_product_type_id) tutulur. 3b'de extraction sonuçları
-- aynı jsonb'ye eklenir; 3c'de apply edilince product_attachments'a
-- kopyalanır + status='applied'.
--
-- import_batches reuse edilmedi — tek-dosya tasarımlı, multi-document
-- lifecycle ayrı varlık ister. batch_id NULL'a izin: 3a'da batch
-- yaratmadan da classify-only kullanılabilir.
--
-- Storage: product-files bucket, path prefix 'import-staging/{uuid}.{ext}'
-- 30-gün cron cleanup kararı 3c'de.
-- ============================================================

CREATE TABLE IF NOT EXISTS import_documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        uuid NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    file_path       text NOT NULL,
    file_name       text NOT NULL,
    file_size       integer NOT NULL CHECK (file_size > 0),
    mime_type       text NOT NULL,
    classification  jsonb,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','classifying','classified','error','applied')),
    error_message   text NULL,
    classified_at   timestamptz NULL,
    created_by      uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_documents_batch
    ON import_documents(batch_id);

CREATE INDEX IF NOT EXISTS idx_import_documents_status_created
    ON import_documents(status, created_at DESC);

ALTER TABLE import_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_import_documents_all" ON import_documents;
CREATE POLICY "service_import_documents_all" ON import_documents
    FOR ALL USING (auth.role() = 'service_role');

-- ROLLBACK:
-- DROP POLICY IF EXISTS "service_import_documents_all" ON import_documents;
-- DROP INDEX IF EXISTS idx_import_documents_status_created;
-- DROP INDEX IF EXISTS idx_import_documents_batch;
-- DROP TABLE IF EXISTS import_documents CASCADE;
