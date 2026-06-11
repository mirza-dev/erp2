# Roven — Claude Code Rehberi

## Mevcut Durum
_Son güncelleme: 2026-06-13_

> Bu bölüm yalnız **güncel durumu + açık yükümlülükleri** tutar. Tam oturum geçmişi git log'unda ve `memory/current_focus.md`'de. Aşağıdaki indeks son dönem oturumlarına (commit + konu) hızlı bakış içindir; daha eski dönemler (Faz 2–3d AI Import, Sprint A–C, M-3 Rate Limiting, React Doctor, Teklif V2–V7 plan turları, Paraşüt Faz 1–11) git geçmişinde.

**Son tamamlanan iş:** **Kalıcı performans — çekirdek paket (render/yükleme yavaşlığı kök çözümü)** (2026-06-13; GREEN). **İstek:** "sistemde çok büyük render yavaşlığı var, kalıcı çözmemiz lazım" + kullanıcının Playwright-trace'li performans raporu (31 istek / 27.6s toplam / alerts 479KB / finance 1.7s). 3 paralel keşif raporu doğruladı; **kararlar (AskUserQuestion):** çekirdek paket (RSC/loading.tsx + tam server-side pagination SONRAKİ tur) · **SWR eklendi** (kullanıcı seçimi, `swr@2.4.1`) · counters migration'sız route. **Faz 0:** `swr-config.ts` (`jsonFetcher`+`FetchError`+`SWR_DEFAULTS` — `revalidateOnFocus:false` kilitli, dedup 15s) + `server-timing.ts` (`startSpan`/`appendServerTiming`) yalnız 3 yavaş route'ta (products/orders all=1 + finance) — DevTools'ta auth/db span'leri. **Faz 1 (auth tekilleştirme):** `resolveAuthContext()` role-guard'a eklendi — TEK createClient+getUser ile `{user,userId,roles,perms}`; `requirePermissionFor`/`requireRoleFor` context'ten karar verir (React.cache route handler'da ÇALIŞMAZ — render scope yok); "guard + ikinci getUser" yapan **11 route** dönüştü (orders/production/transcribe/quotes-accept/settings-files/attachments/classify/apply/extract/document-lines/email-test) → istek başına auth round-trip 2-3→1; diğer ~100 route'a dokunulmadı; 11 test dosyasının mock factory'sine yeni export'lar eklendi; classify'ın "post-AI getUser abort penceresi" yapısal olarak kalktı (auth artık route başında). **Faz 2 (Sidebar sayaçları):** YENİ `GET /api/dashboard/counters` `{pendingOrders,reorderCount,activeAlerts}` (~100 byte; guard'sız — emsal GET /api/alerts; head+count helper'ları `dbCountOrdersByCommercialStatus`+`dbCountActiveAlerts` [open+ack tanımı birebir]; reorderCount = YENİ saf `isReorderCandidateRow` — purchase-copilot'un inline filtresi TEK kaynağa çıkarıldı, copilot da bunu kullanır + products-tag'li 60s unstable_cache); Sidebar `useData` İMPORT ETMEZ → `useDashboardCounters()` (SWR 60s poll); rozet davranışı aynı (`count || undefined`). **Faz 3 (veri fırtınası — planın kalbi):** `data-context.tsx` SWR domain hook'larına yeniden yazıldı (dosya YERİNDE — 9 source-lock + 4 vi.mock dosyası): `useProducts/useCustomers/useOrders/useProduction/useAlerts/useReorderSuggestions` + mutation-only `useOrderMutations` (liste aboneliği başlatmaz); key sabitleri `PRODUCTS_KEY("/api/products?all=1")/CUSTOMERS_KEY/ORDERS_KEY/ALERTS_KEY/COUNTERS_KEY` + `productionFetchUrl()` aynen; **DataProvider artık VERİ ÇEKMEZ** (yalnız SWRConfig) — eski mount'ta 5 endpoint Promise.all (~10MB) TARİH OLDU; `useData()` geriye-uyumlu kompozisyon (alan-alan aynı dönüş; ölü komponentler derlenir); mutasyon köprüleri sözleşme-birebir (cache patch `{revalidate:false}`; `updateOrderStatus` `shouldRefetchProducts` saf export + `mutate(PRODUCTS_KEY)` + `mutate(COUNTERS_KEY)`; üretim `Promise.allSettled` → `{refetchFailed}` korunur; `buildLoadError` saf export — eski mesaj formatları birebir; `invalidateAllData()` = refetchAll); 10 tüketici dar hook'lara geçti (dashboard [customers fetch'i İLK KEZ ELENDİ], customers, production, purchase/suggested, orders + [id] + OrderForm, QuoteForm, import/excel, CustomerDetailPanel); mirror testler gerçek export'lara bağlandı (`data-context-error`→buildLoadError, `data-context-stock-refetch`→shouldRefetchProducts — drift kapandı). **Faz 4 (duplicate fetch):** YENİ `shared-hooks.ts` — `useExchangeRates` (20dk, Ticker+dashboard TEK istek; `ratesResolved`=!isLoading flash-guard korunur), `useUserProfile` (Avatar+dashboard tek istek; settings PATCH → `updateUserProfileCache` köprüsü = Topbar avatarı anında tazelenir, bonus fix), `useSystemHealth` (5dk korundu); RTL testleri için ortak `helpers/swr-test-wrapper.tsx` (`provider: () => new Map()` — cache sızıntısı önlenir). **Faz 5 (server quick-win):** `/api/alerts` GET → `dbListAlerts(filter, {limit:500, columns:dar-liste})` — **default davranış AYNEN** (scan/dedup/ops-summary tam satır); kolon listesi UI'nin okuduğu HER alanı kapsar (OpenAlert + entity_type/resolved_at/due_date/created_by; ai_inputs_summary/ai_reason TAŞINMAZ) → ~479KB→~80KB; `/api/dashboard/finance` COGS RPC'si `unstable_cache` tags:["products","finance-cogs"] revalidate:300 (canViewCosts+reportingCurrency cache DIŞINDA — imza kilidi testli) → 1.7s→cache-hit ~ms; profile route'una DOKUNULMADI (SWR dedup yeter, admin-API invalidasyon karmaşası kazanca değmez). **Test:** +6 yeni dosya (`swr-config`/`server-timing`/`resolve-auth-context`/`dashboard-counters-route`/`alerts-route-narrow` + reorder-suggestions'a `isReorderCandidateRow` bloğu) + ~20 dosya güncellendi; tsc 0 · lint 0 · **5104 test / 371 dosya** · build 0. **Beklenen kazanım:** dashboard açılışı ~13-15 istek/~10MB → ~8 istek/birkaç yüz KB; liste sayfaları kendi verisini kendisi çeker; Server-Timing ile ölçülebilir. **Kalan:** tarayıcı smoke (dashboard panelleri dolu · sipariş onayla→Sidebar pending rozeti düşer · üretim→stok düşer · import→listeler tazelenir · demo guard · viewer redaction · Network sekmesinde istek sayısı/byte karşılaştırması).

**Önceki iş:** **Dashboard: Teklif Hattı + Yoldaki Mal kartları (/frontend-design)** (2026-06-12; GREEN). **İstek:** doğruluk turunun açtığı iki boşluğu kapatan 2 yeni KPI kartı ("ikisini de uygula"). **Şerit (7 kart, satış→tedarik anlatısı):** Ciro · Açık Siparişler · **Teklif Hattı** · Stok Değeri · **Yoldaki Mal** · Üretim · Açık Uyarılar. **View-model:** `quotePipelineView` (yalnız `sent`; `expiring7d` = validUntil ∈ [bugün, +7g] string-karşılaştırma; RBAC `grandTotal:null` → `redacted` → değer "—" adet kalır) + `incomingPoView` (sent/confirmed/partially_received; `overdueCount` = expected_date < bugün) — birinci elden veri, proxy yok; `KpiInput` += `quotes?/purchaseOrders?` (**null/undefined = kart üretilmez, fail-soft**); `DashboardKpi` += `href?` + `subTone?`. **KpiCard:** `href` varsa gerçek `next/link` (ok ikonu+pointer artık yanıltıcı değil; aria-label "label: value"); `subTone` warning/danger alt satırı renklendirir (sakin şeritte tek aciliyet vurgusu — Teklif "X tanesi 7 gün içinde doluyor" warning, PO "X tanesi gecikmede" danger); href'siz div fallback korunur. Mevcut 5 kart da href aldı (orders/products/production/alerts). **Page:** `/api/quotes` + `/api/purchase-orders` mount fetch'leri (IIFE+alive); PO 403 (sales/viewer — view_purchase_orders yok) dahil !ok → null → kart yok; kur uyarısı memo'su quote/PO para birimlerini de tarar. **Rapor:** kpis generic map → 7 satır otomatik. **Test:** +17 (`kpi-card-render` 3 RTL [link/div-fallback/subTone renkleri] · view-model pipeline/incoming sınır testleri + buildKpis 7-sıra/redaction/href kilitleri · data-accuracy page source-lock'ları · preservation tip adları); tsc 0 · lint 0 · **5066 test / 366 dosya** · build 0. **Kalan:** görsel smoke (7 kart admin'de; sales'te Yoldaki Mal yok; kart tıkla→sayfa; expiring/gecikme renkleri).

**Önceki iş:** **Dashboard doğruluk turu — 4 bulgu fix + Açık Alacak kartı kaldırıldı** (2026-06-12; GREEN). **İstek:** "dashboard %100 doğru mu, veriler güvenilir mi, açık alacak neye göre hesaplanıyor" denetimi → "bulguları eksiksiz düzelt + Açık Alacak kartını kaldır" (proxy hesap güvenilir değil). **Kararlar (AskUserQuestion):** ciro = YALNIZ approved; kur çözülemeyince hariç tut + görünür uyarı. **Fix'ler:** (1) **Üretim limit-50 bug'ı** — data-context `/api/production`'ı parametresiz çağırıyordu (default 50 kayıt → dönem KPI'ları sessizce eksik); yeni `productionFetchUrl()` = `?since=<now-120g>&limit=5000` (3 çağrı noktası), route `since` regex-valide + tavan 500→5000, `dbListProductionEntries` `gte(production_date)`; (2) **Ciro yalnız approved** — `isRevenueOrder` pending_approval'ı da sayıyordu (mig.088'den beri gönderilen her teklif pending sipariş yaratır → kabul edilmemiş teklif ciroyu şişiriyordu); trend/rapor/sayımlar aynı fonksiyondan otomatik tutarlı; (3) **FX sessiz karışım** — `toReporting` kur çözülemeyince tutarı DEĞİŞTİRMEDEN geçiriyordu (TRY→USD 40 kat hata); artık 0 döner (toplam dışı) + yeni `canConvert`/`listUnconvertibleCurrencies` + KPI şeridi altında `ratesResolved` guard'lı uyarı satırı ("Kur verisi alınamadı — X tutarları toplamlara dahil edilemedi"); (4) **"Kritik Uyarılar" → "Açık Uyarılar"** (değer tüm open+ack, info dahil — etiket değerle tutarlı; rapor bölümü de). **Kaldırılan:** `receivablesAging`+`AgingBucket`+`ReceivablesView` (Açık Alacak kartı; createdAt+30g sabit vade/90g pencere/ödeme-düşülmez proxy idi) → **5 KPI**; `KpiPerms.canViewFinancialSummary` kalktı (kart tek tüketiciydi; müşteri sayfalarındaki kullanım context'te duruyor); gerçek alacak istenirse `invoices`/`payments` tablolarından (mevcut, UI okumuyor). **Test:** yeni `dashboard-data-accuracy`(6 source-lock) + view-model/report/preservation kilitleri yeni sözleşmeye (+geri-gelmez kilitleri); tsc 0 · lint 0 · **5049 test / 365 dosya** · build 0. **Kalan:** görsel smoke (5 kart + uyarı satırı TCMB kapalıyken).

**Önceki iş:** **Ayarlar → "Dosyalar" sekmesi — şirket dosya arşivi (handoff implement, mig.091)** (2026-06-11; GREEN). **İstek:** `design_handoff_settings_files_tab/` paketini "detaylı ve eksiksiz implement et, backend sağlam olsun." **Kararlar (AskUserQuestion):** api/yapay-zeka sekmeleri SİLİNMEDİ (handoff "kaldır" diyordu ama dünkü Bakım/internal-operator işi korunur — müşteri admini zaten görmüyor); yalnız tablo görünümü (kart/grid prototipin tweak-panel özelliğiydi, toggle speclenmemiş). **Backend:** mig.091 (`company_files` tablo + CHECK 5 kategori [sozlesme/belge/teklif-eki/kurumsal/diger] + `deleted_at` soft-delete + `uploaded_by` görünen-ad snapshot [alerts.created_by paterni] + private bucket `company-files` 25MB MIME-allowlist'li, **APPLY BEKLİYOR ⚠️**); `lib/company-files.ts` saf paylaşılan modül (kategoriler/splitName/formatFileSize/EXT renkleri/uzantı→MIME haritası — contentType uzantıdan türer, tarayıcı `file.type` boş olabilir); `lib/supabase/company-files.ts` product-attachments kalıbı (insert→upload→path-patch, orphan cleanup; soft-delete storage'a DOKUNMAZ); uçlar: `GET /api/settings/files` (view_settings; files+usedBytes+limitBytes), `POST` (manage_settings; multipart file+display_name+category; ad≤200/kategori/uzantı/25MB validasyon), `DELETE /[id]` (soft, 404), `GET /[id]/download` (imzalı 1saat; `?download=1` attachment; **SVG her zaman attachment** — 046 stored-XSS precedent). **README'den sapma:** PATCH yok (UI tüketicisi yok → ölü uç politikası; `dbUpdateCompanyFileMeta` helper hazır), purge cron'u yok (dosya ≥30 gün kalır). **UI:** `dosyalar` sekmesi system scope firma'dan sonra `FolderOpen`; yeni `DosyalarTab.tsx` (~560): pencere-geneli DnD (dragDepth sayacı + **tüm dragover/drop preventDefault** [tarayıcı dosyayı açmasın] + gizli-panel guard'ı `section[hidden]`), isimlendirme+kategori onay modalı (taban ad düzenlenir, uzantı sabit, boş ad kilitler; Escape+focus-dönüş), tr-TR arama (ad+açıklama+yükleyen), kategori dropdown sayılı, 3-eksen sıralama (ad/boyut/tarih), sticky-thead tablo + DocIcon uzantı-etiketli + hover aksiyonları (Önizle [senkron `window.open` sonra URL — popup-blocker dersi; SVG'de gizli] / İndir / iki-aşamalı "Sil?"), depolama çubuğu (5 GB sabit) + "30 gün çöp kutusu" özeti; globals.css `.files-*` portu (yalnız tablo-yolu sınıfları; renkler `var(--*)`); demo guard'lar. **Test:** +41 (`company-files-routes` 14 [RBAC/validasyon/snapshot/SVG-attachment] · `company-files-db` 10 [saf yardımcılar + orphan/soft-delete/bucket/mig source-lock] · `dosyalar-tab` 12 RTL [arama/filtre/sıralama/modal/silme/DnD kilitleri] · settings-tabs/page-tabs güncel); tsc 0 · lint 0 · **5032 test / 361 dosya** · build 0 (3 route manifest'te). **Kalan:** mig.091 APPLY + manuel smoke (yükle/DnD/önizle/indir/sil/kota/tema).

**Önceki iş:** **İç kullanıcıya özel bakım alanları — API Anahtarları + AI gözlem ekranı müşteri admininden gizlendi** (2026-06-11; GREEN). `INTERNAL_OPERATOR_EMAILS` + `view_settings` birleşimi tek server-side `internal-access` kaynağı oldu; env boşsa fail-closed. `/api/auth/me` yalnız boolean `internalOperator` döndürür; client context yükleme/hata durumunda false. Ayarlar artık Sistem / Bakım / Kişisel gruplu; müşteri admini Firma+Kişisel görür, `?tab=api|yapay-zeka` → firma fallback; internal operator Bakım grubunu görür. `/api/settings/api-keys-status` ve `/api/ai/observability` guard'lı (anon 401, müşteri 403); Paraşüt Sync/OAuth müşteri admininde korundu. Migration YOK. **Doğrulama:** tsc 0 · lint 0 · **4991 test / 358 dosya** · build 0. **Deploy:** Coolify'da bakım hesabı için `INTERNAL_OPERATOR_EMAILS=<eposta>` set edilmeli.

**Önceki iş:** **Uyarılar — kullanıcı notları / hatırlatmalar (user_note, mig.090)** (2026-06-11; GREEN). **İstek:** "kullanıcı kendi uyarısını/notunu oluşturabilsin." **Kararlar (AskUserQuestion, 4/4 önerilen):** serbest not + hatırlatma tarihi / herkese ortak / vade geçince severity yükselt / view_alerts olan herkes oluşturur. **Backend:** mig.090 (`alerts_type_check` += user_note + `due_date` date + `created_by` text kolonları, **APPLY EDİLDİ ✅** + canlı smoke: escalation seed→scan→warning doğrulandı); `POST /api/alerts` — YALNIZ type=user_note yazar (sistem/AI tipi enjekte edilemez; severity=info, source=ui damgalı), validasyon (başlık zorunlu ≤200 / açıklama ≤2000 / due_date YYYY-MM-DD ve bugünden ileri), `created_by` session snapshot (full_name || email), RBAC `requirePermission("view_alerts")`; `dbEscalateOverdueUserNotes` — due_date geçmiş aktif info notlar warning'e (scan route'unda non-fatal, yanıt `noteEscalated`); enrichment user_note için due_date'i satırın KENDİ kolonundan okur ("Hatırlatma" etiketi). **UI:** CalendarHeader "✎ Not" butonu (demo guard) → `NoteFormModal` (başlık/açıklama/tarih, Escape+focus-dönüş, hata satırı) → POST → refetch+toast; yeni "Notlar" sekmesi (`user_note`); drawer'da "Oluşturan" satırı; not takvimde yazıldığı gün + hatırlatma gününde görünür (mevcut occurrence mekaniği). Scan'ler notlara dokunmaz (orphan/AI dedup kapsamı dışında — source-lock testli). **Test:** +15 (`user-note-alerts`: POST validasyon/RBAC/enjeksiyon-kilidi/created_by + escalation & enrichment & UI source-lock + Notlar sekmesi); alerts-page-labels güncel; tsc 0 · lint 0 · **4976 test** (356 dosya) · build 0. **Kalan:** mig.090 APPLY + manuel smoke (✎ Not → form → kaydet → takvimde bugün + hedef günde; tarih geçince Tara → warning; drawer Oluşturan). <details><summary>Önceki: Genel Bakış — Finansal Özet kaldırıldı (2026-06-11)</summary>

**Önceki iş:** **Genel Bakış — Finansal Özet paneli kaldırıldı, Stok Dağılımı tam-genişlik revize** (2026-06-11; GREEN). **İstek:** "Finansal özet kısmını kaldırıyoruz; stok dağılımını finansal özetin yerini karşılayacak şekilde revize et, sonra her şeyi push." **Yapılan:** `FinancePanel.tsx` + tek tüketicisi olduğu `AgingBars.tsx` SİLİNDİ; `financeSummary`/`grossToNetRevenue`/`REPORTING_VAT_RATE`/`FinanceSummary` view-model'den çıkarıldı (tek tüketici paneldi); maliyet granülerlik notu trend paneline taşındı (`costGranularityNote &&` bloğu). **StockPanel revize (tam genişlik):** Satır 1 artık tek panel — donut (188px) + paylı legend (her kategori %pay + 4px pay çubuğu) + sağda dikey ayraçlı özet kolonu (Toplam Stok Değeri hero + Aktif ürün / Kritik stok (≤min, danger-tint) / Risk bandında (≤min×1.5, warning-tint) sayıları; `stockStats` page'de products'tan türetilir). Rapor (`DashboardReport`): "Finansal Özet" bölümü kaldırıldı; Stok Dağılımı tablosuna Pay sütunu (%xx.x + %100 toplam) + altına aktif/kritik/risk özet satırı; `finance`/`financeNote` propları kalktı, `stockStats` geldi. Alacak Yaşlandırma: önce raporda korunmuştu, **ardından kullanıcı kararıyla rapordan da kaldırıldı** — `receivables`/`canViewFinance` propları + page'deki `receivablesAging` çağrısı silindi (Açık Alacak KPI'ı `buildKpis` içinde hesaplamaya devam eder, helper view-model'de canlı). **Test:** overview-panels-render FinancePanel→StockPanel describe (5 yeni), charts-render AgingBars çıktı, view-model financeSummary bloğu çıktı, preservation yeni diziliş kilidi (tek grid satırı + `<FinancePanel` geri gelmez + financeSummary çağrısı geri gelmez), report-render Pay/%100/Aktif-ürün + `not.toContain("Alacak Yaşlandırma")`, preservation `receivablesAging` page'de geri gelmez; tsc 0 · lint 0 · **4959 test** (355 dosya) · build 0. <details><summary>Önceki: Uyarılar sistemi tutarlılık + kapsam turu (2026-06-11)</summary>

**Önceki iş:** **Uyarılar sistemi tutarlılık + kapsam turu — churn fix, AI revamp, quote/PO vade uyarıları** (2026-06-11; GREEN; `f9e88ed`). **İstek:** "uyarılar sayfası genel ERP'nin uyarı merkezi olsun — tutarlı mı, atlanan/yanlış var mı, backend kapsamlı mı; önerilerini sun." Analiz 3 ciddi tutarlılık sorunu + kapsam boşlukları buldu; kararlar AskUserQuestion ile alındı (fix paketi 4/4 · purchase_recommended→Satın Alma'ya devret · AI source=ai sekme+sınırlı üretim · V7 teklif+PO gecikme kapsamı; model: **Haiku kalır** — maliyet kaygısı, kalite girdiden gelir, `MODEL` tek sabit→gerekirse Sonnet'e tek satır). **Tutarlılık:** (1) `order_deadline` resolve+create churn'ü → `dbUpdateActiveAlertContent` ile YERİNDE tazeleme (6h cron'da günde 4 "çözüldü" kopyası üretiyordu; severity değişimi bilinçli resolve+create kaldı); (2) takvim fetch'i limitsiz select'ti → Supabase 1000 satır tavanında SESSİZCE kesiliyordu → `dbListAlertsForCalendar` (tüm aktifler + son 6 ay kapanmış, explicit 5000 limit; route query-filtreli eski sözleşmeyi korur); (3) sidebar sayacı open+acknowledged (sayfayla aynı tanım); (4) yoksay satırı silmek yerine dismissed işaretler; (5) domain-rules §6.1 warning kodla hizalandı (min×1.5 + fiziksel/promisable eksen notu). **Satın alma devri:** ölü zincir silindi — `/api/purchase/scan`+`/api/purchase/suggestions`+`purchase-service.ts` hiçbir cron/UI çağırmıyordu (canlı yol ai_recommendations/copilot); DR-7 testi ölü servisi ölçüyordu→silindi; "AI Öneriler"→"AI Bulgular" sekmesi type yerine **source=ai** (`matchesAlertClass` tek matcher, tip sekmeleri AI'ı dışlar→çifte sayım yok; tarihi purchase_recommended kayıtları source=ai→görünür kalır). **AI revamp:** `aiGenerateAlertFindings` — riskli ürün alt kümesi ≤30 zengin satır (promisable/coverage/lead/shortage/yoldaki-PO `dbGetIncomingPOQuantities`) + tool-use yapılandırılmış çıktı (regex JSON yok) + product_id doğrulama (halüsinasyon at) + kural-tekrarı yasak prompt + max 6 bulgu severity info|warning (§6.3 kırmızı üretmez); `serviceGenerateAiAlerts` entity-bağlı `stock_risk` yazar, aktif AI alert'i yerinde günceller, bulgusu geçeni `ai_finding_cleared` resolve eder, kural-stok-alert'li/24h-yoksayılmış ürüne eklemez; toptan `dbDismissAlertsBySource` churn'ü kalktı (entity'siz eskiler tek seferlik `legacy_entityless_ai_alert` dismiss); `ai_runs.feature` += alert_findings. **Yeni kapsam:** mig.089 `alerts_type_check` += **po_overdue** (**UYGULANMADI** ⚠️); PO taraması scan route'unda stok taramasıyla aynı lock'ta non-fatal (089 uygulanana dek CHECK hatası yutulur); V7 **sent** teklif süresi dolunca `quote_expired` (entity_type=quote; draft sessiz; revizyon `quote_revised` ile kapatır; dedup unique-idx); `alert-due-dates` 3 eksene genişledi (sales_orders/quotes/purchase_orders tablo-başına tek batch; "Beklenen Teslim"/"Teklif Geçerlilik" + po_number/quote_number); drawer süre-uzat formu `entityType==="sales_order"`'a kilitlendi (quote-entity'de `/dashboard/quotes/[id]`, po_overdue'da `/dashboard/purchase/orders/[id]` derin link); "Sevkiyat & Teklif" sekmesi → **"Vadeler"** (overdue_shipment+quote_expired+po_overdue). **Test:** +35 yeni (`po-overdue-scan` 7 · `ai-alert-findings` 6 · `alerts-consistency-locks` 11 · due-dates +3 · lifecycle AI bloğu yeniden · quote expire 6), 13 güncellendi; tsc 0 · lint 0 · **4964 test** (355 dosya) · build 0 (ölü route'lar manifest'ten düştü). **Kalan:** mig.089 APPLY + manuel smoke (Tara→po_overdue/quote_expired üretimi; AI Öner→entity-bağlı bulgular; sekme sayaçları; drawer derin linkler). <details><summary>Önceki: Veri Aktarım Merkezi sadeleştirme — dosya-önce hub (2026-06-10)</summary>

**Önceki iş:** **Veri Aktarım Merkezi sadeleştirme — dosya-önce hub + Excel sihirbazı ayrı sayfa** (2026-06-10; PUSH EDİLDİ `a633632` mirror; `7b58154`+`eb489cc`). **İstek:** "inanılmaz karmaşık ve işlevi kalabalık — sadeleştir, mantıklı zemine oturt." **Kararlar (AskUserQuestion):** dosya-önce giriş / sihirbaz ayrı sayfa / ölü uç temizliği / rehber küçültme. **Faz 1 (`7b58154`):** UI'sız `POST /[batchId]/parse` + drafts POST (GET kaldı) + `serviceAddDraftsToBatch` + `aiBatchParse`/`BATCH_PARSE_SYSTEM` silindi (grep doğrulamalı; `FALLBACK_FIELD_MAP`/`fallbackParseRow` CANLI=detect-columns); eval-runner/acceptance-eval/README hizalandı; POST-yok regression-lock. **Faz 2+3 (`eb489cc`):** Hub 1595→~210 satır — tek DropZone ("Dosyanı bırak — PDF · Excel · görsel"), uzantı yönlendirme: Excel→`/dashboard/import/excel` (AI maliyeti yok), PDF/görsel→AI kuyruğu; `import-file-transfer.ts` singleton (stash/take oku-ve-temizle; deep-link boş→kendi dropzone); ImportGuide(290) silindi→şablon satırı+tip-özel dropdown+tek satır güven notu (tam notlar tooltip); import-guide.ts küçüldü (IMPORT_STEPS+buildOperationTargets öldü, kalan exportlar canlı). Sihirbaz 7 adım birebir taşındı (remember/inline-edit-rollback/field-approval/bulk-fill/overwrite/rapor/demo-guard/25MB/E2E locator korundu); **stok sheet'lerinde Sayım/Hareket radio** + apply-mappings `sheets[].operation_type` (grid kalkınca sessiz stock_count düşüşü önlendi; explicit seçim isim-çıkarımını yener). **İşlem türü:** classify `operation_type` opsiyonel → `defaultOperationForDocumentType` belge tipinden türetip damgalar; ClassifierQueue chip damgadan okur (`onOpenExcelWizard(file)` CTA); ExtractionReview'a işlem select + "Hedef: modül — ne olur" satırı; extract body `operation_type` override (persist). Çift yönlü kaçış: sihirbaz "AI ile analiz et"→hub, kuyruk migration_excel→"Excel sihirbazında aç". RBAC otomatik (page-access prefix). **Test:** faz3d+guide-render silindi; yeni `import-hub`(11)+`import-excel-wizard`(19, regression-lock dahil); 8 test dosyası path/davranış güncellendi; Playwright→`/dashboard/import/excel` goto. tsc 0 · lint 0 · **4943 test** (5068'den: ~155 ölü-yol testi silindi, +30 yeni) · build 0 (hub+excel+extract manifest'te). **Kalan:** push (ff main+both) + manuel smoke (Excel bırak→sihirbaz otomatik; PDF→classify→İncele→apply; migration_excel CTA; deep-link boş dropzone; demo guard). <details><summary>Önceki: Genel Bakış — döviz + dönem segmenti + rapor (2026-06-10)</summary>

**Önceki iş:** **Genel Bakış — döviz tasarımı + işlevsel dönem segmenti + gerçek yazdırılabilir rapor** (2026-06-10; GREEN). **İstek (ekran görüntüsü):** (1) üst bardaki döviz gösterimi tasarıma uymuyor; (2) `Bugün/Hafta/Ay/Çeyrek` segmenti hiçbir şeyi filtrelemiyor; (3) `Rapor indir` ekran görüntüsü HTML basıyor → "adam akıllı" rapor istendi. **Kararlar (AskUserQuestion):** döviz→tasarıma uy; segment→işlevsel filtre; rapor→yazdırılabilir PDF (içerik = Detaylı + zengin künye). **(1) Döviz:** `ExchangeRatesTicker.tsx` → tasarım `RateChip` portu (Alış kalın / Satış yeşil `--success-text`, 2 ondalık, dikey ayraç); fetch/source + gerçek `● Bağlı` korundu (sabit "Sistem aktif" ALINMADI). **(2) Segment:** yeni saf `periodModel`+`revenueByPeriod`/`orderCountsByPeriod`/`cogsByPeriod`/`productionInPeriod` (`dashboard-view-model.ts`); Ciro+Üretim KPI+Trend+Finans seçili döneme göre (Ay 12ay·Çeyrek 4·Hafta 12·Bugün 14g); 4 snapshot KPI **anlık** etiketli (geçmiş snapshot yok→sahte veri yok); boş-durum "Bu dönemde sipariş yok" (advisor kapısı); Hafta/Bugün COGS aylık-RPC kovalanamaz→maliyet hattı gizli+granülerlik notu; CSS `"on"`→`is-active`; **advisor blocker fix** `productionInPeriod` tüm-pencere→`currentIndex` kovası. **(3) Rapor:** yeni `DashboardReport.tsx` (ekran görüntüsü DEĞİL; `.dashboard-print-report` baskıda/`.dashboard-screen-only` gizli; 9px override ezildi); içerik = Roven logo+başlık+tarih·dönem·firma·para+**Hazırlayan** (`/api/settings/user/profile`) → KPI · Finansal Özet · trend tablosu · Stok(+Toplam) · Alacak · Son Siparişler(10) · Kritik Uyarılar(TÜM); RBAC maskeli; reorder/üretim/AI seçilmedi→yok. **Testler:** view-model period + `dashboard-report-render` (renderToStaticMarkup+RBAC) + `dashboard-segment-report` (source-regression); 4 mevcut test (ticker/topbar/overview-preservation) güncel. tsc 0 · lint 0 · **5068 test** · build 0. **Kalan:** görsel smoke (segment toggle + PDF önizleme; logo/Hazırlayan/bölüm sırası).</details> <details><summary>Önceki: Yeni Teklif sayfasına çift-onaylı inline "Gönder" butonu (2026-06-10)</summary>

**Son tamamlanan iş:** **Yeni Teklif sayfasına çift-onaylı inline "Gönder" butonu** (2026-06-10; GREEN). **İstek:** `/dashboard/quotes/new`'de yalnız "Önizle & PDF" + "Kaydet" vardı; kullanıcı buraya "Gönder" istedi — iki kez onay + hatasız. **Önceden** gönderim yalnız teklif **detay** sayfasındaydı (önce Kaydet → detaya git → Gönder). **Yaklaşım:** `QuoteForm` ortak (yeni + detay); yeni `enableInlineSend` prop'u **yalnız** new sayfasında Gönder'i açar (detayın kendi header Gönder'i → çift buton önlenir). **Çift onay:** `sendStep` 0→1→2 (Modal 1 rezerve notu + e-posta checkbox · Modal 2 son onay). **Ön-validasyon** sunucu sözleşmesini BİREBİR aynalar (`validateQuoteForSend`/`validateQuoteLineQuantities` client'tan import) → manuel-kod/adres-yok satır **iki onaydan ÖNCE** bloklanır (400 yememe). **Çekirdek:** `handleSave`'den `persistQuote({skipUrlSync})` çıkarıldı; `handleSendInline` = persist (replaceState YOK → push desync hazard elenir) → `sent` transition → sonuç toast → (e-posta) → `router.push` detaya. `suppressAutoSaveRef` + draft localStorage temizliği (clear→nav penceresi). **Drift önleme:** yeni `_utils/send-result.ts` (`applySendResultToast` cascade: arşiv>rezervasyon>shortage>başarı + `sendQuoteEmail`); detay sayfası da artık buna delege (inline kod taşındı, davranış korundu). **Yeni butonlar aynı 088 RPC'sini çağırır** (detay ile birebir). +yeni source-regression test (`quotes-new-inline-send`) + 4 mevcut test helper refactor'a göre güncellendi. tsc 0 · lint 0 · **5036 test** · build 0. **⚠️ Runtime smoke `migration 088 APPLY` gerektirir** (uygulanmazsa ilk tık "stok rezervasyonu oluşturulamadı" → kırık görünür; aşağıdaki açık yükümlülük). **Sıradaki smoke:** Kaydet-sonra-Gönder alt-vakası (skipUrlSync'in tam nötrlemediği tek yol) + plan §Manuel smoke. <details><summary>Önceki: Teklif gönderilince stok rezervasyonu (bekleyen sipariş) (2026-06-10)</summary>

**Son tamamlanan iş:** **Teklif gönderilince stok rezervasyonu (bekleyen sipariş)** (2026-06-10; GREEN, **PUSH/APPLY BEKLİYOR**). **Kullanıcı senaryosu:** aynı 10 stoğu iki satışçı iki müşteriye teklif edip ikisi de kabul ederse stok -10 → oversell. **Kullanıcı kararı (AskUserQuestion):** rezervasyon teklif **GÖNDERİLİNCE** (accept'te değil); kabul edince sipariş otomatik **Onaylı**. **Yaklaşım (Strateji A):** teklif `draft→sent`'te accept'in teklif→sipariş dönüşümünü öne çek ama `pending_approval` + `allocate_order_lines` ile rezerve et (sipariş-merkezli motoru reuse; kullanıcının "sipariş ekranında da bekliyor" beklentisiyle birebir). **Birleşik yaşam döngüsü:** sent→pending sipariş+rezerve · accepted→approve_order (Onaylı) · rejected/expired/revised→cancel_order (rezerv release). **Migration 088:** `send_quote_and_create_pending_order` (077 gövdesi ama pending+allocate; **zero-stock'ta RAISE YOK** = lenient, kısmi+shortage; arşiv NULL olabilir; idempotent quote_id) + `accept_quote_and_create_order` REVİZE (bağlı pending varsa approve_order, yoksa legacy draft create fallback) + `cancel_quote_linked_order` (cancel_order reuse). **Servis (`quote-service.ts`):** sent→`dbSendQuoteCreatePendingOrder` (reservationWarning/shortages/reservedOrderNumber → QuoteTransitionResult, archiveWarning paterni); rejected/expire/revise→`dbCancelQuoteLinkedOrder` (best-effort). **DB helper** (`quotes.ts`): `dbSendQuoteCreatePendingOrder`/`dbCancelQuoteLinkedOrder`. **Route:** sent yanıtı shortage/uyarı taşır. **UI** (`quotes/[id]`): gönder onayında "stok rezerve edilecek" notu + shortage/uyarı toast'ları. **Stok modeli değişmedi** (`quoted`=draft sipariş; send-yaratımı pending zaten `reserved` → çift sayma yok). domain-rules §4.4/§5.1 + CLAUDE.md güncellendi. **+16 test** (servis lifecycle + migration source-regression + UI). tsc 0 · lint 0 · **5021 test** · build 0. **Bilinen edge:** quote-pending siparişi orders'tan elle iptal → rezerv gider, teklif sent kalır (kabul). **Sıradaki:** push + **migration 088 APPLY** (Supabase) + smoke (gönder→available_now düşer→ikinci teklif kısmi→reddet→geri yükselir→kabul→Onaylı). <details><summary>Önceki: Teklif arşiv belgesi render fix + demo e-posta nötrleştirme (PUSH `d9ef1c3`)</summary>

**(A) Arşiv "Belgeyi Aç" / "Arşivlenmiş Teklif" bug:** yeni sekmede ham HTML kaynağı + UTF-8 mojibake (`ArÅŸivi`/`â€"`) gösteriyordu. **Kök neden:** Supabase storage signed URL'i donmuş arşiv HTML'ini `text/html` render etmiyor (stored-XSS koruması → metin/indirme). **Çözüm:** arşiv route'una **`?view=1` modu** — HTML'i kendi origin'imizden `Content-Type: text/html; charset=utf-8` ile DOĞRUDAN stream eder (yeni `dbDownloadArchiveHtml` helper: `storage.download()`→`.text()`). Buton artık fetch beklemeden **senkron `window.open(?view=1)`** → await-sonrası açılışı engelleyen popup-blocker da elenir (iki sebep tek fix'le çözülür — advisor: download→text→re-encode zinciri hem MIME hem charset hem disposition'a dayanıklı). Eksik arşiv/403 → ham JSON yerine yeni sekmede dostça HTML hata sayfası (`htmlError`). JSON modu (signed URL) geriye uyumlu korundu. `orders/[id]`+`quotes/[id]` butonlarından `archiveLoading`/`loading` kaldırıldı (aksiyon artık senkron). **(B) Demo e-posta mayını:** seed + mock-data'daki 4 müşteri (Tüpraş/Abdi İbrahim/Enerjisa/Ülker) **gerçek firma domain'lerine** işaret ediyordu; smoke'ta kullanıcı yanlışlıkla `procurement@abdibrahim.com.tr`'ye gerçek teklif gönderdi (Resend "Sent", bounce yok → muhtemelen Exchange spam/karantina; özür gereksiz). Fix: tüm müşteri e-postaları **`@*.example.com`** (RFC 2606, asla teslim edilmez); firma adları korundu; `info@pmt.com.tr` (satıcı, gönderim hedefi değil) dokunulmadı. **+6 test** (3 view-mode route 200/404/403 + 2 download helper + 1 seed regression yok→source); 3 source-regression güncellendi. tsc 0 · lint 0 · **5004 test** · build 0. **Smoke gümüş astar:** bounce yok = EMAIL_FROM + Resend + `.html` ek pipeline'ı çalışıyor (Aşama 1 fiilen yeşil). **Sıradaki:** (1) arşiv fix deploy sonrası görsel doğrula — "Belgeyi Aç" → render edilmiş belge + doğru Türkçe (mojibake yok); (2) `.html` eki smoke Aşama 2 (kendi Gmail+Outlook, müşteri e-postasını kendi adresinle değiştir). <details><summary>Önceki: Teklif "Gönder" → müşteriye HTML ekli e-posta (PUSH `5ecc104`)</summary>

Teklif "Gönder"e basınca müşteriye teklif belgesi `.html` ekli e-posta. Karar: HTML eki (binary PDF yok); tetik = "Gönder" onayına checkbox (varsayılan işaretli). Mimari: transition saf kalır, e-posta ayrı reusable endpoint. 6 kod + 6 test: (1) `sendDirectEmail` attachment primitifi; (2) `renderQuoteToCustomer` müşteri şablonu (`hideManageFooter` → dashboard footer gizli, XSS escape); (3) `serviceSendQuoteToCustomer` (arşivle birebir pipeline, `no_email` guard, email_logs entity_type='quote'); (4) `POST /api/quotes/[id]/send-email` (`manage_quotes` RBAC; 404/400/503/502 map); (5) `dbListFailedEmailsForRetry` NULL-safe `.or("entity_type.is.null,entity_type.neq.quote")` quote retry exclusion; (6) frontend draft confirm + checkbox + post-transition POST. ADVISOR 4 not: uçtan uca doğrulanmadı; `.html` Exchange strip riski → önce smoke; RBAC temiz; frozen yerine re-render (gelecek "Tekrar Gönder" frozen ekle). 4999 test · build 0. Drift fix `458c14b` (CTA fallback URL+`.env.example`→erp.getmedspace.com) önceden mirror'a gitmişti.</details>

(B) Demo e-posta nötrleştirme + arşiv render fix detayı yukarıdaki blokta; `d9ef1c3` mirror'a push edildi.</details></details></details></details></details></details>

### Açık yükümlülükler (kullanıcı doğrulamalı — yeşil testler kapsamaz)
- **Migration 091 APPLY (Supabase):** `company_files` tablosu + `company-files` storage bucket. Uygulanana dek Ayarlar → Dosyalar sekmesi GET hatası gösterir (Yeniden Dene'li hata durumu; başka akış etkilenmez).
- **⚠️ Migration 088 APPLY (Supabase) — BLOKER:** `send_quote_and_create_pending_order` + revize `accept_quote_and_create_order` + `cancel_quote_linked_order` canlı DB'ye uygulanmalı. Uygulanmazsa teklif "Gönder" (hem detay hem yeni-teklif inline buton) ilk tıkta "stok rezervasyonu (bekleyen sipariş) oluşturulamadı" toast'ı verir + bekleyen sipariş/`available_now` düşüşü olmaz → kırık görünür. Smoke'tan ÖNCE uygula.
- **Teklif gönder rezervasyon smoke:** gönder→`available_now` düşer + orders'ta bekleyen sipariş → ikinci teklif aynı stoktan fazlası → kısmi+shortage → reddet→geri yükselir → kabul→Onaylı. Yeni-teklif inline butonda ayrıca **Kaydet-sonra-Gönder** alt-vakası (skipUrlSync'in tam nötrlemediği navigasyon yolu).
- **Teklif e-posta smoke (bu oturum):** Aşama 1 — `EMAIL_FROM`'u `/api/email/test` ile doğrula; Aşama 2 — gerçek teklif "Gönder" → kendi Gmail + Outlook/Exchange → `.html` eki sağlam mı / spam'e düşüyor mu. Sorunluysa PDF-API yoluna geç.
- **Login "Monolith" deploy ön koşulları** (push `27733c6`; canlı tur doğrulanmadı):
  1. **Supabase "Allow new users to sign up" = OFF** (BİRİNCİL kilit — kapalı değilse self-signup oturumu `/api/seed` gibi ALWAYS_PUBLIC uçlarda hâlâ risk).
  2. **⚠️ BRICK RİSKİ:** prod admin `app_metadata.roles` taşımalı VEYA `ADMIN_EMAILS` her iki Coolify env'inde set olmalı — yoksa `isProvisionedUser` guard herkesi kilitler (kurtarma: Supabase dashboard'dan app_metadata set).
  3. **Canlı Google OAuth turu** (testler mock'lu): Supabase Google provider etkin + redirect-URL allowlist `…/auth/callback` + tarayıcı smoke.
- **Paraşüt Faz 12 — Sandbox GATE:** gerçek Paraşüt API ile OAuth + list filtreleri + e-doc trackable_job + stok invariant doğrulamaları (`PARASUT_PLAN.md` §Faz 12).

### Son dönem oturum indeksi (en yeniden eskiye — detay git log'unda)
- Dashboard: Teklif Hattı + Yoldaki Mal kartları — 7 KPI + href navigasyon + subTone
- Dashboard doğruluk turu — üretim limit-50/yalnız-approved ciro/FX hariç-tut+uyarı/etiket + Açık Alacak kaldırıldı
- Ayarlar → Dosyalar sekmesi — şirket dosya arşivi (handoff implement, mig.091)
- İç kullanıcıya özel bakım alanları (INTERNAL_OPERATOR_EMAILS, Bakım grubu)
- Uyarılar: kullanıcı notları/hatırlatmalar (user_note, mig.090)
- Genel Bakış: Finansal Özet kaldırıldı, Stok Dağılımı tam-genişlik revize
- Uyarılar sistemi tutarlılık + kapsam turu — churn fix, AI revamp, quote/PO vade uyarıları (`f9e88ed`)
- Veri Aktarım Merkezi sadeleştirme — dosya-önce hub + Excel sihirbazı ayrı sayfa + ölü uç temizliği (`7b58154`+`eb489cc`)
- Genel Bakış — döviz RateChip tasarımı + işlevsel dönem segmenti (periodModel) + gerçek yazdırılabilir rapor (DashboardReport)
- Yeni Teklif sayfasına çift-onaylı inline "Gönder" butonu + paylaşılan send-result helper
- Teklif gönderilince stok rezervasyonu (bekleyen sipariş) — migration 088
- Genel Bakış — panel yerleşimi yeniden düzenlendi (drift fix `458c14b`)
- Genel Bakış TAM-SADIK yeniden kurulum (`b2481a1`)
- Uyarılar → Takvim Görünümü — Faz 3 (cila/responsive/a11y) (PUSH `ddac29d`)
- Uyarılar Takvim — Faz 2 (drawer zenginliği)
- Uyarılar Takvim — Faz 1 (iskelet + enrichment + temel drawer)
- Login "Monolith" (F) redesign — TR/EN + tema + Google OAuth + şifre sıfırla
- Null-SKU kapatma — İncele ekranında yeni-ürün SKU girişi (`c7db606`/`7e9654b`)
- Faz D-POC — tam-otomatik katalog→ürün görseli (mupdf WASM) (`4253696`)
- Veri Aktarım yazma yolları — Faz A·B·C·D epic (`bdcdbee`)
- Veri Aktarım Merkezi — rehber + şeffaflık katmanı
- Roven hexagon logo — component + topbar/login/favicon ince ayarları
- Marka rename (KokpitERP → Roven) + main hizalama
- Tema sistemi — Koyu + Aydınlık (Cool slate)
- Topbar "Sakin düz" yeniden tasarım + uyarı butonunu kaldırma (`bf28fb0`)
- Dashboard AI Özeti + Aktif Uyarılar collapsible (`44d4e54`)
- Teklif formu ürün açılır-listesi kırpılma fix'i (`QuoteForm.tsx`)
- Görsel QA (codex) + iki-branch hizalama + PUSH (`1ef3c8e`)
- Branch hizalama audit'i — son commitlerin detaylı kod incelemesi + 3 bulgu (`5265a08`)
- İki branch'i hizalama — codex-experiment ↔ main birleştirme (`56ecbd1`/`39c0d07`)
- Ürün Tipleri sayfası — final ürün (alan düzenleme UI + N+1 fix + a11y modal) (`0914b28`, codex merge'inde superseded)
- Satın Alma Siparişi (Yeni) — birim fiyat + KDV auto-fill (`2509dcf`)
- Ayarlar sayfası — final ürün (modal a11y + tablist a11y + entity render bug + hata mesajı paritesi) (`b37764a`)
- Cariler (Müşteriler) sayfası — final ürün (toplu-silme bayat satır + hover antipattern + modal a11y + validation parity) (`c8057e5`)
- Üretim Girişi sayfası — final ürün (BOM şeffaflığı + silme onayı + a11y) (`0504bdc`)
- Tedarikçiler sayfası — final ürün (a11y modal + görünür yükleme hatası + toplu-seçim kapsamı) (`95ad46e`)
- Satın Alma Siparişleri sayfası — final ürün 2. tur (`448c548`)
- Paraşüt Sync sayfası — final ürün (`ca34198`)
- Satın Alma Siparişleri sayfası — final ürün 1. tur (`470578c`)
- Öneriler (Satın Alma Önerileri) sayfası — eksik kapatma + canlı E2E (`5e6e097`)
- Stok & Ürünler sayfası — eksik kapatma + canlı E2E (`982c4bb`)
- Satış Siparişleri Faz 3 — pending_approval rezervasyon (`40731af`, migration 082)
- Satış Siparişleri Faz 1+2 (`e9c6ac6`, migration 081 APPLY EDİLDİ ✅)
- Faz 6 Bulgular 2. tur (`9a57d66`, 077/078 APPLY EDİLDİ ✅)
- Teklif V7 Faz 6 Bulgular 1. tur (`b17181e`, 077 APPLY EDİLDİ ✅)
- Teklif V7 Faz 6 — Accept → Sipariş (atomik) (`d4988ca`, migration 077 APPLY EDİLDİ ✅)
- Teklif V7 Faz 4 — PDF Arşiv (`6c9c317`, migration 075/076 APPLY EDİLDİ ✅) + Bulgular 1-4. review tur
- Teklif V7 Revizyon Zinciri (`1d96211`, migration 074 APPLY EDİLDİ + review pass)
- Faz 5 infra dilim — numara katmanı (`942ee0d`, migration 073 APPLY EDİLDİ)
- Faz 3 review düzeltmeleri (Bulgular P1-P3, 2 tur, `6366cbd`+`11c5079`, migration 070-072 APPLY EDİLDİ)
- Faz 3 ilk implement (`c5d8267`, migration 070/071 APPLY EDİLDİ)
- Faz 2 (önceki, `afe936b`)

---

## Proje Özeti
PMT Endüstriyel için yapay zeka destekli ERP sistemi. Endüstriyel vana satışı (B2B).
**Stack:** Next.js 15 · TypeScript · Supabase (aktif, 18+ migration) · Tailwind CSS kurulu ama kullanılmıyor (inline styles kullanıyoruz)

---

## Bu Projeyi İlk Açıyorsan

Okuma sırası:
1. `README.md` — kurulum + env + migration
2. `domain-rules.md` — sistemin ne yapması/yapmaması gerektiği (source of truth)
3. `src/lib/database.types.ts` — DB tablo şeması (snake_case)
4. `src/lib/api-mappers.ts` — DB ↔ frontend veri dönüşümleri

---

## Kritik Kodlama Kuralları

### Stil: Sadece Inline Styles + CSS Variables
```tsx
// DOĞRU
<div style={{ color: "var(--text-primary)", padding: "16px" }}>

// YANLIŞ — Tailwind class kullanma
<div className="text-white p-4">
```

### Animasyon Yasak
- Framer Motion **kurulu ama YASAK** — import etme
- CSS `animation` ve `transition` sadece gerekli yerde (hover, progress bar gibi)

### Her interaktif component için
```tsx
"use client";
```

### Renk değerleri: Her zaman CSS variable
```
var(--text-primary)    var(--text-secondary)   var(--text-tertiary)
var(--bg-primary)      var(--bg-secondary)      var(--bg-tertiary)
var(--border-primary)  var(--border-secondary)  var(--border-tertiary)
var(--accent)          var(--accent-bg)          var(--accent-text)     var(--accent-border)
var(--success)         var(--success-bg)         var(--success-text)    var(--success-border)
var(--warning)         var(--warning-bg)         var(--warning-text)    var(--warning-border)
var(--danger)          var(--danger-bg)          var(--danger-text)     var(--danger-border)
```

---

## Proje Yapısı

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                    — Ana dashboard
│   │   ├── layout.tsx                  — Sidebar + Topbar wrapper
│   │   ├── orders/
│   │   │   ├── page.tsx                — Sipariş listesi
│   │   │   ├── new/page.tsx            — Yeni sipariş formu
│   │   │   └── [id]/page.tsx           — Sipariş detay + durum geçişleri
│   │   ├── products/page.tsx           — Stok & Ürünler
│   │   ├── customers/page.tsx          — Cariler
│   │   ├── production/page.tsx         — Üretim kaydı (ses + form)
│   │   ├── import/page.tsx             — AI dosya içe aktarma (7-adım wizard)
│   │   ├── alerts/page.tsx             — Üretim & Stok uyarıları
│   │   ├── parasut/page.tsx            — Muhasebe sync dashboard
│   │   ├── purchase/suggested/page.tsx — Yeniden sipariş önerileri
│   │   └── settings/page.tsx           — Firma + kullanıcı + API ayarları
│   ├── api/                            — Route handler'lar (Next.js App Router)
│   │   ├── health/                     — Sağlık kontrolü
│   │   ├── orders/                     — CRUD + durum geçişleri
│   │   ├── products/                   — CRUD
│   │   ├── customers/                  — CRUD
│   │   ├── production/                 — CRUD
│   │   ├── alerts/                     — CRUD + scan
│   │   ├── import/                     — Batch → drafts → confirm akışı
│   │   ├── ai/                         — parse + score endpoint'leri
│   │   └── parasut/                    — sync-all, retry, stats, invoices, logs
│   └── globals.css                     — CSS variables (dark theme)
├── components/
│   ├── layout/                         — Sidebar, Topbar
│   ├── dashboard/                      — StatsCards, RecentOrders, AIAlerts
│   ├── ui/                             — Button, Toast, DemoBanner
│   └── customers/                      — CustomerDetailPanel (sağ panel)
└── lib/
    ├── supabase/                        — DB client + tablo query fonksiyonları
    │   ├── service.ts                   — Supabase service client (RLS bypass)
    │   └── orders.ts, products.ts,      — Her tablo için query fonksiyonları
    │       customers.ts, alerts.ts,
    │       production.ts, sync-log.ts, import.ts
    ├── services/                        — İş mantığı katmanı
    │   ├── order-service.ts             — Sipariş geçişleri, rezervasyon tetikleme
    │   ├── alert-service.ts             — Alert yaşam döngüsü
    │   ├── production-service.ts        — BOM etkileri, üretim tamamlama
    │   ├── purchase-service.ts          — Yeniden sipariş önerisi hesaplama
    │   ├── parasut-service.ts           — Sync, retry, sync-all
    │   ├── import-service.ts            — Batch → draft → merge pipeline
    │   └── ai-service.ts               — Claude Haiku: parse, score, risk
    ├── database.types.ts                — Supabase tablo tipleri (snake_case)
    ├── api-mappers.ts                   — DB row → frontend model dönüşümleri
    ├── mock-data.ts                     — Frontend interface tanımları (camelCase)
    ├── data-context.tsx                 — Global React context (gerçek API'ye bağlı)
    ├── api-error.ts                     — Merkezi hata yönetimi
    └── stock-utils.ts                   — coverage_days, daysColor yardımcıları
supabase/
└── migrations/                          — SQL migration dosyaları (sırayla uygula)
```

---

## Veri Modelleri

### Mimari Katmanlar
- **DB katmanı** (`database.types.ts`): snake_case, nullable field'lar
- **Frontend katmanı** (`mock-data.ts`): camelCase interface'ler
- **Dönüşüm** (`api-mappers.ts`): `mapProduct()`, `mapCustomer()`, `mapOrderDetail()` vb.

```ts
// Product — DB-aligned field isimler
// productType: "manufactured" | "commercial"
Product: id, name, sku, category, unit, price, currency,
         on_hand, reserved, available_now,
         minStockLevel, isActive, productType, warehouse,
         reorderQty?, preferredVendor?, dailyUsage?

// Customer
Customer: id, name, email, phone, address, taxNumber, taxOffice,
          country, currency, notes, isActive,
          totalOrders, totalRevenue, lastOrderDate

// Order — ÇİFT EKSEN
Order: id, orderNumber, customerName,
       commercial_status,   // draft | pending_approval | approved | cancelled
       fulfillment_status,  // unallocated | partially_allocated | allocated | partially_shipped | shipped
       grandTotal, currency, createdAt, itemCount

// OrderLineItem
OrderLineItem: id, productId, productName, productSku, unit,
               quantity, unitPrice, discountPct, lineTotal

// OrderDetail extends Order
OrderDetail: ...Order, customerId, customerEmail, customerCountry,
             customerTaxOffice, customerTaxNumber, subtotal, vatTotal, notes,
             parasutInvoiceId?, parasutSentAt?, parasutError?,
             aiConfidence?, aiReason?, aiRiskLevel?,
             lines: OrderLineItem[]
```

---

## Sipariş Durumu (Çift Eksen)

```
commercial_status:
  DRAFT → PENDING_APPROVAL → APPROVED → CANCELLED

fulfillment_status (PENDING_APPROVAL'dan itibaren aktif):
  UNALLOCATED → PARTIALLY_ALLOCATED → ALLOCATED → PARTIALLY_SHIPPED → SHIPPED

Kural: Rezervasyon "Onaya Gönder" (DRAFT → PENDING_APPROVAL) ile tetiklenir
       (migration 082; eskiden APPROVED'daydı). APPROVED = light ticari teyit.
       AYRICA teklif "Gönder" (quote draft→sent) de bağlı bir PENDING_APPROVAL
       sipariş yaratıp rezerve eder (migration 088 — oversell önleme). Teklif
       accepted→sipariş approved; rejected/expired/revised→sipariş cancelled.
```

---

## Sipariş Hesaplama
```ts
lineTotal  = quantity * unitPrice * (1 - discountPct / 100)
subtotal   = sum(lineTotals)
vatTotal   = subtotal * 0.20   // KDV %20
grandTotal = subtotal + vatTotal
```

---

## Stok Modeli
```
available_now = on_hand - reserved
// on_hand: fiziksel stok
// reserved: pending_approval + approved siparişler için ayrılmış (migration 082)
// available_now: satılabilir gerçek miktar (computed column)
```

---

## Stok Modeli (Detay)

```
on_hand        — fiziksel stok
reserved       — pending_approval + approved siparişler için ayrılmış (migration 082)
available_now  = on_hand - reserved              (computed column)
quoted         = YALNIZ draft siparişlerdeki toplam miktar (soft hold; pending artık reserved'da)
promisable     = available_now - quoted          (canonical; negatif olabilir — Math.max ile gizleme)
incoming       = açık purchase commitment toplamı
forecasted     = on_hand + incoming - reserved - quoted
```

---

## Domain Kuralları

### Teklif Süresi (quote_valid_until)
- `sales_orders.quote_valid_until date` — nullable, NULL = süresiz
- **Tarih karşılaştırma kuralı — ZORUNLU:**
  ```ts
  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = !!date && date < todayStr;  // string karşılaştırma
  ```
  `new Date(date) < new Date()` KULLANMA — saat farkı nedeniyle ~24 saat kayar.
- Expire akışı: `serviceExpireQuotes()` (CRON) → expired draft → auto-cancel, pending → `quote_expired` alert

### Alert Tipleri

| Tip | Tetikleyici |
|-----|-------------|
| `stock_critical` | available_now ≤ 0 |
| `stock_risk` | available_now ≤ min_stock_level |
| `purchase_recommended` | reorder önerisi |
| `order_shortage` | onaylı sipariş için stok yetersiz |
| `order_deadline` | stok tükenme tarihi yakın |
| `quote_expired` | pending_approval + quote_valid_until geçmiş |
| `overdue_shipment` | approved + sevk edilmemiş, planlanan tarih geçmiş veya created_at+7 gün |
| `sync_issue` | Paraşüt sync hatası |
| `import_review_required` | import batch review gerekiyor |

**Dedup:** `dbListActiveAlerts()` → type+entity_id filtresi ile aktif alert varsa yeni yaratılmaz.
**Kapanma:** `dbBatchResolveAlerts([{ type, entityId, reason }])` — ID değil type+entity ile.

### CRON Endpoint'leri (`middleware.ts CRON_PATHS`)

| Endpoint | İşlev |
|----------|-------|
| `POST /api/alerts/scan` | Stok alert taraması |
| `POST /api/alerts/ai-suggest` | AI alert önerileri |
| `POST /api/parasut/sync-all` | Paraşüt sync |
| `POST /api/orders/expire-quotes` | Süresi dolan teklifleri işle |
| `POST /api/orders/check-shipments` | Geciken sevkiyat alertları |

### Import Servisi Kontratı
`serviceConfirmBatch` → `{ added, updated, skipped, errors }`
- Yeni SKU → `added` (on_hand dahil)
- Mevcut SKU → `updated` (on_hand dahil değil — master-data only)
- Eksik zorunlu alan (sku/name/unit) → `skipped`

---

## Güvenlik ve Demo Mode

### Auth Middleware (`middleware.ts` — proje kökünde)
- `/` ve `/login` → herkese açık; auth'd kullanıcı `/`'e gelirse `/dashboard`'a yönlendir
- `/dashboard/**` ve `/api/**` → oturum gerektirir
- Cron bypass: `CRON_SECRET` Bearer token → CRON_PATHS
- `/api/health` ve `/api/auth/demo` → her zaman public

### Demo Mode
**Entry:** Landing "Demo Gez" → `demo_mode=1` cookie → `/dashboard`

**`src/lib/demo-utils.ts`:** `useIsDemo()`, `DEMO_DISABLED_TOOLTIP`, `DEMO_BLOCK_TOAST`

**Middleware gate (demo_mode=1 + unauthenticated):**
- `GET /api/**` → izin ver
- `POST/PATCH/DELETE /api/**` → 403

**Client-side guard pattern:**
```tsx
const isDemo = useIsDemo();
if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
<Button disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
```

### Credential Güvenliği
- Auth'd kullanıcı: masked (ilk 4 kar + ••••••••) + boolean flag
- Demo/anon: null veya false
- Regression: `src/__tests__/credentials-no-leak.test.ts`, `demo-mode-middleware.test.ts`

---

## Entegrasyonlar

### Paraşüt
- `src/lib/parasut.ts` — şu an **MOCK** (%90 başarı, 1-1.8s rastgele gecikme)
- `PARASUT_ENABLED=true` → sync aktif; boş/false → erken döner
- Sipariş detay → sevk → `serviceSyncOrderToParasut(id)` (fire-and-forget değil)

### AI Katmanı (Claude Haiku — `claude-haiku-4-5-20251001`)
- Import: `aiDetectColumns()` — sheet başına TEK çağrı, kolon eşleştirme
- Order Review Risk, Ops Summary, Stock Risk Forecast, Purchase Copilot
- AI memory: `column_mappings` tablosu (kolon hafızası), `ai_entity_aliases` (isim öğrenme)
- Guardrails: G1-G4, run logging (`ai_runs` tablosu)
- `GET /api/ai/observability` → son 7 gün istatistik

### Test Altyapısı
- **Framework:** Vitest · `src/__tests__/` · node environment
- **63 dosya · 1274 test**
- Mock pattern:
  ```ts
  vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
  vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));
  ```

---

## Auth ve Kullanıcı Yönetimi

- `src/app/login/page.tsx` — Supabase `signInWithPassword`
- `src/app/api/admin/users/route.ts` — GET/POST (service role key)
- İlk admin: `npm run create-admin email şifre`
- Demo modda POST/DELETE → middleware 403

---

## Tamamlanan Fazlar

| Faz | Konu |
|-----|------|
| 0 | Domain Alignment |
| 1 | Frontend Stabilization |
| 2 | Core Domain Model (DB schema — 14+ tablo, 26 migration) |
| 3 | Orders Engine |
| 4 | Inventory & Reservation Engine |
| 5 | Critical Stock & Alerts Engine + Teklif Kırılımı |
| 6 | Purchase Suggestion Engine + Teklif Süresi + Geciken Sevkiyat |
| 7 | Production Engine |
| 8 | Import Flow → Kolon Eşleştirme + Hafıza + Inline Düzenleme |
| 9 | Paraşüt Integration |
| 10 | AI Layer (Claude Haiku) |
| + | Demo Mode, Güvenlik, Ürün Kullanım Bayrakları |

---

## Claude İçin Kurallar (Feedback)

1. **Sessiz silme yasak:** Kodu silmeden önce yerine ne geldiğini açıkla veya kullanıcıya sor. "Taşıdım" demek yeterli değil — eski işlevsellik tam karşılanmalı.

2. **Memory güncellemesi:** Proje durumu değiştiğinde (`current_focus.md`, bu dosyanın "Mevcut Durum" bölümü) otomatik güncelle — kullanıcı söylemeden.

3. **Context güncelleme:** İş commit'lendikten hemen sonra "Mevcut Durum"u ve `memory/current_focus.md`'yi güncelle.
