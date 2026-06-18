# Roven — Claude Code Rehberi

## Mevcut Durum
_Son güncelleme: 2026-06-18_

> Bu bölüm yalnız **güncel durumu + açık yükümlülükleri** tutar. Tam oturum geçmişi git log'unda ve `memory/current_focus.md`'de. Aşağıdaki indeks son dönem oturumlarına (commit + konu) hızlı bakış içindir; daha eski dönemler (Faz 2–3d AI Import, Sprint A–C, M-3 Rate Limiting, React Doctor, Teklif V2–V7 plan turları, Paraşüt Faz 1–11) git geçmişinde.

**Son tamamlanan iş:** **alerts modülü derin denetim (erp2-reviewer kampanyası B) + D1 düzeltmesi** (2026-06-19; GREEN; PUSH BEKLİYOR; **migration YOK**). REVIEW.md read-only (6 alert route + calendar-notes + service + helper'lar + sayfa/component); rapor `docs/audit/2026-06-19-alerts-review-bulgular.md` (**K:0 Y:0 O:0 D:1 Nit:0** — modül çok olgun). **D1 (Düşük):** `GET /api/alerts/[id]` `view_alerts` guard'sızdı → `dbGetAlertById` `select("*")` tam satır (ai_reason + ai_inputs_summary + serbest `user_note` + created_by); liste GET bilinçli DAR kolon + dashboard-tier ama `[id]` detay tam satırı verir. Kardeş route'lar (calendar GET, calendar-notes+[id], [id] PATCH) hepsi view_alerts/manage_alerts guard'lı; bu GET method-seviye kör noktada atlanmış → accounting (view_alerts YOK) + proxy-fail-open/anon tam detayı okuyabiliyordu. **GET'in UI tüketicisi YOK** (alerts/page.tsx tüm `/api/alerts/${id}` çağrıları PATCH) → guard hiçbir şeyi kırmaz, yalnız accounting/anon kapanır. **Düzeltme:** GET'e `requirePermission(view_alerts)` (PATCH + calendar kardeş kalıbı). **By-design (bulgu değil):** liste GET dashboard-tier (accounting AlertsPanel `useAlerts`); scan CRON_SECRET veya oturum (products mount'unda tüm view_products rollerinde oto-tetik → session-tier zorunlu, idempotent+locked+non-destructive); ai-suggest cron-only (`requireCronSecret`); calendar-notes session+view_alerts+ownership/visibility+validation (örnek-temiz); sync-retry manage_alerts. **Temiz:** AI üretimi G1/G2 sanitize + dedup; advisory-lock'lar. +3 test (YENİ `alerts-read-guards.test.ts`). tsc 0 · lint 0 · **5554 test** · build 0. **Kalan:** opsiyonel smoke (accounting→`GET /api/alerts/<id>` 403; alerts sayfası+dashboard tüm rollerde normal).

<details><summary>Önceki: customers/products modülü derin denetim + O1/D1/Nit</summary>

**customers/products modülü derin denetim (erp2-reviewer kampanyası B) + O1/D1/Nit düzeltmeleri** (2026-06-19; GREEN; PUSH EDİLDİ `ab635ff`; **migration YOK**). REVIEW.md read-only (customers 2 route + products 10 route + redact.ts + sayfalar); rapor `docs/audit/2026-06-19-customers-products-review-bulgular.md` (**K:0 Y:0 O:1 D:1 Nit:1**). **O1 (Orta):** `GET /api/customers` `view_customers` guard'sızdı → redaction yalnız `total_revenue`'yu maskeler, müşteri **PII** (ad/e-posta/telefon/adres/vergi) korumasızdı. `view_customers` production'da YOK + `page-access.ts:42` sayfayı production'a kapatır → production (+ proxy-fail-open/anon) tüm müşteri PII'sini doğrudan API'den okuyabiliyordu. Tüketici-güvenli: `useCustomers` yalnız manage_quotes/manage_sales_orders/view_customers UI'larında, dashboard'dan customers elenmiş, demo=viewer(view_customers taşır). **Düzeltme:** GET'e `requirePermission(view_customers)` (redaction korunur). products GET'ten asimetri kasıtlı (products dashboard-tier→accounting StockPanel ister, customers elenmiş→guard'lanır). **D1 (Düşük):** `GET /api/products/[id]/quotes` hiç guard'sızdı (kardeş shortages/supplier-prices `view_products` guard'lı) → teklif kırılımı (müşteri+miktar+satışçı e-postası `createdByEmail`) view_products'sız accounting+anon'a açıktı; redaction yalnız sales-price'ı maskeliyordu. **Düzeltme:** `resolveAuthContext`+`requirePermissionFor(view_products)` (kardeş kalıp; gate baseline redaction kaydı düşürüldü). **Nit:** `PATCH /api/customers/[id]` `revalidateTag("customers")` çağırmıyordu (POST/DELETE çağırıyor) → düzenleme ≤30s bayat; eklendi. **By-design (bulgu değil):** products/[id]/aging/counts GET guard'sız ama dashboard-tier (redaction'lı); attachments+signed-URL GET proxy-only (O11). **Temiz:** redact.ts kapsamlı (cache-dışı per-request), tüm yazma yolları role-guard'lı, attachments UUID/product_id/kind whitelist, supplier-prices/shortages view_products guard'lı. +6 test (YENİ `customers-products-read-guards.test.ts`) + 2 mevcut quotes test auth-mock güncellendi. tsc 0 · lint 0 · **5551 test** · build 0. **Kalan:** opsiyonel smoke (production→customers GET 403; accounting→products/[id]/quotes GET 403).
</details>

<details><summary>Önceki: production modülü derin denetim + O1 (reverse_production idempotency)</summary>

**production modülü derin denetim (erp2-reviewer kampanyası B) + O1 düzeltmesi** (2026-06-18; GREEN; PUSH EDİLDİ `2aaf14f` main=codex birebir; **mig.104 APPLY ✅**). REVIEW.md kurallarıyla read-only inceleme (3 route + service + supabase helper + complete/reverse_production RPC + page + dashboard paneli); rapor `docs/audit/2026-06-18-production-review-bulgular.md` (**K:0 Y:0 O:1 D:0 Nit:2**). **O1 (Orta):** `reverse_production` RPC (mig.008) üretim kaydını **`FOR UPDATE` olmadan** okuyordu → READ COMMITTED'de aynı `entry_id`'ye iki eşzamanlı DELETE (iki sekme/retry/script) ikisi de stale `v_entry` ile bitmiş-ürün düşüşü + BOM bileşen iadesi yapıyordu → on_hand **2× düşer**, bileşenler **2× iade**, tek (sıfır) kayıt kalır → **stok defteri sessizce bozulur** (sondaki `delete` idempotent ama stok mutasyonları satır-sayısına bağlı değil). RPC "Atomic" iddia ediyordu ama eşzamanlı reversal'a karşı değildi. Hafifletmeler: `delete_production` yalnız admin+production; UI `deletingId` + disabled + onay modalı (casual çift-tık korunur) — ama DB sınırı UI'ye güvenmemeli. **Düzeltme (mig.104):** entry select'e `for update` (tek satır) → satır kilidi iki tx'i serialize eder, kaybeden re-read'de silinmiş satırı bulamaz → temiz `{success:false}`, stok 1× geri alınır. Gövde 008 ile birebir; on_hand "zaten sevk" guard'ı DELETE öncesi → korunur; yeni deadlock yok. Gate `sql-lint-baseline` zinciri `reverse_production: ["004","008","104"]`. **By-design (BULGU DEĞİL):** `GET /api/production` guard'sız ama kasıtlı dashboard-tier (ana dashboard tüm rollerde `useProduction()` çağırır; no-session=viewer floor → `view_production` guard demo+4 rolde dashboard'ı kırar, `view_dashboard` no-op, hard 401 demo'yu kırar). **Nit-1:** `complete_production` çift-POST idempotent değil (ama görünür/geri-alınabilir). **Nit-2:** `dbCompleteProduction` UTC default tarih (dormant — sayfa hep yerel tarih gönderir). **Temiz:** POST/DELETE/transcribe guard'lı (manage/delete_production + session+MIME/boyut), complete_production FOR UPDATE deterministik kilit + shortage pre-check abort, scrap_qty kasıtlı düşülmez, shortage-helpers client-safe boundary, demo bloklu. **O1 saf SQL → vitest eşzamanlılığı kanıtlayamaz; enforced "test" = gate baseline zinciri.** tsc 0 · lint 0 · **5545 test** · build 0. **Kalan:** opsiyonel eşzamanlı-DELETE smoke (mig.104 APPLY ✅).
</details>

<details><summary>Önceki: import/AI modülü derin denetim + O1/D1</summary>

**import/AI modülü derin denetim (erp2-reviewer kampanyası B) + O1/D1 düzeltmeleri** (2026-06-18; GREEN; PUSH EDİLDİ main=codex birebir; **migration GEREKMEZ**). REVIEW.md kurallarıyla read-only inceleme (15 import + 6 AI route + ~5000 satır lib); rapor `docs/audit/2026-06-18-import-ai-review-bulgular.md` (**K:0 Y:0 O:1 D:1 Nit:1**). **O1 (Orta):** `GET /api/import/[batchId]` + `GET /api/import/drafts/[id]` hiç RBAC guard'ı içermiyordu (method-seviye kör nokta — dosya DELETE/PATCH'te `requirePermission` kullandığından dosya-seviye tarama "korunmuş" sanıyordu, gate baseline'da bile yok). `view_import` yalnız admin+purchasing'de → **sales/production/accounting/viewer (4/6 rol) + demo** bu uçları okuyabiliyordu (draft tedarikçi/fiyat verisi + batch metadata; proxy demo'ya `GET /api/*` izni verir, RBAC'i route'a bırakır). Y1 kardeş route'lara `view_import` eklemişti, bu iki tekil GET atlanmıştı. **Düzeltme:** her iki GET'e `view_import` guard'ı. **D1 (Düşük):** `/api/ai/ops-summary` route-seviye auth'suzdu (yalnız rate-limit) → proxy-fail-open + stock-risk Y2 tutarsızlığı (sömürülebilir değil: demo=session yok, tüm roller view_dashboard taşır). **Düzeltme (kullanıcı kapsamı: yalnız ops-summary):** session + `view_dashboard` (stock-risk Y2 kalıbı). **purchase-copilot (ALWAYS_PUBLIC+cron) + parse/score** RBAC'siz ama demo/anon zaten bloklu → raporda izlenir, dokunulmadı. **Temiz:** tüm import yazma/uygula yolları role-guard'lı (`manage_import`/`requireRoleFor(admin,purchaser)`), prompt-injection sanitizasyonu (G1/G2 input+output cap) `ai-service.ts` boyunca tutarlı, `requireRoleFor` purchaser→purchasing çift-normalize, extract abort/idempotency, apply field-approval whitelist. +4 test (2 import GET 403 + 2 ops-summary auth). tsc 0 · lint 0 · **5545 test** (+4) · build 0. **Kalan:** opsiyonel smoke (viewer/demo→import GET 403; dashboard AI özet tüm rollerde).
</details>

<details><summary>Önceki: Paraşüt modülü derin denetim + O1 (checkAuthAlertThreshold wiring)</summary>

**Paraşüt modülü derin denetim (kampanya B) + O1** (2026-06-18; `eb829ed`; **migration GEREKMEZ**); rapor `docs/audit/2026-06-18-parasut-review-bulgular.md` (**K:0 Y:0 O:1 D:0 Nit:2**). Modül çok olgun (Faz 1-11 + 2 önceki Bulgular turu). **⚠️ Bağlam:** Paraşüt şu an MOCK (`PARASUT_USE_MOCK`) + `PARASUT_ENABLED != "true"` → canlıda devre dışı; bulgu yalnız Faz 12 (canlı OAuth) go-live'da ısırır. **O1 (Orta):** `checkAuthAlertThreshold` (`parasut-service.ts:135`) export + 25 testle kanıtlı ama **hiçbir üretim çağıranı yoktu** (orphaned). Canlıda OAuth refresh_token iptal/expired olunca `getAccessToken` `auth` hatası → `error_kind='auth'` + 2099 retry-block → **tüm sipariş sync'leri sessizce durur**, operatöre alert açılmaz; dahası `/api/alerts/[id]/sync-retry` `ALERT_ENTITY_PARASUT_AUTH` alert'inden OAuth-refresh tetikler ama o alert hiç oluşmadığından **alert→sync-retry→OAuth-refresh kurtarma döngüsü asla tetiklenemiyordu**. **Kullanıcı kararı (AskUserQuestion): wire et.** `serviceSyncOrderToParasut` + `serviceRetryParasutStep` catch bloklarında, error sync-log yazımından SONRA, `pe.kind==="auth"` ise best-effort `checkAuthAlertThreshold()` çağrılır (log önce yazılmalı ki eşik bu hatayı saysın; `idx_alerts_active_dedup` çift alert önler). Yalnız `parasut-service.ts` değişti; +5 davranışsal test (`parasut-auth-alert-wiring.test.ts`). **Nit-1:** `getAccessToken` poll penceresi (5s) < lease TTL (30s). **Nit-2:** `serviceParasutOAuthRefresh` lease almadan global `expires_at` mutasyonu. (İkisi de dokunulmadı.) **Temiz doğrulananlar:** OAuth CSRF (HMAC-state/timing-safe/fail-closed/relative-redirect), token tablosu RLS (service_role-only) + claim/release RPC REVOKE/GRANT, RBAC (`view_parasut` yalnız admin+accounting=ikisi de view_sales_prices → invoices `select(*)` redaction açığı DEĞİL), secret maskeleme (config mask + demo enabled-only), stok invariant (adapter-throw + alert), idempotency/crash-recovery (TTL-lease mutex + attempted marker + remote lookup + poll idempotent guard + partial unique index'ler), discount reconcile (claim-öncesi/kuruş-int), invoice-no deterministik. tsc 0 · lint 0 · **5541 test** (+5) · build 0. **Kalan:** opsiyonel canlı smoke (Faz 12 sandbox'ta: refresh_token iptal → ≥3 sync denemesi → tek critical Paraşüt-auth alert).
</details>

<details><summary>Önceki: A1 — products sunucu tarafı sayfalama (A1 TAMAMLANDI 6/6)</summary>

**Son tamamlanan iş:** **A1 — products sunucu tarafı sayfalama (A1 SON LİSTE → A1 TAMAMLANDI 6/6)** (2026-06-17; GREEN; PUSH BEKLİYOR; **migration GEREKMEZ**). products diğer 5 aynanın temiz RSC kalıbına UYMAZ (risk/alert overlay'leri AI/POST + mount-sonrası → RSC'ye ucuza taşınamaz). **Kullanıcı kararı (AskUserQuestion):** "Client + sunucu-sayfalı fetch (tam sadakat)" — sayfa `"use client"` KALIR, mega-fetch → sayfalı `{rows,total}`; sinyal filtresi aktifken overlay ID seti sunucuya `id.in` ile geçer (tam sadakat korunur). **S0 (`supabase/products.ts`):** `dbListProductsPaged` (arama name/sku `.or` + çoklu-kategori `in(category)` + tip `eq(product_type)` + sinyal `in(id)` + `count:"exact"`; **`signalActive && ids boş → BOŞ döner** yanlışlıkla tümünü döndürmez); `dbGetProductListCounts` (tüm-katalog total+kategori sayaçları+kritik [`promisable=on_hand-reserved-quoted ≤ minStok`, `dbGetQuotedQuantities` gerekir] — hafif kolonlar, full-object değil); `PRODUCTS_DEFAULT_PAGE_SIZE=50`; `orIlikeFilter` import. **S1 (route):** `GET /api/products?paged=1` → `{rows,total}` (dizi şekli `?all=1`/çıplak GET DEĞİŞMEZ — yalnız paged=1 nesne) + YENİ `GET /api/products/counts` (yalnız adetler, hassas değil → gate baseline'a `public` kayıt). **S2 (`products/page.tsx`):** `mockProducts`(tüm) → `pageRows`(yalnız sayfa)+`total`+`counts`; `signalIds` memo (riskli=riskData/uyarılı=alerts/öneri=recMap-suggested → null="tümü"); `buildListParams`+`fetchList`+`refetchCounts`; arama 350ms debounce + filtre değişiminde `setCurrentPage(1)`; client `filtered`/`usePagination(filtered)`/`pagedItems` KALKTI → `computeTotalPages(total,PAGE_SIZE)`+`<Pagination onPageChange={setCurrentPage}>`; sinyal/kategori/kritik sayaçları artık overlay+counts'tan (sayfadan değil); mutasyon→`fetchList()+refetchCounts()`. **Test:** +7 (`products-pagination.test.ts` paged filtre/sinyal-boş-guard/count + counts agregasyon; `pagination-integration` products case server-side'a çevrildi; gate matrix `products/counts` baseline). tsc 0 · lint 0 · **5545 test** · build 0 (`/api/products/counts` ƒ dynamic). **Kalan:** push + manuel smoke (arama/kategori/tip/sinyal sunucuda filtreler+sayfalar; sinyal sekmeleri tam-katalog [yalnız sayfa değil]; sayaçlar/kritik doğru; mutasyon→liste+sayaç tazelenir; viewer redaction; demo bloklu). **⇒ A1 epic TAMAMLANDI** (orders pilot + quotes/PO/customers/vendors ayna + products = 6/6 liste).
</details>

<details><summary>Önceki: A1 — Server-side pagination rollout: quotes · purchase/orders · customers · vendors</summary>

**Son tamamlanan iş:** **A1 — Server-side pagination rollout: quotes · purchase/orders · customers · vendors** (2026-06-17; GREEN; PUSH BEKLİYOR; **migration GEREKMEZ**). Orders pilotunun (aynı gün, `d4ed2e9`) RSC + sunucu-filtre/sayfalama pattern'i 4 "ayna" listeye yayıldı; **products ERTELENDİ** (risk/AI/alert overlay + çoklu-kategori filtreleri tüm set üzerinde → ayrı redesign turu, `deferred_backlog` A1 kalanı). Kullanıcı kararı (AskUserQuestion): 4 ayna + products ertele · **paylaşılan soyutlama**. **Shared infra:** `src/hooks/useListUrlState.ts` (`useListUrlState` navigate+useTransition, `current` ref'te → navigate kararlı; `useDebouncedSearch` 350ms) + `src/lib/list-query.ts` (`firstStr`/`parsePage`/`orIlikeFilter` — `.or()` güvenli escape, RFQ emsali); **orders pilotu da bu hook'lara refactor edildi** (tek bakım noktası). **Her sayfa (orders S0–S3 tekrarı):** DB `db<X>Paged` (`count:"exact"` tek sorgu rows+total, filtreler ORDER/RANGE'den önce) + sayaç fn; `page.tsx`→SUNUCU component (`force-dynamic`, `await searchParams`, RBAC redaction route ile birebir, mapper) + `loading.tsx` iskelet; `<X>Client.tsx` URL-driven filtre/pagination + debounce arama, mutasyon→`router.refresh()`. **Sayfa özellikleri:** quotes (status tab+arama+döviz+tarih, `dbListQuotesPaged`/`dbCountQuotesByStatus`); purchase/orders (status+arama; **tedarikçi-adı araması**: ada eşleşen vendor_id'ler çözülüp `.or(po_number.ilike, vendor_id.in)`; vendorMap server'da; `dbListPurchaseOrdersPaged`/`dbCountPurchaseOrdersByStatus`); customers (arama+aktif/pasif; **pasif sekmesi düzeltildi** — eski `dbListCustomers` yalnız aktif döndürüp pasif sekmesini boş bırakıyordu; `dbListCustomersPaged`/`dbCountCustomers`; mutasyon doğrudan fetch + `mutate(CUSTOMERS_KEY)` ile dashboard cache tazelenir); vendors (arama name/kişi/e-posta + "Pasifleri göster"; `dbListVendorsPaged`; tab yok → yalnız total). **RSC sonucu:** client `loadError`/`loadVendors` graceful-retry modeli kalktı → sunucu hatası Next error boundary'sine düşer (sessiz yutma yok). **Test:** +~50 (4 `<page>-pagination.test.ts` filtre→sorgu+total+sayaç + `list-url-state.test.tsx` hook davranışı + ~10 source-lock testi page→Client yönlendirildi/RSC'ye uyarlandı: pagination-integration server-side, underlined/button/faz7/theme/interactive/quotes-ui/purchase-orders-ui/customers-ui/vendors-ui). tsc 0 · lint 0 · **5538 test** · build 0 (5 hedef route ƒ dynamic). **Kalan:** push + manuel smoke (her sayfa: filtre/arama/sayfa URL'e + geri/ileri; sayaçlar; mutasyon→refresh; viewer redaction; demo bloklu; **customers pasif sekmesi artık dolu**; büyük veride sayfalanır) + **sonraki tur: products** (ayrı/ağır).
</details>

<details><summary>Önceki: A1 — Orders sunucu tarafı sayfalama (RSC pilot, `d4ed2e9`)</summary>

**Son tamamlanan iş:** **A1 — Orders sunucu tarafı sayfalama (RSC pilot)** (2026-06-17; GREEN; PUSH `d4ed2e9`; **migration GEREKMEZ**). Ertelenen en büyük teknik tur (`deferred_backlog` A1). Kullanıcı kararı (AskUserQuestion): **RSC + loading.tsx tam yeniden** + **orders pilotu → sonra diğer 5 listeye yay**. Önceki model: liste `?all=1` ile TÜM satırları client'a çekip `usePagination`+`useMemo` ile bellekte filtreler/dilimlerdi. **Yeni:** **S0 (`supabase/orders.ts`):** `dbListOrdersPaged(OrdersPageQuery)` tek sorguda `count:"exact"` ile filtre uygulanmış satır+total döner (tab→commercial/fulfillment eksen çevirisi UI `matchesTab` birebir; arama/tarih/döviz/müşteri SQL'e); `dbCountOrdersByTab` 6 global head+count rozet sayacı (arama/tarih-bağımsız = eski UI davranışı); `buildOrderSearchOrFilter` PostgREST `.or()` güvenli escape (RFQ O2 emsali). service: `serviceListOrdersPaged`/`serviceCountOrdersByTab`. **S1 (`orders/page.tsx`):** artık SUNUCU component'i (`force-dynamic`) — `await searchParams` (tab/search/customer[Id]/from/to/currency/page; `customer` eski deep-link korunur) → `resolveAuthContext`+`view_sales_orders` guard → `serviceListOrdersPaged`+`serviceCountOrdersByTab` (Promise.all) → `redactOrdersForPerms` (route ile birebir) → `mapOrderSummary` → `<OrdersClient/>`; + `loading.tsx` iskelet. **S2 (`OrdersClient.tsx` yeni client):** tüm etkileşim (tab/arama/tarih/döviz/pagination) URL'e yazılır (`router.replace`+`useTransition`), arama 350ms debounce, satırlar yalnız geçerli sayfa prop'undan; `usePermissions` (RBAC string'leri korundu), demo guard, bulk/single iptal → `router.refresh()`. **Test:** +26 (`orders-pagination` filtre→sorgu+total+escape+sayaç · `orders-rsc-pagination` mimari kilit · 9 source-lock testi page→OrdersClient yönlendirildi · `pagination-integration` orders case server-side'a özelleştirildi). tsc 0 · lint 0 · **5514 test** · build 0 (`/dashboard/orders` artık ƒ dynamic). **migration YOK** (mevcut kolonlar + count). **Kalan:** push (main+codex FF+proje-codex) + manuel smoke (filtre/arama/tarih/döviz/sayfa URL'e yazılır + geri/ileri çalışır; tab sayaçları doğru; iptal sonrası refresh; viewer redaction; demo bloklu; büyük veri sayfalanır). **Sonraki tur:** aynı pattern'i products → customers → vendors → quotes → purchase/orders'a yay (`deferred_backlog` A1 kalanı).

<details><summary>Önceki: Orders modülü derin denetim + bulgu düzeltmeleri (Y1/O1/O2/D1/N1/N2)</summary>

**Son tamamlanan iş:** **Orders modülü derin denetim + bulgu düzeltmeleri (Y1/O1/O2/D1/N1/N2)** (2026-06-17; GREEN; PUSH BEKLİYOR; **migration GEREKMEZ**). `erp2-reviewer` orders modülünü taradı (rapor `docs/audit/2026-06-17-orders-review-bulgular.md`, K:0 Y:1 O:2 D:1 Nit:2; mekanik araçlar yeni bulgu yok), kullanıcı "raporu commit'le + bulguları düzelt" dedi. Plan onaylı. **Y1 (kök):** `serviceReceivePOLines` PO mal kabulü sonrası alınan ürünler için `dbTryResolveShortages` (best-effort) → PO ile gelen stok onaylı `partially_allocated` siparişi otomatik `allocated`'a yükseltir (mevcut RPC promosyonu mig.008 reuse) → eskiden sipariş kalıcı sıkışıyordu. **O2:** yeni `POST /api/orders/[id]/reallocate` + `serviceReallocateOrder` (açık shortage ürünlerini FIFO çözer) + UI "Yeniden Rezerve Et" butonu; "Sevket" yalnız `allocated`'da aktif. **O1:** orders GET'lerine `view_sales_orders` guard'ı (gate dosya-seviye kör noktası nedeniyle açıktı; PII redaction bilinçli eklenmedi). **D1:** `partially_shipped` TS seviyesinde tamamen kaldırıldı (tip/UI/view-model/seed→`shipped`/test; uygulanmış SQL'e dokunulmadı — karar: tamamen kaldır). **N1:** OrderForm 3× `localISODate`. **N2:** parasut-status `dbGetProductParasutIds` batch (N+1 giderildi). **+10 yeni test** (`orders-review-fixes.test.ts`) + 2 mevcut test güncellendi (parasut-status mock → Map, orders-route-all mock → resolveAuthContext). tsc 0 · lint 0 · **5488 test** · build 0 (`/api/orders/[id]/reallocate` manifest'te). **Açık follow-up:** gate guard-matrix method-seviye tespiti (ayrı tur). **Kalan:** push (main + codex FF + proje-codex) + manuel smoke (approved+partially_allocated → PO mal kabul → otomatik allocated + Sevket açılır; "Yeniden Rezerve Et" aynı sonuç; allocated olmadan Sevket disabled).

</details>

</details>

<details><summary>Önceki: erp2-reviewer denetim turu — RFQ modülü O1/O2/D1 + mekanik tarama</summary>

**Son tamamlanan iş:** **erp2-reviewer denetim turu — RFQ modülü O1/O2/D1 düzeltildi** (2026-06-17; GREEN; PUSH BEKLİYOR; **migration GEREKMEZ**). `/erp-review` (full) ilk uçtan-uca koşu — restart sonrası `erp2-reviewer` subagent çağrıldı. Bulgular `docs/audit/2026-06-17-review-bulgular.md` (K:0 Y:0 O:2 D:1 Nit:2; önceki 2026-06-16 turunun O1/O2/D1/D2'si `01501ff`'te zaten kapanmıştı → bu tur yeni noktalar). **Düzeltmeler:** **O1** `rfq-service.ts` tedarikçi e-postası gövdesi `escapeHtml`'siz interpole ediyordu (latent stored-XSS / konvansiyon sapması) → yerel `escapeHtml` helper'ı + `vendor_name`/`rfq_number`/`due_date` sarmalandı; **O2** `supplier-rfqs.ts` arama PostgREST `.or()`'a ham giriyordu (filtre enjeksiyonu) → `buildRfqSearchOrFilter` saf helper (çift-tırnak + `"`/`\` escape; `,`/`.`/`()` koşul ayracı olamaz); **D1** `rfq-archives.ts` yeniden gönderimde arşiv INSERT'i UNIQUE'e çarpıyordu → upload-önce + `upsert(onConflict: "rfq_id,vendor_id")` (orphan-satır da elendi). **+7 regresyon testi** (`rfq-review-fixes.test.ts`). PUSH `7c0d92e` (main + codex FF + proje-codex). **Ardından N1+N2 temizlendi:** N1 `orders/[id]/page.tsx` teklif-vade `localISODate(Date.now())`'e; N2 `validateRfqAwards` ölü `quantity`/`unit_price` zorunluluğu kaldırıldı (yalnız `{rfq_line_id,vendor_id}` UUID) + `RfqAward` tipi daraltıldı + UI `handleAward` gereksiz fiyat/qty payload'ını bıraktı (fiyatsız-kalem UX guard'ı korundu). tsc 0 · lint 0 · **5478 test** · build 0 (migration GEREKMEZ). ✅ **Mekanik tarama (kullanıcı isteğiyle aynı gün tüm repo):** semgrep (554 registry+7 erp kuralı, 923 dosya) → 85 bulgu hepsi `roven-*` özel kurallardan, registry ~0, hepsi triyajlı kategoride (hardcoded-color doc/print · utc-slice test/seed/UI + 3 sunucu-tarafı GÜVENLİ doğrulandı [noon/Z-anchored] · tailwind-FP · money-rounding kabul · dangerouslySetInnerHTML hepsi statik CSS) — **yeni gerçek bulgu yok**; gitleaks (657 commit history → 2 FP [sentetik test fixture + tarihsel placeholder] · WT 149→6 gerçek = `.env.local` [gitignore'lı, hiç commit edilmemiş] + fixture) — **gerçek secret sızıntısı 0**. Detay raporda. **Tüm denetim bulguları (K/Y/O/D/Nit) kapandı + mekanik katman temiz.**

</details>

<details><summary>Önceki: Kapsamlı inceleme ajanı — `erp2-reviewer` subagent + Semgrep/gitleaks (`efab85c`)</summary>

**Son tamamlanan iş:** **Kapsamlı inceleme ajanı — `erp2-reviewer` subagent + Semgrep/gitleaks** (2026-06-16; PUSH `efab85c` iki branch aynı SHA; **ürün kodu DEĞİŞMEDİ**). İstek: bug/semantik/güvenlik tarayan ajan + güvenilir repo/skill araştırması. 2 araştırma turu (yerel altyapı + web). **Kararlar (AskUserQuestion):** subagent / Semgrep+gitleaks / yerel-istek-üzerine / bespoke (vetted repodan beslen). **Yapıldı:** `.claude/agents/erp2-reviewer.md` (izole bağlam; önce REVIEW.md+domain-rules+permissions+gate-baseline+denetim-raporu okur → semgrep+gitleaks+npm audit yorumlar → güvenlik+semantik checklist → çıktı `docs/audit/<tarih>-review-bulgular.md` **K/Y/O/D + Kanıt/Etki/Düzeltme/Efor**, Nit≤5, gate-kapsadığını tekrar etmez, yalnız RAPOR); `.semgrep/erp-rules.yml` (7 kural: NEXT_PUBLIC secret[anon hariç]/UTC-slice Y6/para-yuvarlama D1/Tailwind/framer-motion/hardcoded-renk/dangerouslySetInnerHTML); `/erp-review` (full|diff) komutu; README notu. `brew install semgrep gitleaks` (1.166/8.30). **Regresyon-kanıt:** Y6 32 / D1 7 hit yeniden bulundu, next-public-secret 0. Detay [[reference_review_agent]]. **⚠️ Subagent oturum-başında yüklenir → `erp2-reviewer`'ı Task ile çağırmak için RESTART gerekir; ilk uçtan-uca koşu restart sonrası.**

</details>

<details><summary>Önceki: RFQ takip geliştirmeleri — 4 özellik (`1c89326`; mig.101+102 APPLY ✅, smoke ✅)</summary>

**Son tamamlanan iş:** **RFQ takip geliştirmeleri — 4 özellik** (2026-06-16; GREEN; PUSH `1c89326`; **mig.101+102 APPLY ✅, uçtan-uca smoke ✅** — RFQ-2026-0001→PO-2026-0007 doğrulandı; mig.102 = create_rfq `rfq_id ambiguous` 42702 fix'i smoke sırasında bulundu). RFQ modülü push edildikten sonra (`0c8460c`) kullanıcı seçimiyle (AskUserQuestion, 4'ü de) RFQ verisini görünür/yararlı kılan takipler: **(1) PO son-fiyat önerisi + fiyat geçmişi** — `dbListVendorLinks`+`GET /api/product-vendor-links` (`redactVendorLinksForPerms`/`view_purchase_costs`), `pickPurchaseUnitPrice` öncelik tedarikçi-son-fiyat>cost_price + PO formu "son alış" ipucu, ürün detay Tedarik sekmesi `SupplierPricesPanel` (`GET /api/products/[id]/supplier-prices`); **(2) RFQ tedarikçi önerisi** — `rfq-suggest.suggestVendorsForProducts` (saf), new formda "Önerilen" rozeti+son fiyat+"Önerilenleri seç"; **(3) Gerçek PDF eki** — `src/lib/rfq-pdf/` (RfqPdfDocument react-pdf, fiyatsız, quote fontları reuse), serviceSendRfq `Fiyat-Talebi-<no>.pdf` ekler (arşiv HTML in-app view'da kalır); **(4) `rfq_response_due` uyarısı** — `mig.101` (alerts type CHECK, 089 deseni), `dbListRfqsAwaitingResponse`+`serviceCheckRfqResponseDue` (po_overdue aynası)+scan+Vadeler sekmesi+takvim "Talebi Aç" linki. **+22 test.** tsc 0 · lint 0 · **5461 test** · build 0. Tek kalan erteleme: ayrı print sayfası (arşiv-view yeterli). Detay [[reference_rfq_module]]. **mig.101+102 APPLY ✅ + smoke ✅ (tamamlandı).**

</details>

<details><summary>Önceki: Tedarikçi Fiyat Talebi (RFQ) modülü — yeni epic (Faz A–F, `0c8460c`)</summary>

**Son tamamlanan iş:** **Tedarikçi Fiyat Talebi (RFQ) modülü — yeni epic (Faz A–F)** (2026-06-16; GREEN; mig.100 APPLY ✅; PUSH `0c8460c`). **İstek:** müşteri "tedarikçilerden fiyat araştırması, kimde ne kadar/kim ne kadar teklif verdi takip + onlara nasıl talep göndereceğim" — satın alma tarafı TAMAMEN eksikti. **Kararlar (AskUserQuestion):** tedarikçi tarafı / tam RFQ akışı (talep→çok tedarikçiye gönder→fiyat gir→karşılaştır→kazananı PO'ya çevir) / e-posta+belge gönder + yanıtları elle gir (portal yok). **Odoo modeli:** RFQ≈taslak PO; `award_rfq_create_pos` mevcut `create_purchase_order_with_lines` (049) çağırır = vendor başına 1 PO. **Yapıldı:** `mig.100_supplier_rfq.sql` (6 tablo: supplier_rfqs/_lines/_vendors/_prices + supplier_price_history + supplier_rfq_archives; rfq_counters/generate_rfq_number RFQ-YYYY-NNNN; product_vendor_links ALTER last_unit_price/currency/at; 7 RPC create/update/mark_sent/upsert_vendor_quote/award/cancel; rfq-pdfs bucket) **APPLY BEKLİYOR**. Backend: database.types satır tipleri, supabase/supplier-rfqs.ts + rfq-archives.ts, rfq-validation.ts, rfq-comparison.ts (saf en-iyi-fiyat + exchange-rates cross-currency), RBAC `view_rfqs`/`manage_rfqs` (purchasing+accounting-view; redaction `view_purchase_costs`), page-access kuralı, 7 API route. Belge: RfqDocument.tsx + rfq-archive-html + rfq-document-helpers (iki dilli, FİYATSIZ) + rfq-service serviceSendRfq (arşiv+e-posta NON-FATAL). UI: liste/yeni(RfqForm)/detay-hub (vendor paneli + VendorQuoteModal + ComparisonMatrix en-ucuz-yeşil + award→PO) + Sidebar "Fiyat Talepleri". **Bilinçli v1 ertelemeleri:** HTML belge (react-pdf sonraya), print=arşiv-view, öneri yok, rfq_response_due alert yok. **+39 test.** tsc 0 · lint 0 · **5449 test** · build 0. Detay [[reference_rfq_module]]. **Kalan: mig.100 APPLY (Studio) + manuel smoke + push.**

</details>

<details><summary>Önceki: Teklif satır tablosu sadeleştirme — Ölçü + Ağırlık kolonları KALDIRILDI (`5caa888`)</summary>

**Son tamamlanan iş:** **Teklif satır tablosu sadeleştirme — Ölçü + Ağırlık kolonları TAMAMEN KALDIRILDI** (2026-06-16; GREEN; commit `5caa888`, PUSH BEKLİYOR). **İstek (semantik):** kullanıcı "kg/size bilgileri nasıl kullanılabilir, bayağı birim seçeneği koyduk, semantik hata var gibi" → "Ölçü=DN50 ürünün ismi, karıştırma" → "Ağırlık kolonu tamamen olmasın, birim hallediyor (kg→miktar kütle, adet→ağırlık gereksiz)". **Kararlar (AskUserQuestion):** Ölçü TAMAMEN KALDIR (açıklamaya GÖMME=çift yazım, DN zaten adda); Ağırlık TAMAMEN KALDIR. **Kanıt:** seed ürün adı DN içerir ("Küresel Vana Class 600 DN20…"), `buildQuoteLineDescription` adı önce koyar → `size_text` redundant; `unit` (mig.099) kütle/adet ayrımını yapar. **Üç yüzeyden (form+HTML belge+PDF) iki kolon + Toplam Ağırlık satırı kaldırıldı.** Silinen: `isWeightBasedUnit` (bir tur önce eklenip geri alındı), form "Ağırlık" toggle/`showWeightForced`/`showKgCol`/`showSizeCol`/Columns3/kg input/`handleKgChange`. colSpan SABİT (`baseCols=8`/`formBaseCols=9`). **VERİ HATTI DORMANT korunur:** `size_text`/`weight_kg` auto-fill+payload+RPC+mapper+hydration aynen → **migration YOK, eski tekliflerde veri kaybı yok**. Testler güncellendi (iki kolon+totalKg satırı yokluğu source-lock; data hattı doğrulandı). tsc 0 · lint 0 · **5410 test / 400 dosya** · build 0. Kural [[reference_quote_line_columns]]'da kalıcı (ikisini de tekrar EKLEME).

</details>

**Önceki iş (SUPERSEDED):** **Teklif Ölçü/Ağırlık kolonları koşullu (099 takip)** (2026-06-16; GREEN; PUSH `80f0961`). Bu turda kolonlar tamamen kaldırıldığı için koşullu-render yaklaşımı geçersiz kaldı. **İstek:** satır birimi (099) sonrası kullanıcı düzeni sorguladı — Ölçü (Size) birime bağlı (kg/metre üründe anlamsız, "her ürünün ölçüsü olmayabilir"), Ağırlık (Kg) çoğu teklifte gereksiz → her-zaman-görünen kolonlar kalabalık. **Karar (AskUserQuestion, 2/2 önerilen):** ikisi de **koşullu göster** (kolon yalnız en az bir satırda veri varsa görünür). **Doğrulanan:** quote ağırlığı yalnız bilgilendirme (sevkiyat ağırlığı `shipments.net/gross_weight_kg` AYRI); belge toplam-ağırlık zaten koşulluydu. **Tek kural, üç yüzey (mig/veri YOK, saf sunum):** `showSize/showKg = rows.some(...)`. **QuoteDocument** (HTML): th+hücre koşullu, not/boş-satır `colSpan` dinamik (`baseCols = 8 + size + kg`). **QuotePdfDocument:** aynı, `ItemRow`'a prop; gizlenince Description (`grow`) genişler. **QuoteForm:** `showSizeCol/showKgCol = optionalColsForced || rows.some(...)` — ürün seçilince master'dan ölçü/ağırlık dolarsa otomatik belirir + toolbar **"Ölçü & Ağırlık" toggle** (`Columns3`, `aria-pressed`) boş quote'a elle giriş; not satırı `colSpan={formBaseCols}` (9 + koşullu). +1 test dosyası `quote-optional-columns.test.ts` (+14) + 3 mevcut source-lock güncellendi (faz4c empty colSpan 10→8, faz4a colSpan→baseCols, note→formBaseCols). tsc 0 · lint 0 · **5415 test / 400 dosya** · build 0. Migration gerekmez.

**Önceki iş:** **Teklif satırı bazlı ölçü birimi (mig.099, APPLY ✅)** (2026-06-16; GREEN; PUSH `9f8fd17` iki branch aynı SHA). **İstek:** "teklif formunda birim kısmı… her ürünün birimi vs aynı olmuyor" — Miktar kolonu her satıra sabit "Adet" yazıyordu; PMT çok-tipli katalogda birim farklı (adet/metre/kg/m²…). **Kararlar (AskUserQuestion, 3/3 önerilen):** belge = Miktar hücresine **birleşik** ("70 adet", yeni kolon DEĞİL) · form = ürün seçilince **otomatik dolar** + serbest düzenlenebilir (datalist) · siparişe = **teklif birimi öncelikli** COALESCE. **`size_text`(065)/`note`(098) "satıra alan ekle" emsali**; `products.unit` zaten NOT NULL. **mig.099:** `quote_line_items.unit text` (nullable) + **4 RPC redefine** — create/update_quote_with_lines (098 gövdesi + INSERT'e `unit` + `NULLIF(ln->>'unit','')`; line_total/assert_quote_totals_sane DOKUNULMADI → toplamı etkilemez), `send_quote_and_create_pending_order` (**094 halefi**) + `accept_quote_and_create_order` legacy draft yolu (**088 halefi**) → `order_lines.unit = COALESCE(NULLIF(qli.unit,''), p.unit)`. **DİKKAT: send=094, accept=088 en güncel gövdeler (078 DEĞİL).** **Zincir:** database.types(`unit:string|null`)/quotes.ts(CreateQuoteLineInput)/mock-data/api-mappers(null→"")/quote-types(döküman)/quote-archive-html. **Form:** QuoteRow+emptyRow+`handleSelectProduct` autofill `p.unit`+hydration+payload(`unit: r.unit.trim()||undefined`); Miktar hücresi miktar üstte + serbest birim input altta (`<datalist id="quote-units">` 12 öneri); Qty th "Miktar / Birim" width 70→92. **Belge:** QuoteDocument(HTML)+QuotePdfDocument miktar+birim birleşik ("12 metre"; boşsa yalnız sayı); PDF qty kolonu 52→74; başlık zaten BILINGUAL "Miktar / Qty" (sabit "Adet" yalnız formdaydı→kalktı). **Gate:** `sql-lint-baseline` 4 zincire 099 + `check-migrations` PROBES'a 099 (`quote_line_items.unit` column probe). +1 test dosyası/+21 test (mig source-lock/mapper/RPC payload/HTML birleşik+başlık-Adet-yok/arşiv/PDF render/form 7 source-lock/gate). tsc 0 · lint 0 · **5401 test / 399 dosya** · build 0. **Kalan (KULLANICI):** **mig.099 APPLY** (Studio → `npx tsx scripts/check-migrations.ts` doğrular) + smoke: ürün seç→birim otomatik dolar; elle "kg"→kaydet→yenile (korunur); Önizle/PDF "12 metre"; **Kabul et**→siparişte birimler teklifle aynı (COALESCE); koyu/aydınlık tema; demo bloklu.

**Önceki iş:** **Teklif satırı bazlı serbest "Not" alanı (mig.098, APPLY ✅)** (2026-06-15; GREEN). **İstek:** "teklif sayfasında genel notlar kısmını her ürün içinde ayrı not oluşturulabilsin şeklinde ürün satırında bulunsun" (plan + soru-cevap → uygula). **Kararlar (AskUserQuestion):** Genel Notlar KALIR + satır bazlı not (iki seviye) · **açılır not satırı** (tablo 10 kolon dar → yeni kolon DEĞİL) · not müşteri belgesinde de görünür (HTML+PDF+e-posta eki, TR/EN bilingual) · siparişe TAŞINMAZ. **Mevcut `description` ("Ürün Tanımı") korundu** (üründen otomatik teknik tanım, mig.080 siparişe taşır); yeni `note` ondan AYRI serbest alan (`size_text` 065 / `unit_weight_kg` 068 "satıra alan ekle" emsali). **mig.098:** `quote_line_items.note text` + `create/update_quote_with_lines` 093 gövdesiyle birebir yeniden tanım (yalnız INSERT'e `note` + `NULLIF(ln->>'note','')`; line_total/assert_quote_totals_sane DOKUNULMADI → toplamı etkilemez); gate `sql-lint-baseline` RPC zinciri + `check-migrations` PROBES'a 098. **Zincir:** database.types/quotes.ts(CreateQuoteLineInput)/mock-data(QuoteLineItem)/api-mappers(null→"")/quote-types(döküman QuoteRow)/quote-document-helpers(`BILINGUAL_LABELS.lineNote`). **Form:** QuoteRow+emptyRow+hydration+payload(`note: r.note.trim()||undefined`) note taşır; açılır not satırı — StickyNote toggle (not doluysa accent renkli) → `expandedNoteRowIds` Set → `<td colSpan={11}>` tam-genişlik textarea (`.q-notes` stili), `readOnly`'da gizli, actions kolonu 28→56px. **Belge:** QuoteDocument(HTML tek `<td colSpan={10}>` paddingLeft girinti+borderLeft brand, `colSpan={9}` üretmez)+QuotePdfDocument(`S.noteRow` View wrap=false) ürün satırının altına "Not / Note:" ön-etiketli koşullu satır; `quote-archive-html` rows.note eşlemesi (arşiv+PDF tek kaynak). +2 test dosyası/+24 test (098 SQL+gate · mapper/RPC/label/HTML/arşiv/PDF render/form 9 source-lock). tsc 0 · lint 0 · **5353 test / 395 dosya** · build 0. UI projenin inline-style+CSS-var konvansiyonlarıyla (/frontend-design yerine in-grid uyum). **Kalan (KULLANICI):** manuel smoke — satıra Not → kaydet → yenile (korunur) → Önizle/PDF ürün altında + notsuz satırda yok → Gönder mail PDF+arşiv → Genel Notlar ayrı → koyu/aydınlık tema, demo bloklu.

**Önceki iş:** **Teklif e-postası: gerçek PDF eki (@react-pdf/renderer)** (2026-06-13; GREEN). **Kullanıcı kararı değişti:** önceki turun "ek YOK + Teklifi Görüntüle linki" yaklaşımı kaldırıldı — "maille iletilen teklifler pdf olsun"; AskUserQuestion: link OLMAYACAK, ekte `Teklif-<no>.pdf`; kapsam yalnız e-posta eki (arşiv/paylaşım HTML altyapısı KODDA KALIR — bucket text/html, migration yok). **Motor:** `@react-pdf/renderer@4.5.1` (saf JS; React 19 peer ✓; mupdf HTML→PDF yapamıyor, Gotenberg/Chromium reddedildi). **Yeni modül `src/lib/quote-pdf/`:** `fonts/` Montserrat 600/700/800 + Inter 400/500/600 statik TTF (Google Fonts, OFL.txt; fvar yok doğrulandı — Türkçe için TTF embed ZORUNLU, std-14 font WinAnsi) · `register-fonts.ts` idempotent Font.register + italik istekleri dik dosyaya bağlanır (12 dosya yerine 6) + **heceleme callback'i: kelime bütün kalır, uzun tireli kodlar tire ÖNCESİNDEN bölünür** (textkit kelime-içi kırılmaya görsel tire EKLER — tire sondaysa "FWBV--" çift tire çıkıyordu) · `QuotePdfDocument.tsx` QuoteDocument'in yakın kopyası (BILINGUAL_LABELS + helpers'a taşınan fmt/fmtDate/SYM tek kaynak; px×0.75=pt ölçek; kolonlar ×0.92 — sayfa padding'i desc kolonunu yiyordu; **trUpper=toLocaleUpperCase("tr-TR")** — react-pdf textTransform i→I yapıyordu "MÜŞTERI"; satırlar wrap=false; uzun kod fontu 8.5'e düşer) · `index.ts` renderQuotePdfBuffer (lazy import'lar) + quotePdfFilename sanitize + resolvePdfLogo (inlineLogoAsDataUri reuse + yalnız PNG/JPEG — react-pdf Image SVG/webp desteklemez, SVG logo→placeholder bilinen sınır). **quote-service:** viewUrl/createQuoteShareToken e-posta yolundan ÇIKTI (token lib + `/api/quotes/shared` route DURUYOR); arşiv audit olarak non-fatal sürer; **PDF üretilemezse FAIL** `reason:"pdf_failed"` → route 502 "PDF belgesi oluşturulamadı — e-posta gönderilmedi" (belgesiz mail gitmez, log açılmaz); sendDirectEmail `attachments:[{filename, content}]`. **templates:** viewUrl ctx alanı kalktı → `attachmentFilename`; docBlock tek dal "ekinde PDF olarak". Detay sayfası modal metni "teklif belgesi PDF olarak eklenir". **next.config:** serverExternalPackages += @react-pdf/renderer; outputFileTracingIncludes `/api/quotes/**` → fonts/*.ttf (standalone'da fontlar + @react-pdf doğrulandı ✓). Görsel smoke: örnek PDF üretilip gözle incelendi (3 tur: İ-fix, kolon ölçeği, çift-tire fix). +testler: `quote-pdf-render` gerçek render smoke (yoga vitest'te sorunsuz; %PDF- + >10KB Türkçe karakterli) · send-customer 14 (attachment/pdf_failed/arşiv-non-fatal + kaynak kilitleri) · şablon "ekindedir"+link-yok · route pdf_failed→502. tsc 0 · lint 0 · **5329 test / 393 dosya** · build 0 · deps-gate OK (allowlist boş kaldı). **Kalan (KULLANICI):** redeploy → taslak gönder → mailde `Teklif-<no>.pdf` açılır (PC+mobil; Türkçe karakter + logo), gövdede link yok; seed yeniden çalıştırma adımı hâlâ açık.

**Önceki iş:** **Canlı smoke bulguları turu — 4 düzeltme** (2026-06-13; GREEN). Kullanıcının seed-sonrası canlı smoke bulguları: (1) **Donut mobil takılması** — dokunma mouseleave üretmiyor → `Donut.tsx` touch pointerdown TOGGLE + 700ms ghost-mouse penceresi, masaüstü hover korunur; (2) **Topbar Roven markası `/dashboard` linki** (next/link, UserAvatarLink kalıbı); (3) **kaydet→Gönder onayında eski e-posta** — sunucu gönderimi zaten tazeydi, stale olan detay sayfası state'i → `QuoteForm onSaved` prop'u PATCH/POST yanıtını parent'a verir, sayfa setQuote ile tazeler; (4) **teklif e-postası eki kaldırıldı → link'li gövde** (kullanıcı kararı; .html eki Gmail PC'de ham kod, mobilde logosuz görünüyordu): yeni `quote-share-token.ts` (HMAC 30g TTL; `QUOTE_SHARE_SECRET` yoksa CRON_SECRET'tan alan-ayrımlı türetme) + public `/api/quotes/shared/[token]` (ALWAYS_PUBLIC; arşiv HTML'i kendi origin'den text/html) + `inlineLogoAsDataUri` (yalnız kendi Supabase host'u, SSRF guard) arşiv logosunu data-URI gömer; link üretilemezse e-posta linksiz yine gider. Ek: order-service testinin gece-yarısı TZ kırığı düzeltildi (UTC→localISODate). +22 test; tsc 0 · lint 0 · **5318 test / 392 dosya** · build 0. **Kalan (KULLANICI):** redeploy → smoke (donut dokunma · logo→dashboard · kaydet→gönder yeni adres · mailde ek yok+link+logo) + seed'i bir kez daha çalıştır (teklif arşivleri HTML fix'i `ac82c0b` için).

**Önceki iş:** **Senaryosal kapsamlı seed — gerçek PMT katalog verisiyle tüm modüller** (2026-06-12; GREEN). **İstek:** "sistemin her şeyiyle doğru çalıştığından emin olmak için senaryosal seed dataları." Kararlar (AskUserQuestion): orta boy (20 ürün/8 müşteri/15 sipariş/8 teklif/5 PO) · storage'a sentetik mini dosyalar · gerçek katalog `pmt/`'den (Langge PT0108 Excel + PMT.pdf parse edildi; **orijinaller public repo'ya KONMAZ, fiyatlar yuvarlanmış türev**) · 6 rol hesabı `rol@pmt-demo.test` (şifre **`SEED_DEMO_PASSWORD` env** — koda yazılmaz) · şirket gerçek adres/tel/web, VKN kurgusal. **ŞART (kullanıcı): dış dünyaya SIFIR etki** — e-posta gönderilmez (email_logs sahte geçmiş; runner'da e-posta/Paraşüt/AI import yasağı test kilidiyle), tüm adresler @example.com/.test. **Yapı:** `/api/seed` thin orchestrator (auth sözleşmesi değişmedi); mantık `src/lib/seed/` (seed-data saf sabitler + seed-runner clearAllData/runSeed 23 bölüm + seed-assets mini PDF/PNG). Kapsam: 8 ürün tipinin TAMAMI `product_type_id`+057-uyumlu `attributes` · V7 teklif tüm eksenler (revizyon zinciri, accepted→ORD-0010 donmuş totaller+arşiv PDF, 088 sent→pending bağlı sipariş, EXWORKS ihracat seller_*'lı) · 5 PO (po_overdue dahil, junction'lı) · 3 import belgesi (core_fields/source_page/new_product) · email_logs 096 retry-snapshot'lı failed · company_files/product_attachments storage `demo/` prefix (temizlik kullanıcı dosyasına dokunmaz) · calendar_notes/084 tabloları. Alert'ler INSERT edilmez — scan 7 tipi de bu veriden üretir. +36 test (31 tutarlılık/senaryo/kaynak kilidi + 5 asset); tsc 0 · lint 0 · **5290 test / 389 dosya** · build 0. **Kalan (KULLANICI):** Coolify'a `SEED_DEMO_PASSWORD` ekle → deploy → Ayarlar→Demo Hazırlık→yükle → sayfa-sayfa smoke (ürün tipleri/attributes · teklif revizyon+arşiv · PO'lar · scan sonrası uyarılar+takvim · import · Dosyalar · e-posta retry · 6 rol RBAC gezintisi).

**Önceki iş:** **Google auth kesin kapanış + "Beni hatırla" gerçek implementasyon** (2026-06-12; GREEN; `5b3f3f9`). **Şikayet:** admin Gmail'le Google girişi "401", beni-hatırla işlevsiz. **Karar (AskUserQuestion): yalnız-ekli-kullanıcılar** (her-Gmail-viewer RED). **Google:** callback (`auth/callback/route.ts`) hata körlüğü giderildi — provider/no_code/**pkce**/exchange `reason`'ları loglanır + login'e taşınır (pkce = "code verifier" hatası → tipik kök **Supabase Redirect URL allowlist'te domain yok**); provizyon kontrolü callback'e alındı: rolsüz OAuth kullanıcısında `reconcileOAuthUserRoles` (`oauth-provision.ts`: aynı-e-postalı rol sahibi ekli kullanıcıdan `app_metadata.roles` kopyalanır — YALNIZ doğrulanmış e-posta; listUsers/update hatası fail-closed), olmazsa `signOut` + `unauthorized&attempted=<email>` ("yarım oturum + arkada 401/403 gürültüsü" bitti); login mesajları reason/attempted'a göre ayrışık. **Beni hatırla (`remember.ts`):** login her iki akışta sign-in ÖNCESİ `roven_remember` cookie yazar; cookie yazan 3 katman (server.ts/proxy.ts/client.ts'e custom cookies eklendi) `persist=0` iken auth cookie'lerinden maxAge/expires düşürür (session cookie → tarayıcı kapanınca düşer); SİLME yazımları muaf (logout sağlam); varsayılan işaretli=bugünkü davranış. +28 test; tsc 0 · lint 0 · **5227 test / 382 dosya** · build 0. **Kalan (KULLANICI — kod tek başına yetmeyebilir):** (1) Supabase Dashboard → Auth → URL Configuration: **Redirect URLs'e her iki Coolify domain'inin `/auth/callback`'i + localhost** ekli mi; (2) her iki Coolify ortamında `ADMIN_EMAILS` doğru mu; (3) deploy sonrası Google dene — artık mesaj/log NEDENİ söyler (reason=pkce/provider çıkarsa kök Dashboard ayarı); beni-hatırla smoke (işaretsiz giriş → tarayıcı kapat-aç → login'e düşmeli).

**Önceki iş:** **Y1 turu — kalan 7 guard'sız GET kapandı** (2026-06-12; GREEN). **Karar (AskUserQuestion): DEMO-DOSTU guard** — `resolveAuthContext` + `requirePermissionFor` izin arar ama `!user→401` dalı YOK (anonim→viewer fallback bilinçli; demo gezintisi [takvim/eksikler/Paraşüt rozetleri/açık-sipariş kolonu] çalışır; import uçları viewer'da `view_import` olmadığından demo dahil fiilen kapalı). İzinler: alerts/calendar→view_alerts · import 3 ucu→view_import · parasut-status→**view_sales_orders** (view_parasut sales/viewer'ı kırardı — tüketici sipariş detayı) · open-count-by-product→**OR [view_purchase_suggestions, view_sales_orders]** (purchasing'de sales_orders yok) · shortages→view_products (view_alerts'li her rolde var). Baseline'dan 7 ACIK-BULGU kaydı silindi (gate stale testi doğruladı); 6 route test dosyasına role-guard mock + Y1 403 senaryosu, yeni `y1-route-guards.test.ts` (7 kaynak kilidi + demo-dostu `!authCtx.user`-yok kilidi + baseline-boş kilidi + open-count davranışsal 2 test). Ayrıca mig.096 APPLY EDİLDİ ✅ (probe doğruladı). tsc 0 · lint 0 · **5199 test / 380 dosya** · build 0. **Kalan:** kullanıcı smoke (demo modda: Uyarılar takvimi + eksik drawer + sipariş Paraşüt rozetleri + satınalma açık-sipariş kolonu ÇALIŞMALI; muhasebe rolünde uyarı takvimi 403) + önceki smoke listesi; son tur adayı: Upstash rate-limit (O5).

**Önceki iş:** **E-posta retry snapshot turu — commit + mirror** (2026-06-12; GREEN; `3c8fb85`). proje-codex'te hazır-ama-commit'siz bulunan iş ("mirrorla" isteğiyle) doğrulanıp gönderildi: **mig.096** `email_logs` + `html_body`/`text_body`/`body_expires_at` (24h TTL; başarı/expiry/max-attempt'te snapshot temizlenir, partial index) — retry artık aynı gövdeyle yeniden gönderir · `sendDirectEmail` `replyTo` desteği · `requireInternalOperatorFor(ctx)` (çözülmüş AuthContext ile guard, ikinci getUser yok) · iç şablon kilitleri (+21 test). `check-migrations.ts` PROBES'a 096 eklendi. tsc 0 · lint 0 · **5182 test / 379 dosya**. Önceki turun mig.093/094/095 doğrulama SQL'i **4×true ✅** (canlıda kesin). **Kalan (KULLANICI):** **mig.096 Studio'da APPLY** (`npx tsx scripts/check-migrations.ts` apply sonrası doğrular) + e-posta retry smoke; önceki smoke listesi açık (sipariş toplamları · teklif gönder→iptal→tekrar gönder · Next sonrası login/dashboard). Sonraki tur adayları: Y1 kalan 8 ACIK-BULGU GET'i · Upstash rate-limit (O5).

**Önceki iş:** **Next 16.x güvenlik yükseltmesi** (2026-06-12; GREEN; `64c2fd0`). **İstek:** denetimde ertelenen Next turu. next/eslint-config-next **16.1.7 → 16.2.9** (tüm 14 advisory <16.2.6 aralığındaydı: 4 high proxy/middleware bypass, DoS, SSRF, XSS, cache poisoning) + `fast-uri` 3.1.0 → 3.1.2 (2 GHSA, @sentry/nextjs→ajv transitif zinciri, `npm update` yetti). **`scripts/check-deps.mjs` ALLOWLIST artık BOŞ** — gate bundan sonra her yeni high/critical advisory'yi anında kırmızı yakalar (sistemin kuruluş amacı gerçekleşti). React 19.2.3 dokunulmadı (peer uyumlu). tsc 0 · lint 0 · **5161 test / 377 dosya** · build 0 (standalone'da next 16.2.9 + mupdf wasm trace doğrulandı, proxy derlendi). Ayrıca mig.093/094/095 **KULLANICI APPLY ETTİ ✅** (rapor §8 güncellendi). **Kalan (KULLANICI):** birleşik doğrulama SQL'i (4 satır `true`) + smoke: sipariş oluştur/düzenle [toplamlar sunucudan] · teklif override %5 · teklif gönder→iptal→tekrar gönder [094] · reddet→rezerv düşer · **Next sonrası: login redirect + dashboard + bir API çağrısı**. Sonraki tur adayları: Upstash rate-limit (O5) · Y1 kalan 8 ACIK-BULGU ucu.

**Önceki iş:** **Denetim bulgularının düzeltilmesi — Tur A–E** (2026-06-13; GREEN). **İstek:** "bütün gerekli düzeltmeleri tek tek yapalım" (rapor: `docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md`; kararlar [AskUserQuestion]: K2 = sipariş katı recompute + teklif override korunup makul-sapma; xlsx = CDN 0.20.3 pin; Next yükseltme + Upstash AYRI turlar). **Tur A (route güvenliği):** K1 audit-log oturum + entity-bazlı yetki (PO→view_purchase_orders, bilinmeyen→admin) · Y2 stock-risk oturum+view_products · K3 import sipariş totalleri order'ın vat_rate+discount_amount'ı ile (081 formülü; %20-hardcode bug'ı) · O11 demo-anon attachment DEFAULT bloklu (`ATTACHMENTS_ALLOW_DEMO_ANON` opt-out) · D4 `requireCronSecret` (timing-safe) 5 cron route'unda · O9 convert=410 tombstone (bulgu değil). **Tur B (finansal):** mig.093 — order RPC'leri (023/081 halefi) toplamları SUNUCUDA hesaplar (istemci değerleri yok sayılır, qty<=0 guard), quote RPC'leri (071 halefi) override'ı koruyup `assert_quote_totals_sane` (%5/100 sapma) uygular, quote line_total sunucuda · O7 orders redaction'a discount_amount+discount_pct · D1 `roundMoney()` (money-utils) OrderForm/QuoteForm/import'ta satır-yuvarla-sonra-topla · D2 iskonto clamp inline uyarı · **gate SQL lint yorum-ayıklama öğrendi** (093'ü yanlış-pozitif yakaladı; 036/069/071/073/074 DEFINER'ı yorumdaymış → grandfather 016+019'a indi). **Tur C (rezervasyon):** mig.094 — send RPC description kopyalar + qty<=0 pre-check + **uq_sales_orders_quote_id cancelled'ı DIŞLAR** (dış raporun haklı çıktığı bulgu: iptal edilen teklif-sipariş yeniden GÖNDERİLEMİYORDU; karne düzeltildi) · `serviceReconcileQuoteReservations` alert-scan'de (sent+sipariş-yok→onar / terminal+pending→bırak / olmazsa sync_issue) · mig.095 — 019+016 DEFINER hijyeni (search_path+REVOKE/GRANT). **Tur D (platform):** xlsx CDN 0.20.3 (GHSA'lar kapandı, allowlist'ten silindi) · Y6 10 nokta `localISODate` (İstanbul 00:00–03:00 gün kayması; teklif/PO vadesi + Paraşüt issueDate; computeDueDate Z-bazlı muaf) · O8 OAuth state HMAC fail-closed · O6 Sentry beforeSend PII scrub (3 config, `sentry-scrub.ts`) · Y8 kritik-stok e-postası awaited + `ScanResult.emailFailed`. **Tur E (operasyonel):** O1 ship post-patch hatası uyarılı BAŞARI (`postShipWarning`; stok düştü) · O2 import status yazımına tek retry · O3 reconcile kuruş-tamsayı · O4 `sanitizeSyncErrorMessage` (e-posta/VKN maskesi) · O10 addOrder hata yolunda cache refetch · D5 PO receive geçersiz miktar toast'ı. Rapora §8 düzeltme-durumu tablosu eklendi. tsc 0 · lint 0 · **5161 test / 377 dosya** · build 0. **Kalan (KULLANICI):** Studio'da sırayla **mig.093 → 094 → 095 APPLY** + smoke (sipariş oluştur/düzenle toplamlar · teklif override %5 · teklif gönder→iptal→tekrar gönder · reddet→rezerv düşer); sonraki tur adayları: Next 16.x güvenlik yükseltmesi · Upstash rate-limit · Y1 kalan 8 ACIK-BULGU ucu.

**Önceki iş:** **Güvenlik & Doğruluk Denetimi + Gate sistemi (ürün kodu DEĞİŞMEDİ)** (2026-06-12; GREEN). **İstek:** kullanıcı dışarıdan bir güvenlik denetim raporu paylaştı → "hiçbir kodda değişiklik yapmadan repo genelinde kod hataları/güvenlik açıkları/semantik hataları DETAYLI EKSİKSİZ incele + gerekiyorsa sistem kur" (AskUserQuestion: Denetim+Gate birlikte). **Denetim:** 6 paralel tarama (route'lar/migration'lar/servis katmanı/lib semantiği/frontend bütünlüğü/cron-email-PDF-entegrasyon) + her Kritik/Yüksek bulgunun elle doğrulanması → **`docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md`**: dış rapor karnesi (2 iddia YANLIŞ çıktı), **5 Kritik** (K1 audit-log guard'sız+PII · K2 finansal toplamlar istemciden [023/081/071 RPC'leri recompute etmez] · K3 import sipariş KDV'si iskontoyu+oranı yok sayıp %20 hardcode · K4 teklif send status-önce/rezervasyon-best-effort+reconciler-yok · K5 migration drift izlenemiyor), **8 Yüksek** (Y1 25/64 GET guard'sız+viewer-fallback · Y2 ai/stock-risk yetkisiz mutasyon · Y3 phantom rezervasyon · Y4 088'in 078-qty-guard+080-description regresyonları · Y5 xlsx 0.18.5 fix'siz · Y6 UTC tarih dilimleme 13 nokta [00:00–03:00 TR'de gün kayar; doğru kalıp `localISODate` zaten var] · Y7 019 advisory-lock DEFINER hijyensiz · Y8 kritik-stok e-postası fire-and-forget+24h-dedup=sessiz kayıp), 11 Orta, 6 Düşük + **elenen 6 yanlış-pozitif** (PO receive RPC 051:48 guard'lı+atomik; QuoteForm `type="number"`; email dedup bilinçli) + 5-turluk düzeltme yol haritası (Tur A: K1+Y2+K3+O9+O11 hızlı paket). **Gate sistemi (baseline-allowlist kalıbı — suite yeşil, YENİ ihlal kırmızı):** `src/__tests__/gate/route-guard-matrix.test.ts`+`route-guard-baseline.ts` (114 route enumerate; guard'sız 28 uç sınıf+gerekçeyle baseline'da [public/self-auth/redaction/cron-proxy/ACIK-BULGU]; yeni guard'sız route VEYA stale kayıt kırar) · `sql-migration-lint.test.ts`+`sql-lint-baseline.ts` (yeni SECURITY DEFINER'da search_path+REVOKE/GRANT zorunlu [039/054/087 kalıbı; 016/019/036/069/071/073/074 grandfathered] + RPC redefinition zincir takibi [088-tipi sessiz regresyon görünür olur]) · `scripts/check-deps.mjs`+test.yml `deps-gate` job (npm audit high+ allowlist'le; xlsx 2 GHSA + **next 16.1.7'nin 14 high advisory'si** + fast-uri 2 gerekçeli istisna — Next yükseltmesinde kayıt silinince gate yeniden yakalar) · `scripts/check-migrations.ts` (READ-ONLY OpenAPI-probe drift kontrolü — schema_migrations bu projede güvenilmez [Studio'dan elle apply, kayıt düşmüyor]; **ilk koşu: 088/090/091/092 CANLIDA UYGULANMIŞ çıktı — önceki "APPLY BEKLİYOR" notları bayatmış; tek belirsiz 089** [manuel SQL hint'i script çıktısında]) + runbook Faz 4 bölümü. Gate kendini kanıtladı (baseline kaydı silinince kırmızı yandı, geri eklendi). tsc 0 · lint 0 · **5123 test / 373 dosya** · build 0. **Kalan:** 089'un elle doğrulanması (script hint'i) · rapor yol haritası Tur A–E'nin ayrı turlarda uygulanması.

**Önceki iş:** **Kalıcı performans — çekirdek paket (render/yükleme yavaşlığı kök çözümü)** (2026-06-12; GREEN). **İstek:** "sistemde çok büyük render yavaşlığı var, kalıcı çözmemiz lazım" + kullanıcının Playwright-trace'li performans raporu (31 istek / 27.6s toplam / alerts 479KB / finance 1.7s). 3 paralel keşif raporu doğruladı; **kararlar (AskUserQuestion):** çekirdek paket (RSC/loading.tsx + tam server-side pagination SONRAKİ tur) · **SWR eklendi** (kullanıcı seçimi, `swr@2.4.1`) · counters migration'sız route. **Faz 0:** `swr-config.ts` (`jsonFetcher`+`FetchError`+`SWR_DEFAULTS` — `revalidateOnFocus:false` kilitli, dedup 15s) + `server-timing.ts` (`startSpan`/`appendServerTiming`) yalnız 3 yavaş route'ta (products/orders all=1 + finance) — DevTools'ta auth/db span'leri. **Faz 1 (auth tekilleştirme):** `resolveAuthContext()` role-guard'a eklendi — TEK createClient+getUser ile `{user,userId,roles,perms}`; `requirePermissionFor`/`requireRoleFor` context'ten karar verir (React.cache route handler'da ÇALIŞMAZ — render scope yok); "guard + ikinci getUser" yapan **11 route** dönüştü (orders/production/transcribe/quotes-accept/settings-files/attachments/classify/apply/extract/document-lines/email-test) → istek başına auth round-trip 2-3→1; diğer ~100 route'a dokunulmadı; 11 test dosyasının mock factory'sine yeni export'lar eklendi; classify'ın "post-AI getUser abort penceresi" yapısal olarak kalktı (auth artık route başında). **Faz 2 (Sidebar sayaçları):** YENİ `GET /api/dashboard/counters` `{pendingOrders,reorderCount,activeAlerts}` (~100 byte; guard'sız — emsal GET /api/alerts; head+count helper'ları `dbCountOrdersByCommercialStatus`+`dbCountActiveAlerts` [open+ack tanımı birebir]; reorderCount = YENİ saf `isReorderCandidateRow` — purchase-copilot'un inline filtresi TEK kaynağa çıkarıldı, copilot da bunu kullanır + products-tag'li 60s unstable_cache); Sidebar `useData` İMPORT ETMEZ → `useDashboardCounters()` (SWR 60s poll); rozet davranışı aynı (`count || undefined`). **Faz 3 (veri fırtınası — planın kalbi):** `data-context.tsx` SWR domain hook'larına yeniden yazıldı (dosya YERİNDE — 9 source-lock + 4 vi.mock dosyası): `useProducts/useCustomers/useOrders/useProduction/useAlerts/useReorderSuggestions` + mutation-only `useOrderMutations` (liste aboneliği başlatmaz); key sabitleri `PRODUCTS_KEY("/api/products?all=1")/CUSTOMERS_KEY/ORDERS_KEY/ALERTS_KEY/COUNTERS_KEY` + `productionFetchUrl()` aynen; **DataProvider artık VERİ ÇEKMEZ** (yalnız SWRConfig) — eski mount'ta 5 endpoint Promise.all (~10MB) TARİH OLDU; `useData()` geriye-uyumlu kompozisyon (alan-alan aynı dönüş; ölü komponentler derlenir); mutasyon köprüleri sözleşme-birebir (cache patch `{revalidate:false}`; `updateOrderStatus` `shouldRefetchProducts` saf export + `mutate(PRODUCTS_KEY)` + `mutate(COUNTERS_KEY)`; üretim `Promise.allSettled` → `{refetchFailed}` korunur; `buildLoadError` saf export — eski mesaj formatları birebir; `invalidateAllData()` = refetchAll); 10 tüketici dar hook'lara geçti (dashboard [customers fetch'i İLK KEZ ELENDİ], customers, production, purchase/suggested, orders + [id] + OrderForm, QuoteForm, import/excel, CustomerDetailPanel); mirror testler gerçek export'lara bağlandı (`data-context-error`→buildLoadError, `data-context-stock-refetch`→shouldRefetchProducts — drift kapandı). **Faz 4 (duplicate fetch):** YENİ `shared-hooks.ts` — `useExchangeRates` (20dk, Ticker+dashboard TEK istek; `ratesResolved`=!isLoading flash-guard korunur), `useUserProfile` (Avatar+dashboard tek istek; settings PATCH → `updateUserProfileCache` köprüsü = Topbar avatarı anında tazelenir, bonus fix), `useSystemHealth` (5dk korundu); RTL testleri için ortak `helpers/swr-test-wrapper.tsx` (`provider: () => new Map()` — cache sızıntısı önlenir). **Faz 5 (server quick-win):** `/api/alerts` GET → `dbListAlerts(filter, {limit:500, columns:dar-liste})` — **default davranış AYNEN** (scan/dedup/ops-summary tam satır); kolon listesi UI'nin okuduğu HER alanı kapsar (OpenAlert + entity_type/resolved_at/due_date/created_by; ai_inputs_summary/ai_reason TAŞINMAZ) → ~479KB→~80KB; `/api/dashboard/finance` COGS RPC'si `unstable_cache` tags:["products","finance-cogs"] revalidate:300 (canViewCosts+reportingCurrency cache DIŞINDA — imza kilidi testli) → 1.7s→cache-hit ~ms; profile route'una DOKUNULMADI (SWR dedup yeter, admin-API invalidasyon karmaşası kazanca değmez). **Test:** +6 yeni dosya (`swr-config`/`server-timing`/`resolve-auth-context`/`dashboard-counters-route`/`alerts-route-narrow` + reorder-suggestions'a `isReorderCandidateRow` bloğu) + ~20 dosya güncellendi; tsc 0 · lint 0 · **5104 test / 371 dosya** · build 0. **Beklenen kazanım:** dashboard açılışı ~13-15 istek/~10MB → ~8 istek/birkaç yüz KB; liste sayfaları kendi verisini kendisi çeker; Server-Timing ile ölçülebilir. **Kalan:** tarayıcı smoke (dashboard panelleri dolu · sipariş onayla→Sidebar pending rozeti düşer · üretim→stok düşer · import→listeler tazelenir · demo guard · viewer redaction · Network sekmesinde istek sayısı/byte karşılaştırması).

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
- **Migration 099 APPLY ✅** (kullanıcı uyguladı, 2026-06-16). Kalan: yalnız smoke — ürün seç→birim otomatik dolar→kaydet→yenile (korunur); Önizle/PDF "12 metre"; Kabul et→siparişte birim teklifle aynı (COALESCE).
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
