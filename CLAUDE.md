# KokpitERP — Claude Code Rehberi

## Mevcut Durum
_Son güncelleme: 2026-05-19_

**Son tamamlanan iş:** Faz 3a Review — 4 bulgu kapatıldı + cancelled-flag bug fix (2026-05-19; 3188 test)

- **P2 (render-phase fetch):** queue sync + concurrency driver useEffect içine taşındı; Strict Mode safety.
- **P2 yeni bug (cancelled-flag):** P2 fix sırasında useEffect cleanup `cancelled=true` her queue patch'inde in-flight fetch'leri iptal ediyordu (prod'u da kırıyordu) → `mountedRef = useRef(true)` paterni + unmount-only cleanup.
- **P3-008 ("Listeyi Temizle"):** `clearAll` handler internal `setQueue([])` + parent `onClear?.()`.
- **P3-009 (plan ↔ implementation):** `MODUL_REVIZE_PLAN.md` "sıralı" satırı bounded-parallel cap 3 olarak güncellendi.
- **P3-010 (UI interaction):** `@testing-library/react` + `jsdom` kuruldu; 5 RTL interaction testi (happy/Strict Mode/retry/remove/clear) + 7 `selectClassifyCandidates` pure helper testi (concurrency state machine extract).
- 6 dosya · +13 test · **3188 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3a — AI Import drop-anywhere UI + multimodal classifier (2026-05-19; 3175 test) · commit `3757e48`

- **Alt-faz şeması:** Faz 3 → 3a (bu), 3b (extraction+matching), 3c (review+apply), 3d (klasik mod toggle).
- **Backend:** Migration 061 `import_documents` + helper (`dbCreateImportDocument` 3-step orphan-safe) + `aiClassifyDocument` multimodal (PDF document block, image content block, Excel text-first) + `POST /api/import/classify` (multipart, requireRole admin|purchaser).
- **Frontend:** `DropZone` + `ClassifierQueue` (concurrency cap 3, render-time scheduling — `started: boolean` flag + File identity dedup) + import sayfası tab toggle "AI ile Aktar" (default) / "Klasik Mod" (mevcut 7-adım korunur).
- **AiFeature** union'a `import_classify` (database.types + ai-runs sync). +6 pure helper export'u.
- **+77 yeni test (8 dosya, gerçek davranış — 2d Review dersi):** aiClassifyDocument (11) + pickContentBlockForMime (7) + validateClassifyUpload (10) + import-documents-helper (12) + classify-route (12) + classifier-queue (13) + dropzone-component (7) + import-documents-migration (9).
- 13 dosya · **3175 test yeşil** · TS clean · 0 lint · build OK

**Önceki:** Faz 2e İPTAL — Parti tablosu ve UI tamamen silindi (2026-05-19; 3098 test) · commit `4401d66`

- **Karar:** PMT ölçeğinde parti (heat lot / FIFO) iş gereksinimi yok; sertifika `product_attachments` ile zaten ürüne bağlı.
- **Silinenler:** Migration 060 (DROP product_batches CASCADE) + product-batches.ts helper + 2 route + ProductBatchRow type + detay sayfası partiler tabı (7→6 sekme) + 2 test dosyası.
- **Geri alma:** 059 migration + helper Faz 2a commit `b7c0227` git history'de.
- 8 dosya · **3098 test yeşil** (-21 batch test) · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2d Review P3-007 — Demo guard davranış testleri (2026-05-19; 3119 test) · commit `05cc81e`

- **P3-007 KAPANDI:** `vi.stubEnv` + `@supabase/ssr` mock + gerçek `middleware(NextRequest)` koşumu ile 10 davranış testi. env true/false × demo cookie × auth user matrisi: 401 trigger doğru path'lerde, scope sızıntısı yok, default off, authenticated kullanıcı etkilenmez, literal "true" comparison.
- 1 dosya · **3119 test yeşil** (+10 davranış) · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2d Review 2. tur — 3 residual kapatıldı (2026-05-19; 3109 test) · commit `6272759`

- **P3-006:** PDF/belge linki click-time refresh → `handleDownloadDocument` + `openSignedUrlInNewTab` helper; 1h TTL aşılsa da çalışır.
- **P3-005:** `ATTACHMENTS_BLOCK_DEMO_ANON` env flag — true ise middleware demo cookie + `/api/products/[id]/attachments**` 401. Default false (geriye uyumlu).
- **P3-004:** 3 yeni pure helper export (buildUploadFormData/parseAttachmentApiError/openSignedUrlInNewTab) + 13 davranış testi. Handler'lar artık extracted helper'ları çağırıyor — source-regex'ten çok güçlü.
- 7 dosya · **3109 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2d Review — 5 P3 bulgu kapatıldı (2026-05-19; 3084 test)

- **P3-001:** `refreshSignedUrl` useCallback + header/grid/lightbox img `onError` → 1h TTL aşıldığında fresh signed URL alır, state günceller.
- **P3-002:** `attachmentsError` state + role=alert banner + "Yeniden dene" button; empty state error varken gizlenir.
- **P3-003:** `?kind=bad` → 400 (fail-closed), helper çağrılmadan reddedilir.
- **P3-004:** `parseAttachmentsResponse` + `findPrimaryImageWithUrl` pure helper export'ları + 25 yeni davranış/regression testi.
- **P3-005:** `/url` route'a SECURITY NOTE — demo + signed URL politika kararı dokümante edildi.
- 6 dosya · **3084 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2d — Ekler sekmesi UI + signed URL endpoint (2026-05-19; 3059 test) · commit `99f3027`

- **Backend:** `dbGetSignedUrl` + `dbGetSignedUrlsForRows` (bulk `createSignedUrls`, N+1 önler) + `mapProductAttachment` mapper (file_path expose etmez; signedUrl opsiyonel 2. arg) + `ProductAttachment`/`ProductAttachmentKind` interface (`mock-data.ts`).
- **GET shape değişimi:** `/api/products/[id]/attachments` artık `{ items, expires_in: 3600 }` döner (eskiden raw array). Her item bulk signed URL ile enriched. `dynamic="force-dynamic"`.
- **Yeni endpoint:** `GET /api/products/[id]/attachments/[attachmentId]/url` — tekil signed URL (header img refresh için). 400/404/500 mapping.
- **Detay sayfası UI:** 5 pure helper export (formatFileSize/getKindLabel/getKindIcon/pickInitialKind/groupAttachments) + 6 state + fetchAttachments + header 80×80 görsel (primary varsa img, yoksa "Görsel yok") + Ekler tab (upload bar / images grid 140×140 thumbnails star+× / documents list İndir+Sil) + lightbox modal (role=dialog aria-modal, ESC + backdrop + scroll lock + focus return) + 3 demo guard'lı handler. Tab `locked: false`. `ATTACHMENT_ACCEPT` client-safe constant (server-only `ALLOWED_MIME` import EDİLMEDİ).
- **MIME→kind otomatik öneri:** file seçilince `pickInitialKind(f.type)` kind state'i override eder.
- **Versiyonlama Faz 3'e ertelendi:** helper `is("superseded_by", null)` zaten filtreliyor.
- **+44 test (5 dosya):** mapper (5) + helpers (18) + url-route (7) + list-signed-url (3) + page-ekler (14).
- 8 dosya · **3059 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2c Review — Tüm P3 bulgular kapatıldı (2026-05-19; 3015 test) · commit `e23baab`

- **P3-003 KAPANDI:** `getMissingRequiredAttributes` pure helper → `handleCreate` + `handleSave` zorunlu alan validasyonu (eksikse Türkçe toast).
- **P3-005 KAPANDI:** `createTypeFieldsError` state — fetch başarısız olursa `role="alert"` banner.
- **P3-004 KAPANDI:** Source-regex ağırlıklı testler → 15 gerçek mantık testi (undefined/null/empty/multiselect senaryoları).

**Önceki:** Faz 2c Review — P2-001 + P2-002 kapanış (2026-05-19; 2990 test) · commit `0c4cf39`

**Önceki:** Faz 2c — Teknik sekmesi dinamik alan rendering (2026-05-19; 2974 test) · commit `6846584`

**Önceki:** Faz 2b Review — 3 bulgu kapatma (2026-05-19; 2935 test) · commit `96d8371`

**Önceki önceki:** Faz 2b — Tam ekran ürün detay sayfası + drawer kaldırma (2026-05-19; 2930 test) · commit `9003044`

**Modül Revize Faz 1 (14 dosya: 2 migration + 2 yeni helper/route paketi + admin paneli + 3 test):**
- **Migration 056** (`supabase/migrations/056_product_types.sql`): `product_types` tablosu (id/name/description/icon/sort_order/is_system) + `product_type_fields` tablosu (id/product_type_id FK CASCADE/field_key regex CHECK/label_tr/label_en/field_type 7-enum CHECK/unit/options jsonb/required/placeholder/help_text/sort_order). RLS service_role + `updated_at` triggers. `products` ALTER: `product_type_id uuid FK ON DELETE SET NULL` (nullable, geriye uyumlu) + `attributes jsonb NOT NULL DEFAULT '{}'`. GIN index attributes üzerinde. Idempotent + ROLLBACK SQL bloğu.
- **Migration 057** (`supabase/migrations/057_seed_product_types.sql`): 8 hazır tip insert (Vana/Conta/Flans/Fitting/Bağlantı Elemanı/Enstrüman/Sızdırmazlık Malzemesi/Diğer) — deterministik UUID'ler `00000000-0000-4000-8000-00000000000{1..8}`. Vana 16 alan, Conta 13, Flans 9, Fitting 7, Bağlantı Elemanı 8, Enstrüman 8, Sızdırmazlık Malzemesi 7, Diğer boş. PN/sınıf select options (PN6-160, 150LB-4500LB), valve_type/flange_type/face_type/fitting_type select listeleri, approvals/standards multiselect listeleri. Idempotent `ON CONFLICT DO NOTHING`.
- **Database tipleri** (`src/lib/database.types.ts`): `ProductFieldType` enum + `ProductTypeRow` + `ProductTypeFieldRow` interface'leri eklendi. `ProductRow`'a `product_type_id: string | null` ve `attributes: Record<string, unknown>` alanları eklendi.
- **Frontend tipleri** (`src/lib/mock-data.ts`): `ProductType`, `ProductTypeField`, `ProductTypeWithFields` + `Product.productTypeId/attributes` alanları.
- **API-mappers** (`src/lib/api-mappers.ts`): `mapProductType()`, `mapProductTypeField()` fonksiyonları + `mapProduct()` extension (productTypeId, attributes).
- **Helper** (`src/lib/supabase/product-types.ts`): `dbListProductTypes`, `dbGetProductType`, `dbGetProductTypeWithFields`, `dbListProductTypeFields`, `dbCreateProductType`, `dbUpdateProductType`, `dbDeleteProductType` (sistem tipi + bağlı ürün guard'ları), `dbAddProductTypeField`, `dbUpdateProductTypeField`, `dbDeleteProductTypeField`, `dbReorderProductTypeFields`, `dbReorderProductTypes`. Validation: `isValidFieldKey` regex (`/^[a-z][a-z0-9_]*$/`), `isValidFieldType` (7 enum), options array check, name max 100 char. Audit log her CRUD'da. Sistem tipi düzenlenince `is_system=false` kilidi düşer.
- **API routes** (`/api/product-types/*`): GET liste (60s cache), POST/PUT admin, `[id]` GET (withFields=1 destekli) + PATCH + DELETE admin, `[id]/fields` GET+POST+PUT(reorder) admin, `[id]/fields/[fieldId]` PATCH+DELETE admin. `requireRole(["admin"])` mutasyon guard'ları, `handleApiError` mapping, 404/409/400 status'lar (sistem tipi → 409, bağlı ürün → 409, validation → 400).
- **Admin paneli** (`/dashboard/settings/product-types`): Liste sayfası — kart görünümü (icon + ad + alan sayısı + SİSTEM rozeti + açıklama), "Yeni Tip Ekle" modal'ı (ad + icon + açıklama). Detay sayfası — tip başlığı düzenleme + alanlar tablosu (anahtar/etiket TR-EN/tip/birim/zorunlu/yukarı-aşağı-sil işlemleri) + yeni alan ekle formu (dinamik: number → unit input, select/multiselect → options textarea). Demo guard + a11y (role="dialog"/aria-modal/aria-label/aria-live). Sidebar'a "Ürün Tipleri" linki.
- **+61 yeni test (3 dosya):** `product-types-helper.test.ts` (16: pure helpers 8 + create/field validation 5 + reorder 2 + delete guards 2), `product-types-route.test.ts` (33: GET 1 + POST 4 + PUT 4 + GET/[id] 2 + PATCH/[id] 3 + DELETE/[id] 4 + GET fields 2 + POST fields 5 + PUT fields 4 + PATCH field 3 + DELETE field 3), `product-types-seed.test.ts` (12: schema 4 + 8 hazır tip 6 — Vana/Conta/Flans/Fitting/Enstrüman alan setleri + idempotent guard).
- 183 dosya · **2855 test yeşil** · TS clean · 0 lint warning · build OK
- **Faz 1 hedefi:** Dinamik şema altyapısı — Faz 2 (ürün sayfası), Faz 3 (AI Import yenileme), Faz 4 (teklif modülü revize) bu altyapı üzerine inşa edilir.
- **Kalıcı plan dosyası:** `MODUL_REVIZE_PLAN.md` — Faz 2-4 detay şeması burada (DB tabloları, alan listeleri, akış diyagramları, kabul kriterleri).

**Önceki:** Genel Pagination — 6 liste sayfasına sayfa başına 50 kayıt + numaralı sayfalama (2026-05-18; 2794 test)

**Genel Pagination (8 dosya: 3 yeni + 5 modifiye + 1 + integration test):**
- **`src/hooks/usePagination.ts`** (YENİ): `PAGE_SIZE=50` sabit + generic `usePagination<T>(items, { pageSize?, resetKey? })` hook. Pure helper'lar export edilir: `computeTotalPages`, `clampPage`, `slicePage` (test edilebilir). `resetKey` değişince render-time "Adjusting state based on prop change" paterniyle page=1'e döner (React 19 `set-state-in-effect` kuralı için useEffect kullanılmıyor — `prevResetKey` state ile karşılaştırma). Filtre daraldığında `safePage = clampPage(currentPage, totalPages)` derived clamp (state yazımı yok).
- **`src/components/ui/Pagination.tsx`** (YENİ, client): A11y-first numaralı sayfalama UI. Pure helper export: `buildPageWindow(current, total): (number | "…")[]` — `total<=7 → tüm sayfalar`; aksi halde `1, current±2, total` + gap'lerde `"…"`. `totalPages<=1 → null` (auto-hide). Info text (sol): `{X}-{Y} / {total} {itemLabel}`. Kontroller (sağ): `‹ Önceki` · windowed numbers · `Sonraki ›` (prev/next disabled state). Aktif sayfa: `aria-current="page"` + `var(--accent-bg)`. Ellipsis: `<span aria-hidden>` (button değil). `<nav aria-label="Sayfalama">` wrapper. Inline CSS + CSS variables (proje paterni).
- **6 liste sayfasına entegrasyon** (kanonik 3-satır değişiklik: import + `usePagination` çağrısı + `filtered.map` → `pagedItems.map` + Pagination component'i `</table>` sonrasına):
  - `vendors/page.tsx` — `resetKey: search|showAll`, `itemLabel="tedarikçi"`
  - `purchase/orders/page.tsx` — `resetKey: search|activeTab`, `itemLabel="sipariş"`
  - `quotes/page.tsx` — `resetKey: activeTab|search|currencyFilter|dateFrom|dateTo`, `itemLabel="teklif"`
  - `customers/page.tsx` — `mockCustomers.filter(...)` inline çağrı `useMemo` ile sarmalandı (referans stabilitesi); `resetKey: activeFilter|search`, `itemLabel="müşteri"`
  - `orders/page.tsx` — `resetKey: activeTab|search|customerIdFilter|dateFrom|dateTo|currencyFilter`, `itemLabel="sipariş"`
  - `products/page.tsx` — multi-filter `resetKey: search|alertFilter|selectedCategories|filterManufactured|filterCommercial`, `itemLabel="ürün"`. Üst sayaçlar (kritik/risk/uyarı counts) `mockProducts` toplamlarından — sayfa başına değil, doğru UX.
- **+39 yeni test (3 dosya):** `use-pagination.test.ts` (16: PAGE_SIZE export + pure helper'lar — computeTotalPages 5, clampPage 4, slicePage 5), `pagination-component.test.ts` (17: module load 1 + buildPageWindow 5 + renderToStaticMarkup smoke 11 — null render, info text 4 varyant, a11y nav/aria-current/aria-label, prev/next disabled, ellipsis span), `pagination-integration.test.ts` (6: tüm liste sayfalarında `usePagination` + `Pagination` import + `pagedItems.map(...)` + `filtered.map(...)` regression lock + itemLabel kontrol).
- 180 dosya · **2794 test yeşil** · TS clean · 0 lint warning · build OK · Migration yok, API yok — sadece frontend client-side slicing
- **Karar — Client-side pagination:** DataContext zaten tüm aktif veriyi `?all=1` ile çekiyor; filtre/arama in-memory yapılıyor → pagination da in-memory. API/backend dokunulmadı. Hook generic return shape sayesinde server-side'a migrate edilirse UI değişmez.

**Önceki:** Faz 10 Review Bulgu — DB hata yutma kapatıldı (2026-05-18; 2755 test)

**Faz 10 Review (P2 reliability, 2 dosya):**
- **P2 KAPANDI — `dbGetOpenShortagesByProductId` hata yutma**: `if (error || !data) return []` → Supabase DB/permission/query hatası sessizce boş array dönüyordu; route 200 `{ items: [] }` üretiyor, drawer "Açık shortage kalmadı (uyarı yakında otomatik kapanacak)" empty branch'ine düşüp kullanıcıyı yanıltıyordu. **Düzeltme:** `if (error) throw new Error(...); if (!data) return [];` — error explicit throw, defensive `data=null` (beklenmeyen durum) için empty kalır. handleApiError zaten 500 maps; drawer `shortageError` set → "Açık shortage kalmadı" branch'i tetiklenmez ("eksik yok" ≠ "DB hatası").
- **Test güncellemesi**: `products-shortages-helper.test.ts` "supabase error → empty array" testi "supabase error → throw" olarak değiştirildi (`rejects.toThrow(/db fail/)`).
- 177 dosya · 2755 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 10 — order_shortage drawer (M3: bilgi yoğunluğu + iki yönlendirme) (2026-05-18; 2755 test)

**Faz 10 (6 dosya: 4 yeni + 2 modifiye):**
- **`src/lib/supabase/products.ts`** (yeni helper): `dbGetOpenShortagesByProductId(productId): Promise<OpenShortageDetailRow[]>` — `shortages` + `sales_orders!inner` JOIN; filtreler: `status='open'`, `commercial_status='approved'`, `product_id=$1`. Sıralama: `createdAt DESC` (en yeni shortage üstte). PostgREST many-to-one ARRAY shape defensive normalize (`sales_orders` object|array hep tek nesne). `OpenShortageDetailRow` interface: `shortageId/orderId/orderNumber/customerId/customerName/requestedQty/availableQty/shortageQty/createdAt`.
- **`src/app/api/products/[id]/shortages/route.ts`** (YENİ): `GET` endpoint — helper'ı çağırır, `{ items, totalShortage }` döner. Auth: middleware `/api/**`; demo modda GET izinli (read-only). `handleApiError` mapping.
- **`src/app/dashboard/alerts/page.tsx`** (3 değişiklik):
  - **`drawerActionLinks` order_shortage güncellemesi:** Plan §9.4.4 — "Üretim emri başlat (yeni sekmede)" primary CTA → `/dashboard/production?productId={entityId}&qty={extractShortageQty}` + `newTab: true`. "Satın alma planla" secondary. Eski "Siparişleri incele" primary kaldırıldı. Link tipine `newTab?: boolean` eklendi.
  - **`AlertDetailDrawer` yeni İLGİLİ SİPARİŞLER bölümü** (yalnız `hasOrderShortage && !group.isOrphaned`): drawer açıldığında `fetch /api/products/{entityId}/shortages` (void async IIFE — `react-hooks/set-state-in-effect` kuralı için proje paterni; `cancelled` flag ile cleanup). 4 dal: loading → error (role=alert, aria-live) → empty (race) → list. Liste satırları: `order_number` (monospace) + `customer_name` + `{shortageQty} {unit} eksik` (danger color) + "İhtiyaç: X · Mevcut: Y →" alt satır + tüm satır clickable Link → `/dashboard/orders/{orderId}` (aria-label: `{orderNumber} siparişine git (eksik X)`). DoD: drawer "tek başına yeterli bilgi" — kullanıcı linke tıklamadan kararını verebilir.
  - **actionLink render:** `link.newTab` → `target="_blank"` + `rel="noopener"` + "↗" işareti (varsayılan "→").
- **`src/app/dashboard/production/page.tsx`** (Suspense wrapper + prefill):
  - Pure helper export: `prefillLineFromQuery(productId, qty, activeIds)` — productId aktif değilse veya yoksa `null`; qty pozitif int/decimal değilse `""` fallback; 0/negatif/alfa reddedilir.
  - `ProductionPage` → `ProductionPageInner` rename; default export Suspense wrapper (`useSearchParams` Next.js 15 requirement).
  - `useSearchParams` ile `?productId=...&qty=...` parse; `prefilledRef` guard ile tek seferlik prefill; products yüklendiğinde useEffect tetiklenir; ilk satır boşsa override, doluysa prepend; toast bilgilendirmesi.
- **+34 yeni test (4 dosya):** `products-shortages-helper.test.ts` (7: empty/error/null/DESC sıralama/PostgREST array shape/sales_orders null skip/alan mapping), `products-shortages-route.test.ts` (4: happy 2-row/empty/throw→500/totalShortage hesaplama), `alerts-order-shortage-drawer.test.ts` (9: drawerActionLinks order_shortage/eski Siparişleri incele kaldırıldı/hasOrderShortage state/fetch /api/products/X/shortages/İLGİLİ SİPARİŞLER conditional render/4 dal/list satır içeriği/aria-label/newTab target rel/orphan guard), `production-prefill.test.ts` (14: prefillLineFromQuery 7 pure helper davranış + production page 7 source-regex Suspense wrapper/useSearchParams/prefilledRef guard/products.length=0 erken return/firstEmpty pattern).
- 177 dosya · 2755 test yeşil · TS clean · 0 lint warning · build OK · yeni route: `GET /api/products/[id]/shortages` + `/dashboard/production?productId&qty` deep link

**Önceki:** Faz 9 Review Bulgular — P2 veri minimizasyonu + P3 gerçek render testi (2026-05-18; 2721 test)

**Faz 9 Review Bulgular (4 dosya):**
- **P2 KAPANDI — Veri minimizasyonu (gizlilik)**: `print/page.tsx` `dbListAllActiveProducts()` çağırıyordu — tüm aktif ürün kataloğu (35 alanlı `ProductRow`: `cost_price`, `parasut_*`, `on_hand`, `reserved`, `product_notes`, `daily_usage`, ...) RSC payload'ı üzerinden client'a serialize ediliyordu. Belge yalnızca PO satırlarındaki ürünlerin `id/sku/name/unit` 4 alanını kullanıyor. **Düzeltme:** `products.ts`'e yeni `dbGetProductRefsByIds(ids: string[]): Promise<ProductRef[]>` helper'ı eklendi (`.select("id, sku, name, unit").in("id", ids)`); empty ids → `[]` early return. `PurchaseOrderDocument` prop tipi `ProductRow[]` → `ProductRef[]` daraltıldı. `print/page.tsx` `dbListAllActiveProducts()` çağrısı `dbGetProductRefsByIds(Array.from(new Set(po.lines.map(l => l.product_id))))` ile değiştirildi (Set ile dedup; aynı ürün birden fazla satırda olabilir).
- **P3 KAPANDI — Gerçek render smoke testi (renderToStaticMarkup)**: Önceki testler source-regex'e dayanıyordu, JSX/DOM bug'ları, conditional render kırılmaları, leak regression'ları yakalamıyordu. **Düzeltme:** `react-dom/server.renderToStaticMarkup` kullanılarak vitest `environment: "node"` ortamında jsdom-free real render testleri eklendi (dep gerektirmez, mevcut Next.js dep'i yeterli). Test paterni: `vi.mock("next/link")` plain `<a>` stub + fixture helper'ları (`makePoFixture`/`makeVendorFixture`/`makeCompanyFixture`/`makeProductRefs`) + `renderDoc()` async helper'ı. Test grupları: (a) **render content** — po_number/vendor/SKU'lar/totaller HTML'de; (b) **conditional branches** — cancelled vs default (İPTAL EDİLDİ badge), cancel_reason var/yok, notes dolu/null, logo dolu/null/company null, vendor null; (c) **toolbar print-gizleme** — `po-no-print` class + window.print() button + Siparişe Dön href; (d) **leak absence (defense-in-depth)** — `secret-user-uuid-leakage-test`, `VENDOR_INTERNAL_NOTES_SHOULD_NOT_LEAK`, `received_qty`, `cost_price`, `parasut_product_id`, `on_hand`, `reserved`, `product_notes`, `daily_usage` substring'lerinin rendered HTML'de bulunmadığı assert edilir.
- **`purchase-order-print-page.test.ts`** — source-regex güncellendi: `dbListAllActiveProducts` import edilmemeli (P2 leak fix lock); `po.lines.map(l => l.product_id)` + `new Set` dedup pattern'i mevcut.
- **+24 yeni test:** Real render: PO bilgisi/vendor/satırlar (5), conditional branches (10), toolbar print-gizleme (3), leak absence (4) + paralel fetch + dedup source-regex (2).
- 173 dosya · 2721 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 9 — PO PDF Render (server-side HTML print) (2026-05-18; 2697 test)

**Faz 9 (4 dosya: 3 yeni + 1 düzenleme):**
- **`src/components/purchase/PurchaseOrderDocument.tsx`** (YENİ, client component): A4 portrait print belgesi. Header (logo + şirket adı + V.D./VKN + adres + iletişim) → title band ("SATIN ALMA SİPARİŞİ") → meta grid (PO no/tarih/beklenen/durum/currency + tedarikçi adı/iletişim/VKN/ödeme vadesi) → lines tablosu (# / SKU / ürün / adet+unit / birim fiyat / iskonto / satır toplamı) → totals (ara toplam/KDV/genel toplam, currency-aware Intl) → notlar (po.notes varsa) → cancel sebebi (cancelled durumunda). `@page A4 portrait` + `@media print` CSS `dangerouslySetInnerHTML` ile. Logo: `<img>` (next/image yerine bilinçli — `QuoteDocument` paterniyle aynı, eslint-disable yorumu). Toolbar: "← Siparişe Dön" Link + "📄 Yazdır / PDF Olarak Kaydet" button (`window.print()`); print'te `.po-no-print` ile gizlenir. **Güvenlik (§12):** `po.created_by`, `audit_log`, `lines[].received_qty`, `vendor.notes`, `vendor.is_active` DOM'a yazılmaz. Cancelled PO: `İPTAL EDİLDİ` badge prominently + `cancel_reason` küçük not. Export'lu pure helper: `formatPoCurrency(amount, currency)` (Intl tr-TR + fallback) + `formatPoDate(iso)` (DD.MM.YYYY).
- **`src/app/dashboard/purchase/orders/[id]/print/page.tsx`** (YENİ, RSC): Server component. `dbGetPurchaseOrderById(id)` → null ise `notFound()`. Sonra `Promise.all([dbGetVendorById, dbGetCompanySettings, dbGetProductRefsByIds])` paralel fetch → `<PurchaseOrderDocument>` mount. `export const dynamic = "force-dynamic"`. Tek server round-trip.
- **`src/app/dashboard/purchase/orders/[id]/page.tsx`**: action button satırına Link butonu (📄 Yazdır / PDF, target=_blank, demo izinli).
- **+25 test (2 dosya):** module load + formatPoCurrency/formatPoDate pure + source-regex print CSS/status labels/conditional render/güvenlik (Faz 9 Review ile +24 gerçek render = toplam 49 yeni test).
- Migration yok. Yeni route: `/dashboard/purchase/orders/[id]/print`

**Önceki:** Faz 8 Review Bulgular — 5 bulgu + payload/slice testleri (2026-05-17–18; 2672 test)

**Faz 8 Review Bulgular (5 dosya + 2 migration güncelleme):**
- **P2 KAPANDI — zero-width/bidi bypass** (`src/lib/ai-guards.ts`): `sanitizeFeedbackForPrompt`'a step 1a eklendi: `ZERO_WIDTH_AND_BIDI_RE` → empty — `syste​m:` → `system:` → step 3 yakalar. +2 test (U+200B bypass + BOM/bidi).
- **P2 KAPANDI — PostgreSQL PUBLIC execute** (`supabase/migrations/054` + `055`): Migration 054'e `REVOKE ALL FROM public, anon, authenticated` eklendi (039 pattern). Migration 055 `public, anon, authenticated` üçünü revoke edecek şekilde genişletildi (önceki: sadece `authenticated`).
- **P3-001 KAPANDI — Plan-migration hizalandı**: `purchase-aksiyon-plan.md` line 261'deki `af.created_at >= now()` cutoff → `ar.decided_at >= now()`.
- **P3-003 KAPANDI — C0 kontrol karakterleri kaldırıldı**: `purchase-aksiyon-plan.md` line 1587'deki NUL (0x00) + Unit Separator (0x1F) → U+0000/U+001F escape sequence. `rg` artık dosyayı binary görmez.
- **P3-004 KAPANDI — Defense-in-depth re-sanitize** (`src/lib/services/ai-service.ts`): `sanitizedItems` map'inde `recentRejections` artık `sanitizeFeedbackForPrompt` ile yeniden geçiriliyor. Import eklendi.
- 172 dosya · 2672 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 8 — AI rejection feedback prompt entegrasyonu (2026-05-17; 2665 test)

**Faz 8 (1 commit, 6 dosya + 1 migration):**
- **Migration 054** (`supabase/migrations/054_ai_feedback_recent_rejections_rpc.sql`): `get_recent_rejections_for_products(p_product_ids uuid[], p_limit int)` RPC — `ROW_NUMBER PARTITION BY entity_id` ile her ürün için son N (default 3) rejection notunu döner. SQL-side filtreler: `entity_type='product'`, `recommendation_type='purchase_suggestion'`, `feedback_type='rejected'`, `feedback_note IS NOT NULL AND <> ''`, `decided_at >= NOW() - INTERVAL '90 days'`. `STABLE` + `SECURITY DEFINER` + `REVOKE ALL FROM public, anon, authenticated` + `GRANT EXECUTE TO service_role`. Idempotent + ROLLBACK SQL.
- **`src/lib/ai-guards.ts`**: yeni `sanitizeFeedbackForPrompt(raw)` export — 5-katmanlı sanitize (C0+DEL+U+2028/U+2029 → boşluk, triple-backtick → `''`, role marker (system/assistant/user):* strip case-insensitive, whitespace normalize, 200-char cap + `…`). Mevcut `sanitizeAiInput`/`sanitizeAiOutput` regex'leri de `new RegExp(...)` constructor pattern'ine taşındı — kaynak dosyaya yanlışlıkla binary kontrol karakter sızması/destrüktif Write riskine karşı sağlamlaştırma.
- **`src/lib/supabase/ai-feedback.ts`** (yeni): `dbGetRecentRejectionsForProducts(productIds, limit=3): Promise<Map<string, string[]>>` — RPC çağrısı + per-row sanitize + boş sanitize sonuçları drop. Empty input → boş Map (RPC çağrılmaz).
- **`src/lib/services/ai-service.ts`**: `PurchaseSuggestionItem`'a opsiyonel `recentRejections?: string[]` alanı; `PURCHASE_COPILOT_SYSTEM` prompt'una "Bağlamsal not — recentRejections" clause'u (notları muhakemede kullan, çıktıya echo etme, alan yoksa kuralı yok say). `sanitizedItems` map'inde `recentRejections` `sanitizeFeedbackForPrompt` ile yeniden sanitize edilir (defense-in-depth; boş sonuçlar filter ile atılır).
- **`src/app/api/ai/purchase-copilot/route.ts`**: `aiEnrichPurchaseSuggestions(needsAiItems)` çağrısından önce `dbGetRecentRejectionsForProducts(needsAiItems.map(i=>i.productId), 3)` — try/catch içinde, başarısızlık non-fatal (graceful degradation, mevcut pattern). Map'ten alınan notlar items'a inject edilir; `notes.length > 0` koşulu — empty array durumunda alan JSON'a hiç yazılmaz (token tasarrufu).
- **+19 yeni test (3 dosya):** `ai-feedback-sanitize.test.ts` (9: 8 saldırı vektörü + 1 defansif join), `ai-feedback-bulk-fetch.test.ts` (6: empty/single/50-bulk/error/sanitize-drop/multi-note), `ai-feedback-prompt-integration.test.ts` (4: 0-rejection/3-rejection/RPC-throw-degrade/output-contract).
- 171 dosya · 2665 test (review + payload + slice testleri sonrası 2672) yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 7 Kapanış — P2 takvim validasyonu + P3 server-side alert resolve (tam) (2026-05-17; 2646 test)

**Faz 7 Kapanış (1 commit, 5 dosya):**
- **P2 BUG FIX — Strict takvim validasyonu** (`src/app/api/orders/[id]/ship/route.ts`): `shipDate` için regex check'ten sonra Date roundtrip guard eklendi — `2026-02-31` (JS normalizasyonu → Mar 3) ve `2026-99-99` (RangeError) artık `dbShipOrderFull` RPC çalışmadan 400 döner.
- **P3 GÜVENİLİRLİK — İki katmanlı alert resolve:** (1) `route.ts`: `dbBatchResolveAlerts` fire-and-forget → `await .catch(log)` — normal başarı yolunda 200 dönmeden önce alert resolve garantili. (2) `alert-service.ts` `serviceCheckOverdueShipments`: güvenlik ağı eklendi — `dbListOverdueShipments` listesinde artık olmayan siparişlerin aktif `overdue_shipment` alertleri CRON'da toplu resolve edilir (Promise.all paralel fetch, `toResolve: BatchResolveEntry[]` liste). `{ alerted, resolved }` dönüş tipi. Ship endpoint başarısız olsa bile en geç 6 saatte temizlenir.
- Client-side `PATCH /api/alerts/${alert.id}` bloğu `alerts/page.tsx` `handleShip`'ten kaldırıldı.
- **+5 test:** `alerts-overdue-ship.test.ts` (+3: takvim overflow × 2, P3 resolved assert), `overdue-shipments-service.test.ts` (+2: stale alert resolve, stale+yeni mix) + mock güncelleme + 5 mevcut test `resolved` alanı için güncellendi.
- 168 dosya · 2646 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 7 — overdue_shipment alert inline ship form (2026-05-16; 2641 test)

**Faz 7 (1 commit, 6 dosya + 1 migration):**
- **Migration 053** (`supabase/migrations/053_orders_ship_meta.sql`): `sales_orders.shipment_tracking_number TEXT NULL` + `shipment_carrier TEXT NULL`. Idempotent, ROLLBACK SQL yorum bloğu.
- **`database.types.ts`**: `SalesOrderRow`'a 2 yeni alan.
- **`ShipMeta` interface + `serviceTransitionOrder` genişletme** (`order-service.ts`): 3. opsiyonel param `shipMeta?: { shipDate?, trackingNumber?, carrier? }`. Shipped branch patch'i: `shipped_at` override + `shipment_tracking_number` + `shipment_carrier` persist. Geriye uyumlu (mevcut callers shipMeta undefined → eski davranış).
- **Yeni `POST /api/orders/[id]/ship`** endpoint (`src/app/api/orders/[id]/ship/route.ts`): body validation (shipDate ISO format zorunlu; trackingNumber/carrier max 100 char opsiyonel); `serviceTransitionOrder(id, "shipped", shipMeta)` çağrısı; Paraşüt sync + email notification fire-and-forget; `revalidateTag("products","max")`.
- **`/dashboard/alerts` güncellemesi** (`page.tsx`): `actionFor()` `overdue_shipment` case eklendi (plan §9.4.1 — "Sevkiyatı yönet" + "/dashboard/orders"). `OrderAlertDrawer`: `onShipped` callback prop, `isOverdueShipment` branch, inline ship form (shipDate/trackingNumber/carrier state, `handleShip` handler, demo guard, `aria-label` + `role="alert"` error, "Sevk Et" butonu). Best-effort alert PATCH resolve.
- **Test (`alerts-overdue-ship.test.ts`, 12 test):** 8 endpoint testi (shipDate eksik/geçersiz/trackingNumber uzun/carrier uzun/sipariş yok/approved değil/happy path + ShipMeta/Paraşüt sync) + 4 source-regression (actionFor case + drawer markup + onShipped prop).
- 168 dosya · 2641 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 6 Kapanış — unit_price=0 bug fix + linkedPOs shape regression testleri (2026-05-16; 2629 test)

**Faz 6 Kapanış (1 commit, 4 dosya):**
- **P2 BUG FIX — unit_price=0 Modal bypass kapatıldı**: `PurchaseOrderModal.tsx` + `from-recommendations/route.ts` + `validatePoLines` içindeki `price < 0` guard'ları `price <= 0` yapıldı. Modal `Number("")=0` dönüştürmesi ile 0 TRY siparişi DB'ye yazılabiliyordu; backend artık 0'ı da reddediyor.
- **P3a — linkedPOs shape regression testleri (2 yeni)**: `dbGetPOsByRecommendationIds` PostgREST object-vs-array normalize kodu artık doğrudan test edildi — `purchase_order_lines` object shape + `purchase_orders` object shape edge case'leri.
- **P3b (vendor fallback)** ve **P3c (PO→öneri link)** plan kapsamı dışı — Faz 6 kapatıldı.
- 167 dosya · 2629 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert Faz 6 Bulgular 1. Tur — duplicate guard + shape normalize + silent zero + UX (2026-05-16; 2626 test)

**Faz 6 Bulgular 1. Tur (1 commit, 6 dosya):**
- **P2.1 Duplicate PO guard** — 3 katmanlı: (1) service-side (`serviceCreatePOFromRecommendations`'da `dbGetPOsByRecommendationIds` kontrolü; cancelled PO bypass; "aktif siparişe bağlı" throw), (2) UI-side (`RecActionCell` `hasActivePO` guard; `disabled={isDemo || hasActivePO}`; tooltip), (3) bulk filter (`acceptedAndEditedCount` + `handleBulkPo` aktif PO'lu rec'leri dışlar).
- **P2.2 Response shape normalize** (`dbGetPOsByRecommendationIds`): PostgREST many-to-one select object veya array dönebilir; her iki shape defensive handle edildi (polArr + pos array normalization). Canlı sessiz boş Map riski kapatıldı.
- **P2.3 Silent zero reject** (`from-recommendations/route.ts`): `quantity` ve `unit_price` için `null`/`undefined`/`""` explicit reject eklendi (`Number(null)===0` tuzağı). `discount_pct === ""` reject. Catch block'a `"aktif siparişe bağlı"` → 400 eklendi.
- **P3.4 Service direkt testler** (3): `vi.importActual` ile gerçek `serviceCreatePOFromRecommendations`; `@/lib/supabase/recommendations` modül mock'u eklendi (`mockDbListRecs`, `mockDbUpdateRecStatus`). qty=suggestQty→accepted, qty≠suggestQty→edited, aktif PO→throw.
- **P3.4 Silent zero test coverage** (2): `unit_price: null → 400`, `unit_price: "" → 400`.
- **P3.4 Toast action prop** (`Toast.tsx`): opsiyonel `action?: { label: string; href: string }` alanı; render'da link. Geriye uyumlu.
- **P3.4 "Siparişe git" toast action** (`suggested/page.tsx` `onSuccess`): başarılı PO toast'ına `action: { label: "Siparişe git", href: /dashboard/purchase/orders/${poId} }`.
- 167 dosya · 2626 test yeşil · TS clean · 0 lint warning · build OK

**Faz 6 (1 commit, 9 dosya):**
- **`dbGetPOsByRecommendationIds`** (`purchase-orders.ts`): `LinkedPO` interface + junction reverse lookup helper (`po_line_recommendations → purchase_order_lines → purchase_orders`; single `.in()` query, JS-side PO dedup). Type cast `unknown` ile Supabase nested array uyumu sağlandı.
- **`serviceCreatePOFromRecommendations`** (`purchase-order-service.ts`): rec doğrulama (statusIn: suggested/accepted/edited, rec type=purchase_suggestion, entity_type=product) + `dbCreatePurchaseOrder` RPC çağrısı (`source_recommendation_ids: [recId]` ile junction atomik insert) + best-effort suggested→accepted/edited status patch (try/catch; PO atomik, patch fail izlenebilir).
- **`POST /api/purchase-orders/from-recommendations`** (yeni route): `requireRole(["admin","purchaser"])`, vendor_id UUID validation, currency whitelist (TRY/USD/EUR), lines array validation (recommendation_id UUID, qty pozitif integer, price≥0, discount_pct 0–100), `revalidateTag("purchase-orders","max")` + `revalidateTag("products","max")`, hata mapping (bulunamadı/pasif/purchase_suggestion/ürün ile ilişkili → 400).
- **`purchase-copilot/route.ts`** güncellendi: `LinkedPO` import + tüm rec ID'leri için `dbGetPOsByRecommendationIds` reverse lookup (try/catch non-fatal) + RecRef'e `linkedPOs: LinkedPO[]` alanı (4 return site).
- **`PurchaseOrderModal.tsx`** (yeni component): drawer-style modal (right-side fixed, z-index 201, backdrop). Props: `open, onClose, mode("single"|"bulk-vendor"|"bulk-orphan"), initialItems: ModalItem[], vendors: VendorOption[], onSuccess, lockedVendorId?`. Vendor auto-fill → currency + expectedDate. Submit → `POST /api/purchase-orders/from-recommendations` → onSuccess. Demo guard + a11y (role="dialog", aria-modal, aria-label tüm inputlarda, error role="alert" aria-live).
- **`mock-data.ts` + `api-mappers.ts`**: `Product.preferredVendorId?: string | null` eklendi; `preferred_vendor_id` uuid FK mapped.
- **`suggested/page.tsx`** güncellendi: `RecEntry.linkedPOs?: LinkedPO[]`; `loadAiData` linkedPOs mapping; vendors state + fetch; `poModalState` + `_bulkQueue` state; `handleOpenPoModal` / `handleBulkPo` / `advanceBulkQueue` handlers; `acceptedAndEditedCount` computed; Bulk CTA bar (acceptedAndEditedCount>0); RecActionCell `onOpenPoModal` prop + `linkedPOs` display + "📋 Sipariş Aç" button (suggested/accepted/edited); PurchaseOrderModal mount.
- **`po-from-recommendations.test.ts`** (yeni, 11 test): helper boş/dolu/dedup (3) + route viewer→403 + geçersiz UUID→400 + service throw→400 + vendor pasif→400 + başarı 201 + revalidateTag (2) + doğru argümanlar + currency whitelist.
- 167 dosya · 2621 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert Faz 5 — PO Mal Kabul (2026-05-16; 2610 test)

**Faz 5 (1 commit, 6 dosya):**
- **Migration 051** (`supabase/migrations/051_po_receive_rpc.sql`): `receive_po_lines(p_po_id, p_lines jsonb, p_actor)` RPC — `FOR UPDATE` lock (aşırı kabul önleme), her line için `received_qty` artış + `on_hand` artış + `inventory_movements` ('purchase_order' referans tipi) + `purchase_commitments.received_qty` senkronu (B1). PO header status auto-update: `partially_received` / `received`. `audit_log` her geçiş için. ROLLBACK SQL bloğu yorum olarak eklendi.
- **`dbReceivePurchaseOrderLines`** (`purchase-orders.ts`): `ReceivePOLine` interface + `receive_po_lines` RPC wrapper helper.
- **`serviceReceivePOLines`** (`purchase-order-service.ts`): RPC çağrısı + best-effort `POST /api/alerts/scan` fire-and-forget (mal kabul sonrası stok alertları güncellenir).
- **`POST /api/purchase-orders/[id]/receive/route.ts`** (yeni): `requireRole(req, ['admin','purchaser'])` (B7); demo guard; body validation (line_id UUID regex, qty > 0 integer); 409 (wrong status), 404 (PO yok), 400 (validation), 200; `revalidateTag("purchase-orders", "max")` + `revalidateTag("products", "max")`.
- **PO detail UI** (`/dashboard/purchase/orders/[id]/page.tsx`): `receiveMode` state + `handleReceive` handler. "Mal Kabul" butonu `confirmed | partially_received` durumlarında görünür. Her satır için kalan miktar input'u (max=remaining, "Tümü" toggle), aria-label, aria-live. Demo guard.
- **Test (11 yeni, `po-receive.test.ts`):** helper RPC argümanları + hata propagation (2); route viewer→403, 404, 409 (draft status), qty=0→400, UUID→400, purchaser→200, revalidateTag (7); B1 kısmi/tam kabul çift sayım önleme (2).
- 166 dosya · 2610 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Coolify Faz D smoke — tüm otomatik kontroller yeşil (2026-05-16; 2599 test)

**Faz D smoke tam durum:**
- Staging URL: `https://erp.getmedspace.com` (sslip.io değil — Coolify'da yapılandırılan gerçek domain)
- `/api/health` → 200 `{"status":"ok"}` ✅
- `/login` → 200 ✅
- `/dashboard` auth gate → 307 ✅
- `/api/products` → 401 ✅
- CSP / HSTS / Permissions-Policy / X-Frame-Options tüm header'lar ✅
- `CRON_SECRET` set (değer: `kokpit-pmt-2026`) — 8 CRON endpoint 200 ✅
- `/api/health?detail=true` — tüm required env + migration kontrolleri OK ✅ (`PARASUT_CLIENT_ID` optional, bekleniyor)
- ⏳ Browser smoke: login + dashboard + vendors + purchase orders + products (kullanıcı tarafında)

**Önceki:** Coolify Faz D smoke fix — reverse-proxy redirect bug (3 endpoint) (2026-05-14; 2599 test)

**Faz D smoke fix (1 commit, 4 dosya):**
- Staging Coolify deploy yeşil çalışıyor. Smoke testlerde 2 sorun yakalandı:
- **Coolify Traefik X-Forwarded-Host pass-through eksik** → `new URL("/path", request.url)` veya `request.nextUrl.origin` container internal hostname'i (`0.0.0.0:3000`) veriyor → Location header public URL'e yönlendirmiyor. 3 endpoint etkileniyordu:
  - `/api/auth/demo` (Demo Gez → /dashboard)
  - `/api/parasut/oauth/start` (mock mode internal redirect)
  - `/api/parasut/oauth/callback` (success → /dashboard/settings)
- **Çözüm:** Same-origin redirect'ler için **relative Location header** kullanıldı (browser zaten same-origin'de follow eder; reverse proxy host header'ına ihtiyaç yok). `NextResponse.redirect(absoluteURL)` → `new NextResponse(null, { status: 307, headers: { Location: "/path" } })`. Bu Coolify/Traefik konfig değişikliği gerektirmez, code-side temiz.
- Test güncellemesi: `parasut-oauth.test.ts` `new URL(location, "http://localhost")` ile base URL eklendi (relative URL parse).
- 165 dosya · 2599 test yeşil · TS clean · 0 lint warning

**Devam eden — Faz D smoke checklist:**
- ✅ /api/health 200 OK
- ✅ /login 200 public
- ✅ /dashboard auth gate (307 → /login)
- ✅ /api/products auth zorunlu (401)
- ✅ CSP/HSTS/Permissions-Policy header'lar
- ✅ CRON_SECRET set + 8 CRON endpoint 200 OK
- ✅ /api/health?detail=true — tüm required checks OK
- ⏳ Browser smoke: login + dashboard + vendors + purchase orders + products (kullanıcı tarafında)

**Önceki:** Vercel → Coolify migration Faz A + cron workflow advisor fix (2026-05-13; 2599 test)

**Faz A advisor follow-up (1 commit, 1 dosya):**
- **P1 — Hidden green fail kapatıldı:** `crons.yml` step'lerine `id` eklendi; her job'ın Summary step'i `steps.<id>.outcome` aggregate yapıp 1+ failure varsa `exit 1` ile workflow'u doğru fail eder. Eski hâl: tüm step'ler `continue-on-error:true` olduğundan tüm endpoint'ler 401/500 verse bile workflow yeşil görünüyordu.
- **P2 — Cron 8 invocation → 4 düzeltildi:** `7,37 0,6,12,18 * * *` (her hedef saatte iki kez = günde 8) → `7 0,6,12,18 * * *` (her hedef saatte bir kez = günde 4). Plan yorumu ile cron string artık tutarlı (TR 03:07/09:07/15:07/21:07).


**Faz A — Coolify migration scaffolding (1 commit, ~10 dosya):**
- **Kök sorun:** Vercel Hobby tier cron sıklık limiti (minimum 1 day interval) `vercel.json`'daki `0 */6 * * *`'i reddediyor → 2026-05-09'dan beri tüm deploy'lar fail. Vercel CLI'sız log alınamadı; `vercel.link/3Fpeeb1` redirect'i cron pricing doc'una gidiyor (kanıt).
- **Çözüm yönü:** Coolify (self-hosted Docker PaaS, Hetzner/Vargonen VPS, ~€5/ay) + GitHub Actions cron (ücretsiz, sınırsız). Vercel paralel canlı tutulup risksiz cutover.
- **next.config.ts:** `output: "standalone"` + `images.unoptimized: true` (Next/image PDF yerinde, intentional `<img>`); CSP/HSTS header'lar aynı.
- **sentry.*.config.ts (3 dosya):** `environment: SENTRY_ENVIRONMENT ?? NODE_ENV` (staging/prod ayrımı için). Client tarafında `NEXT_PUBLIC_SENTRY_ENVIRONMENT`.
- **Dockerfile** (yeni, multi-stage, secret-free): deps → builder → runner. Sadece `NEXT_PUBLIC_*` build args (bundle'a yazılır). Server secret'ları (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `PARASUT_*`, `RESEND_API_KEY`) Coolify runtime env'inden enjekte. **SENTRY_AUTH_TOKEN Dockerfile'a hiç girmiyor** (advisor P1.3 — Docker secret yönergesi: build arg layer'a yazılır, leak riski). Source map upload ayrı GH Actions workflow'unda yapılır.
- **`.dockerignore`** (yeni): test artifact'ları, .env, dokümanlar, .vercel, .next dışlanır.
- **`.github/workflows/crons.yml`** (yeni): 8 endpoint envanteri (advisor P1.1 — eksikti `quotes/expire`). Her step `continue-on-error: true` + `curl --retry 3 --retry-delay 20 --max-time 60` + step `timeout-minutes: 5` (fail-isolation + retry). Off-peak dakika `7,37` (advisor P2.1 — top-of-hour drift'ten kaçınma). `workflow_dispatch` ile manuel tetikleme (job=all/six-hourly/hourly choice). Endpoint'ler: 6h → ai-suggest/alerts-scan/purchase-copilot/parasut sync-all/orders expire-quotes/quotes expire/check-shipments. 1h → email retry/parasut poll-e-documents.
- **`.github/workflows/sentry-release.yml`** (yeni): main push veya manual dispatch. GH Actions runner'da `npm ci && npm run build` çalıştırır; `SENTRY_AUTH_TOKEN`+`SENTRY_ORG`+`SENTRY_PROJECT` env ile `withSentryConfig` source map auto-upload yapar. Build iki kere yapılır (Coolify'da + GH Actions runner'da source map için); GH Actions free tier 2000 dk/ay, bu workflow ~30-50 dk/ay kullanır.
- **`.env.example`**: `SENTRY_ENVIRONMENT`/`NEXT_PUBLIC_SENTRY_ENVIRONMENT` notları; `NEXT_PUBLIC_APP_URL` Coolify URL'lerine güncellendi; `ADMIN_EMAILS` ek not; Coolify deployment GitHub Secrets gereksinimleri belgelendi.
- **package.json**: `docker:build` ve `docker:run` script'leri (local test için).
- **README.md**: yeni "Deployment (Coolify)" bölümü — mimari özet + secret listesi + local Docker test komutu.
- **vercel.json korunur** — Faz E cutover sonrası silinir (`chore(deploy): Coolify migration complete` commit'i).
- **`npm run build`** standalone output üretti (`.next/standalone/server.js` doğrulandı), 165 dosya · 2599 test yeşil · TS clean · 0 lint warning.

**Sıradaki adımlar (kullanıcı tarafında — Faz B-F):**
- **Faz B:** VPS al (Vargonen İstanbul önerili / Hetzner FSN1 alternatif) + Coolify install (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`)
- **Faz C:** Coolify'da `erp2-staging` Resource → GitHub bağla → env vars (staging için `PARASUT_ENABLED=false`, `RESEND_API_KEY=""`, advisor P1.2)
- **Faz D:** `erp-staging.kokpit.app` üzerinde 13 maddelik smoke test
- **Faz E:** DNS cutover `erp.kokpit.app` → Hetzner IP + GitHub Actions cron secret'ları set + Vercel pause
- **Faz F:** UptimeRobot health monitoring + Hetzner/Vargonen snapshot backup

**Önceki:** Purchase&Alert Faz 4 follow-up — UI gap'leri + Suspense fix (Vercel build kritik) (2026-05-13; 2599 test)

**Faz 4 follow-up (1 commit, ~10 dosya):**
- **CRITICAL Vercel build fix — `useSearchParams` Suspense wrap**: `new` page'e eklediğim `useSearchParams()` Next.js'in static prerender hatası vermesine sebep oluyordu (`Missing Suspense Boundary`). `NewPurchaseOrderPageInner` extract edildi + üstte `<Suspense>` wrapper. **Bu, May 6'dan beri Vercel build'lerinin de aynı tipte hata almasının kök nedeni olma ihtimali yüksek (kullanıcı Vercel CLI logu paylaşırsa kesin doğrulanır).** Mevcut `/dashboard/orders/page.tsx` ve `/dashboard/orders/new/page.tsx` zaten aynı pattern'i kullanıyor.
- **P2.1 fromDraft preload** (`new/page.tsx`): `useSearchParams.get("fromDraft")` ile gelen ID için `GET /api/purchase-orders/[id]` çağrısı + tüm form state'in (vendor, currency, expected_date, notes, lines) doldurulması. `expectedDateDirty=true` set edilerek preload'lanan tarih korunur.
- **P2.2 Revize endpoint + UI** (`[id]/revise/route.ts` yeni + detail page): `POST /api/purchase-orders/[id]/revise` → `serviceRevisePO` → sent→draft (CAS'lı UPDATE + sent_at=NULL). Detail UI'da `isSent` koşulunda "Revize Et" butonu (native confirm + transition).
- **P2.3 Audit timeline** (yeni `audit-log.ts` helper + `/api/audit-log` endpoint + detail UI): `dbListAuditLog(entityType, entityId)` chronological audit_log fetch. Generic GET endpoint: `?entity_type=...&entity_id=...`. Detail'de notes paneli altında dikey liste, `ACTION_LABELS` ile Türkçeleştirilmiş eventler (po_created/sent/confirmed/partially_received/received/cancelled/revised/lines_replaced). aria-label="Sipariş aktivite geçmişi".
- **P3.2 Vendor değişiminde stale expected_date** — `expectedDateDirty` flag pattern. Kullanıcı tarih değiştirirse korunur; vendor seçilirse otomatik fill.
- **P3.3 Double cancel toast fix** — `handleCancel`'de 403 dalı tek toast'a indirgendi (`const msg = ... ? ... : ...; toast({...msg})`).
- **Pure helper extraction** (`new/page.tsx`): `lineFromDraft(line) → LineDraft` ve `computeExpectedDate(leadTime, baseDate) → ISO` test-edilebilir helper'lar olarak export edildi.
- **Test (+17):** `audit-log.test.ts` yeni (4) + `purchase-orders-route.test.ts` revise endpoint (+3) + `purchase-orders-ui.test.ts` (+10): smoke (4) + lineFromDraft (2) + computeExpectedDate (3) + source-regex (5: Revize render condition, audit timeline mevcudiyeti + ACTION_LABELS, cancel 403 tek toast, fromDraft preload pattern, expectedDateDirty pattern).
- 165 dosya · 2599 test yeşil · TS clean · 0 lint warning · build OK

**Vercel deploy durumu (acil):** Son başarılı deploy 2026-05-06 (sha `d1ef1cd`). Sonraki Vercel deploy'ları `failure` (kullanıcı dashboard'dan `vercel.link/3Fpeeb1` log'unu paylaşırsa kök neden netleşir). Bu commit'le birlikte `useSearchParams` Suspense fix push edilince Vercel build'inin de geçme ihtimali yüksek — push sonrası `gh api repos/mirza-dev/erp2/commits/HEAD/statuses --jq '.[]|select(.context=="Vercel")'` kontrol edilmeli. Hâlâ fail ise kullanıcı `npm i -g vercel && vercel login && vercel inspect erp2-sigma.vercel.app --logs` çalıştırıp log'u paylaşmalı.

**Önceki:** Purchase&Alert Faz 4 — PO UI sayfaları + Faz 3 son advisor fix (source_recommendation_ids validation) (2026-05-12; 2582 test)

**Faz 4 (1 commit, ~6 dosya):**
- **Faz 3 cleanup — `source_recommendation_ids` validation gap kapatıldı**: `validatePoLines` artık opsiyonel `source_recommendation_ids` alanı için array + UUID regex check yapıyor. Defense-in-depth — Faz 6 service'i server-generated UUID kullanacak ama API boundary'de doğrulanır. +2 test (array değil → 400, geçersiz UUID → 400).
- **Sidebar** (`Sidebar.tsx`): "Satın Alma" grubuna "Siparişler" linki eklendi (Öneriler + Siparişler + Tedarikçiler).
- **`/dashboard/purchase/orders` (yeni)**: PO list sayfası. Status tab'ları (Tümü/Taslak/Gönderildi/Onaylandı/Kısmi Kabul/Tamamlandı/İptal), PO no + tedarikçi arama, durum badge, beklenen tarih, toplam (currency-aware), oluşturma tarihi. Row click → detail.
- **`/dashboard/purchase/orders/new` (yeni)**: PO oluşturma formu. Vendor select (vendor seçilince currency + expected_date `lead_time_days` ile auto-fill), satır ekleme/silme (product/qty/unit_price/discount_pct/notes), notlar, real-time KDV dahil toplam. JS-side validation (boş alan, qty/price tip), POST sonrası detail'e yönlendirme.
- **`/dashboard/purchase/orders/[id]` (yeni)**: PO detail. Header (PO no + status badge + vendor + expected_date), durum bazlı CTA'lar (Gönder/Onayla/İptal Et + Düzenle placeholder), summary cards (vendor, currency, ara toplam, KDV, genel toplam), lines table (ürün + qty + alındı/qty + birim fiyat + iskonto + satır toplamı; received_qty rengi kabul yüzdesine göre), notes paneli, cancel modal (reason zorunlu + admin uyarısı). NOT: mal kabul UI'ı Faz 5'te eklenecek.
- **Demo + a11y disiplini**: tüm mutasyon buton/inputları `useIsDemo` + `DEMO_BLOCK_TOAST` + `disabled` + `title`, form alanları `aria-label`, modal `role="dialog" aria-modal`, error mesajları `role="alert" aria-live`. Inline style + CSS variables (Tailwind kullanılmadı).
- **Smoke test (4 yeni, `purchase-orders-ui.test.ts`)**: 3 page module load + default export type check + Sidebar source contains "Siparişler" link regex check.
- 164 dosya · 2582 test yeşil · TS clean · 0 lint warning · build OK (3 yeni route: list/new/[id])

**Önceki:** Purchase&Alert Faz 3 advisor 2. tur — P2 follow-up + P3 regression lock (2026-05-12; 2576 test)

**Faz 3 advisor 2. tur (1 commit, ~5 dosya):**
- **P2 follow-up — `validatePoLines` sıkılaştırma** (`purchase-orders.ts`): (a) `unit_price` ve `quantity` için `null`/`undefined`/`""` explicit reject (`Number(null)===0` ve `Number("")===0` silent 0 tuzakları kapatıldı; eksik fiyat → 0 TRY siparişi sızıyordu); (b) `product_id` için UUID regex kontrolü (DB cast hatası 500 yerine 400'e map); (c) `discount_pct === ""` artık reject ediliyor (alan tamamen omitted olmalı).
- **P2 follow-up — Currency whitelist**: `isValidPoCurrency(c)` helper eklendi (`vendors.ts` paterniyle aynı). POST `/api/purchase-orders` ve PATCH `/api/purchase-orders/[id]` artık `currency`'yi whitelist'le doğruluyor (TRY/USD/EUR); whitelist dışı → 400 (önceden DB CHECK fail → 500).
- **P3 — Test regression lock**: `purchase-orders-route.test.ts`'te `next/cache` mock'u `mockRevalidateTag` module-level fn'e dönüştürüldü. confirm + cancel başarı testlerine `expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max")` assertion eklendi — kod doğruydu, sadece regresyon kilidi zayıftı.
- **Test (+5):** `purchase-orders-route.test.ts` — unit_price=null/"" (Number silent 0 tuzakları, 2), invalid UUID product_id (1), POST currency=GBP (1), PATCH currency=GBP (1) + confirm/cancel cache regression assert'leri mevcut testlere eklendi. Mevcut fixture'larda `product_id: "p-1"` → valid UUID `PID = "00000000-0000-4000-8000-000000000001"`.
- 163 dosya · 2576 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert Faz 3 advisor fix — P1+P2+P3 backend hardening (2026-05-11; 2571 test)

**Faz 3 advisor fix (1 commit, ~9 dosya):**
- **P1.1 (merge-blocker) — `role-guard.ts`**: `user.user_metadata?.role` → `user.app_metadata?.role`. Privilege escalation kapatıldı (Supabase'de `user_metadata` `auth.updateUser` ile kullanıcı tarafından yazılabilir; `app_metadata` sadece service_role ile yazılır).
- **P1.2 (merge-blocker) — `dbTransitionPurchaseOrder`**: (a) `partially_received`/`received` direct UPDATE branch'inden çıkarıldı, throw "mal kabul akışından (receive_po_lines RPC) geçilir" (Faz 5 receive RPC bu state'leri kendi içinde set edecek). (b) sent/draft direct UPDATE artık compare-and-set ile şartlı: `.eq("id", id).eq("status", current).select("id")` — 0 satır dönerse "yarış" hatası. Paralel send+confirm artık ikinci transition'ı kaybeder.
- **P2.1 (should-fix) — `dbDeactivateVendor`**: aktif PO guard eklendi. `purchase_orders` tablosundan `vendor_id=? AND status IN ('draft','sent','confirmed','partially_received')` count > 0 ise "aktif PO'su var" throw. DELETE route'un mevcut `aktif PO` regex'i 409'a map ediyor.
- **P2.2 (should-fix) — Line validation helper**: `validatePoLines(raw)` `purchase-orders.ts`'e eklendi (export). POST `/api/purchase-orders` + PUT `/api/purchase-orders/[id]/lines` `body.lines`'ı JS-side validate eder: array kontrol + `quantity > 0` integer + `unit_price >= 0` + `discount_pct ∈ [0,100]` + `product_id` non-empty. Hata → 400 (DB CHECK fail → 500 yerine).
- **P3 — cache invalidation**: confirm + cancel route'larına `revalidateTag("products", "max")` eklendi (`purchase-orders` revalidate'in yanına). `confirm_po` commitment seed → incoming/forecasted etkiler; `cancel_po` pending commitment cancel → incoming etkiler.
- **Test (+14, 4 dosya):** `role-guard.test.ts` (yeni, 4: app_metadata admin/purchaser/role-yok-fallback/user-null-viewer); `vendors.test.ts` (+2: dbDeactivateVendor aktif PO var → throw, yok → UPDATE+audit); `purchase-orders.test.ts` (+4: receive guard partially_received/received + CAS başarılı/race kaybı); `purchase-orders-route.test.ts` (+4: quantity=0/unit_price=-1/discount_pct=150/product_id eksik → 400).
- 163 dosya · 2571 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert plan Faz 3 — Purchase Orders backend (2026-05-11; 2557 test)

**Faz 3 (1 commit, ~15 dosya):**
- **Migration 049** (`supabase/migrations/049_purchase_orders.sql`): `po_counters` tablosu + RLS (B6) + `generate_po_number()` RPC (B2) + `purchase_orders` tablosu (status: draft/sent/confirmed/partially_received/received/cancelled) + triggers (line_total, header totals, updated_at) + `purchase_order_lines` tablosu + `po_line_recommendations` junction tablosu (M2) + `create_purchase_order_with_lines` RPC (B3, B4 vendor active guard) + `replace_purchase_order_lines` RPC (B3). Tüm `audit_log` insert'leri `actor` kolonu kullanır (NOT `created_by`).
- **Migration 050** (`supabase/migrations/050_purchase_commitments_po_link.sql`): `purchase_commitments.po_line_id` FK + `received_qty` kolonu (B1) + `chk_pc_received_le_qty` constraint + `uniq_pc_active_po_line` partial unique index.
- **Migration 052** (`supabase/migrations/052_po_confirm_commitment_seed.sql`): `confirm_po` RPC (B4: expected_date, boş PO, inactive vendor guard + commitment otomatik seed) + `cancel_po` RPC (terminal state guard + pending commitment cancel).
- **DB Types** (`database.types.ts`): `PurchaseOrderStatus` type; `PurchaseOrderRow`, `PurchaseOrderLineRow`, `PoLineRecommendationRow`, `PoCounterRow` interface'leri; `PurchaseCommitmentRow`'a `po_line_id: string | null` ve `received_qty: number` eklendi.
- **`purchase-commitments.ts`** güncellendi: `CreateCommitmentInput`'a `po_line_id` eklendi; `dbGetIncomingQuantities` B1 fix — `incoming = SUM(quantity - received_qty) WHERE pending` (kısmi kabulde çift sayım önlenir).
- **`src/lib/auth/role-guard.ts`** (yeni): `getCurrentUserRole` (auth.users.user_metadata.role, fallback 'purchaser') + `requireRole` (admin/purchaser/viewer).
- **`src/lib/supabase/purchase-orders.ts`** (yeni): `VALID_PO_TRANSITIONS` + `dbListPurchaseOrders` + `dbGetPurchaseOrderById` (+ lines) + `dbCreatePurchaseOrder` (→ RPC) + `dbReplacePurchaseOrderLines` (→ RPC) + `dbTransitionPurchaseOrder` (state machine: confirm→RPC, cancel→RPC, sent/draft/others→UPDATE) + `dbPatchPurchaseOrder`.
- **`src/lib/services/purchase-order-service.ts`** (yeni): `serviceTransitionPO` + `serviceSendPO` + `serviceConfirmPO` + `serviceCancelPO` + `serviceRevisePO` (M1: sent→draft, sent_at=NULL).
- **API routes (6 yeni):** `GET/POST /api/purchase-orders` + `GET/PATCH /api/purchase-orders/[id]` + `PUT /api/purchase-orders/[id]/lines` + `POST /api/purchase-orders/[id]/send` + `POST /api/purchase-orders/[id]/confirm` + `POST /api/purchase-orders/[id]/cancel` (admin only — B7).
- **Test (50 yeni test, 3 dosya):** `purchase-orders.test.ts` (18) + `purchase-orders-route.test.ts` (14) + `purchase-order-service.test.ts` (12) + B1 incoming partial receive tests (2) + state machine terminal state tests.
- 162 dosya · 2557 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert plan Faz 2 — Vendor entity (2026-05-10; 2498 test)

**Faz 2 (1 commit, ~8 dosya):**
- **Migration 048** (`supabase/migrations/048_vendors.sql`): `CREATE EXTENSION IF NOT EXISTS pg_trgm` (B5) + `vendors` tablosu (id/name/contact_email/contact_phone/contact_person/tax_number/address/currency/payment_terms_days/lead_time_days/notes/is_active/created_at/updated_at) + `updated_at` trigger + RLS + trigram index (name search) + `products.preferred_vendor_id uuid FK` (ON DELETE SET NULL).
- **DB Types** (`database.types.ts`): `VendorRow` interface eklendi; `ProductRow`'a `preferred_vendor_id: string | null` eklendi.
- **`src/lib/supabase/vendors.ts`** (yeni): `dbListVendors` (filter: isActive, search) / `dbGetVendorById` / `dbCreateVendor` (validation: name, email, tax_number 10/11 hane, currency whitelist, lead_time_days≥0 + audit_log) / `dbUpdateVendor` (partial patch + audit_log) / `dbDeactivateVendor` (soft delete + audit_log).
- **`/api/vendors`** GET (cache 60s, search/all param) + POST (validation error → 400).
- **`/api/vendors/[id]`** GET (404 yok) + PATCH (404 yok, 400 validation) + DELETE soft (404 yok, 409 zaten pasif).
- **`/dashboard/vendors/page.tsx`** (yeni): tablo (name, iletişim, currency, tedarik süresi, ödeme vadesi, durum) + search + pasif toggle + drawer form (tüm alanlar, aria-label/aria-live) + demo guard + deactivate confirm.
- **Sidebar** (`Sidebar.tsx`): "Satın Alma Önerileri" tek linki → "Satın Alma" grup (Öneriler + Tedarikçiler) olarak yeniden düzenlendi.
- **Test (17 yeni, `vendors.test.ts`):** 5 validation (name/email/tax/currency/lead_time), GET 200, POST 3 (name eksik 400, email 400, başarılı 201), GET/[id] 2 (404/200), PATCH/[id] 3 (404/email 400/200), DELETE/[id] 3 (404/zaten pasif 409/200).
- 159 dosya · 2498 test yeşil · TS clean · 0 lint warning

**Önceki:** Purchase&Alert plan Faz 1 + advisor P2/P3 fix (2026-05-10; 2481 test)

**Faz 1 advisor follow-up (1 commit, 4 dosya):**
- **P2 (parasut_auth filter bug):** `parasut-oauth.ts` CAS çakışmasında `entity_type='parasut_auth'` (snake_case) yazıyordu; UI sadece `entity_type='parasut'` filtreliyordu → bu alertler "Silinmiş Ürün" olarak ürün gruplarına düşebiliyordu, inline retry CTA'sı ulaşmıyordu. Fix: `parasut-constants.ts`'e `PARASUT_ALERT_ENTITY_TYPES` (parasut + parasut_auth) ve `PARASUT_SYNC_ALERT_ENTITY_IDS` (5 bilinen Paraşüt UUID) Set'leri eklendi. UI'daki `systemAlerts` ve `productSysAlerts` filter'ları iki katmanlı kontrol kullanır (entity_type **VEYA** entity_id whitelist) → her iki kategori kayıp olmaz.
- **P3 (endpoint type-only guard):** `/api/alerts/[id]/sync-retry` sadece `type === 'sync_issue'` kontrol ediyordu; gelecekte sync_issue başka entegrasyonlar için de yaratılırsa yanlışlıkla Paraşüt sync-all tetiklenebilirdi. Fix: defense-in-depth — `entity_type ∈ PARASUT_ALERT_ENTITY_TYPES` **VE** `entity_id ∈ PARASUT_SYNC_ALERT_ENTITY_IDS` guard. Bilinmeyen → 400 "Paraşüt sync alanına ait değil".
- **Test (+4):** `parasut_auth` AUTH alert oauth refresh; bilinmeyen entity_type whitelist dışı → 400; entity_type=parasut ama entity_id rastgele → 400 (defansif); constants whitelist source-regression.
- 158 dosya · 2481 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert plan Faz 1 — sync_issue alert inline retry (2026-05-10)

**Faz 1 (1 commit, ~7 dosya):**
- **Yeni endpoint** `POST /api/alerts/[id]/sync-retry`: alert tipini doğrular, entity_id'ye göre dispatch eder. `ALERT_ENTITY_PARASUT_AUTH` → `serviceParasutOAuthRefresh` çağrılır; diğer Paraşüt entity'leri → `serviceSyncAllPending`. Başarılı her iki yolda alert `resolved` (reason='sync-retry-from-alert'). 404 (alert yok) / 400 (tip sync_issue değil ya da zaten resolved) / 409 (OAuth bağlantısı kurulmamış) / 502 (sync-all tamamen başarısız).
- **`serviceParasutOAuthRefresh` helper extract** (`parasut-oauth.ts`): `/api/parasut/oauth/refresh` admin endpoint'inin iç mantığı helper'a taşındı. Faz 1 sync-retry endpoint'i de aynı helper'ı kullanır → tek source-of-truth. `getParasutAdapter` çağrısı helper'ın içine alındı.
- **`/dashboard/alerts` UI**: `actionFor()` switch'ine `sync_issue` case (defansif fallback `/dashboard/parasut`); `productSysAlerts` filter genişletildi (`entity_type !== 'parasut'`) → sync_issue alertleri ürün gruplarından ayrıldı; yeni `systemAlerts` listesi (`entity_type='parasut'` && `type='sync_issue'`); yeni `SystemAlertCard` component'i ("Yeniden Dene" CTA + Paraşüt sayfa linki + Yoksay); sayfa üstünde "Paraşüt Sync Uyarıları" bölümü. `retrySyncAlert` handler optimistic resolve + toast; demo guard.
- **Test (11 yeni, `alerts-sync-retry.test.ts`):** 7 endpoint senaryo (404, tip 400, zaten resolved 400, AUTH→oauth refresh, notConnected→409, diğer→sync-all, sync-all fail→502) + 4 source-regression (actionFor case, SystemAlertCard, systemAlerts filter, productSysAlerts parasut exclusion).
- **Eski test güncel:** `parasut-oauth-refresh.test.ts` mock factory `vi.importActual` ile partial mock'a dönüştürüldü (helper extract sonrası testler kırılmasın).
- 158 dosya · 2477 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** G11 audit 12. tur — dbUpdateRecommendationMetadata yarış koruması (status=suggested guard) (2026-05-10; 2466 test)

**G11 audit 12. tur (1 commit, ~3 dosya):**
- **Fix (MEDIUM) — `dbUpdateRecommendationMetadata` race guard**: helper UPDATE'i `.eq("id", id)` ile filtre yapıyordu; status guard yoktu. Yarış: CRON levelSame metadata patch'i hesaplarken (rec suggested görüldü → `dbGetRecommendationById` → hesap → UPDATE) kullanıcı aynı rec'i kabul/red ederse, decided rec'in `metadata.suggestQty` (frozen miktar) CRON'un patch'i ile yenileniyordu → "decided rec frozen metadata" kuralı kırılıyor, UI'da yanlış miktar görünüyordu. `dbUpdateSuggestedRecommendation` zaten `.eq("status","suggested")` kullanıyordu — aynı disiplin metadata helper'a uygulandı: (1) `dbGetRecommendationById` sonrası `current.status !== "suggested"` ise erken return (defansif kısa devre), (2) UPDATE chain'ine `.eq("status","suggested")` SQL guard'ı (yarış pencerei kapatma).
- **route.ts:280** civarında yorum güncellendi (12. tur referansı).
- **Test (4 yeni):** `recommendations.test.ts` `dbUpdateRecommendationMetadata` test grubu — (1) status=suggested → UPDATE çalışır + .eq filtreler doğru sırayla, (2) status=accepted → UPDATE atılmaz (early return), (3) status=rejected → UPDATE atılmaz, (4) rec yok → UPDATE atılmaz.
- 157 dosya · 2466 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Lint warning temizliği — 30 → 0 (config + dead code) (2026-05-10; 2462 test, 0 warning)

**Lint cleanup (1 commit, 13 dosya):**
- **Config-level fixes (16 warning):**
  - `eslint.config.mjs` `globalIgnores`'a `coverage/**` (Vitest/c8 artifacts) ve `tests/load/**` (k6 ayrı runtime) eklendi.
  - `@typescript-eslint/no-unused-vars` rule override: `argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`, `caughtErrorsIgnorePattern: "^_"` — TS/JS topluluk konvansiyonu (parasut.ts mock adapter `_code/_input/_vkn`, voice-service.test.ts `_maxLen` zaten konvansiyon kullanıyordu, rule eksikti).
- **Test dosyalarında dead kod (7 warning, 6 dosya):** `parasut-mock-adapter.test.ts` `beforeEach` import; `parasut-oauth-refresh.test.ts` `mockGetUser` decl.; `parasut-oauth.test.ts` `req` ataması; `parasut-service-faz5/6.test.ts` `ParasutError` import; `parasut-service-faz8.test.ts` 2× `const result =`; `parasut-service-faz9.test.ts` `const result =`.
- **App/script dead atamalar (3 warning):** `seed-large.ts` ölü `tables` decl.; `alerts/page.tsx:149` ilk `const product = ...` (line 156'da yeniden atanıyor); `orders/[id]/page.tsx:1218` ölü `const err = isErrorOnStep(s)`.
- **Next.js Image (1 warning):** `QuoteDocument.tsx:318` PDF/print `<img>` bilinçli tercih (`next/image` PDF render'da lazy-load + extra request sorunu); inline `eslint-disable-next-line @next/next/no-img-element` yorumu eklendi.
- **Bonus:** Yeni rule sonrası `quotes.ts:68`'deki gereksiz `eslint-disable-next-line` kaldırıldı.
- **Test dokümantasyonu:** `purchase-suggested-frozen-qty.test.ts:55` "frozen 30" yanıltıcı başlık → "fallback computed 50" (kod davranışı 50, test başlığı 30 diyordu — bug yok, sadece dokümantasyon yanıltıcı).
- 157 dosya · 2462 test yeşil · TS clean · 0 lint warning · 0 lint error · build OK

**Önceki:** G11 audit 11. tur — AI fail recovery (aiPending flag) + frozen suggestQty UI + yorum bayatlığı (2026-05-10; 2462 test)

**G11 audit 11. tur (1 commit, ~5 dosya):**
- **Fix 1 (MEDIUM) — `aiPending` metadata flag**: `buildAiMetadata` AI fail durumunda eski metni fallback yapıyordu (Audit 6 Fix 4) ama `metadata.urgencyLevel`'i her zaman güncel hesapla yazıyordu → bir sonraki cron'da `readUrgencyLevelFromMeta` aynı level'ı okuyup `levelSame` der → fresh AI bir daha denenmiyordu (geçici hata kalıcılaşıyordu). Yeni: `buildAiMetadata` her zaman `aiPending: !ai` yazar; diff-merge sinyali (`existingLevel === currentLevel && !aiPending`) ile pending durumda levelChanged'a düşürür ve fresh AI dener. JSONB JS-merge sayesinde levelSame patch'i `aiPending` içermez → korunur; AI başarılı patch'inde false olarak yazılır → eski true silinir.
- **Fix 2 (MEDIUM) — Frozen suggestQty UI**: backend `outOfScopeDecidedItems` için `metadata.suggestQty` (frozen) yayınlıyordu ama UI satır render'ı her render'da `computeSuggestion(p)` ile güncel hesap yapıyordu — accepted toplamı stok değişiminde değişebiliyordu. Yeni: `selectDisplaySuggestQty(rec, computedQty)` helper karar mantığını tek noktada toplar; backend `RecRef`'e `frozenSuggestQty` alanı (decided rec metadata.suggestQty'sinden); UI `RecEntry`'ye eklenir; tüm callsite'lar (mobil 1290, masaüstü 1416, computeOrderTotals input, drawer 946) helper kullanır.
  - rec yok / suggested → güncel hesap; edited → editedQty; accepted/rejected → frozenSuggestQty; legacy fallback computed.
- **Fix 3 (LOW) — Yorum güncelleme**: `recommendations.ts:34-37` JSDoc + `route.ts:211` yorum `.gte → .or(...)` davranışına göre güncel; 10. tur Fix 1 referansı eklendi.
- **Yeni testler (14):** `purchase-copilot-ai-error-flag.test.ts` (+5 aiPending senaryosu); `purchase-suggested-frozen-qty.test.ts` (yeni dosya, 9 helper test).
- 157 dosya · 2462 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 10. tur — 2 düşük risk fix (legacy decided_at NULL, initial fetch behavior testi) (2026-05-10; 2448 test)

**G11 audit 10. tur (1 commit, ~5 dosya):**
- **Fix 1 (LOW) — Legacy `decided_at = null` defansif**: `dbListRecommendations.decidedAfter` filter eskiden `.gte("decided_at", X)` ile NULL kayıtları reddediyordu → eski test seed/manuel insert'le `decided_at=null, status='accepted'` rec'ler out-of-scope drift response'una hiç girmezdi. Yeni: helper `.or("decided_at.gte.X,decided_at.is.null")` ile NULL'ları kapsa; route JS-side fallback `r.decided_at === null` durumunda `created_at` ile 7-gün cutoff kontrolü. Mevcut akış için bug yok (yeni rec'lerde `decided_at` her zaman set), defansif legacy data koruması.
- **Fix 2 (LOW) — Initial fetch behavior testi**: Audit 9. tur Fix 1 source-regex testlere ek olarak `shouldTriggerFetch(productsLen)` pure helper testleri — fetch tetikleme koşulu (`products.length === 0 → return`) davranış matrisiyle çift sigorta. Mevcut testler de korundu.
- 156 dosya · 2448 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 9. tur — initial fetch chicken-and-egg, decidedAfter SQL, kart kırılımı, available clamp (2026-05-10; 2443 test)

**G11 audit 9. tur (1 commit, ~8 dosya):**
- **Fix 1 (HIGH) — İlk yükleme out-of-scope decided fetch**: useEffect'in dependency'si sadece `reorderSignature` idi → ilk açılışta recMap boş + reorderSuggestions boş → signatureSource boş → imza "" → effect skip → route hiç çağrılmıyor → recMap dolmuyor (chicken-and-egg). Çözüm: `[reorderSignature, products.length, loadAiData]` dependency, `if (products.length === 0) return` early-return. Products yüklendiğinde bir kez fetch tetiklenir, recMap dolunca signatureSource genişler ve effect tekrar çalışır.
- **Fix 2 (MEDIUM) — `decidedAfter` SQL filter**: route 7-gün cutoff'unu JS-side uyguluyordu (`for (r of allDecidedRecs) if (now - decided_at >= 7days) continue`). Decided rec'ler TTL'siz olduğu için ai_recommendations tablosu büyüdükçe gereksiz I/O. Helper'a `decidedAfter?: string` param + `.gte("decided_at", cutoff)` zinciri. Route ISO cutoff geçer; JS-side filter loop kaldırıldı.
- **Fix 3 (MEDIUM) — Özet kart kırılımı reorderSuggestions üzerinden**: "Toplam Kritik" sayısı `reorderSuggestions.length` (in-scope satın alma ihtiyacı), ama alt kırılım `manufacturedItems.length`/`commercialItems.length` (displayProducts üzerinden) idi → 1 ana sayı, 2 kırılım toplamı. Yeni `inScopeManufacturedCount`/`inScopeCommercialCount` useMemo (reorderSuggestions üzerinden) — kart başlığı + kırılım hizalı. Tab count'ları displayProducts'ta kalır (görünür ürün sayısı).
- **Fix 4 (LOW) — `available` clamped**: route items.map'inde `available: promisable` ham değer veriyordu — over-quoted (-5) durumunda AI prompt JSON içinde negatif görüyor, fallback body "Stok -5/20" yazıyordu. Yeni `available: stock` (= max(0, promisable)) — UI ile aynı görünüm.
- **Yeni 1 test dosyası (3 yeni test):** `purchase-suggested-initial-fetch.test.ts` (Fix 1 source-regression). `recommendations.test.ts` (+3 decidedAfter filter), `purchase-copilot-out-of-scope-decided.test.ts` (1 testi update — JS-side 7-gün test'i artık SQL cutoff geçişini doğrular), `purchase-suggested-tab-counts.test.ts` (+3 in-scope kırılım), `purchase-copilot-promisable-deep.test.ts` (+2 response available clamp).
- 156 dosya · 2443 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 8. tur — in-scope clamp, urgency pctFallback, tab counts, silinmiş ürün filter (2026-05-09; 2432 test)

**G11 audit 8. tur (1 commit, ~9 dosya):**
- **Fix 1 (HIGH) — Backend in-scope items clamp**: route `needed = max(0, target - promisable)` over-quoted ürünler için `suggestQty` şişiriyordu (UI 40, backend 50). Yeni: `stock = max(0, promisable)` + `needed = max(0, target - stock)` + `coverageDays = computeCoverageDays(stock, ...)`. Frontend `pickStock` paterniyle birebir → UI ile backend item.suggestQty eşit.
- **Fix 2 (HIGH) — `computeUrgencyLevel` pctFallback**: `coverageDays === null` (daily_usage yoksa) durumunda her zaman `moderate` dönüyordu; severity (`urgencyPct ≥ 80`) ile çelişkili rozet/AI metni. Yeni 3. opsiyonel param `pctFallback`: cov=null durumunda ≥80 → critical, ≥50 → high, else moderate. Route tüm caller'lar `computeUrgencyPct(stock, min)` geçer; `item.urgencyLevel` zaten hesaplandığı için diğer noktalar `item.urgencyLevel`'i tek source kullanır. `readUrgencyLevelFromMeta` `meta.urgencyPct` fallback alır. `ai-service.ts` yorumu güncel.
- **Fix 3 (MEDIUM) — Tab counts/pendingCount displayProducts üzerinden**: `tabs.count`, `manufacturedItems`/`commercialItems`, `pendingCount` `reorderSuggestions` üzerinden hesaplanıyordu → out-of-scope accepted ürünleri saymıyordu, `pendingCount` negatif çıkabiliyordu. Hepsi `displayProducts` üzerinden. `acceptedCount`/`rejectedCount` `displayIds` filtresiyle (recMap'te kalan silinmiş ürünleri sayma).
- **Fix 4 (LOW) — Silinmiş ürün entry filter**: `productMap.has(productId)` kontrolü `outOfScopeDecidedItems` ve `decidedRefs` filter'larında → orphan cleanup henüz tetiklenmediyse bile UI'a `productName: "—"` placeholder sızmaz.
- **Yeni 1 test dosyası (8 yeni test):** `purchase-suggested-tab-counts.test.ts`. `purchase-copilot-promisable-deep.test.ts` (+3 in-scope clamp), `compute-urgency-level.test.ts` (+9 pctFallback), `purchase-copilot-out-of-scope-decided.test.ts` (1 test güncellendi + 1 yeni "items'a girmez").
- 155 dosya · 2432 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 7. tur — auto-reload imzası displayProducts, items'a out-of-scope, statusIn helper (2026-05-09; 2411 test)

**G11 audit 7. tur (1 commit, ~7 dosya):**
- **Fix 1 (HIGH) — Auto-reload imzası `displayProducts`'ı kapsar**: `reorderSignature` `reorderSuggestions` üzerinden hesaplanıyordu → out-of-scope decided ürünlerin stok/quote değişimi imzayı değiştirmiyordu. Yeni `signatureSource` useMemo (= `displayProducts`) hem imza hem listeleme için tek source-of-truth. Out-of-scope ürün stok değişiminde auto-reload tetiklenir, drift güncellenir.
- **Fix 2 (HIGH) — Out-of-scope decided ürünler `data.items`'da**: backend `responseItems` sadece `items` (= needsPurchase) üzerinden kuruluyordu → UI `aiMap.get(p.id)` undefined → "✦ AI" rozeti gizli, drawer'da AI yorumu yok. Frozen metadata DB'de var ama UI'a ulaşmıyordu. Yeni: `outOfScopeDecidedItems` dizisi (decided rec metadata'sından `aiWhyNow/aiQuantityRationale/aiUrgencyLevel/suggestQty/targetStock/...` çıkarılır; `available` güncel state); `responseItems = items ∪ outOfScopeDecidedItems`. `productMap` lookup ile ürün adı/SKU vb. doldurulur.
- **Fix 3 (MEDIUM) — `dbListRecommendations` statusIn**: `ListRecommendationsFilter`'a `statusIn?: RecommendationStatus[]` eklendi; helper `.in("status", [...])` kullanır. Route `statusIn: ["accepted","edited","rejected"]` geçer → SQL-side filter, JS-side `if (r.status !== ...) continue` overhead yok. Büyük tabloda performans. `statusIn` `status`'tan öncelikli.
- **Fix 4 (LOW) — `displayProducts`/`signatureSource` runtime testi**: simülasyon helper'ı ile dedup, accepted/rejected/edited filter, stok değişimi → imza değişimi senaryoları test edildi.
- **Yeni 5 test (Fix 1) + 5 test (Fix 2) + 4 test (Fix 3):** `purchase-suggested-auto-reload.test.ts` (+5), `purchase-copilot-out-of-scope-decided.test.ts` (+6, statusIn dahil), `recommendations.test.ts` (+4 statusIn).
- 154 dosya · 2411 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 6. tur — decided drift kapsamı, UI clamp, sort/drawer pickStock, AI fallback, POST enrich (2026-05-09; 2396 test)

**G11 audit 6. tur (1 commit, ~10 dosya):**
- **Fix 1 (HIGH) — Decided rec drift kapsamı**: route `dbGetActiveRecommendationsForEntities` sadece needsPurchase ürünleri için decided rec çekiyordu → kullanıcı kabul + stok düzelmiş senaryosunda rec response/UI dışında kalıyor, drift rozeti hiç görünmüyordu. Yeni: `dbListRecommendations` ile tüm aktif decided rec'ler ayrıca yüklenir (7-gün window içinde); items dışı ürünler için drift hesabı `productMap` üzerinden güncel state'e göre yapılır. UI: `displayProducts = reorderSuggestions ∪ outOfScopeDecided` — decision filter `accepted/rejected` seçilince out-of-scope ürünler de listede görünür.
- **Fix 2 (MEDIUM) — UI promisable<0 clamp**: `computeRowStock` ve `computeSuggestion` `Math.max(0, promisable)` ile clamp; urgency formula `Math.min(100, ...)` — over-quoted ürünlerde negatif gün/%>100 urgency önlenir. Yeni `pickStock(p)` helper export'u (sort/mostUrgent/drawer için tek source).
- **Fix 3 (MEDIUM) — Sort/En Acil/AI drawer pickStock**: sort fallback (coverage/urgency), `mostUrgent`/`mostUrgentDays`, `aiDrawerCoverageDays`, drawer "Stok Durumu" gridi hep `pickStock` üzerinden — `(a|b|mostUrgent|aiDrawerProduct).available_now` doğrudan kullanım yok. Drawer "Açık" değeri `Math.max(0, min - drawerStock)` ile negatif görünmez.
- **Fix 4 (MEDIUM) — Level değişiminde AI fail fallback**: `buildAiMetadata(item, fallbackMeta)` — AI fail/empty olunca eski rec metadata'sındaki `aiWhyNow`/`aiQuantityRationale`/`aiUrgencyLevel` korunur. Geçici network/parse hatası eski iyi metni silmez.
- **Fix 5 (LOW) — POST /api/products enriched response**: yeni ürün yaratma response'u `enrichProducts` ile `quoted/promisable/incoming/forecasted/stockoutDate/orderDeadline` alanları içerir. DataContext ilk full refetch'e kadar tutarlı state.
- **Yeni 2 test dosyası (16 yeni test):** `purchase-copilot-out-of-scope-decided.test.ts` (6), `purchase-suggested-pickstock-regression.test.ts` (5). `purchase-suggested-promisable-ui.test.ts` (+9 clamp + pickStock), `purchase-copilot-diff-merge.test.ts` (+3 AI fallback), `api-products-quoted.test.ts` (+4 POST enrich).
- 154 dosya · 2396 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 5. tur — UI promisable, refetch ?all=1, signature quoted, ?all=1 filter (2026-05-09; 2369 test)

**G11 audit 5. tur (1 commit, ~9 dosya):**
- **Fix 1 (HIGH) — DataContext promisable filter**: `reorderSuggestions` `shouldSuggestReorder({ available: p.available_now })` çağırıyordu → quote'lu siparişler hesaba katılmıyordu, UI öneriyi kaçırıyordu. Yeni: `available: p.promisable ?? p.available_now` — backend `purchase-copilot/route.ts:124` ile semantik eşleşme.
- **Fix 2 (HIGH) — page.tsx tüm hesaplar promisable**: `computeSuggestion`, mobil kart, masaüstü tablo `p.available_now` kullanıyordu. UI'da gösterilen suggestQty/coverage/urgency backend'le çelişebilirdi (örn. backend 90 öneriyor, UI 10 gösteriyor). `computeSuggestion` ve yeni `computeRowStock` helper'ları artık `p.promisable ?? p.available_now` ile çalışır; ikisi de export'lu (test edilebilirlik). Mobil kart "Mevcut" sütunu + masaüstü "Stok" sütunu artık satılabilir stok (promisable) gösterir.
- **Fix 3 (MEDIUM) — reorderSignature quoted**: imza `id:available:min:daily:reserved` idi → quote eklenince available_now sabit kalsa bile imza değişmiyordu, auto-reload kaçıyordu. Yeni: `:quoted` suffix eklendi.
- **Fix 4 (MEDIUM) — Refetch ?all=1**: `data-context.tsx`'de 3 mutasyon path'i (uretimEkle, uretimSil, updateOrderStatus) çıplak `/api/products` çağırıyordu → 100+ ürünlü setlerde global state ilk 100'e düşüyordu. Hepsi `?all=1`'e geçirildi (ilk yükleme paterni).
- **Fix 5 (LOW) — `?all=1` filter desteği**: `?all=1` branch erken return; `category/product_type/is_active` parse edilmiyordu. Yeni `getCachedAllProducts(category, productType, isActive)` filter-aware (cache key `["products-all-filtered"]`); `dbListProducts({...filters, pageSize: 10000})` kullanır.
- **Yeni 4 test dosyası (25 yeni test):** `purchase-suggested-promisable-ui.test.ts` (12), `data-context-refetch-all.test.ts` (3), `data-context-reorder-promisable.test.ts` (2), `purchase-suggested-auto-reload.test.ts` quoted ekstreleri (4), `api-products-quoted.test.ts` filter-aware (4 ek + mock güncelleme).
- 152 dosya · 2369 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 4. tur — promisable filter+hesaplar, UI full scan, set imzası (2026-05-09; 2344 test)

**G11 audit 4. tur (1 commit, ~9 dosya):**
- **Fix 1 (HIGH) — Promisable filter**: route filtresi ilk dalında `available_now <= min_stock_level` kontrol ediyordu. Senaryo: available=50, quoted=40, min=20, daily_usage=null → promisable=10 ≤ min=20 ama eski filter pas geçiyor + deadline path daily_usage=null nedeniyle pasif → öneri kaybı. Fix: filter `promisable <= min` üzerinden bakar (`purchase-service.ts:81` paterniyle aynı).
- **Fix 2 (HIGH) — Promisable tüm hesaplara**: `suggestQty`, `coverageDays`, `available` (response'a), `urgencyPct`, `urgencyLevel` hâlâ `p.available_now` üzerindendi → quote'lu siparişlerde miktar yanlıştı (örn. 100 stok / 80 quoted / 110 target → eski 10 açık göziyor, gerçek 90). Fix: tüm hesaplar promisable; `item.available` artık promisable (UI'da "Stok" sütunu satılabilir miktarı gösterir).
- **Fix 3 (MEDIUM) — UI full active list**: `/api/products` default page=1+pageSize=100; DataContext sadece ilk 100 ürünü çekiyordu. Cron full scan, UI 100 sınırlı → 100+ ürünlü setlerde sayfa eksik gösteriyordu. `/api/products?all=1` opt-in eklendi (`dbListAllActiveProducts`, ayrı cache key); DataContext bu flag'i kullanıyor.
- **Fix 4 (MEDIUM/LOW) — Auto-reload set imzası**: `useEffect` dependency `reorderSuggestions.length` idi; aynı sayıda farklı ürün seti veya stok/quote değişimi auto-fetch tetiklemiyordu. Yeni: `reorderSignature = sort(map(p => id:available:min:daily:reserved)).join("|")` — değişen her şey effect'i tetikler.
- 149 dosya · 2344 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 3. tur — promisable, full-scan, AI hadError, stale TTL scope, levelChanged in-place (2026-05-09; 2325 test)

**G11 audit 3. tur (1 commit, ~13 dosya):**
- **Fix 1 (HIGH) — Promisable hesabı**: route ham `dbListProducts` çağırıp `p.promisable ?? p.available_now` fallback kullanıyordu; helper promisable üretmiyor → quote'lu siparişler hiç dikkate alınmıyordu. Yeni: `dbListAllActiveProducts` + `dbGetQuotedQuantities` paralel; `promisable = available_now - quoted` UI ile aynı semantikte.
- **Fix 2 (HIGH) — pageSize:500 → full scan**: 501. ürün hem öneri için skip hem cleanup'ta orphan sayılıp yanlış expire ediliyordu. `dbListProducts({pageSize:500})` → `dbListAllActiveProducts()` (pagination yok).
- **Fix 3 (MEDIUM) — AI hadError flag**: `aiEnrichPurchaseSuggestions` graceful catch içinde `enrichments:[]` dönüyordu ama route'un try/catch'i tetiklenmiyordu → production'da AI patlasa bile UI banner gösterilmiyordu. Servis result'ına `hadError: boolean` field'ı; route bunu okuyup `aiCallFailed` set eder.
- **Fix 4 (MEDIUM) — Stale TTL scope**: `dbExpireStaleRecommendations(48)` recommendation_type filtrelemiyor → purchase cron'u diğer rec türlerinin (varsa) suggested'larını da expire ediyordu. Helper'a opsiyonel 2. param eklendi; copilot route `"purchase_suggestion"` geçer.
- **Fix 5 (MEDIUM) — levelChanged in-place update**: expire+upsert dansı sessiz fail'de `dbUpsertRecommendation` mevcut suggested rec'i aynen döndürüyordu → yeni AI içeriği DB'ye yazılmıyor, her cron'da boşa AI çağrısı. Yeni `dbUpdateSuggestedRecommendation(id, {body, confidence, severity, model_version, metadata})` helper — tek atomik UPDATE'le rec içeriği yenilenir, ID stable kalır. `dbExpireEntityRecommendations` levelChanged flow'undan kaldırıldı (silme akışlarında hâlâ kullanılır + artık throw eder).
- **Yeni 2 test dosyası (9 yeni test):** `purchase-copilot-promisable.test.ts` (5), `purchase-copilot-ai-error-flag.test.ts` (4). `recommendations.test.ts`'e `dbExpireStaleRecommendations` recType + `dbUpdateSuggestedRecommendation` testleri (4). Mevcut diff-merge testleri yeni in-place update flow'una göre güncellendi.
- 147 dosya · 2325 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 2. tur — CSRF, expire scope defansif, empty list, lead-time, moq=0 (2026-05-09; 2312 test)

**G11 audit 2. tur (1 commit, ~10 dosya):**
- **Fix 1 (HIGH) — GET CSRF guard**: handler GET ile çağrıldığında session-cookie kabul ediyordu → `<img src>` ile yan etki tetiklenebilirdi. Yeni: GET sadece CRON_SECRET; POST hibrit (session VEYA Bearer). `checkAuth(request, method)` imzası, `GET/POST` ayrı arrow wrapper'larla export.
- **Fix 2 (MEDIUM defansif) — Helper status filter**: `dbExpireEntityRecommendations(id, type, recType?)` artık `recType` belirtildiyse SADECE `'suggested'` expire eder. Decided rec invariant kırılırsa bile dokunulmaz. Silme akışında (param geçmez) tüm aktif statüler korunur (regresyon yok).
- **Fix 3 (MEDIUM) — Boş ürün listesi**: tüm ürünler stok üstüne çıkıp `needsPurchase=[]` olduğunda eski `suggested` rec'ler 48h TTL'e kadar takılı kalıyordu. Yeni `dbExpireAllSuggestedRecommendations` helper + route koşullu fallback.
- **Fix 4 (MEDIUM) — Lead-time aware urgency**: `computeUrgencyLevel(cov, lead?)` artık `cov < lead` durumunda critical (Sprint A `computeStockRiskLevel` ile aynı semantik). Senaryo: cov=20, lead=45 → eskiden moderate, şimdi critical. `readUrgencyLevelFromMeta` backward-compat (eski rec'lerde `leadTimeDays` opsiyonel). Rec metadata'sına `leadTimeDays` field'ı yazılır.
- **Fix 5 (MEDIUM) — moq=0 NaN/Infinity guard**: route `moq = Math.max(1, p.reorder_qty ?? p.min_stock_level)` (frontend `page.tsx:226` paterniyle aynı). `reorder_qty=NULL && min=0` durumunda `Math.ceil(needed/0)=Infinity` riski kapatıldı.
- **Yeni 3 test dosyası (15 yeni test):** `purchase-copilot-empty-products.test.ts` (4), `purchase-copilot-moq-guard.test.ts` (6), `purchase-copilot-decided-defense.test.ts` (3). `compute-urgency-level.test.ts` lead-time kapsamıyla genişletildi (10 yeni). `purchase-copilot-auth.test.ts` Fix 1 testleri (CSRF guard).
- 145 dosya · 2312 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 1. tur — Vercel CRON GET, expire scope, source-of-truth (2026-05-09; 2286 test)

**Önceki²:** G11 — AI öneri tutarlılığı (diff-merge + 6h CRON + manuel yenile) (2026-05-09)

**G11 (1 commit, ~10 dosya):**
- **Hibrit diff-merge** (`/api/ai/purchase-copilot/route.ts`): aktif `suggested` rec'in `urgencyLevel`'ı state'le aynıysa metadata in-place refresh; değiştiyse eski rec expire + AI yeniden çağrılır. Sayısal alanlar her CRON'da güncellenir; AI metni sadece level değiştiğinde yenilenir.
- **Drift detection (decided rec'ler):** accepted/edited/rejected rec'lerin metadata'sı dondurulur ama `currentDrift` field'ı response'a eklenir.
- **6 saatlik CRON:** `vercel.json` yeni dosya — schedule `"0 */6 * * *"`.
- **Hibrit auth:** `/api/ai/purchase-copilot` artık ALWAYS_PUBLIC; route içinde CRON_SECRET Bearer veya authenticated session kontrolü.
- **Frontend (`/dashboard/purchase/suggested`):** "↻ Yenile" butonuna demo guard + son güncelleme saati + toast. Decided rec'lerde drift varsa `<StaleDriftBadge>` rozeti.
- **4 yeni test dosyası (38 yeni test):** compute-urgency-level, purchase-copilot-auth, purchase-copilot-diff-merge, purchase-suggested-stale-badge.

**Önceki:** SMTP / e-posta gönderim altyapısı (Resend) — 5 bildirim türü tamamı (2026-05-06)

**SMTP entegrasyonu (1 commit):**
- Yeni: `resend` npm package; `.env.example`'a `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`.
- Migration 047: `email_logs` tablosu (audit + retry tracking) + 2 index (status/attempt + dedup) + RLS service_role.
- Yeni helper'lar: `email-logs.ts` (DB CRUD + dedup check + retry list), `users-with-prefs.ts` (auth.users + preferences join), `email/templates.ts` (5 türde HTML+text render), `email-service.ts` (notifyUsersByEmail + retryFailedEmails).
- Yeni endpoint: `/api/email/retry-failed` (CRON, middleware CRON_PATHS'e eklendi).
- 5 trigger noktası fire-and-forget entegrasyon: `alert-service.ts` (stock_critical), `order-service.ts` (order_pending), `orders/route.ts` (order_new), `orders/[id]/route.ts` (order_shipped — updated state ile), `parasut-service.ts` (sync_error).
- Dedup penceresi: 6 saat (entity+type+user); retry: max 3 deneme, son 24 saat.
- Fail-safe: `RESEND_API_KEY` veya `EMAIL_FROM` yoksa fonksiyon erkenden return (config eksikliği request'i bozmaz).
- 3 yeni test dosyası (27 test): email-logs (10), email-service (14), email-retry-failed (3). order-ship-parasut.test.ts'e email-service mock eklendi.
- 138 dosya · 2242 test yeşil · TS clean · 0 lint hatası

**Önceki:** Settings audit 2. tur — demo cookie temizleme + SVG sınırla + server validation (2026-05-05)

**Settings audit 2. tur (1 commit, 9 dosya):**
- **HIGH/Orta — Demo cookie geçişte temizlenmiyordu**: `clearDemoMode()` ne login submit'inde ne dashboard banner link'inde çağrılıyordu. Auth'lu kullanıcı dashboard'a girse bile `isDemoMode()` true kalıyor → settings demo gibi davranıyor. Fix: login `handleSubmit` başarılı dönünce `clearDemoMode()`; dashboard banner link'i `onClick` ile cookie temizler + router.push.
- **Orta — Avatar SVG kabul ediyordu**: Public bucket'tan kullanıcı kontrollü XML servis edildiğinde XSS riski. Fix: `ALLOWED_MIME` listesinden `image/svg+xml` çıkarıldı (avatar/route.ts), migration 045 + yeni migration 046 (idempotent update), UI accept attribute + format yazısı güncellendi. Şirket logosu (company-assets) farklı: admin yüklüyor, scope farklı, SVG kalır.
- **Düşük/Orta — Firma PATCH API tarafında validation yoktu**: UI inline validation vardı ama auth'lu biri doğrudan PATCH /api/settings/company çağırıp geçersiz email/VKN/URL yazabilirdi. Fix: `validateCompanyPatch` helper — required name, email regex, VKN 10/11 hane, URL formatı, currency whitelist (USD/EUR/TRY).
- **Düşük — Preferences PATCH boolean coercion**: `!!value` string `"false"`'u true'ya çeviriyordu. Fix: `typeof === "boolean"` strict kontrol — non-boolean değerlere 400 dön.
- 2 yeni test dosyası: `settings-company-route.test.ts` (10 test), `settings-user-preferences.test.ts` güncellendi (boolean strict + malformed type sanitization)
- 135 dosya · 2215 test yeşil · TS clean · 0 lint hatası

**Önceki:** Settings güvenlik + semantik audit fix'leri (2026-05-05)

**Settings audit fix'leri (1 commit, 6 dosya):**
- **HIGH — Avatar orphan file**: metadata güncellemesi başarısız olursa storage'daki dosya temizlenir (try/catch ile sb.storage.remove). Yoksa bucket'ta orphan kalırdı.
- **HIGH — patchUserMetadata race**: GET-merge-SET window dokümante edildi (Supabase admin updateUserById user_metadata'yı REPLACE ediyor — merge gerekli; race UI tarafından korunur).
- **MEDIUM — KullaniciTab concurrent mutation**: 3 handler (profile save / avatar upload / password change) global `isMutating` flag ile gate'li. Lost-update koruması.
- **MEDIUM — Type duplication**: UserProfile + NotificationPref `settings/page.tsx`'e import edildi (önce duplicate define).
- **MEDIUM — defaultPrefs() çift çağrı**: useState + useRef arasında shared ref ile tek instance.
- **LOW — Avatar tests**: 8 yeni test (MIME, size, path traversal, orphan cleanup, upload error).
- **Kod yorumları**: Password endpoint'a Supabase GoTrue rate-limit notu, avatar route ext sanitization açıklaması, user-profile.ts patchUserMetadata race window açıklaması.
- 134 dosya · 2202 test yeşil · TS clean · 0 lint hatası

**Önceki:** Ayarlar production-ready — Kullanıcı/Bildirimler API + validation + DemoBanner koşullu (2026-05-05)

**Ayarlar production-ready (1 commit, 12 dosya):**
- Migration 045: `user_notification_preferences` tablosu (user_id, notification_type, email_enabled, browser_enabled, unique constraint) + `user-avatars` storage bucket (1MB, public).
- Yeni 4 endpoint: `/api/settings/user/{profile,password,avatar,preferences}` — session auth, validation, audit_log entegrasyonu.
- `notification-types.ts` — 5 tip sabit liste (stock_critical, order_pending, order_new, sync_error, order_shipped).
- `validation.ts` — `isValidEmail`, `isValidTaxNumber` (10/11 hane), `isValidUrl`.
- `user-profile.ts` — Supabase `auth.users.user_metadata`'da full_name + avatar_url (yeni custom tablo gereksiz).
- `user-preferences.ts` — DB satırı yoksa default true/true virtual liste; PATCH'te whitelist + upsert.
- Şifre değişikliği: cookie'siz fresh anon client ile mevcut şifre doğrulaması (Supabase updateUser eski şifre sormuyor; çalınmış oturum riskine karşı koruma).
- Avatar upload: `/api/settings/company/logo` pattern paralel, path `${user.id}.{ext}`.
- KullanıcıTab + BildirimlerTab gerçek API'ye bağlandı (öncesi: `setTimeout` mock).
- FirmaTab inline validation: required name, email regex, VKN 10/11 hane, URL formatı; hatalı alanlarda border kırmızı + FieldError mesajı.
- DemoBanner artık `useIsDemo` ile koşullu — production'da görünmüyor (mevcut UX bug).
- 4 yeni test dosyası (36 test): profile, password, preferences, firma validation. 133 dosya · 2194 test yeşil · TS clean · 0 lint hatası.

**Önceki:** Production bulgular 1. tur — AI filtre + import UI + multi-currency netleştirme (2026-05-05)

**Production bulgular 1. tur (1 commit):**
- AI route filter aligned with frontend `shouldSuggestReorder`: `available <= min` veya `orderDeadline ≤ 7 gün` — AA-SOV gibi deadline-imminent ürünler artık öneri listesinde "Beklemede" değil aktif öneriyle gözüküyor (purchase-copilot/route.ts).
- `sourceChipLabel`: "?" yerine "fallback" → "Otomatik", bilinmeyen → "—" (import sayfası kolon eşleştirme rozetleri).
- `apply-mappings` route catch block: generic "başarısız" yerine actual error message dön ("Eşleştirme uygulanamadı: {detail}").
- Multi-currency tutarın "+" ön eki kaldırıldı; her tutar yanına currency code eklendi (€518.400,00 EUR / $133.600,00 USD). Başlık "Toplam Sipariş Tutarı" → "Önerilen Satın Alma Tutarı" + tooltip.
- Test güncellendi (1 ai-purchase-copilot test, 1 source-chips test). 129 dosya · 2158 test yeşil · TS clean · 0 lint hatası.

**Önceki:** Seed idempotent + UI tetikleyici — settings'te tek tıkla reset (2026-05-05)

**Seed idempotent + UI (1 commit):**
- `clearAllData` helper extract → DELETE handler ve POST handler ikisi de kullanıyor (DRY).
- POST artık idempotent: önce temizle, sonra yükle. Response: `{ ok, cleared: {...}, seeded: {...} }`. Tek çağrı = tam reset + seed.
- `checkAuth` genişletildi: `CRON_SECRET` **VEYA** authenticated session (`@/lib/supabase/server`). UI'dan Authorization header'sız çağrılabilir.
- Yeni `src/components/settings/ResetDemoSection.tsx` — kırmızı "Tehlikeli Bölge" kartı, confirm modal, busy state, toast, 2 sn sonra reload. Demo modda disabled.
- `/dashboard/settings` en altına mount edildi.
- 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

**Önceki tamamlanan iş:** Demo seed yenileme — sade öz boyut + tüm modüller dolu (2026-05-04)

**Demo seed rewrite (1 commit):**
- Mevcut seed (1613 satır, 39 ürün, 15 sipariş) müşteri turuna kalabalıktı; LOAD- prefix kalıntıları temizlenmiyordu; quotes/ai_recommendations/import_*/company_settings/parasut_oauth_tokens boş kalıyordu.
- Yeni seed: 8 ürün · 4 müşteri · 7 sipariş · 3 teklif · 5 AI öneri · 2 import batch · 3 üretim · 1 şirket ayarı + parasut stub. Her sayfada anlamlı veri, çift eksen sipariş matrisi tam (draft/pending/approved×{unallocated,partially_allocated,allocated,partially_shipped,shipped}/cancelled).
- DELETE: LOAD- temizliği (sales_orders.notes/customers.name/products.sku LIKE) + 25 demo tablosu + company_settings reset (silmez, sıfırlar) + order_counters reset.
- POST: company_settings UPDATE → parasut_oauth_tokens UPSERT → products → customers → quotes (TKL-2026-001/002/003: sent/expired/accepted) → orders (ORD-2026-0001..0007, TKL-003 → ORD-0003 quote_id) → reservations + shortages → BOM (KV-3P-DN50 ← CT-SS + BE-SC) → commitments → production → movements → shipments + invoices + payments → ai_recommendations + ai_feedback → import_batches + drafts → column_mappings + ai_entity_aliases → sync_logs + audit_log.
- Stok senaryoları: KV-DB-DN100 critical, KV-3P-DN80 warning, KB-WT-DN150 past deadline, AA-SOV-DN80 imminent 3 gün (Almanya 45 gün lead), CV-KV-DN65 imminent 1 gün, CT-SS-DN50 fiyat eksik (price=NULL).
- Müşteriler: Tüpraş (TRY), Abdi İbrahim (EUR), Enerjisa (USD), Ülker (VKN-eksik — Paraşüt preflight test).
- 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

**Önceki:** Sprint C bulgular 4. tur — G3 gerçek veri + G5 mobil + test tamamlama (2026-05-02)

**Sprint C bulgular 4. tur (1 commit `3e01cd0`):**
- G3 (HIGH): "Açık Sipariş" hardcoded 0 → gerçek sipariş sayısı (mount fetch + alerts pattern paralel; vurgu rengi). Backend helper + endpoint zaten hazırdı, sadece UI bağlantısı eksikti.
- G5 (MEDIUM): Mobil kart inline IIFE → `RecActionCell`; pending'de inline aksiyon, decided'da "Kararı geri al"; RejectMode input `maxLength={200}`
- G4: 2 yeni test — `refetch-after-mutation`, `demo-mode`. 2 helper extract: `scheduleRefetchAfterMutation` (4 handler debounce DRY), `shouldSkipAiFetch` (demo guard)
- `acik-column` testine `openOrderCount` regression notu + assertion
- "Undo başarı toast'ı yok" iddiası geçersiz — 3. turda eklenmişti (page.tsx:663)
- 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

**Önceki²:** Sprint C bulgular 3. tur — G1/G3/G5 fix + 3 adlandırılmış test (2026-05-02)

**Sprint C bulgular 3. tur (1 commit `52a082d`):**
- G1 (HIGH): `dbGetAllActiveProductIds` yeni helper — pageSize:500 truncation'ından bağımsız tam aktif ID seti ile orphan expire
- G3 (HIGH): "Stok Açığı" → "Açık Sipariş" (masaüstü + mobil; tooltip güncellendi; unused deficit hesabı kaldırıldı)
- G5 (MEDIUM): Masaüstü KARAR hücresi → inline `RecActionCell` (Kabul Et/Düzenle/Reddet); handleUndo başarı → "Karar geri alındı." toast
- 3 yeni test: multi-currency (8), on-product-delete (5), acik-column (5)
- 127 dosya · 2145 test yeşil · TS clean · 0 lint hatası

**Önceki²:** Sprint C bulgular 2. tur — 4 fix + 5 adlandırılmış test (2026-05-02)

**Sprint C bulgular 2. tur (1 commit):**
- Fix 1 (HIGH): NULL fiyat sıfıra düşüyor → `??` → `||` (page.tsx) — missingPriceCount artık doğru
- Fix 2 backend (HIGH): "Kararı geri al" akışı → VALID_TRANSITIONS'a reverse geçişler + ALLOWED_STATUSES'a "suggested"
- Fix 2 frontend (HIGH): handleUndo + optimistic rollback + "Kararı geri al" butonu (table + drawer)
- Fix 3 (MEDIUM): Ürün silinince/deaktif edilince rec'ler anında expire — dbExpireEntityRecommendations yeni helper
- Fix 4: 5 adlandırılmış test — action-feedback, cost-fallback, ai-banner, product-cleanup, empty
- 124 dosya · 2128 test yeşil · TS clean · 0 lint hatası

**Önceki:** Sprint B bulgular 2. tur — import sayfası 5 fix + 6 adlandırılmış test (2026-05-01)

**Sprint B bulgular 2. tur (1 commit):**
- Fix 1 (HIGH): Confirm API hatası UI'da yutulmuyordu → !confirmRes.ok dalı + hata parse + toast
- Fix 2 (MEDIUM): Kolon chip'leri AI confidence %'sini gösteriyor (sourceChipLabel helper export)
- Fix 3 (MEDIUM): order_line insert/update hataları kontrol ediliyor — lineInsertErr → rejected
- Fix 4 (LOW): Dosya boyutu aşımında inline hata + toast birlikte
- Fix 5 (LOW): validateFileSize() helper export (test edilebilirlik)
- 6 adlandırılmış test dosyası: file-size-limit, source-chips, inline-edit-rollback, confirm-race, order-line-sort-order, result-by-entity
- 119 dosya · 2092 test yeşil · TS clean · 0 lint hatası

**Önceki:** Sprint C — Satın Alma Önerileri stabilizasyonu (2026-05-01)

**Sprint C özet (3 commit):**
- Part 1: AI fail banner (büyük sarı, "Yeniden dene") + costPrice/price NULL → toplama dahil değil + "X üründe fiyat eksik" sayacı + karar sonrası loadAiData(300ms) + isDemo guard ile AI POST kapatma + mavi info banner. Backend route'a `ai_call_failed` flag eklendi.
- Part 2: `dbExpireRecommendationsForMissingEntities` yeni helper — silinmiş/deaktif ürünlerin TÜM aktif rec'lerini (suggested+accepted+edited+rejected) expire eder. Route scan başında entegre — alerts orphan cleanup ile paralel pattern.
- Part 3: "Açık" → "Stok Açığı" (header netleştirme + tooltip + 0 göster) + multi-currency TOPLAM SİPARİŞ TUTARI (currency'ye göre Map; tek currency mevcut görünüm, karışıksa "+ $X" alt satırlar).
- Atlandı: G5 (KARAR cell-içi buton seti) — mevcut "Karar ver →" drawer pattern korundu (plan'ın "mevcut tasarım korunur" hükmü).
- 106 dosya · 2003 test yeşil · TS clean.

**Önceki:** Sprint B — AI İçeri Aktar stabilizasyonu (2026-05-01)

**Sprint B özet (4 commit):**
- Part 1: file size limit (max 25 MB) + inline edit rollback (silent fail kaldırıldı)
- Part 2: Sonuç ekranında entity-bazlı kırılım tablosu (G6) — Türkçe etiket ile
- Part 3: order_line sort_order collision fix (per-order cache)
- Part 4: serviceConfirmBatch race condition (atomik CAS + 'confirming' status + rollback)
- Migration `043_import_batches_confirming_status.sql`
- 106 dosya · 1993 test yeşil · TS clean

**Önceki:** Sprint A — Üretim & Stok Uyarıları stabilizasyonu (2026-04-29)

**Sprint A özet (4 commit):**
- Part 1: Türkçe etiketler (quote_expired/overdue_shipment/order_deadline/sync_issue) + 24h dismiss açıklaması toast + dead code temizliği (import_review_required AlertType union'undan çıkarıldı)
- Part 2: Silinmiş ürün uyarılarının auto-cleanup'ı (G1) — scan başında orphan resolution (4 tip için, reason='product_deleted_or_deactivated')
- Part 3: AI servisi kullanılamıyor banner'ı (G3) — kırmızı toast yerine sayfa üstünde sarı banner + "Yeniden dene"
- Part 4a/4b/4c: AI önerilerinde "neden öneriliyor" şeffaflığı (G7), quote_expired drawer'ında inline "Süreyi Uzat" formu (G6), 24h dismiss dedup + severity escalation bypass (G8)
- Migration `042_alerts_dismissed_severity.sql` (dismissed_severity kolonu)
- 106 dosya · 1987 test yeşil · TS clean

**Önceki:** Paraşüt Faz 11 bulgular 3. tur (2026-04-29)

**Bulgular 3. tur fix:**
- **HIGH→MEDIUM (retry regression):** `serviceRetryParasutStep`'e `parasut_step='done'` guard eklendi — RPC'den bağımsız servis katmanı koruması. UI'da `canRetry` done (yeşil) ve edoc skipped badge'lerde `false`; yanıltıcı "başka işlem tutuyor" toastı ortadan kalktı.
- **MEDIUM (OAuth false-success):** `POST /api/parasut/oauth/refresh` içindeki `expires_at` update hatası artık `throw` ediyor → `success:true` false-success imkansız.
- **MEDIUM (intermediate step regression):** `serviceRetryParasutStep`'e `STEP_ORDER` map guard eklendi — `parasut_step='invoice'` iken `step='contact'` gibi geri adım istekleri servis katmanında bloklanıyor (RPC çağrılmadan).
- +5 test: 3 `parasut-retry-step-faz11.test.ts` + yeni `parasut-oauth-refresh.test.ts` (2 test).
- **104 dosya · 1975 test yeşil · TS clean.**

**Sıradaki:**
- Faz 12 — Sandbox GATE: gerçek Paraşüt API ile OAuth, list filtreleri, e-doc trackable_job, stok invariant doğrulamaları (PARASUT_PLAN.md §Faz 12)
- SMTP altyapısı production deploy: Migration 047 + Resend hesabı/domain + Vercel env + cron config (kod hazır 2026-05-06'da yapıldı; deploy eksik)

**Kalan / ertelendi:**
- M-3: Rate limiting (Upstash Redis — altyapı kararı bekliyor)
- `purchase_commitments` + `column_mappings` RLS — 029'da ENABLE ROW LEVEL SECURITY eklendi ✅ (explicit policy yok; proje genelinde aynı pattern — tüm erişim service_role'den)
- Sesli giriş V3: fireNotes → scrap_qty UI, Ctrl+M klavye kısayolu

**Test sayısı:** 106 dosya · 2003 vitest (hepsi yeşil)

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

fulfillment_status (sadece APPROVED siparişlerde aktif):
  UNALLOCATED → PARTIALLY_ALLOCATED → ALLOCATED → PARTIALLY_SHIPPED → SHIPPED

Kural: Rezervasyon sadece commercial_status = APPROVED olunca tetiklenir.
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
// reserved: onaylı siparişler için ayrılmış
// available_now: satılabilir gerçek miktar (computed column)
```

---

## Stok Modeli (Detay)

```
on_hand        — fiziksel stok
reserved       — onaylı siparişler için ayrılmış
available_now  = on_hand - reserved              (computed column)
quoted         = draft + pending_approval siparişlerdeki toplam miktar
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
