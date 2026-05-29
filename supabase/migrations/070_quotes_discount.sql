-- ============================================================
-- Migration 070 — Faz 3: quotes.discount_amount (header iskonto)
--
-- Teklif başına tek bir iskonto tutarı. Türk fatura standardı:
--   Ara Toplam → İskonto → KDV Matrahı (= subtotal − discount)
--   → KDV → Genel Toplam (iskonto KDV ÖNCESİ düşülür).
--
-- subtotal iskonto-ÖNCESİ satır toplamı olarak kalır; discount_amount
-- ayrı saklanır; grand_total = subtotal − discount_amount + vat_total
-- snapshot'lanır. Mevcut teklifler default 0 → totalleri etkilenmez
-- (legacy snapshot korunur).
--
-- NOT: company_settings.default_vat_rate bu fazda EKLENMEZ (kullanıcı
--   kararı 2026-05-29: iskontodan bağımsız + formdaki KDV select sabit
--   0/10/20 olduğu için configurable default friction yaratır → ayrı
--   "ayarlar" fazına ertelendi).
-- ============================================================

alter table quotes add column if not exists discount_amount numeric(15,2) not null default 0;

-- ROLLBACK:
-- alter table quotes drop column if exists discount_amount;
