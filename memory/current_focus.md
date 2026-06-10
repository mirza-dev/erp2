---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

> Bu dosya yalnız **güncel odak + açık yükümlülükleri** tutar. Tam oturum geçmişi git log'unda. Aşağıdaki indeks geçmiş oturumlara hızlı bakış içindir.

## Son Tamamlanan İş — 2026-06-11 (**Genel Bakış: Finansal Özet kaldırıldı, Stok Dağılımı tam-genişlik revize — GREEN, push edildi**)

**İstek:** "Finansal özet kısmını kaldırıyoruz; stok dağılımını finansal özetin yerini karşılayacak şekilde revize edelim, ardından her şeyi push."

- **Silinen:** `FinancePanel.tsx` (Finansal Özet paneli — brüt kâr hero + money-flow + aging) ve tek tüketicisi olduğu `charts/AgingBars.tsx`; view-model'den `financeSummary`/`grossToNetRevenue`/`REPORTING_VAT_RATE`/`FinanceSummary` (tek tüketici paneldi). Maliyet granülerlik notu ("Maliyet aylık/çeyreklik bazda gösterilir") trend paneline taşındı.
- **StockPanel revize (tam genişlik, Satır 1 tek panel):** donut 188px + paylı legend (kategori başına %pay etiketi + 4px renkli pay çubuğu) + sağda dikey-ayraçlı özet kolonu: **Toplam Stok Değeri** hero (mono 26px) + Aktif ürün / **Kritik stok** (≤min, danger-tint) / **Risk bandında** (≤ceil(min×1.5), warning-tint). `stockStats` page.tsx'te products'tan memo ile türetilir, `StockPanelStats` tipi RealPanels'tan export.
- **Rapor (`DashboardReport`):** "Finansal Özet" bölümü kaldırıldı; Stok Dağılımı tablosu Pay sütunu kazandı (%xx.x satırlar + %100 toplam) + altında "Aktif ürün · Kritik stok · Risk bandında" özet satırı; `finance`/`financeNote` propları kalktı → `stockStats?` geldi. **Alacak Yaşlandırma rapor bölümü KORUNDU** (`receivables` artık yalnız raporun tükettiği veri; ekran paneliyle birlikte gitmedi — RBAC `canViewFinance` maskesi aynen).
- **Test:** overview-panels-render: FinancePanel describe → StockPanel revize describe (pay/%toplam/stats/RBAC/hex-yok, 5 test); overview-charts-render: AgingBars blokları çıktı; dashboard-view-model: financeSummary/KDV-tuzağı blokları çıktı (helper'lar silindi); dashboard-overview-preservation: yeni diziliş kilidi (tek `overview-grid-1-1` + `<FinancePanel` ve `financeSummary(` geri gelmez + not trend'de); dashboard-report-render: `not.toContain("Finansal Özet")` + Pay/%100/Aktif-ürün; dashboard-segment-report hizalandı.
- **Doğrulama:** tsc 0 · lint 0 · **4959 test / 355 dosya** · build 0.

## Önceki — 2026-06-11 (**Uyarılar sistemi tutarlılık + kapsam turu — churn fix, AI revamp, quote/PO vade uyarıları — GREEN, `f9e88ed`**)

**İstek:** "Uyarılar sayfası genel ERP'nin uyarı merkezi olsun — verdiği uyarılar tutarlı mı, atladığı/yanlış gösterdiği var mı, backend kapsamlı mı; önerini sun (şunlar gereksiz vs.)." Analiz: backend çekirdeği sağlam (8 tip, lifecycle matrisi, dedup unique-idx, 24h dismiss+severity bypass, orphan temizliği, advisory lock, 6h GH-Actions cron) ama 3 ciddi tutarlılık sorunu + boşluklar. **Kararlar (AskUserQuestion):** fix paketi 4/4 · purchase_recommended→Satın Alma'ya devret · AI source=ai sekme+sınırlı üretim · kapsam: V7 teklif+PO gecikme (import_review_required + order_shortage e-postası SEÇİLMEDİ) · **model: Haiku kalır** (maliyet ~$1/ay vs Sonnet ~$3/ay ama kalite girdiden gelir; `MODEL` tek sabit→gerekirse tek satırla Sonnet).

**Tutarlılık fix'leri:** (1) `order_deadline` aynı-severity tazeleme `dbUpdateActiveAlertContent` ile YERİNDE — eski resolve+create churn'ü günde 4 "çözüldü" kopyası üretip takvimi/DB'yi şişiriyordu (severity değişimi bilinçli resolve+create kaldı = escalation geçmişi); (2) takvim fetch'i `dbListAlertsForCalendar` — limitsiz select Supabase **1000 satır tavanında sessizce kesiliyordu**; şimdi tüm aktifler + son 6 ay kapanmış, explicit 5000 limit (route query-filtreli eski sözleşmeyi korur); (3) data-context aktif sayaç open+**acknowledged** (sayfa istatistiğiyle aynı; dashboard panelleri de tutarlı); (4) yoksay UI'da satır silme→dismissed patch (refetch'te geri-görünme tutarsızlığı bitti); (5) domain-rules §6.1 warning kodla hizalı (min×1.5 + fiziksel-available_now/promisable eksen notu), §12.1 tip listesi güncel.

**Satın alma devri:** `/api/purchase/scan` + `/api/purchase/suggestions` + `purchase-service.ts` SİLİNDİ — **hiçbir cron/UI çağırmıyordu** (tek referans RBAC testi; canlı satın alma yolu ai_recommendations/purchase-copilot). DR-7 testi ölü servisi ölçüyordu→silindi (canlı promisable kilidi ai-purchase-copilot+reorder-suggestions testlerinde). Sekme: "AI Öneriler"→**"AI Bulgular"**, type yerine `source=ai` (`matchesAlertClass` TEK matcher — sekme sayacı+sayfa filtresi aynı; tip sekmeleri AI'ı dışlar→çifte sayım yok; tarihi purchase_recommended kayıtları source=ai→görünür kalır; tip union'da kaldı).

**AI revamp (kalite girdiden):** eski akış 8 toplam sayı+top5 ile Haiku'ya gidip entity'siz serbest metin insight/anomali üretiyor, her 6h'de TÜMÜNÜ dismiss+yeniden yaratıyordu (günde 4 batch takvim gürültüsü). Yeni: `aiGenerateAlertFindings` — riskli alt küme ≤30 ürün zengin satır (available/promisable/min/dailyUsage/coverage/lead/shortage/yoldaki-PO `dbGetIncomingPOQuantities` YENİ helper) + **tool-use structured output** (`uyari_bulgulari` şeması; regex JSON yok) + product_id girdi-listesi doğrulaması (halüsinasyon atılır) + kural-tekrarı YASAK prompt (kritik/risk/shortage/deadline kuralları zaten var — yalnız kuralların göremediği kalıplar) + max 6 bulgu, severity info|warning (§6.3: AI kırmızı üretmez) + per-finding confidence. `serviceGenerateAiAlerts`: entity-bağlı `stock_risk source=ai` yazar; aynı ürünün aktif AI alert'ini YERİNDE günceller; bulgusu geçeni `ai_finding_cleared` resolve; kural-stok-alert'li ve 24h-yoksayılmış ürüne EKLEMEZ; entity'siz eski nesil tek seferlik `legacy_entityless_ai_alert` dismiss; sonuç {created,updated,dismissed,summary}. `ai_runs.feature` += `alert_findings`. Dashboard AI Özeti (`aiGenerateOpsSummary`) DOKUNULMADI.

**Yeni kapsam:** **mig.089** `alerts_type_check` += `po_overdue` (**UYGULANMADI ⚠️** — `supabase db push`); `serviceCheckOverduePurchaseOrders` — expected_date geçmiş açık PO (sent/confirmed/partially_received) → warning, gecikmesi bitenler `po_no_longer_overdue` resolve; **alerts/scan route'unda** stok taramasıyla aynı lock'ta non-fatal (089'suz CHECK hatası yutulur, stok taraması etkilenmez → cron değişikliği gerekmedi). **V7 teklif:** `serviceExpireQuotes` sent→expired olurken `quote_expired` (entity_type=**quote**; draft sessiz; dedup unique-idx; best-effort) + `serviceCreateQuoteRevision` kaynaktaki uyarıyı `quote_revised` resolve. `alert-due-dates` 3 eksen (sales_orders/quotes/purchase_orders tablo-başına tek batch; "Teklif Geçerlilik" quote_number / "Beklenen Teslim" po_number). Drawer: süre-uzat formu `entityType==="sales_order"` kilidi (quote-entity'de form YOK→`/dashboard/quotes/[id]` "Teklifi Aç", po_overdue→`/dashboard/purchase/orders/[id]`); sekme "Sevkiyat & Teklif"→**"Vadeler"** (+po_overdue). `ALERT_TYPE_LABEL` += "Geciken Tedarik".

**Test:** +35 yeni (`po-overdue-scan` 7 [servis+route-lock+sorgu-lock] · `ai-alert-findings` 6 [tool-use/halüsinasyon/cap/clamp/boş-girdi/prompt] · `alerts-consistency-locks` 11 [sayaç/yoksay/churn/pencere/ölü-zincir geri gelmez] · due-dates +3 [quote/PO/karışık eksen] · lifecycle AI bloğu 4 yeniden · quote expire 6 yeniden), 13 mevcut güncellendi. **tsc 0 · lint 0 · 4964 test (355 dosya) · build 0** (ölü route'lar manifest'ten düştü, `ƒ Proxy` var). **Kalan:** mig.089 APPLY + manuel smoke (Tara→po_overdue; teklif süresi→uyarı; AI Öner→entity-bağlı; sekme sayaçları; drawer linkler).

## Önceki — 2026-06-10 (**Veri Aktarım Merkezi sadeleştirme — dosya-önce hub + Excel sihirbazı ayrı sayfa — GREEN, PUSH `a633632`**)

**İstek:** "Veri aktarım merkezi inanılmaz karmaşık ve işlevi çok kalabalık — sadeleştir, mantıklı zemine oturt." **Kararlar (AskUserQuestion):** (1) dosya-önce giriş (İşlem Türü ızgarası kalkar, tek dropzone, sistem dosya tipine göre yönlendirir); (2) Excel 7-adım sihirbazı ayrı sayfaya (`/dashboard/import/excel`); (3) ölü uç temizliği (`POST /[batchId]/parse` + drafts POST); (4) ImportGuide küçült (şablon satırı + tek satır güven notu + bilgi ilgili adıma).

**Faz 1 (`7b58154`) — ölü uç temizliği:** UI'sız `parse` route + drafts POST handler (GET kaldı) + `serviceAddDraftsToBatch` + `aiBatchParse`/`parseChunk`/`BATCH_PARSE_SYSTEM` silindi (grep doğrulamalı; `FALLBACK_FIELD_MAP`/`fallbackParseRow` CANLI — detect-columns kullanıyor). Testler: import-parse-route(26)+ai-batch-parse(19) silindi, drafts POST trim + POST-yok regression-lock, eval-runner aiBatchParse blokları + acceptance-eval + README hizalandı.

**Faz 2+3 (`eb489cc`) — hub + sihirbaz:** Hub 1595→~210 satır: tek DropZone ("Dosyanı bırak — PDF · Excel · görsel"), uzantı yönlendirme (`import-file-transfer.ts` singleton: `stashImportFile`/`takeImportFile` oku-ve-temizle; deep-link'te boş→kendi dropzone), ClassifierQueue, şablon satırı (+tip-özel `?kind=product_type&typeId=` dropdown), güven satırı (tam notlar tooltip'te). ImportGuide.tsx (290) silindi; import-guide.ts küçüldü (IMPORT_STEPS+buildOperationTargets öldü; IMPORT_DATA_TARGETS/getTargetForOperation/IMPORT_TRUST_NOTES/getActiveTemplateLinks canlı). Sihirbaz `/dashboard/import/excel`: 7 adım birebir taşındı (remember/inline-edit-rollback/field-approval/bulk-fill/overwrite/rapor/demo-guard/25MB/E2E locator korundu); **stok sheet'lerinde Sayım/Hareket radio** + apply-mappings `sheets[].operation_type` (grid kalkınca sessiz stock_count düşüşü önlendi; explicit seçim sunucu isim-çıkarımını yener — `inferStockOpFromSheetName` pure). **İşlem türü kaderi:** classify `operation_type` opsiyonel → `defaultOperationForDocumentType` (cert/compliance/test/msds/photo→product_documents, catalog→product_create, datasheet→product_technical_update, vendor_profile→vendor_upsert, else default) damgalar; ClassifierQueue chip damgadan okur, `onOpenClassicMode`→`onOpenExcelWizard(file)`; ExtractionReview'a işlem select + "Hedef: modül — ne olur" satırı; extract body `operation_type` override (classification'a persist). Çift yönlü kaçış: sihirbaz "AI ile analiz et"→hub kuyruğu, kuyruk migration_excel→"Excel sihirbazında aç". RBAC otomatik (page-access prefix `/dashboard/import`→view_import).

**Test:** import-page-faz3d+import-guide-render silindi; yeni `import-hub`(11: yönlendirme+regression-lock grid/accordion/parse-drafts-POST geri gelmez) + `import-excel-wizard`(19: state machine+korunan davranışlar+singleton+stok radio+E2E hizası); queue-interaction/guide/overwrite/muted-text/chips/file-size güncellendi; Playwright accordion-beforeEach→`/dashboard/import/excel` goto. **tsc 0 · lint 0 · 4943 test (5068'den: ~155 ölü-yol testi silindi, +30 yeni) · build 0 (hub+excel+extract manifest'te).** **Kalan:** push (ff main+both) + manuel smoke (Excel bırak→sihirbaz; PDF→classify→İncele→apply; migration_excel CTA; deep-link; demo guard).

## Önceki — 2026-06-10 (**Genel Bakış: döviz tasarımı + işlevsel dönem segmenti + gerçek rapor — GREEN**)

**İstek (ekran görüntüsü):** Genel Bakış'ta (1) üst bardaki döviz gösterimi tasarıma uymuyor; (2) `Bugün/Hafta/Ay/Çeyrek` segmenti hiçbir şeyi filtrelemiyor (kullanılmıyor); (3) `Rapor indir` ekran görüntüsü HTML basıyor → "adam akıllı" rapor istendi. **Kararlar (AskUserQuestion):** döviz→tasarıma uy (Alış/Satış etiketli, satış yeşil); segment→işlevsel filtre; rapor→yazdırılabilir PDF (sonra içerik = Detaylı kapsam + zengin künye).

**(1) Döviz çipi:** `ExchangeRatesTicker.tsx` → tasarım `RateChip` portu: her para birimi Alış (kalın) / Satış (yeşil `--success-text`) iki satır, 2 ondalık, dikey ayraç. Fetch/source mantığı + `● Bağlı` (gerçek `SystemHealthIndicator`) korundu; tasarımın sabit "Sistem aktif" noktası ALINMADI.

**(2) İşlevsel dönem segmenti:** Yeni saf `periodModel(range,now)` + `revenueByPeriod`/`orderCountsByPeriod`/`cogsByPeriod`/`productionInPeriod` (`dashboard-view-model.ts`). Ciro+Üretim KPI + Trend + Finans seçili döneme göre yeniden hesaplanır (Ay→12 ay · Çeyrek→4 çeyrek · Hafta→12 hafta · Bugün→14 gün). 4 snapshot KPI (Stok/Açık Sipariş/Açık Alacak/Uyarı) **anlık** etiketli (geçmiş snapshot yok — sahte veri yok). **Boş-durum** (advisor kapısı): siparişsiz dönemde Ciro+Trend "Bu dönemde sipariş yok" (düz-sıfır eksen değil). Hafta/Bugün'de COGS aylık-RPC kovalanamaz → maliyet hattı gizli + "Maliyet aylık/çeyreklik bazda gösterilir" notu. CSS bug fix: `"on"`→`is-active`. **Advisor blocker fix:** `productionInPeriod` tüm pencereyi topluyordu → yalnız `currentIndex` kovası.

**(3) Gerçek rapor:** Yeni `DashboardReport.tsx` — ekran görüntüsü değil, amaca özel yazdırılabilir (`.dashboard-print-report` ekranda gizli/baskıda block; `.dashboard-screen-only` baskıda gizli; globals.css 9px override ezildi). **İçerik (Detaylı + zengin künye):** Roven logo + "Genel Bakış Raporu" + tarih·dönem·firma·para + **Hazırlayan** (`/api/settings/user/profile`) → Özet Göstergeler(KPI) · Finansal Özet · Ciro&Maliyet trend tablosu · Stok Dağılımı(+Toplam) · Alacak Yaşlandırma · Son Siparişler(10) · Kritik Uyarılar(TÜM) · footer. Seçili döneme bağlı + RBAC maskeli. Ek bölümler (reorder/üretim/AI) kullanıcı seçmedi → yok.

**Testler:** view-model period testleri + `dashboard-report-render` (renderToStaticMarkup smoke+RBAC) + `dashboard-segment-report` (source-regression); 4 mevcut test (ticker/topbar/overview-preservation) yeni tasarıma göre güncel. **tsc 0 · lint 0 · 5068 test · build 0.** **Kalan:** görsel smoke (segment toggle + PDF önizleme).

### Önceki — Yeni Teklif sayfasına çift-onaylı inline "Gönder" butonu (GREEN)

**İstek:** `/dashboard/quotes/new`'de yalnız "Önizle & PDF"+"Kaydet" vardı; kullanıcı "Gönder" istedi (iki kez onay + hatasız). Önceden gönderim yalnız teklif detay sayfasındaydı. **Yaklaşım:** `QuoteForm` ortak (yeni+detay); yeni `enableInlineSend` prop'u **yalnız** new sayfasında Gönder'i açar (detayın kendi header Gönder'i → çift buton önlenir). **Çift onay:** `sendStep` 0→1→2 (Modal 1 rezerve notu + e-posta checkbox · Modal 2 son onay). **Ön-validasyon** sunucu sözleşmesini BİREBİR aynalar (`validateQuoteForSend`/`validateQuoteLineQuantities` client'tan import) → manuel-kod/adres-yok satır iki onaydan ÖNCE bloklanır (400 yememe). **Çekirdek:** `handleSave`'den `persistQuote({skipUrlSync})` çıkarıldı; `handleSendInline` = persist (replaceState YOK → push desync hazard elenir) → `sent` transition → sonuç toast → (e-posta) → `router.push` detaya. `suppressAutoSaveRef` + draft localStorage temizliği. **Drift önleme:** yeni `_utils/send-result.ts` (`applySendResultToast` cascade + `sendQuoteEmail`); detay sayfası da artık buna delege (inline kod taşındı, davranış korundu). Yeni buton aynı 088 RPC'sini çağırır. +`quotes-new-inline-send` test + 4 mevcut test refactor'a göre güncel. **tsc 0 · lint 0 · 5036 test · build 0.** **⚠️ Runtime smoke `migration 088 APPLY` gerektirir** (yoksa ilk tık "rezervasyon oluşturulamadı" → kırık görünür). **Sıradaki smoke:** Kaydet-sonra-Gönder alt-vakası + rezervasyon akışı.

## Önceki — 2026-06-10 (**Teklif gönderilince stok rezervasyonu (bekleyen sipariş) — GREEN, migration 088 APPLY bekliyor**)

**Senaryo:** aynı 10 stoğu iki satışçı iki müşteriye teklif → ikisi de kabul → -10 oversell. **Kullanıcı kararı:** rezervasyon teklif GÖNDERİLİNCE (accept'te değil); kabul→sipariş Onaylı. **Strateji A:** `draft→sent`'te accept'in teklif→sipariş dönüşümünü öne çek ama `pending_approval`+`allocate_order_lines` ile rezerve et (sipariş-merkezli motoru reuse). **Yaşam döngüsü:** sent→pending+rezerve · accepted→approve_order · rejected/expired/revised→cancel_order (release). **Migration 088:** `send_quote_and_create_pending_order` (pending+allocate, **zero-stock lenient** kısmi+shortage, arşiv NULL OK, idempotent) + `accept_quote_and_create_order` revize (bağlı pending→approve, yoksa legacy draft) + `cancel_quote_linked_order`. **Servis/route/UI:** sent sonucu reservationWarning/shortages/reservedOrderNumber; reject/expire/revise→cancel (best-effort); gönder onayında rezerve notu + shortage toast. Stok modeli değişmedi (pending zaten reserved). **+16 test · tsc 0 · lint 0 · 5021 test · build 0.** **Sıradaki:** push + **migration 088 APPLY (Supabase)** + smoke (gönder→available_now düşer→ikinci kısmi→reddet→geri→kabul→Onaylı). Edge: pending'i orders'tan elle iptal → rezerv gider teklif sent kalır (kabul).

## Önceki — 2026-06-09 (**Arşiv belgesi render fix + demo e-posta nötrleştirme — PUSH `d9ef1c3`**)

**(A) Arşiv "Belgeyi Aç" bug:** belge yeni sekmede ham HTML kaynağı + UTF-8 mojibake gösteriyordu. Kök neden: Supabase storage signed URL'i donmuş arşiv HTML'ini `text/html` render etmiyor (stored-XSS koruması → metin). Çözüm: arşiv route'una **`?view=1` modu** (`dbDownloadArchiveHtml` → `Content-Type: text/html; charset=utf-8` ile stream) + buton **senkron `window.open`** (popup-blocker de elendi). Eksik arşiv/403 → dostça HTML hata sayfası. JSON modu geriye uyumlu. `orders/[id]`+`quotes/[id]` butonlarından `archiveLoading` kaldırıldı. Commit `6ea6045`.

**(B) Demo e-posta mayını:** seed + mock-data'daki 4 müşteri gerçek firma domain'lerine işaret ediyordu; smoke'ta yanlışlıkla `procurement@abdibrahim.com.tr`'ye gerçek teklif gitti (Resend Sent, bounce yok → muhtemelen spam; özür gereksiz). Fix: tüm müşteri e-postaları `@*.example.com` (RFC 2606); `info@pmt.com.tr` satıcı, dokunulmadı. Commit `fe96937`.

**+6 test · tsc 0 · lint 0 · 5004 test · build 0.** Bounce yok = EMAIL_FROM+Resend+`.html` pipeline çalışıyor (smoke Aşama 1 fiilen yeşil). **Sıradaki:** (1) arşiv fix deploy sonrası görsel doğrula (render + doğru Türkçe); (2) `.html` smoke Aşama 2 (kendi Gmail+Outlook, müşteri e-postasını kendine çevir).

## Önceki — 2026-06-09 (**Teklif "Gönder" → müşteriye HTML ekli e-posta — PUSH `5ecc104`**)

**Kullanıcı isteği:** Teklif detay sayfasında "Gönder"e basınca müşteriye teklif belgesi e-posta ile gitsin (kullanıcı isterse). **Kararlar:** ek = **HTML eki** (binary PDF yok; dondurulmuş arşiv HTML — gerçek PDF chromium/dış-API gerektirir, reddedildi); tetik = **"Gönder" onayına checkbox** (varsayılan işaretli, transition'a bağlı tek-sefer).

**Yapılanlar (6 kod + 6 test):** (1) `sendDirectEmail` attachment primitifi (`email-service.ts`); (2) `renderQuoteToCustomer` müşteri şablonu (`templates.ts`, `shell()`+`hideManageFooter` → müşteriye giden e-postada dashboard footer'ı gizli, XSS escape); (3) `serviceSendQuoteToCustomer` (`quote-service.ts`, arşivle birebir HTML pipeline reuse, `no_email` guard, `email_logs` entity_type='quote'); (4) **`POST /api/quotes/[id]/send-email`** (`manage_quotes` RBAC; 404/400/503/502 map); (5) `dbListFailedEmailsForRetry` NULL-safe `.or("entity_type.is.null,entity_type.neq.quote")` (quote retry exclusion); (6) frontend `[id]/page.tsx`+`quote-display.ts` (draft Gönder confirm + checkbox + post-transition `/send-email`).

**ADVISOR (bug yok, 4 not):** #1 done=kod-complete+green AMA uçtan uca DOĞRULANMADI (EMAIL_FROM altyapısı; kullanıcı düzeltti); #2 **`.html` eki Exchange/Outlook strip/karantina riski** → kullanıcı kararı **önce smoke ile ölç** (Gmail+Outlook), sorunsa PDF-API; #3 RBAC temiz (manage_quotes=admin+sales, ikisi view_sales_prices tutar); #4 frozen arşiv yerine re-render (gelecek "Tekrar Gönder" frozen ekle — kod yorumu). tsc 0 · lint 0 · **4999 test** · build 0 (`ƒ /api/quotes/[id]/send-email`). Migration YOK.

**DURUM: PUSH EDİLDİ** (drift fix `458c14b` + bu iş; mirror main==codex-experiment). **Sıradaki smoke:** Aşama 1 `/api/email/test` EMAIL_FROM doğrula → Aşama 2 gerçek teklif → kendi Gmail+Outlook → `.html` eki geliyor mu/spam mı.

---

## Açık yükümlülükler (kullanıcı doğrulamalı)
- **Teklif e-posta smoke:** Aşama 1 — `EMAIL_FROM`'u `/api/email/test` ile doğrula; Aşama 2 — gerçek teklif "Gönder" → kendi Gmail + Outlook/Exchange → `.html` eki sağlam mı / spam'e düşüyor mu. Sorunluysa PDF-API yoluna geç.
- **Login "Monolith" deploy ön koşulları** (push `27733c6`; canlı tur doğrulanmadı): (1) Supabase "Allow new users to sign up" = OFF (birincil kilit); (2) ⚠️ BRICK RİSKİ — prod admin `app_metadata.roles` VEYA `ADMIN_EMAILS` her iki Coolify env'inde set olmalı (yoksa `isProvisionedUser` guard herkesi kilitler); (3) canlı Google OAuth turu (Supabase provider + `…/auth/callback` allowlist + tarayıcı smoke).
- **Paraşüt Faz 12 — Sandbox GATE:** gerçek API ile OAuth + list filtreleri + e-doc trackable_job + stok invariant doğrulamaları (`PARASUT_PLAN.md` §Faz 12).

## Geçmiş oturum indeksi (en yeniden eskiye — detay git log'unda)
- Önceki — (**Genel Bakış (Executive Dashboard) — TAM-SADIK yeniden kurulum (GREEN, PUSH BEKLİYOR)**)
- Son Tamamlanan İş — (**Login "Monolith" (F) redesign — TR/EN + tema + Google OAuth + reset**)
- Son Tamamlanan İş — (**Veri Aktarım Merkezi — rehber + şeffaflık katmanı**)
- Son Tamamlanan İş — (**Teklif formu ürün açılır-listesi kırpılma fix'i**)
- Son Tamamlanan İş — (**Görsel QA (codex) + iki-branch hizalama + PUSH**)
- Son Tamamlanan İş — (**Branch hizalama audit'i — son commitlerin detaylı kod incelemesi + 3 bulgu düzeltme**)
- Son Tamamlanan İş — (**İki branch'i hizalama — codex ↔ main merge + main hardening re-apply**)
- Önceki — (**Ürün Tipleri sayfası — final ürün [alan düzenleme UI + N+1 fix + a11y modal]**) — ⚠️ product-types değişiklikleri `56ecbd1` merge'inde codex rewrite'ı ile superseded; field_key guard codex yapısına re-apply edildi
- Önceki — (**Satın Alma Siparişi (Yeni) — ürün seçilince birim fiyat + KDV otomatik gelmiyor [FONKSİYONEL bug]**)
- Önceki İş — (**Ayarlar sayfası — final ürün (modal a11y + tablist a11y + entity render bug + hata mesajı paritesi)** — COMMIT+PUSH `b37764a`)
- Önceki İş — (**Cariler (Müşteriler) sayfası — final ürün (toplu-silme bayat satır + hover antipattern + modal a11y + validation parity)** — COMMIT+PUSH `c8057e5`)
- Önceki — (**Üretim Girişi sayfası — final ürün (BOM eksik-bileşen şeffaflığı + silme onayı + a11y)**)
- Önceki — (**Tedarikçiler sayfası — final ürün (a11y modal + görünür yükleme hatası + toplu-seçim kapsamı)**)
- Önceki — (**Satın Alma Siparişleri sayfası — final ürün 2. tur (sessiz yükleme hatası + tarih tutarlılığı)**)
- Önceki — (**Paraşüt Sync sayfası — final ürün (kritik: kırık manuel sync + dürüst durum)**)
- Önceki — (**Satın Alma Siparişleri sayfası — final ürün (eksik kapatma + salt-okuma canlı E2E)**)
- Önceki — (**Öneriler (Satın Alma Önerileri) sayfası — eksik kapatma + canlı E2E**)
- Önceki — (**Stok & Ürünler sayfası — eksik kapatma + canlı E2E**)
- Önceki — (**Satış Siparişleri Faz 3 — HARD rezervasyonu "Bekliyor"a (pending_approval) taşı**)
- Önceki — (**Satış Siparişleri Faz 1+2 — migration 081 APPLY EDİLDİ ✅ + canlı doğrulama**)
- Önceki — (**Teklif V7 Faz 8 Bulgular 1. tur — Paraşüt reconcile retry-bypass + doc/P3**, 2 commit, 4215 test)
- Önceki — (**RBAC Faz 4 TAMAMLANDI — quotes + PO redaction + archive gate**, commit `1db5865`, 4197 test)
- Önceki — (**RBAC Faz 4 (R1-R5) MAIN'E MERGE + PUSH** — merge commit `234d8d9`, 4174 test, build OK)
- Önceki — (Teklif V7 **Faz 8 — Ertelenen Borçlar Kapanışı** — 5 alt-faz/5 commit, 4098 test, COMMIT+PUSH EDİLDİ · **migration 080 APPLY EDİLDİ ✅**)
- Önceki — (Teklif V7 **Faz 7 — Not Şablonları (note_templates)** + Bulgular 1.+2.tur — migration 079, 4098 test, COMMIT+PUSH EDİLDİ · **079 APPLY EDİLDİ ✅**)
- Önceki — (Teklif V7 **Faz 6 Bulgular 3. tur — 3 P3 bulgu** + 2. tur, 4043 test, COMMIT+PUSH EDİLDİ + 077/078 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 **Faz 6 Bulgular 2. tur — 5 bulgu**, 4043 test, COMMIT+PUSH EDİLDİ `9a57d66` + 077/078 APPLY EDİLDİ ✅)
- Lint sinyali düzeltmesi — (npm run lint artık güvenilir + 0 sorun)
- Son Tamamlanan İş — (Teklif V7 **Faz 6 Bulgular — 5 bulgu review tur**, 4034 test, COMMIT+PUSH EDİLDİ + migration 077 APPLY EDİLDİ ✅ / 078 APPLY BEKLİYOR)
- Önceki — (Teklif V7 **Faz 6 — Accept → Sipariş (atomik)**, 4021 test, COMMIT+PUSH EDİLDİ + migration 077 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 Faz 4 — Bulgular 4. review tur, COMMIT+PUSH `6c9c317` + migration 075/076 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 Faz 4 — Bulgular 3. review tur, COMMIT+PUSH `da09dce`)
- Önceki — (Teklif V7 Faz 4 — Bulgular 2. review tur, COMMIT+PUSH `bb3b3f2` + migration 075/076 APPLY BEKLİYOR)
- Önceki — (Teklif V7 Faz 4 — PDF Arşiv: dondurulmuş HTML snapshot + Bulgular 1. review tur, 3951 test, COMMIT+PUSH b8c1613 + migration 075/076 APPLY BEKLİYOR)
- Önceki — (Teklif V7 Revizyon Zinciri — Faz 5'ten ertelenen, 3837 test, COMMIT+PUSH 1d96211 + migration 074 APPLY EDİLDİ + review pass)
- Önceki — (Teklif V7 Faz 5 infra dilim — numara katmanı, 3821 test, COMMIT+PUSH 942ee0d + migration 073 APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 3 REVIEW DÜZELTMELERİ — Bulgular P1-P3, 2 tur, 3815 test, COMMIT+PUSH 6366cbd+11c5079 + migration 070-072 APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 3 IMPLEMENT EDİLDİ — header iskonto, 3799 test, COMMIT+PUSH c5d8267 + migration APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 2 IMPLEMENT EDİLDİ — validasyon katmanı, 3778 test, COMMIT+PUSH afe936b)
- Önceki — (Teklif V7 Faz 1b IMPLEMENT EDİLDİ — QuoteForm entegrasyon, 3729 test, COMMIT+PUSH+APPLY EDİLDİ)
- Önceki — (6. tur: bekleyen UI fix commit/push + V7 bulgu doğrulama)
- Önceki — Teklif Modülü V6 Master Plan (5. tur review, 2026-05-29)
- Önceki — Teklif Modülü V5 Master Plan (4. tur review, 2026-05-29)
- Önceki — Teklif Modülü V4 Master Plan (3. tur review, 2026-05-29)
- Önceki — Teklif Modülü V3 Master Plan (2. tur review, 2026-05-29)
- Önceki — Teklif Modülü V2 Master Plan (1. tur review, 2026-05-29)
- Önceki — Teklifler modülü UI/UX eksiksiz düzeltme (3682 test, 2026-05-28)
- Önceki — SMTP smoke endpoint + deploy runbook (3667 test, 2026-05-28)
- Önceki — Sesli giriş V3 (3657 test, 2026-05-28)
- Önceki — React Doctor only-export-components ×22 fix (3637 test, 2026-05-28)
- Önceki — React Doctor Bölüm 4 (3636 test, 2026-05-28)
- Önceki — React Doctor temizlik (3636 test, 2026-05-27)
- Önceki — UX iyileştirme (3636 test, 2026-05-27)
- Önceki — AI rate limit advisor refinement (3614 test, 2026-05-26)
- Önceki — Route-level AI rate limit (3606 test, 2026-05-26)
- Önceki — M-3 Resilience fix (3581 test, 2026-05-26)
- Önceki — M-3 Review 2 (3575 test, 2026-05-25)
- Önceki — M-3 Review 1 (3569 test)
- Önceki — M-3 ilk implementasyon (3565 test)
- Önceki — Faz 4c (3534 test)
- Önceki — Faz 4b Review 1 (3516 test)
- Önceki — Faz 4b (3512 test)
- Önceki — Import E2E (3493 test)
- Önceki — Faz 4a Review (3491 test)
- Önceki — Faz 4a (3480 test)
- Önceki — Aging E2E 2 fail kapatma (3460 test)
- Önceki — Faz 3d Review 2.tur (3457 test)
- Önceki — Faz 3d Review 1.tur (3455 test)
- Önceki — Faz 3d (3452 test)
- Önceki — Faz 3c Review 5.tur (3441 test)
- Önceki — Faz 3c Review 4.tur (3439 test)
- Önceki — Faz 3c Review 3.tur (3432 test, 2 commit)
- Önceki — Faz 3c Review 2.tur (3419 test, 2 commit)
- Önceki — Faz 3c Review 1.tur (2026-05-22; 3401 test, commit `14a7253`)
- Önceki — Faz 3c (3387 test)
- Önceki — Faz 3b Review 6.tur (3360 test)
- Önceki — Faz 3b Review 5.tur (3350 test)
- Önceki — Faz 3b Review 4.tur (3348 test)
- Önceki — Faz 3b Review 3.tur (3345 test)
- Önceki — Faz 3b Review 2.tur (3329 test)
- Önceki — Faz 3b Review (3326 test)
- Önceki — Faz 3b (3305 test)
- Önceki — Faz 3a Review 3.e (3200 test)
- Önceki — Faz 3a Review 3.d (3200 test)
- Önceki — Faz 3a Review 3.c (3199 test)
- Önceki — Faz 3a Review 3.b (3192 test)
- Önceki — Faz 3a Review 3. tur (3190 test, commit `444dced`)
- Önceki — Faz 3a Review 2. tur (3188 test)
- Önceki — Faz 3a — AI Import drop-anywhere UI + multimodal classifier (3175 test, commit `3757e48`)
- Önceki — Faz 2e İPTAL (3098 test, commit `4401d66`)
- Önceki — Faz 2d Review P3-007 (3119 test, commit `05cc81e`)
- Önceki — Faz 2d Review 2. tur (3109 test, commit `6272759`)
- Önceki — Faz 2d Review 1. tur (3084 test, commit `2b4dd0a`)
- Önceki — Faz 2d (3059 test, commit `99f3027`)
- Önceki — Faz 2c Review P3 (3015 test)
- Önceki — Faz 2c — Teknik sekmesi dinamik alan rendering + tip seçici (2974 test) · commit `6846584`
- Önceki — Toplu Seçme ve Silme — Tüm 6 Liste Sayfası (2954 test) · commit `c043636`
- Önceki — Faz 2b Review — 3 bulgu kapatma (2935 test)
- Önceki — Faz 2b — Tam ekran ürün detay sayfası + drawer kaldırma (2930 test)
- Önceki — Faz 2a Review — Tüm Bulgular Kapandı (2026-05-19; 2911 test)
- Önceki — Faz 2a — Batches + Attachments DB Foundation (2903 test)
- Önceki — Faz 1 Review P2 Tam Kapanış (2026-05-19; 2874 test)
- Önceki — Faz 1 Review — 3 bulgu kapatma (2026-05-19; 2873 test)
- Önceki — Modül Revize Faz 1 (2026-05-19; 2855 test)
- Sıradaki İş
- 35 Soruluk Q&A — Ana Kararlar Özeti
- Önceki İşler (kısa kronoloji)
