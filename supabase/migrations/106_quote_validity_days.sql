-- ============================================================
-- Migration 106 — Teklif geçerlilik süresi (varsayılan gün sayısı)
--
-- Problem: `quotes.valid_until` PRATİKTE HİÇ DOLMUYORDU. QuoteForm'da
--   "Geçerlilik" alanı boş başlıyor (useState("")) ve opsiyonel gönderiliyor
--   (`valid_until: validUntil || undefined`) → kullanıcı elle doldurmazsa null
--   kalıyor. Canlı veride 16 teklifin HİÇBİRİNDE geçerlilik yok (2026-08-24).
--
--   Sonuç zinciri: `/api/quotes/expire` cron'u (094) hiçbir teklifi süresi
--   dolmuş işaretleyemiyor · `quote_expired` uyarısı (V7) hiç tetiklenmiyor ·
--   Teklifler listesindeki "Geçerlilik" kolonu ve "Süresi Doldu" sekmesi ölü.
--   Gönderilen teklif sonsuza kadar açık kalıyor — fabrikada fiyat taahhüdü
--   süresiz görünür.
--
-- Bu migration: firma genelinde varsayılan geçerlilik gün sayısı. Yeni teklif
--   formu `quote_date + N gün` ile alanı ÖNCEDEN doldurur; kullanıcı satır
--   bazında değiştirebilir veya boşaltabilir (alan opsiyonel kalır — mevcut
--   teklifler ve iş akışı DEĞİŞMEZ).
--
-- Varsayılan 30: sanayi teklif normu. CHECK 1..365 — 0/negatif "hemen
--   süresi dolmuş" teklif üretir, 365 üstü fiili süresizliktir.
--
-- Mevcut singleton row (033:30) default'u alır → geriye dönük davranış aynı.
-- Idempotent: add column if not exists + constraint duplicate_object guard →
--   Supabase editöründe manuel double-apply patlamaz.
-- Geçmiş veriye DOKUNMAZ: eski tekliflerin valid_until'i null kalır.
-- ============================================================

alter table company_settings
    add column if not exists quote_validity_days integer not null default 30;

do $$
begin
    alter table company_settings
        add constraint company_settings_quote_validity_days_check
        check (quote_validity_days between 1 and 365);
exception
    when duplicate_object then null;
end $$;

comment on column company_settings.quote_validity_days is
    'Yeni teklifte "Geçerlilik" alanının varsayılanı: quote_date + N gün. Form doldurur, kullanıcı değiştirebilir.';
