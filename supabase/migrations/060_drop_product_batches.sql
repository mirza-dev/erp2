-- ============================================================
-- 060 — DROP product_batches (Faz 2e iptal)
--
-- Karar: PMT iş ölçeğinde parti (heat lot / FIFO) izlenebilirliği
-- talep edilmedi. Sertifika dosyaları zaten product_attachments
-- (kind=certificate) ile ürüne bağlanıyor; ayrı parti tablosu
-- bakım yükü oluşturuyor (helper + route + test).
--
-- Geri alma: 059_product_batches.sql dosyası git history'de
-- (komit b7c0227 — Faz 2a). İleride gerekirse oradan restore.
-- ============================================================

DROP TRIGGER  IF EXISTS trg_product_batches_updated_at ON product_batches;
DROP FUNCTION IF EXISTS product_batches_set_updated_at();
DROP POLICY   IF EXISTS "service_product_batches_all"  ON product_batches;
DROP INDEX    IF EXISTS idx_batches_product_date;
DROP INDEX    IF EXISTS idx_batches_product;
DROP TABLE    IF EXISTS product_batches CASCADE;

-- ROLLBACK: re-apply 059_product_batches.sql
