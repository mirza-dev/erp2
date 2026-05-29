-- ============================================================
-- Migration 067 — Faz 1a: quotes müşteri adresi + satıcı (PMT) snapshot
--
-- V4-A2 (QUOTES_V2_PLAN.md): quotes.customer_address snapshot — müşteri
--   seçilince adres dondurulur (müşteri sonradan değişse bile teklif sabit).
-- V4-A3: seller_* 7 snapshot alanı (name/phone/email/address/tax_id/website/
--   logo_url). Bugün satıcı bilgileri DB'de saklanmıyor; QuoteForm her mount'ta
--   company_settings'ten canlı çekiyor. Snapshot ile sent teklif dondurulur
--   (freeze hydrate ayrımı Faz 1b'de QuoteForm'da çözülür).
--
-- Hepsi TEXT NULL. Backfill yok (eski quote'lar NULL → 1b hydrate'te "").
-- ============================================================

ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS customer_address text,
    ADD COLUMN IF NOT EXISTS seller_name      text,
    ADD COLUMN IF NOT EXISTS seller_phone     text,
    ADD COLUMN IF NOT EXISTS seller_email     text,
    ADD COLUMN IF NOT EXISTS seller_address   text,
    ADD COLUMN IF NOT EXISTS seller_tax_id    text,
    ADD COLUMN IF NOT EXISTS seller_website   text,
    ADD COLUMN IF NOT EXISTS seller_logo_url  text;

-- ROLLBACK:
-- ALTER TABLE quotes DROP COLUMN IF EXISTS customer_address;
-- ALTER TABLE quotes DROP COLUMN IF EXISTS seller_name;
-- ALTER TABLE quotes DROP COLUMN IF EXISTS seller_phone;
-- ALTER TABLE quotes DROP COLUMN IF EXISTS seller_email;
-- ALTER TABLE quotes DROP COLUMN IF EXISTS seller_address;
-- ALTER TABLE quotes DROP COLUMN IF EXISTS seller_tax_id;
-- ALTER TABLE quotes DROP COLUMN IF EXISTS seller_website;
-- ALTER TABLE quotes DROP COLUMN IF EXISTS seller_logo_url;
