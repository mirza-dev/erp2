---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

## Son Tamamlanan İş — 2026-05-19

**Faz 2e İPTAL — Parti tablosu ve UI tamamen silindi (3098 test)**

- **Karar:** PMT ölçeğinde parti (heat lot / FIFO izlenebilirlik) iş gereksinimi yok. Sertifika dosyaları `product_attachments` (kind=certificate) ile zaten ürüne bağlanıyor; ayrı `product_batches` tablosu bakım yükü oluşturuyordu.
- **Silinenler:**
  - Migration 060: `DROP TABLE product_batches CASCADE` + index/trigger/policy/function temizliği
  - `src/lib/supabase/product-batches.ts` helper
  - `/api/products/[id]/batches/route.ts` + `/[batchId]/route.ts`
  - `database.types.ts` `ProductBatchRow` interface
  - Detay sayfası: TabKey'den `partiler` çıkarıldı, tab tanımı + placeholder render silindi (7 sekme → 6 sekme)
  - 2 test dosyası (`product-batches-helper.test.ts`, `product-batches-route.test.ts`)
- **Güncellenenler:** `product-detail-page.test.ts` — "6 tab key" + "no tabs are locked" assertion'ları
- **Geri alma:** 059 migration + helper Faz 2a commit `b7c0227` git history'de — ileride istenirse oradan restore.
- 8 dosya silindi/değişti · **3098 test yeşil** (-21 batch test) · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2d Review P3-007 (3119 test, commit `05cc81e`)

**Faz 2d Review P3-007 — Demo guard davranış testleri (3119 test)**

- **P3-007 KAPANDI** (middleware guard'ın gerçek koşumu): Mevcut source-regex testlerinin yanına 10 davranış testi eklendi — `@supabase/ssr` mock'lu, gerçek `middleware()` + `NextRequest` ile env true/false × demo cookie × auth user kombinasyonları:
  - env=true + demo + GET attachments list → **401**
  - env=true + demo + GET `/url` endpoint → **401**
  - env=true + demo + GET `/attachments/{id}` PATCH path → **401** (regex subtree)
  - env=true + demo + GET `/api/products` (unrelated) → **200** (scope sızıntısı yok)
  - env=true + demo + GET `/api/orders` → **200** (sadece attachments)
  - env=true + authenticated + GET attachments → **200** (auth wins, demo branch skip)
  - env=true + authenticated + demo cookie + GET attachments → **200** (auth branch'ine düşmeden 401 dönmüyor)
  - env UNSET + demo + GET attachments → **200** (default off)
  - env="false" + demo + GET attachments → **200** (literal "true" karşılaştırması)
  - env="1" + demo + GET attachments → **200** (sadece "true" literal'i tetikler)
- 1 dosya · **3119 test yeşil** (+10 davranış) · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2d Review 2. tur (3109 test, commit `6272759`)

**Faz 2d Review 2. tur — 3 residual kapatıldı (3109 test)**

- **P3-006 KAPANDI** (PDF/belge linki refresh): `<a href={doc.signedUrl}>` → `<button onClick={handleDownloadDocument(id)}>`. Handler `/url` endpoint'ten fresh URL alır + `openSignedUrlInNewTab` (window.open `noopener,noreferrer`) ile yeni sekmede açar; başarıdan sonra liste state'i de güncellenir (sonraki tıklama için cache). 1h TTL aşılsa da çalışır.
- **P3-005 KAPANDI** (ENV opt-in demo guard): `ATTACHMENTS_BLOCK_DEMO_ANON=true` env flag — middleware'de demo cookie + `/api/products/[id]/attachments**` path'i = 401. Default false (geriye uyumlu, demo turunu kırmaz). `.env.example` + `/url` route SECURITY NOTE güncellendi.
- **P3-004 KAPANDI** (handler logic davranış testleri): 3 yeni pure helper export — `buildUploadFormData(file, kind)`, `parseAttachmentApiError(res, fallback)`, `openSignedUrlInNewTab(url, windowOpen)`. handleUpload/handleSetPrimary/handleDelete bu helper'ları çağırıyor; testler gerçek davranışı doğruluyor (FormData içeriği, JSON error parse 5 vaka, window.open args 4 vaka). Page-ekler regression lock'ları helper kullanımına yöneldi.
- **+25 test** (helper davranış 13 + page-ekler P3 lock 6 + demo guard 6)
- 7 dosya · **3109 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2d Review 1. tur (3084 test, commit `2b4dd0a`)

**Faz 2d Review — 5 P3 bulgu kapatıldı (3084 test)**

- **P3-001 KAPANDI** (signed URL refresh): `refreshSignedUrl(attId)` useCallback `/url` endpoint'i çağırır; header img + grid img + lightbox img `onError={() => refreshSignedUrl(...)}` ile fresh URL alır. State'te attachment + aktif lightbox güncellenir. 1h TTL aşıldıktan sonra UI kendi kendini iyileştirir.
- **P3-002 KAPANDI** (sessiz fetch hatası): `attachmentsError` state + role="alert" banner + "Yeniden dene" button. fetchAttachments `!res.ok` ve catch dallarında hata set ediliyor; başarıda null'a sıfırlanır. Empty state koşulu `&& !attachmentsError` ile genişletildi — "Henüz ek dosya yok" yanılsaması yok.
- **P3-003 KAPANDI** (fail-open invalid kind): `?kind=bad` artık 400 döner; helper çağrılmadan reddedilir (fail-closed). `kindParam !== null` ise whitelist kontrolü zorunlu.
- **P3-004 KAPANDI** (source-regex ağırlıklı testler): 2 yeni pure helper export — `parseAttachmentsResponse` (defensive shape) + `findPrimaryImageWithUrl` (header logic + non-image defense). +10 helper davranış testi + 3 url-route invalid-kind testi + 16 page-ekler P3 regression lock.
- **P3-005 KAPANDI** (demo + signed URL politika kararı): `/url` route'a SECURITY NOTE yorumu — demo bucket SADECE seed/fake data ise risk yok; prod ile paylaşılırsa `requireAuthenticatedUser` guard eklenmeli.
- 6 dosya · **3084 test yeşil** (+25 P3 review) · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2d (3059 test, commit `99f3027`)

**Faz 2d — Ekler sekmesi UI + signed URL endpoint (3059 test)**

- **Backend (3 dosya):** `dbGetSignedUrl` + `dbGetSignedUrlsForRows` (bulk `createSignedUrls`, N+1 önler) + yeni `mapProductAttachment` (file_path expose etmez, signedUrl opsiyonel 2. arg) + yeni `ProductAttachment`/`ProductAttachmentKind` interface (`mock-data.ts`).
- **GET /attachments shape değişimi:** raw array → `{ items, expires_in: 3600 }` (her item enriched signedUrl ile, bulk fetch). `export const dynamic = "force-dynamic"` defansif.
- **Yeni endpoint:** `GET /api/products/[id]/attachments/[attachmentId]/url` → tekil signed URL (header img refresh için). 400/404 (ek yok / cross-product / file_path boş) / 500 (createSignedUrl null).
- **Detay sayfası UI (`[id]/page.tsx`):** 5 pure helper export (formatFileSize/getKindLabel/getKindIcon/pickInitialKind/groupAttachments) + 6 state + fetchAttachments useEffect + header 80×80 görsel (primary image varsa img, yoksa "Görsel yok" placeholder) + Ekler tab içeriği (upload bar kind+file+button / images grid 140×140 thumbnails star+× / documents list İndir+Sil) + lightbox modal (role="dialog" aria-modal aria-label, ESC + backdrop + scroll lock + focus return) + 3 handler (upload/setPrimary/deleteAttachment, hepsi demo guard'lı). Tab `locked: false` (artık tıklanabilir). `ATTACHMENT_ACCEPT` client-safe constant (server-only `ALLOWED_MIME` import edilmedi).
- **MIME→kind otomatik öneri:** file seçilince `pickInitialKind(f.type)` ile kind state'i override edilir; kullanıcı dropdown'dan değiştirebilir.
- **Lightbox PDF için kullanılmaz:** PDF "İndir" link'i `target=_blank rel=noopener` ile yeni sekmede açılır.
- **Versiyonlama Faz 3'e ertelendi:** helper `is("superseded_by", null)` zaten filtreliyor; 2d UI yalnız aktif version'ı görür.
- **+44 test (5 dosya):** mapper (5) + helpers (18) + url-route (7) + list-signed-url (3) + page-ekler (14)
- **Eski test güncellemesi:** `product-detail-page.test.ts` "Faz 2d placeholder" assert'i kaldırıldı (Ekler artık aktif).
- 8 dosya · **3059 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2c Review P3 (3015 test)

**Faz 2c Review — Tüm P3 bulgular kapatıldı**

- **MR-F2C-P3-003 ✅ KAPANDI:** `getMissingRequiredAttributes(fields, attributes)` pure helper eklendi (her iki page dosyasında export). `handleCreate` (create drawer) + `handleSave` (detay edit) her ikisi de kaydetmeden önce zorunlu alanları kontrol ediyor; eksikse `"Zorunlu alanlar eksik: X, Y"` toast'ı.
- **MR-F2C-P3-004 ✅ KAPANDI:** Testler source-regex'ten gerçek mantık testlerine geçirildi. `getMissingRequiredAttributes` için 9+6 pure helper test (8 senaryo: undefined/null/empty string/empty array/multiselect/multi-missing). Source-regex lock'ları korundu.
- **MR-F2C-P3-005 ✅ KAPANDI:** `createTypeFieldsError` state eklendi. `handleCreateTypeChange`'de `!res.ok` ve `catch` dalları `"Alan şablonu yüklenemedi…"` set ediyor; yeni tip seçilince `null` ile temizleniyor. JSX'te `role="alert"` banner render'ı.
- **+25 test** (product-create-type-selector.test.ts: +15 yeni, product-detail-page-faz2c.test.ts: +10 yeni)
- **3015 test yeşil · TS clean · 0 lint warning · Faz 2c tamamen kapalı**

---

## Önceki — Faz 2c — Teknik sekmesi dinamik alan rendering + tip seçici (2974 test) · commit `6846584`

- Genel sekmesinde "Tip Şablonu" selector (`/api/product-types` listesinden, edit mode)
- Teknik sekmesi aktif: seçili tipin `product_type_fields` alanları `withFields=1` ile fetch, alan tipine göre render
- `DynamicFieldEdit` component'i: 7 field_type variant (text/number/select/multiselect/boolean/date/longtext) + unit suffix/pill toggle/checkbox/textarea
- `handleSave` body'sine `product_type_id` + `attributes` JSONB eklendi
- Tip değişiminde `computeLostAttributeKeys` ile yeni tipte olmayan attribute key'leri tespit edilir → uyarı modalı; onaylanınca filtre uygulanır
- +20 test · 2974 test yeşil

---

## Önceki — Toplu Seçme ve Silme — Tüm 6 Liste Sayfası (2954 test) · commit `c043636`

- Yeni `src/hooks/useSelection.ts`: resetKey render-phase sıfırlama, 4 pure helper export, UseSelectionResult interface
- 6 sayfa: products / orders / customers / vendors / quotes / purchase/orders
- Her tabloya checkbox kolonu (select-all + indeterminate + per-row)
- Bulk action bar: seçilen count + işlem butonu + Seçimi Temizle
- Inline confirm modal: her sayfada bağımsız `bulkDeleteConfirm` state
- Products/Orders/Customers/Quotes → DELETE endpoint
- Vendors → DELETE (soft deactivate, "Pasife Al", warning rengi)
- Purchase Orders → POST cancel `{ reason: "Toplu iptal" }`, "İptal Et" etiketi
- +19 test (use-selection.test.ts)
- 8 dosya · **2954 test yeşil** · TS clean · 0 lint warning

---

## Önceki — Faz 2b Review — 3 bulgu kapatma (2935 test)

---

## Önceki — Faz 2b — Tam ekran ürün detay sayfası + drawer kaldırma (2930 test)

- **Yeni sayfa `/dashboard/products/[id]`:** Client component, 7-sekme yapısı. 4 aktif sekme (Genel/Stok/Tedarik/Ticari) + 3 placeholder 🔒 (Teknik→Faz 2c, Ekler→Faz 2d, Partiler→Faz 2e). Header: 80×80 görsel placeholder + ürün adı + SKU mono + Aktif/Pasif + Manufactured/Commercial rozetleri. Düzenle/Devre Dışı Bırak butonları (demo guard). Save handler PATCH /api/products/[id] (24 alan: name/category/subCategory/productFamily/productType/sector/industries/useCases/material/origin/site/standards/certifications/unit/warehouse/preferredVendor/leadTimeDays/weightKg/price/currency/costPrice/productNotes/minStockLevel/dailyUsage/reorderQty). Deactivate handler `is_active:false` → router.push liste. Stok sekmesinde 6 metric card + Bekleyen Teslimatlar tablosu + Aktif Uyarılar banner; Ticari sekmesinde Aktif Teklifler tablosu (order linkleri). role="tablist"/tab + aria-selected/controls + 404 + loading branch'leri.
- **Liste sayfası `page.tsx`:** AIDetailDrawer + tüm drawer state'leri (selectedProductId/drawerEditMode/drawerSaving/drawerEditForm/rejectMode/rejectNote/drawerAlerts/commitments/showCommitmentForm/commitmentForm/quotes/extendingId) + drawer-only useEffect'leri (commitments/quotes/alerts fetch) + handleDrawerSave/handleAccept/handleReject/extendQuote handler'ları kaldırıldı (~1115 satır net azalma). Tablo 6 sabit kolona indirildi: SKU/Ad/Stok/Satılabilir/Fiyat/Min stok. Eski Kategori/Kapsam/Son Tarih/Sinyal kolonları kaldırıldı. Satır onClick `router.push(/dashboard/products/{id})`.
- **aging/page.tsx:** ESLint için `<a href="/dashboard/products">` → `<Link>` (yeni `[id]` route eklenince Next.js shadowing tetiklenmiş; lint hatası giderildi).
- **+19 test:** `product-detail-page.test.ts` (11: module load + useParams/Router/fetch + 7 sekme key + 3 placeholder + PATCH wiring + deactivate + loading/404 + demo + ops sections + header + ARIA), `products-page-drawer-removed.test.ts` (8: drawer regresyon kilidi — AIDetailDrawer yok, drawer state'leri yok, handleDrawerSave yok, selectedProductId yok, router.push paterni, 6 kolon header'lar, eski kolonlar kaldırılmış, useRouter import).
- 5 dosya · **2930 test yeşil** · TS clean · 0 lint warning · build OK · commit `9003044`

**Sıradaki:** Faz 2c — Teknik sekmesi dinamik alan rendering + tip seç + attributes JSONB write/read + tip değiştirme uyarısı.

---

## Önceki — Faz 2a Review — Tüm Bulgular Kapandı (2026-05-19; 2911 test)

- **MR-F2A-P2-001 KAPANDI:** `dbCreateBatch`/`dbUpdateBatch` `certificate_attachment_id` sahiplik + kind kontrolü. +3 test. commit `4977603`
- **MR-F2A-P3-002 KAPANDI:** 058+059 migration policy create'leri `DROP POLICY IF EXISTS` guard'lı. commit `4977603`
- **MR-F2A-P3-003 KAPANDI:** POST + PATCH catch blokları "bulunamadı"→404, "ait değil"/"türünde olmalıdır"→400 olarak eşlendi (önceden 500'e düşüyordu). +5 route testi. commit `5743bd1`

---

## Önceki — Faz 2a — Batches + Attachments DB Foundation (2903 test)

Faz 2 (ürün bilgileri sayfası) alt-fazlara bölündü: 2a (DB+backend, BU), 2b (sayfa skeleton), 2c (Teknik dinamik form), 2d (Ekler UI), 2e (Partiler UI).

**2a kapsamı (13 dosya):**
- **Migration 058:** `product_attachments` tablosu (kind enum: image/datasheet/certificate/manual/drawing/other; versiyonlama `superseded_by`; `is_primary_image` unique partial index — ürün başına 1 primary) + `storage.buckets product-files` (private, 10MB, image+PDF whitelist) + RLS service_role.
- **Migration 059:** `product_batches` (heat_no/batch_date/initial_qty/remaining_qty + `certificate_attachment_id` → attachments FK) + CHECK `remaining_qty <= initial_qty` + updated_at trigger.
- **DB types:** `ProductAttachmentRow` + `ProductBatchRow` + `ProductAttachmentKind` enum.
- **Helper `product-attachments.ts`:** `dbListAttachmentsByProduct(productId, kind?)` (superseded_by NULL filter), `dbGetAttachment`, `dbCreateAttachment` (atomik DB insert → storage upload `{productId}/{id}.{ext}` → fail ise DB row sil; avatar paterni), `dbDeleteAttachment` (DB sil → storage best-effort cleanup), `dbSetPrimaryImage` (clear-all then set-one). Export: `ALLOWED_MIME` (png/jpeg/webp/pdf), `MAX_FILE_SIZE = 10MB`, `isValidAttachmentKind`, `isAllowedMime`.
- **Helper `product-batches.ts`:** CRUD + validation (heat_no non-empty, initial_qty > 0, remaining_qty ≥ 0, remaining ≤ initial, batch_date YYYY-MM-DD).
- **API routes (4 dosya):** `/api/products/[id]/{attachments,batches}` ailesi — GET (auth) + POST/PATCH/DELETE (admin|purchaser via requireRole). Attachments POST multipart/form-data; PATCH `{is_primary_image:true}` (sadece image kind). Cross-tenant guard (batch/attachment.product_id !== url.id → 404). `revalidateTag("products","max")`.
- **+29 yeni test (4 dosya):** product-attachments-helper (9: pure validators 3 + dbCreate validation 3 + dbSetPrimary 1 + dbDelete 1 + isAllowedMime 1), product-attachments-route (7: viewer/MIME/size/kind/happy/PATCH primary+image/PATCH non-image), product-batches-helper (8: validation 5 + sıralama 1 + update validation 2), product-batches-route (5: viewer/heat_no boş/happy/DELETE/cross-product 404).
- 197 dosya · **2903 test yeşil** · TS clean · 0 lint warning · build OK · commit `b7c0227`

**Sıradaki:** Faz 2b — Tam ekran `/dashboard/products/[id]` skeleton + 4 statik sekme (Genel/Stok/Tedarik/Ticari) + eski drawer kaldırma. Liste sayfası satır click → tam sayfa.

---

## Önceki — Faz 1 Review P2 Tam Kapanış (2026-05-19; 2874 test)

`dbReorderProductTypeFields` reorder sırasında parent `is_system=true` ise `is_system=false` UPDATE + audit_log yazmıyordu → eklendi. +1 source-regex test. MR-F1-P2-001 kapatıldı.
- 184 dosya · 2874 test · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 1 Review — 3 bulgu kapatma (2026-05-19; 2873 test)

Kullanıcı Faz 1 commit'ini (`67708d1`) review etti, 3 açık bulgu buldu:
- **P2 (kısmi):** field add/update/delete sistem kilidini düşürmüyordu → 3 helper'a parent fetch + `is_system=false` UPDATE eklendi
- **P3 (route):** `[id]/fields/[fieldId]` route'u `id`'yi destructure etmiyordu → cross-tenant açığı vardı. Helper'lara opsiyonel `expectedTypeId` parametresi eklendi.
- **P3 (products):** `CreateProductInput` `product_type_id`/`attributes` içermiyordu → tip + insert güncellendi
- +18 test · 2873 test · TS clean · 0 lint warning · build OK

---

## Önceki — Modül Revize Faz 1 (2026-05-19; 2855 test)

### Bağlam
Kullanıcı 35 soruluk Q&A ile 3 modülün revizesini kararlaştırdı:
1. **AI Import** — multimodal kapı (PDF/Excel/foto/scanned), document classifier, type-aware extraction, hibrit matching, versiyonlama, vendor master
2. **Ürün bilgileri** — dinamik şema (admin paneli ile kullanıcı tipi tanımlar), 8 hazır tip, 7 sekmeli tam sayfa
3. **Teklif modülü** — PMT brand PDF, Ölçü/Teslimat/Ödeme alanları, bilingual TR/EN, auto-build description

**Sıra:** Faz 1 (dinamik tip altyapısı) → Faz 2 (ürün sayfası) → Faz 3 (AI Import) → Faz 4 (teklif). Sebep: Import + Teklif Faz 1+2'ye bağımlı.

### Faz 1 Tamamlandı
- **Migration 056 + 057**: `product_types` + `product_type_fields` tabloları + `products.product_type_id`/`attributes` ALTER + 8 hazır tip seed (Vana/Conta/Flans/Fitting/Bağlantı Elemanı/Enstrüman/Sızdırmazlık Malzemesi/Diğer) deterministik UUID'lerle
- **Helper + API**: `src/lib/supabase/product-types.ts` (CRUD + validation + reorder + sistem tipi/bağlı ürün guard'ları) + `/api/product-types/*` (4 route ailesi, admin guard, withFields=1 desteği)
- **Admin paneli**: `/dashboard/settings/product-types` liste (kart görünümü + modal) ve `[id]` detay (alan yöneticisi: ekle/sil/sırala, dinamik form: number → unit, select → options)
- **TypeScript tipleri** + mapper'lar + sidebar link
- **+61 test** (helper 16 + route 33 + seed 12)
- 183 dosya · 2855 test · TS clean · 0 lint warning · build OK

### Plan Dosyası
`/Users/mirzasaribiyik/Projects/erp2/MODUL_REVIZE_PLAN.md` — tüm fazların detay şeması (DB tabloları, alan listeleri, akış diyagramları, kabul kriterleri). Farklı session'larda kalınan yerden devam için referans dosyası.

---

## Sıradaki İş

**Faz 2 — Ürün Bilgileri Sayfası**
- Tam ekran `/dashboard/products/[id]` (drawer kaldırılır)
- 7 sekme: Genel / Teknik / Stok / Tedarik / Ticari / Ekler / Partiler
- Teknik sekmesi dinamik — seçilen tipin alanları renderlanır
- `product_batches` tablosu (heat_no, parti tarihi, miktar, sertifika linki, sevkiyat history)
- `product_attachments` tablosu (Supabase Storage entegrasyonu, versiyonlama via superseded_by)
- Ana görsel header'da + diğer dosyalar Ekler sekmesinde
- Liste sayfası: 6 sabit kolon (SKU/ad/stok/satılabilir/fiyat/min stok), basit arama
- Eski drawer kaldırılır

**Faz 3 — AI Import Yenileme**
Drop-anywhere arayüz + classifier + type-aware extraction + hibrit matching + versiyonlama. Eski 7-adım wizard "Klasik Mod" altına gizlenir.

**Faz 4 — Teklif Modülü Revize**
PMT brand PDF template, bilingual TR/EN, yeni alanlar (Ölçü/Teslimat/Ödeme), auto-build description, ürün şemasıyla entegrasyon.

---

## 35 Soruluk Q&A — Ana Kararlar Özeti

### AI Import
- Kapsam: A+B+D+E+F (Müşteri C hariç)
- Format: PDF/Excel/foto/scanned hepsi
- Varyant: düz SKU (her permütasyon ayrı kart)
- Eşleştirme: hibrit (yüksek güven otomatik, belirsiz sor)
- Belge yeri: ürünün altında "Ekler" sekmesi
- Multi-product onay: tek liste batch; tekil güncelleme: diff
- Çakışma: sadece çakışmada sor
- Versiyonlama: eski "önceki versiyon", history kalır
- Çoklu dosya: sıralı, ayrı onay

### Ürün
- Dinamik şema (admin panel)
- Default 8 tip ship
- Ortak iskelet sabit (SKU/ad/fiyat/stok/vendor), Teknik tipe göre
- Sayfa: tam ekran, 7 sekme
- Parti izleme: hibrit (özet + Partiler sekmesi)
- Görsel: ana header + diğerleri Ekler
- Liste: 6 kolon + basit arama
- Eski demo ürünler önemsiz (silinecek)

### Teklif
- Referans: `/Users/mirzasaribiyik/Downloads/PMT.pdf` (PMT brand)
- Yeni alanlar: Ölçü/Teslimat/Ödeme
- Bilingual TR/EN
- Auto-build description (ad + gövde mat + sınıf + trim mat)
- Sipariş dönüşümü: manuel buton (mevcut yeterli)

---

## Önceki İşler (kısa kronoloji)

- Genel Pagination (2026-05-18) — 6 liste sayfası 50/sayfa + numaralı navigation (2794 test)
- Faz 10 Review (2026-05-18) — `dbGetOpenShortagesByProductId` DB hata yutma kapatıldı
- Faz 10 (2026-05-18) — order_shortage drawer M3 (bilgi yoğunluğu + iki yönlendirme)
- Faz 9 (2026-05-18) — PO PDF render (server-side HTML print) + review bulgular
- Faz 8 (2026-05-17) — AI rejection feedback prompt entegrasyonu
- Faz 7 (2026-05-16/17) — overdue_shipment alert inline ship form + P2/P3 kapanış
- Faz 6 (2026-05-16) — Suggested → PO köprüsü + review kapanış
- Faz 1-5 (purchase&alert) — sync_issue inline retry, vendor entity, PO schema/UI/mal kabul
- Paraşüt Faz 1-11 tam tamamlandı
