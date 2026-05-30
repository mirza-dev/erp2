-- ============================================================
-- 075 — Quote PDF Archives (Faz 4, V7)
-- Gönderilmiş (sent) teklifin immutable "kilitli arşivi": dondurulmuş HTML snapshot.
-- file_path → storage 'quote-pdfs' bucket'ındaki .html (Migration 076).
-- V3-A5 immutability: INSERT-only; aynı (quote_id, revision_no) ikinci arşiv İMKANSIZ
--   (UNIQUE index = helper idempotency'sinin DB backstop'u).
-- revision_no → revizyon zinciri (074) ile hizalı; her revizyonun kendi arşivi.
-- RLS service_role; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS quote_pdf_archives (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id        uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    revision_no     int NOT NULL DEFAULT 1,
    file_path       text NOT NULL CHECK (length(trim(file_path)) > 0),
    content_hash    text NOT NULL,        -- sha256(html), bütünlük/dedup
    byte_size       int NOT NULL CHECK (byte_size > 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- V3-A5 immutability backstop: aynı teklif+revizyon ikinci arşiv reddedilir.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_quote_archive_rev
    ON quote_pdf_archives(quote_id, revision_no);

CREATE INDEX IF NOT EXISTS idx_quote_archive_quote
    ON quote_pdf_archives(quote_id);

ALTER TABLE quote_pdf_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_quote_pdf_archives_all" ON quote_pdf_archives;
CREATE POLICY "service_quote_pdf_archives_all" ON quote_pdf_archives
    FOR ALL USING (auth.role() = 'service_role');

-- ROLLBACK:
-- DROP POLICY IF EXISTS "service_quote_pdf_archives_all" ON quote_pdf_archives;
-- DROP INDEX IF EXISTS idx_quote_archive_quote;
-- DROP INDEX IF EXISTS uniq_quote_archive_rev;
-- DROP TABLE IF EXISTS quote_pdf_archives CASCADE;
