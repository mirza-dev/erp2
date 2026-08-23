-- ────────────────────────────────────────────────────────────────────────────
-- MANUAL migration doğrulaması — TEK SORGU (SALT-OKUNUR)
--
-- `scripts/check-migrations.ts` 17 migration'ı otomatik problar; geri kalan 9'u
-- "elle doğrula" diye işaretler çünkü bunlar REDEFINE migration'ları (fonksiyon
-- zaten vardı, gövdesi değişti) veya CHECK/index tanımı. PostgREST bunları
-- okuyamaz — fonksiyonun VAR olması güncel sürüm olduğunu KANITLAMAZ.
--
-- Kullanım: Supabase Dashboard → SQL Editor → yapıştır → Run.
-- Hiçbir şey değiştirmez; yalnız katalog okur.
--
-- Deploy günü (bkz. memory C3) bu sorgu + `npx tsx scripts/check-migrations.ts`
-- + `npm run preflight:auth` üçlüsü açılış hamlesidir.
-- ────────────────────────────────────────────────────────────────────────────

select '089+101' as mig, 'alerts type CHECK (po_overdue / rfq_response_due)' as kontrol,
       pg_get_constraintdef(oid) as sonuc
  from pg_constraint
 where conrelid = 'alerts'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%type%'

union all
select '093', 'create_order_with_lines → v_line_total (finansal recompute)',
       case when prosrc like '%v_line_total%' then '✅ VAR' else '❌ YOK — 093 uygulanmamış' end
  from pg_proc where proname = 'create_order_with_lines'

union all
select '094a', 'send_quote_and_create_pending_order → qli.description',
       case when prosrc like '%qli.description%' then '✅ VAR' else '❌ YOK — 094 uygulanmamış' end
  from pg_proc where proname = 'send_quote_and_create_pending_order'

union all
select '094b', 'uq_sales_orders_quote_id (cancelled HARİÇ olmalı)', indexdef
  from pg_indexes where indexname = 'uq_sales_orders_quote_id'

union all
select '095', 'scan lock fonksiyonları → search_path (lock hijyeni)',
       proname || ' → ' || coalesce(array_to_string(proconfig, ', '), '❌ proconfig YOK')
  from pg_proc where proname like '%scan_lock%'

union all
select '102', 'create_rfq_with_lines → ON CONFLICT (rfq_id ambiguity temiz mi',
       case when prosrc not like '%ON CONFLICT (rfq_id%' then '✅ TEMİZ (102 uygulanmış)'
            else '❌ ESKİ SÜRÜM — 102 uygulanmamış' end
  from pg_proc where proname = 'create_rfq_with_lines'

union all
select '103', 'award_rfq_create_pos → sunucu-otoriter fiyat guard''ı',
       case when prosrc like '%fiyat vermedi%' then '✅ VAR' else '❌ YOK — 103 uygulanmamış' end
  from pg_proc where proname = 'award_rfq_create_pos'

union all
select '104', 'reverse_production → FOR UPDATE (eşzamanlı çift-DELETE fix)',
       case when lower(prosrc) like '%for update%' then '✅ VAR' else '❌ YOK — 104 uygulanmamış' end
  from pg_proc where proname = 'reverse_production'

union all
select '105', 'recount_stock → FOR UPDATE (atomik stok sayımı)',
       case when lower(prosrc) like '%for update%' then '✅ VAR' else '❌ YOK — 105 uygulanmamış' end
  from pg_proc where proname = 'recount_stock'

order by 1, 2;
