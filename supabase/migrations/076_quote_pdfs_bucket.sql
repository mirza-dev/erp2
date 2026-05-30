-- ============================================================
-- 076 — Storage bucket: quote-pdfs (Faz 4, V7)
-- Dondurulmuş teklif arşivi HTML dosyaları (text/html). Private bucket:
-- yalnız signed URL ile erişim (müşteri verisi → anonim erişim yok).
-- product-files (058) paterni; idempotent.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'quote-pdfs',
    'quote-pdfs',
    false,
    5242880,  -- 5 MB (tek HTML snapshot fazlasıyla yeterli)
    ARRAY['text/html']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "quote_pdfs_service_all" ON storage.objects;
CREATE POLICY "quote_pdfs_service_all" ON storage.objects
    FOR ALL
    USING (bucket_id = 'quote-pdfs' AND auth.role() = 'service_role');

-- ROLLBACK:
-- DROP POLICY IF EXISTS "quote_pdfs_service_all" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'quote-pdfs';
