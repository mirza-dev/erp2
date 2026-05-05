-- ============================================================
-- Migration 046: user-avatars bucket'tan SVG MIME'ı çıkar
-- ============================================================
-- Avatar için kullanıcı kontrollü SVG public bucket'tan servis edildiğinde
-- embedded script / XSS riski yaratır. Raster formatlara sınırla.
-- (Şirket logosu — company-assets — farklı: admin yükler, scope farklı.)

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'user-avatars';
