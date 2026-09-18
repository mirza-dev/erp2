-- ============================================================
-- Migration 112 — Belge vurgu rengi (firma ayarı)
--
-- Problem: dışarı giden belgelerin marka rengi KODDA SABİTTİ — `#0072BC`,
--   PMT'nin kurumsal mavisi; 8 dosyada (teklif HTML + baskı CSS'i + form ikizi
--   + teklif PDF'i, satın alma siparişi, fiyat talebi HTML + PDF). Teslim
--   modeli müşteri başına ayrı kurulum (project_delivery): ikinci bir müşterinin
--   teklifleri, siparişleri ve fiyat talepleri de PMT mavisiyle çıkacaktı.
--
-- Bu migration: firma genelinde tek belge rengi. Ayarlar › Firma › Belge Rengi
--   yazar; belgeler `resolveDocumentAccent()` (src/lib/document-accent.ts)
--   üzerinden okur.
--
-- Varsayılan BİLEREK '#0072BC': mevcut singleton satır (033) default'u alır →
--   PMT'nin belgelerinde tek piksel değişmez. Yeni müşteri kurulumda kendi
--   rengini seçer.
--
-- CHECK yalnız BİÇİM (#RRGGBB): renk `<style>` metnine ve PDF stiline gömülür,
--   biçim dışı değer DB'ye hiç girmemeli. OKUNABİLİRLİK (beyaz yazı kontrastı
--   ≥ 3:1) API'de doğrulanır — SQL'de parlaklık hesabı gereksiz karmaşa olurdu.
--
-- Migration uygulanmadan önce kod ÇALIŞIR: okuma `select("*")` → alan gelmez →
--   varsayılana düşer; Ayarlar alanı kilitli gösterir, API 409 döner
--   (company_settings kolonu yok). Canlı `dev:live` bu yüzden kırılmaz.
--
-- Idempotent: add column if not exists + constraint duplicate_object guard →
--   Supabase editöründe manuel double-apply patlamaz. RLS: tablo 033'ten beri
--   RLS'li (service-only politika); yeni kolon aynı politikayla korunur.
--
-- Rollback:
--   alter table company_settings drop constraint if exists company_settings_document_accent_color_check;
--   alter table company_settings drop column if exists document_accent_color;
-- ============================================================

alter table company_settings
    add column if not exists document_accent_color text not null default '#0072BC';

do $$
begin
    alter table company_settings
        add constraint company_settings_document_accent_color_check
        check (document_accent_color ~ '^#[0-9A-Fa-f]{6}$');
exception
    when duplicate_object then null;
end $$;

comment on column company_settings.document_accent_color is
    'Belge vurgu rengi (#RRGGBB): teklif, satın alma siparişi ve fiyat talebi belgelerinin başlık bandı / tablo başlığı / bölüm başlıkları. Varsayılan #0072BC.';
