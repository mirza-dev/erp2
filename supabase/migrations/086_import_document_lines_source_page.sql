-- ============================================================
-- 086 — Faz D: import_document_lines.source_page + image_region
--
-- Katalog PDF extraction'ında AI'nın bildirdiği, ürünün/fotoğrafının
-- göründüğü sayfa numarası (1-tabanlı) + ürün fotoğrafının sayfadaki
-- yaklaşık normalize bbox'ı (0-1) ve güveni. Apply aşamasında mupdf ile
-- o sayfa PNG render edilip ürün görseli/kapağı (primary) yapılır.
--
-- source_page  — int NULL (PDF dışı/sayfa belirsiz satırlarda NULL)
-- image_region — jsonb NULL ({x0,y0,x1,y1,confidence}); güven eşiğin
--                altında veya yoksa apply tam sayfa render eder (hibrit).
--
-- Additive + idempotent: eski satırlar NULL kalır (eski davranış korunur).
-- ============================================================

ALTER TABLE import_document_lines
    ADD COLUMN IF NOT EXISTS source_page int NULL,
    ADD COLUMN IF NOT EXISTS image_region jsonb NULL;

-- ROLLBACK:
-- ALTER TABLE import_document_lines DROP COLUMN IF EXISTS source_page;
-- ALTER TABLE import_document_lines DROP COLUMN IF EXISTS image_region;
