-- ============================================================
-- 091 — Company Files (Ayarlar → Dosyalar sekmesi)
-- company_files tablosu: şirket dosya arşivi (sözleşme/sertifika/
-- teklif eki/kurumsal kimlik/diğer) — 30 gün soft-delete (deleted_at)
-- storage.buckets "company-files" (private, signed URL, 25 MB)
-- uploaded_by: kullanıcı görünen adı SNAPSHOT (alerts.created_by paterni)
-- RLS service_role; idempotent
-- ============================================================

CREATE TABLE IF NOT EXISTS company_files (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name    text NOT NULL CHECK (length(trim(display_name)) > 0),
    description     text,
    category        text NOT NULL CHECK (category IN
                        ('sozlesme', 'belge', 'teklif-eki', 'kurumsal', 'diger')),
    ext             text NOT NULL,
    file_path       text NOT NULL,
    file_size       bigint NOT NULL CHECK (file_size > 0),
    mime_type       text NOT NULL,
    uploaded_at     timestamptz NOT NULL DEFAULT now(),
    uploaded_by     text,
    deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_company_files_active
    ON company_files(uploaded_at DESC)
    WHERE deleted_at IS NULL;

ALTER TABLE company_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_company_files_all" ON company_files;
CREATE POLICY "service_company_files_all" ON company_files
    FOR ALL USING (auth.role() = 'service_role');

-- ── Supabase Storage bucket: company-files ───────────────────
-- Private bucket: dosyalar signed URL ile servis edilir.
-- MIME whitelist: ofis belgeleri + görseller + zip/csv/txt.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'company-files',
    'company-files',
    false,
    26214400,  -- 25 MB
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
        'application/zip', 'application/x-zip-compressed',
        'text/csv', 'text/plain'
    ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "company_files_service_all" ON storage.objects;
CREATE POLICY "company_files_service_all" ON storage.objects
    FOR ALL
    USING (bucket_id = 'company-files' AND auth.role() = 'service_role');
