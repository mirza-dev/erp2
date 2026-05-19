---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

## Son Tamamlanan İş — 2026-05-19

**Faz 1 Review — 3 bulgu kapatma (2873 test)**

Kullanıcı Faz 1 commit'ini (`67708d1`) review etti, 3 açık bulgu buldu:
- **P2:** field add/update/delete sistem kilidini düşürmüyordu (header edit düşürüyordu, field tarafı yok) → 3 helper'a parent fetch + `is_system=false` UPDATE eklendi
- **P3 (route):** `[id]/fields/[fieldId]` route'u `id`'yi destructure etmiyordu → cross-tenant açığı vardı (`/typeA/fields/fieldOfTypeB` çalışırdı). Helper'lara opsiyonel `expectedTypeId` parametresi, route'tan geçiriliyor → uyumsuz → "Alan bu tipe ait değil" 404
- **P3 (products):** `CreateProductInput` `product_type_id`/`attributes` içermiyordu; `dbCreateProduct` insert payload bu alanları yazmıyordu → write yolu yarımdı → tip + insert güncellendi, default null/{}
- +18 test (helper 6 + route 4 + yeni products-attributes-write-read.test.ts 8)
- 184 dosya · 2873 test · TS clean · 0 lint warning · build OK

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
