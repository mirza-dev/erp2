---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

## Son Tamamlanan İş — 2026-05-19

**Toplu Seçme ve Silme — Tüm 6 Liste Sayfası (2954 test) · commit `c043636`**

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
