-- ────────────────────────────────────────────────────────────────────────────
-- MANUAL migration doğrulaması — TEK SORGU (SALT-OKUNUR)
--
-- `scripts/check-migrations.ts` migration'ların bir kısmını otomatik problar;
-- geri kalanını "elle doğrula" diye işaretler çünkü bunlar REDEFINE migration'ları
-- (fonksiyon zaten vardı, gövdesi değişti), CHECK/index tanımı, ya da **yetki/RLS**
-- değişikliği (017, 029, 110). PostgREST bunları okuyamaz — fonksiyonun VAR olması
-- güncel sürüm olduğunu KANITLAMAZ, tablonun VAR olması da RLS'inin açık
-- olduğunu göstermez.
--
-- Kullanım: Supabase Dashboard → SQL Editor → yapıştır → Run.
-- Hiçbir şey değiştirmez; yalnız katalog okur.
--
-- HER SATIR KISA HÜKÜM döndürür (✅/❌). Ham CHECK/index tanımı döndürmek
-- cazip ama SQL editörü uzun metni kırpıyor → hüküm okunamıyordu (2026-08-24).
-- Ham tanıma bakmak gerekirse dosyanın sonundaki yorumlu blok var.
--
-- SON KOŞUM: 2026-09-11 — canlı `erp2` projesinde 19/19 GEÇTİ. İki çalıştırmada
-- okundu: dosyanın bir önceki sürümüyle 15 satır (017 · 029 · 089 · 093 ·
-- 094 ×2 · 095 ×2 · 101 · 102 · 103 · 104 · 105 · 106 · 110) + yeni dört satır
-- ayrı sorgu olarak (107a · 107b · 108a · 108b). 095'in iki satırı ✅ yerine
-- search_path değerini basar — `public, pg_catalog` = geçti. 017/029 RLS
-- satırları 2026-08-30'da eklendiğinden beri İLK KEZ okundu.
-- Önceki koşum: 2026-08-30 — 9/9 ✅ (089, 093, 094 ×2, 095, 101, 102, 103, 104, 105).
--
-- 2026-09-11 GÜNCELLEME: `check-migrations.ts` 23 değil **22** otomatik probe
-- taşıyor (git geçmişi: 22 ekleme, 0 silme — hiçbir migration kapsamdan
-- düşmemiş, sayı elle yanlış yazılmıştı). Aynı gün 107 + 108 canlıya
-- uygulandı ve yapı tarafı YEREL VERİTABANINA KARŞI DIFF'LENEREK doğrulandı:
-- 64 tablo · 837 kolon · 60 RPC · 6 bucket — fark SIFIR. 017/029 RLS satırları
-- da anon anahtarıyla canlıda ölçüldü (64 tablo tarandı, 0 sızan; kırmızı-kanıt:
-- aynı istek servis anahtarıyla 18 satır döndürüyor). Bu dosyadaki satırlar
-- bunların HİÇBİRİNİN göremediği katmanı ölçer: fonksiyon GÖVDESİ, CHECK,
-- index, grant.
--
-- 2026-08-30 EK: 110 (DEFINER grant) + 017/029 (tablo RLS) satırları eklendi.
-- Üçü de canlıda GEÇMİŞ durumda olmalı; yeni migration DEĞİL, mevcut korumanın
-- canlıda hâlâ yerinde olduğunu ölçüyorlar. RLS satırı ❌ dönerse o tablo
-- tarayıcıdaki anon anahtarıyla okunabiliyor demektir → deploy DURDURULUR.
--
-- Deploy günü (bkz. memory C3) bu sorgu + `npx tsx scripts/check-migrations.ts`
-- + `npm run preflight:auth` üçlüsü açılış hamlesidir.
-- ────────────────────────────────────────────────────────────────────────────

-- alerts type CHECK'i ÜÇ migration birlikte kuruyor (089 · 101 · 108).
-- DİKKAT: bu dört satır AGGREGATE — kısıt HİÇ yoksa bile bir satır döner.
-- Eski biçim (count'suz) kısıt tamamen düşmüş olsaydı sonuç kümesinden
-- SESSİZCE kaybolurdu; ekranda bir satır eksilirdi, ❌ görünmezdi.
select '089' as mig, 'alerts type CHECK → po_overdue' as kontrol,
       case when count(*) = 0 then '❌ alerts type CHECK''İ HİÇ YOK'
            when bool_or(pg_get_constraintdef(oid) like '%po_overdue%') then '✅ VAR'
            else '❌ YOK — 089 uygulanmamış' end as sonuc
  from pg_constraint
 where conrelid = 'alerts'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%stock_critical%'

union all
select '101', 'alerts type CHECK → rfq_response_due',
       case when count(*) = 0 then '❌ alerts type CHECK''İ HİÇ YOK'
            when bool_or(pg_get_constraintdef(oid) like '%rfq_response_due%') then '✅ VAR'
            else '❌ YOK — 101 uygulanmamış' end
  from pg_constraint
 where conrelid = 'alerts'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%stock_critical%'

-- 108'in CHECK parçası: 2026-09-11'e kadar HİÇBİR ŞEY doğrulamıyordu.
-- `check-migrations.ts`in 108 probe'u yalnız sales_orders.parasut_payment_status
-- KOLONUNA bakıyor; `parasut-payment-status.test.ts:214` ise migration
-- DOSYASININ metnini kilitliyor — ikisi de veritabanını görmez. Kolonlar inip
-- kısıt inmeseydi her iki kapı da yeşil derdi.
union all
select '108a', 'alerts type CHECK → payment_overdue',
       case when count(*) = 0 then '❌ alerts type CHECK''İ HİÇ YOK'
            when bool_or(pg_get_constraintdef(oid) like '%payment_overdue%') then '✅ VAR'
            else '❌ YOK — 108''in CHECK parçası inmemiş' end
  from pg_constraint
 where conrelid = 'alerts'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%stock_critical%'

-- 092 kararı: takvim notları `calendar_notes` tablosuna taşındı, `user_note`
-- uyarı tipi listeden BİLİNÇLİ düşürüldü. Bu sözleşme bugüne kadar yalnız
-- 108'in YORUMUNDA yaşıyordu — yorumda yaşayan sözleşme fiilen yoktur.
union all
select '108b', 'alerts type CHECK → user_note GERİ GELMEMİŞ (092 kararı)',
       case when count(*) = 0 then '❌ alerts type CHECK''İ HİÇ YOK'
            when bool_or(pg_get_constraintdef(oid) like '%user_note%')
                 then '❌ GERİ GELMİŞ — takvim notları calendar_notes''ta olmalı'
            else '✅ YOK (doğru)' end
  from pg_constraint
 where conrelid = 'alerts'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%stock_critical%'

-- 107 de aynı körlükte: kolonları OpenAPI'de görünür (probe ✅ der) ama
-- CHECK'i ve iki CRON index'i görünmez. Yarım uygulanmış bir 107'de alış
-- faturası satır KDV'si sınırsız girilebilir, tahsilat pollu da tam tarama yapar.
union all
select '107a', 'purchase_order_lines → chk_pol_vat_rate (KDV 0..100)',
       case when count(*) > 0 then '✅ VAR'
            else '❌ YOK — 107''in CHECK parçası inmemiş' end
  from pg_constraint
 where conrelid = 'purchase_order_lines'::regclass and contype = 'c'
   and conname = 'chk_pol_vat_rate'

union all
select '107b', 'Paraşüt CRON index''leri (retry + contact lease)',
       case when count(*) = 2 then '✅ 2/2 VAR'
            else '❌ ' || count(*)::text || '/2 — 107''in index parçası eksik' end
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('idx_po_parasut_retry',
                     'idx_vendors_parasut_contact_creating_until')

union all
select '093', 'create_order_with_lines → v_line_total (finansal recompute)',
       case when prosrc like '%v_line_total%' then '✅ VAR' else '❌ YOK — 093 uygulanmamış' end
  from pg_proc where proname = 'create_order_with_lines'

union all
select '094a', 'send_quote_and_create_pending_order → qli.description',
       case when prosrc like '%qli.description%' then '✅ VAR' else '❌ YOK — 094 uygulanmamış' end
  from pg_proc where proname = 'send_quote_and_create_pending_order'

union all
select '094b', 'uq_sales_orders_quote_id → cancelled HARİÇ (kısmi indeks)',
       case when indexdef ilike '%where%' and indexdef ilike '%cancelled%'
            then '✅ KISMİ — iptal sonrası yeniden gönderilebilir'
            else '❌ TAM İNDEKS — 094 uygulanmamış (iptal sonrası gönderilemez)' end
  from pg_indexes where indexname = 'uq_sales_orders_quote_id'

union all
select '095', 'scan lock fonksiyonları → search_path (lock hijyeni)',
       proname || ' → ' || coalesce(array_to_string(proconfig, ', '), '❌ proconfig YOK')
  from pg_proc where proname like '%scan_lock%'

union all
select '102', 'create_rfq_with_lines → ON CONFLICT (rfq_id ambiguity temiz mi)',
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

union all
select '106', 'company_settings.quote_validity_days (teklif geçerlilik varsayılanı)',
       case when exists (
                select 1 from information_schema.columns
                 where table_name = 'company_settings' and column_name = 'quote_validity_days')
            then '✅ VAR' else '❌ YOK — 106 uygulanmamış' end

-- 110 + 017/029: yetki ve RLS değişiklikleri. Hiçbiri OpenAPI'de görünmez →
-- `check-migrations.ts` bunları probe EDEMEZ, tek doğrulama yolu burası.
union all
select '110', 'DEFINER RPC''leri anon/authenticated''a KAPALI (5 fonksiyon)',
       case when count(*) filter (
                where has_function_privilege('anon', p.oid, 'EXECUTE')
                   or has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 0
            then '✅ HEPSİ KAPALI' else '❌ AÇIK KALAN VAR — 110 uygulanmamış' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('purge_telemetry', 'record_error_occurrence', 'record_request_metrics',
                     'claim_notification_outbox', 'update_email_delivery_from_provider')

union all
select '017', 'Çekirdek 23 tabloda RLS açık (017_enable_rls)',
       case when count(*) filter (where not c.relrowsecurity) = 0 and count(*) = 23
            then '✅ 23/23 AÇIK'
            else '❌ ' || count(*) filter (where not c.relrowsecurity)::text
                 || ' tabloda KAPALI (bulunan: ' || count(*)::text || '/23)' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('customers', 'products', 'sales_orders', 'order_lines', 'quotes',
                     'audit_log', 'alerts', 'inventory_movements', 'production_entries',
                     'invoices', 'payments', 'shipments', 'bills_of_materials',
                     'stock_reservations', 'shortages', 'import_batches', 'import_drafts',
                     'ai_entity_aliases', 'ai_feedback', 'ai_recommendations', 'ai_runs',
                     'order_counters', 'integration_sync_logs')

union all
select '029', 'purchase_commitments + column_mappings RLS açık',
       case when count(*) filter (where not c.relrowsecurity) = 0 and count(*) = 2
            then '✅ 2/2 AÇIK' else '❌ KAPALI VAR (bulunan: ' || count(*)::text || '/2)' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('purchase_commitments', 'column_mappings')

order by 1, 2;

-- ── Ham tanımlar (gerekirse ayrı çalıştır; editör kırpabilir) ────────────────
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'alerts'::regclass and contype = 'c'
--    and pg_get_constraintdef(oid) ilike '%stock_critical%';
-- select indexdef from pg_indexes where indexname = 'uq_sales_orders_quote_id';
