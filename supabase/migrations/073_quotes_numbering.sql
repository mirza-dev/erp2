-- ============================================================
-- Migration 073 — Faz 5 (infra dilim): Numara katmanı
--   yıllık reset + configurable prefix
--
-- Problem: next_quote_number() (034) global quotes_number_seq kullanıyor →
--   format TKL-YYYY-NNN ama NNN yılbaşında sıfırlanmıyor (yıl kozmetik).
-- Bu migration: yıllık reset (quote_yearly_counters) + prefix/separator
--   company_settings'ten okunur. next_quote_number() signature () returns text
--   korunur (create_quote_with_lines + seed no-arg çağırıyor — değişmez).
--
-- Güvenlik: quotes.quote_number zaten UNIQUE (012:9) → backfill yanlış hesaplasa
--   bile sessiz duplicate DEĞİL; next_quote_number mevcut numara üretirse create
--   INSERT'i gürültülü UNIQUE violation verir (recoverable).
--
-- Kapsam DIŞI (sonraki fazlar): revizyon zinciri (root_quote_id/revision_no/
--   create_quote_revision + status CHECK genişletme), sig_* rename.
--
-- Idempotent: add column if not exists / create table if not exists /
--   backfill on conflict / policy duplicate_object guard → Supabase editöründe
--   manuel double-apply patlamaz.
-- V7-A1: SECURITY DEFINER YOK (LANGUAGE plpgsql default = INVOKER).
-- ============================================================

-- 1. company_settings += prefix/separator (V3-B3)
--    Mevcut singleton row (033:30) default'ları alır → davranış birebir korunur.
alter table company_settings add column if not exists quote_number_prefix    text not null default 'TKL';
alter table company_settings add column if not exists quote_number_separator text not null default '-';

-- 2. quote_yearly_counters tablo + RLS (V4-B1, V4-B2)
create table if not exists quote_yearly_counters (
    year      int  primary key,
    last_seq  int  not null default 0
);

alter table quote_yearly_counters enable row level security;

do $$ begin
    create policy "service_quote_yearly_counters_all" on quote_yearly_counters
        for all using (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

-- 3. Backfill — mevcut tekliflerden yıl başına max seq (V5-A5)
--    034:73-78 defansif precedent'i birebir mirror: yalnız '^TKL-\d{4}-\d+$'
--    conforming numaralar sayılır (non-conforming/012-era legacy → 0 katkı,
--    çakışamaz). Gruplama gömülü-yıl (split_part ,2) — next_quote_number now()
--    yılını numaraya gömdüğü için collision uzayı aynı gömülü-yılı paylaşır.
--    Mevcut tüm quotes hardcoded 'TKL-' ile üretildi → guard tam isabetli.
insert into quote_yearly_counters (year, last_seq)
select split_part(quote_number, '-', 2)::int          as yr,
       max(split_part(quote_number, '-', 3)::int)      as max_seq
from quotes
where quote_number ~ '^TKL-\d{4}-\d+$'
group by split_part(quote_number, '-', 2)::int
on conflict (year) do update
    set last_seq = greatest(quote_yearly_counters.last_seq, excluded.last_seq);

-- 4. next_quote_number() rewrite — yıllık reset + configurable prefix
create or replace function next_quote_number()
returns text language plpgsql as $$
declare
    yr  int := extract(year from now())::int;
    seq int;
    pfx text;
    sep text;
begin
    -- atomik per-yıl artış (year row kilitlenir; eşzamanlı çağrılar serialize)
    insert into quote_yearly_counters (year, last_seq)
    values (yr, 1)
    on conflict (year) do update set last_seq = quote_yearly_counters.last_seq + 1
    returning last_seq into seq;

    select coalesce(nullif(quote_number_prefix, ''), 'TKL'),
           coalesce(nullif(quote_number_separator, ''), '-')
      into pfx, sep
      from company_settings limit 1;
    -- company_settings satırı yoksa (teorik) güvenli default
    if pfx is null then pfx := 'TKL'; sep := '-'; end if;

    return pfx || sep || yr::text || sep || lpad(seq::text, 3, '0');
end;
$$;

-- NOT: quotes_number_seq artık kullanılmıyor ama DROP edilmez
--   (geri-uyum/rollback güvenliği).

-- ROLLBACK:
-- 1) next_quote_number() 034 versiyonuna geri al (global quotes_number_seq).
-- 2) drop table if exists quote_yearly_counters;
-- 3) alter table company_settings drop column if exists quote_number_prefix;
--    alter table company_settings drop column if exists quote_number_separator;
