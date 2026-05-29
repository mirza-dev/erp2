-- ============================================================
-- Migration 072 — Faz 3 follow-up: quotes.discount_amount CHECK
--
-- Review P2: discount_amount UI'da clamp'leniyor ama POST/PATCH/RPC doğrudan
-- negatif yazabilir. Route 422 validasyonu (validateDiscount) primer koruma;
-- bu CHECK DB-seviyesi belt-and-suspenders (caller-bypass / manuel SQL).
--
-- Sadece `>= 0` — `discount_amount <= subtotal` route kuralı olarak kalır
-- (subtotal override esnekliği; iki-kolon CHECK katı kalırdı).
--
-- Mevcut satırlar discount_amount default 0 → CHECK geçer (güvenli).
--
-- NOT (numbering): bu migration Faz 3 follow-up olarak 072'yi aldı →
--   Faz 5 (status CHECK/revision/prefix) artık 073, downstream +1 kayar.
-- ============================================================

-- Idempotent (review P3): Supabase editöründe manuel iki kez apply edilse de
-- patlamaz. pg_constraint guard — constraint zaten varsa atla.
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'quotes_discount_nonneg'
    ) then
        alter table quotes
            add constraint quotes_discount_nonneg check (discount_amount >= 0);
    end if;
end $$;

-- ROLLBACK:
-- alter table quotes drop constraint if exists quotes_discount_nonneg;
