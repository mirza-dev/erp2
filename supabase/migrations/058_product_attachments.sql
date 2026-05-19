-- ============================================================
-- 058 — Product Attachments (Faz 2a)
-- product_attachments tablosu (görsel/datasheet/sertifika/manuel/çizim/diğer)
-- storage.buckets "product-files" (private, signed URL)
-- Versiyonlama: superseded_by ile eski version chain
-- Primary image: aynı ürünün sadece 1 primary image'i olabilir (unique partial index)
-- RLS service_role; idempotent
-- ============================================================

CREATE TABLE IF NOT EXISTS product_attachments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    file_path           text NOT NULL,
    file_name           text NOT NULL CHECK (length(trim(file_name)) > 0),
    file_size           bigint NOT NULL CHECK (file_size > 0),
    mime_type           text NOT NULL,
    kind                text NOT NULL CHECK (kind IN
                            ('image', 'datasheet', 'certificate', 'manual', 'drawing', 'other')),
    is_primary_image    boolean NOT NULL DEFAULT false,
    version             integer NOT NULL DEFAULT 1,
    superseded_by       uuid REFERENCES product_attachments(id) ON DELETE SET NULL,
    metadata            jsonb,
    uploaded_at         timestamptz NOT NULL DEFAULT now(),
    uploaded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_product
    ON product_attachments(product_id);

CREATE INDEX IF NOT EXISTS idx_attachments_kind
    ON product_attachments(product_id, kind);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_primary_image
    ON product_attachments(product_id)
    WHERE is_primary_image = true;

ALTER TABLE product_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_product_attachments_all" ON product_attachments;
CREATE POLICY "service_product_attachments_all" ON product_attachments
    FOR ALL USING (auth.role() = 'service_role');

-- ── Supabase Storage bucket: product-files ───────────────────
-- Private bucket: ürün dosyaları signed URL ile servis edilir.
-- MIME whitelist: image (png/jpeg/webp) + PDF (datasheet/sertifika/manuel).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-files',
    'product-files',
    false,
    10485760,  -- 10 MB
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product_files_service_all" ON storage.objects;
CREATE POLICY "product_files_service_all" ON storage.objects
    FOR ALL
    USING (bucket_id = 'product-files' AND auth.role() = 'service_role');

-- ROLLBACK:
-- DROP POLICY IF EXISTS "product_files_service_all" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'product-files';
-- DROP POLICY IF EXISTS "service_product_attachments_all" ON product_attachments;
-- DROP INDEX IF EXISTS idx_attachments_primary_image;
-- DROP INDEX IF EXISTS idx_attachments_kind;
-- DROP INDEX IF EXISTS idx_attachments_product;
-- DROP TABLE IF EXISTS product_attachments CASCADE;
