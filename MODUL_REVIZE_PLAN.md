# Modül Revize Planı — Ürün / AI Import / Teklif

> **Faz 2e İPTAL (2026-05-19):** Parti (heat_no/FIFO) izlenebilirliği PMT ölçeğinde iş gereksinimi olmadığı için tamamen kaldırıldı. Aşağıdaki Partiler sekmesi/`product_batches` tablosu/Faz 2e referansları **artık geçerli değil** — sertifika fonksiyonalitesi `product_attachments` (kind=certificate) ile Ekler sekmesinde karşılanıyor. Detay: `migration 060_drop_product_batches.sql`. Geri alma: commit `b7c0227` (Faz 2a) git history.

## 🎯 Progress Tracker

**Son güncelleme:** 2026-05-19
**Durum:** Tasarım kararları alındı. Faz 1 uygulama bekliyor.

### Faz ilerlemesi

| # | Faz | Durum | Son güncelleme | Notlar |
|---|-----|-------|---------------|--------|
| 1 | Dinamik Ürün Tipi Altyapısı (DB + admin paneli + 8 hazır tip) | ⬜ Başlamadı | — | Diğer fazların ön koşulu |
| 2 | Ürün Bilgileri Sayfası (7 sekme, tam ekran, görsel, parti) | ⬜ Başlamadı | — | Faz 1'e bağımlı |
| 3 | AI Import Yenileme (multi-format + classifier + matching + versioning) | ⬜ Başlamadı | — | Faz 1 ve 2'ye bağımlı |
| 4 | Teklif Modülü Revize (PMT brand template + yeni alanlar + bilingual) | ⬜ Başlamadı | — | Faz 2'ye bağımlı (yeni ürün alanları) |

**Durum legend:** ⬜ Başlamadı · 🟦 Devam ediyor · ✅ Tamamlandı · ⚠️ Bloklu

### Sıradaki adım
**Faz 1 — Dinamik Ürün Tipi Altyapısı.** DB migration + admin paneli + 8 hazır tip seed.

### Sıralama gerekçesi
Önce dinamik şema kurulmalı. Çünkü:
- AI Import'ta belge sınıflandırma → ürün tipi seçimi → tipe özgü alan ekstraksiyon yapacak (Faz 1 gerekli)
- Teklif satır açıklaması auto-build için ürünün gövde malzemesi / sınıf / trim alanları gerekli (Faz 2 gerekli)
- Eski 100+ demo ürün önemsiz, sıfırdan başlanabilir

---

## Kararlar Matrisi (35 soruluk Q&A özeti)

### AI Import (Soru 1–14)

| # | Karar |
|---|---|
| Kullanım amacı | Toplu veri girişi için evrensel kapı: ürün/tedarikçi/sertifika/katalog her şey |
| Kapsam | A (ürün yaratma) + B (zenginleştirme) + D (vendor master) + E (multimodal) + F (cross-cutting). Müşteri tarafı (C) hariç. |
| Format | PDF, Excel, foto, scanned — her şey |
| Varyant stratejisi | Düz SKU (her permütasyon ayrı kart), malzeme/boyut ürün üzerinde alan |
| Eşleştirme | Hibrit — yüksek güven otomatik, belirsiz → kullanıcıya sor |
| Belge arşivi | Sadece ürünün altında "Ekler" sekmesi (global arşiv yok) |
| Çoklu ürün onayı | Tek liste ekranı, batch onay/düzenle/iptal |
| Tekil güncelleme | Diff onayı (önce/sonra göster) |
| Alan çakışması | Sadece çakışmada sor; boş alanlar otomatik doldurulur |
| Versiyonlama | Eski belge "önceki versiyon" işaretlenir, yeni aktif olur, history kalır |
| Çoklu dosya yükleme | Sıralı işleme, dosya başına ayrı onay ekranı |

### Ürün Bilgileri (Soru 15–26)

| # | Karar |
|---|---|
| Alan sayısı | ~37 (mevcut + 12 yeni teknik alan) |
| Yeni alanlar | DN, PN/sınıf, bağlantı tipi, aktüatör, gövde malzemesi, trim malzemesi, max çalışma sıcaklığı/basıncı, test basıncı, face-to-face, conta tipi, onaylar (CE/PED/API), görsel |
| Şema | **Dinamik** — admin paneli ile kullanıcı kendi tipini tanımlar |
| Default tipler | 8 tip ship: Vana, Conta, Flans, Fitting, Bağlantı Elemanı, Enstrüman, Sızdırmazlık Malzemesi, Diğer |
| Ortak iskelet | SKU/ad/fiyat/stok/vendor/maliyet **sabit** her tipte |
| Tipe özgü | Sadece "Teknik" sekmesi dinamik |
| Zorunlu alanlar | Tip bazlı (vana için DN/PN/gövde, conta için inner/outer ID, vs.) |
| Parti izlenebilirlik | Hibrit — özet kartta + Partiler sekmesinde history |
| Sayfa düzeni | 7 sekme: Genel / Teknik / Stok / Tedarik / Ticari / Ekler / Partiler |
| Görsel | Ana görsel header'da + diğer görseller Ekler'de |
| Liste sayfası | Basit arama (filtre panel yok), 6 sabit kolon |
| Liste kolonları | SKU, ad, stok, satılabilir, fiyat, min stok |
| Düzenleme UX | Tam ekran sayfa `/dashboard/products/[id]` |
| Mevcut ürünler | Önemsiz — seed temizlenecek, sıfırdan başlanır |

### Teklif Modülü (Soru 27–34)

| # | Karar |
|---|---|
| Referans | `/Users/mirzasaribiyik/Downloads/PMT.pdf` (PMT brand teklif formu) |
| Yeni alanlar | Ölçü kolonu per satır, Teslimat Şekli per teklif, Ödeme Şekli per teklif |
| Ölçü kolonu | Hibrit — ürün varsa DN otomatik, ürün yoksa elle |
| Teslimat & ödeme | Serbest text (her teklifte değişir) |
| Lead time | NOT alanı (elle yazılır) |
| Bilingual rendering | Evet — TR/EN her etikette (Teklif No / Offer No, Müşteri / Customer ...) |
| Satır açıklaması | Auto-build — ürün kartı alanlarından şablon (ad + gövde mat + sınıf + trim mat) |
| HS code + ağırlık | Per-line korunur |
| Müşteri email/telefon, satış temsilcisi email/telefon | Form'da kalır (mevcut sistem) |
| Sipariş dönüşümü | Manuel buton (mevcut, yeterli) |
| PDF layout | PMT brand template: logo, müşteri kutusu, satır tablosu, 3 sütunlu alt blok (teslimat/geçerlilik/ödeme), 3 imza (HAZIRLAYAN/ONAY/MÜŞTERİ ONAYI), footer şirket bilgileri |

---

## Faz 1 — Dinamik Ürün Tipi Altyapısı

### Hedef
Kullanıcı admin panelinden kendi ürün tiplerini tanımlayabilsin. Her tipin alan seti farklı olabilir. 8 hazır tip ile system'i seed et.

### DB Şeması

#### Yeni tablo: `product_types`
```sql
CREATE TABLE product_types (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,    -- "Vana", "Conta", ...
    description text,
    icon        text,                     -- opsiyonel emoji/icon
    sort_order  int NOT NULL DEFAULT 0,
    is_system   boolean NOT NULL DEFAULT false,  -- hazır gelen tipler için
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
```

#### Yeni tablo: `product_type_fields`
```sql
CREATE TABLE product_type_fields (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_type_id uuid NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
    field_key       text NOT NULL,       -- "dn", "pn_class", "body_material"
    label_tr        text NOT NULL,
    label_en        text,                -- bilingual destek
    field_type      text NOT NULL,       -- text/number/select/multiselect/date/boolean/longtext
    unit            text,                -- "mm", "bar", "°C", "kg" — number için
    options         jsonb,               -- select/multiselect için ["A105", "F304", ...]
    required        boolean NOT NULL DEFAULT false,
    placeholder     text,
    help_text       text,
    sort_order      int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_type_id, field_key)
);
```

#### `products` tablosuna ekleme
```sql
ALTER TABLE products ADD COLUMN product_type_id uuid REFERENCES product_types(id);
ALTER TABLE products ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
-- attributes = { "dn": 50, "pn_class": "600LB", "body_material": "A105", ... }
CREATE INDEX idx_products_type ON products(product_type_id);
CREATE INDEX idx_products_attributes ON products USING gin(attributes);
```

### 8 Hazır Tip Tohumlama

#### Vana
- `dn` (number, mm, required)
- `pn_class` (select: 150LB/300LB/600LB/800LB/900LB/1500LB/2500LB veya PN6/10/16/25/40/63/100/160, required)
- `valve_type` (select: Küresel/Globe/Gate/Check/Butterfly/Control)
- `end_connection` (select: Flanşlı/Kaynaklı/NPT/SW/Threaded/Butt-weld, required)
- `actuator` (select: Manuel/Elektrik/Pnömatik/Dişli/Volan)
- `body_material` (text, required)
- `trim_material` (text)
- `seat_material` (text)
- `stem_material` (text)
- `max_temp_c` (number, °C)
- `max_pressure_bar` (number, bar)
- `test_pressure_bar` (number, bar)
- `face_to_face_mm` (number, mm)
- `gasket_type` (text)
- `approvals` (multiselect: CE/PED/API 6D/API 6A/ISO 9001/SIL/ATEX)
- `standards` (multiselect: ASME B16.34/EN 12266/API 600/API 6D/API 6A)

#### Conta
- `inner_id_mm` (number, mm, required)
- `outer_id_mm` (number, mm, required)
- `thickness_mm` (number, mm, required)
- `style` (select: Spiral Wound/Ring Joint/Soft Cut/Camprofile)
- `hoop_material` (text)
- `filler_material` (text)
- `inner_ring_material` (text)
- `outer_ring_material` (text)
- `min_temp_c` (number, °C)
- `max_temp_c` (number, °C)
- `max_pressure_bar` (number, bar)
- `standards` (multiselect)
- `color_code` (text)

#### Flans
- `dn` (number, mm, required)
- `pn_class` (select, required)
- `flange_type` (select: WN/SO/Blind/Threaded/Lap Joint/Socket Weld)
- `face_type` (select: RF/FF/RTJ/Tongue&Groove/Male&Female)
- `material` (text, required)
- `bolt_count` (number)
- `outer_diameter_mm` (number, mm)
- `hub_thickness_mm` (number, mm)
- `standards` (multiselect: ASME B16.5/EN 1092-1)

#### Fitting
- `dn` (number, mm, required)
- `pn_class` (select)
- `fitting_type` (select: Dirsek/T/Redüksiyon/Cap/Cross)
- `schedule_no` (text, ör. SCH 40, SCH 80, SCH XXS)
- `material` (text, required)
- `bend_radius` (text, ör. Long/Short)
- `standards` (multiselect)

#### Bağlantı Elemanı
- `length_mm` (number, mm, required)
- `diameter_mm` (number, mm, required)
- `thread_pitch` (text)
- `material` (text, required)
- `grade` (text, ör. A193 B7, A320 L7)
- `coating` (select: Çıplak/Galvaniz/Xylan/PTFE/Inox)
- `standards` (multiselect)

#### Enstrüman
- `measurement_range` (text, required)
- `accuracy` (text)
- `process_connection_size` (text)
- `process_connection_type` (text)
- `body_material` (text)
- `media_type` (text)
- `approvals` (multiselect: CE/PED/ATEX/SIL/IECEx)

#### Sızdırmazlık Malzemesi
- `material_type` (select: PTFE/Graphite/Aramid/Asbestos-free)
- `form` (select: Şerit/Sıvı/Bant/Pul/Halka)
- `min_temp_c` (number, °C)
- `max_temp_c` (number, °C)
- `max_pressure_bar` (number, bar)
- `chemical_compatibility` (longtext)

#### Diğer
- (Boş — kullanıcı kendi ekler)

### UI

#### Admin paneli: `/dashboard/settings/product-types`
- Tip listesi (kart görünümü, sort_order'a göre)
- "Yeni Tip Ekle" butonu
- Tip detay sayfası: alan ekle/sil/sırala, label TR/EN, field_type seç, options ekle (select/multiselect için)
- System tipleri (`is_system = true`) sadece görüntülenebilir, override edilirse `is_system = false` olur

### Kabul Kriterleri
- 8 hazır tip seed migration ile gelir
- Admin panelden yeni tip eklenir, alanlar eklenir
- DB'de `products.product_type_id` ve `products.attributes` mevcut
- TypeScript tipleri: `ProductType`, `ProductTypeField`, `Product.attributes`
- Test: tip CRUD, alan CRUD, products attributes write/read

---

## Faz 2 — Ürün Bilgileri Sayfası

### Hedef
Tam ekran ürün detay sayfası. 7 sekme. Dinamik tip alanları "Teknik" sekmesinde render edilir.

### Sayfa Yapısı: `/dashboard/products/[id]`

#### Header (sabit, üstte)
- **Sol:** Ana görsel (200×200 thumbnail, tıklayınca lightbox)
- **Orta:** Ürün adı (h1), SKU (mono), Tip rozeti, durum (aktif/pasif)
- **Sağ:** "Düzenle" / "Sil" / "Çoğalt" butonları

#### 7 Sekme

| Sekme | İçerik |
|---|---|
| **Genel** | SKU, Ad, Kategori, Aile, Alt-kategori, Sektör uyumluluğu, Ürün tipi (manufactured/commercial), Tip seçimi (vana/conta/...) |
| **Teknik** | Dinamik alanlar — seçilen tipe göre `product_type_fields`'tan render |
| **Stok** | on_hand, reserved, available_now, quoted, promisable, incoming, forecasted, min_stock_level, warehouse, daily_usage |
| **Tedarik** | preferred_vendor, lead_time_days, reorder_qty, cost_price, currency |
| **Ticari** | price, currency, use_cases, industries, standards, certifications, notes |
| **Ekler** | Ana görsel + diğer görseller + datasheet + sertifika + manual + diğer dosyalar — Supabase Storage |
| **Partiler** | Heat no, parti tarihi, miktar, sertifika linki, sevkiyat history (hibrit — özet üstte, history altında) |

### Parti Sistemi

#### Yeni tablo: `product_batches`
```sql
CREATE TABLE product_batches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    heat_no         text NOT NULL,
    batch_date      date,
    initial_qty     numeric,
    remaining_qty   numeric,
    certificate_attachment_id uuid,  -- product_attachments tablosuna FK
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_batches_product ON product_batches(product_id);
```

#### Sevkiyat tarafı (gelecek)
- Sevk satırına `batch_id` eklenir
- "Hangi partiden ne kadar gönderildi" izlenir
- İlk fazda manuel ("hangi parti yaz" alanı), ileride otomatik FIFO seçimi

### Ekler / Storage

#### Yeni tablo: `product_attachments`
```sql
CREATE TABLE product_attachments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    file_path       text NOT NULL,        -- Supabase Storage path
    file_name       text NOT NULL,
    file_size       bigint NOT NULL,
    mime_type       text NOT NULL,
    kind            text NOT NULL,        -- "image" / "datasheet" / "certificate" / "manual" / "drawing" / "other"
    is_primary_image boolean NOT NULL DEFAULT false,
    version         int NOT NULL DEFAULT 1,
    superseded_by   uuid REFERENCES product_attachments(id),  -- versiyonlama
    metadata        jsonb,                -- AI'dan gelen ek bilgi (sertifika no, parti, vb.)
    uploaded_at     timestamptz NOT NULL DEFAULT now(),
    uploaded_by     uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_attachments_product ON product_attachments(product_id);
CREATE INDEX idx_attachments_kind ON product_attachments(product_id, kind);
```

#### Storage bucket: `product-files`
- Public veya signed URL (karar verilecek)
- Path pattern: `{product_id}/{attachment_id}.{ext}`

### Liste Sayfası

#### `/dashboard/products`
- 6 sabit kolon: SKU, Ad, Stok, Satılabilir, Fiyat, Min stok
- Basit arama kutusu (mevcut)
- Pagination (mevcut — 50/sayfa)
- Tıklayınca tam sayfa `/dashboard/products/[id]` (drawer KALDIRILIR)

### Kabul Kriterleri
- Yeni ürün ekle: tip seç → tipin alanları gelir → kaydet
- Mevcut ürün düzenle: tipi değiştir → uyarı (eski attributes'lerin kayıp riski), onaylayınca taşı
- Görsel yükle: ana görsel + galeri
- Belge yükle: Supabase Storage'a yazılır, attachment kaydı oluşur
- Parti ekle: heat_no + tarih + miktar, sertifika linki opsiyonel
- Test: 25+ yeni test (tip değişimi, attribute write/read, batch CRUD, attachment CRUD, görsel upload)

---

## Faz 3 — AI Import Yenileme

### Hedef
Tek "dosya bırak" arayüzü. AI belge tipini sınıflandırır → uygun extractor çalışır → diff/list onay ekranı → uygula.

### Akış

```
1. User dosya bırakır (drag-drop veya browse) — PDF/Excel/foto/scanned
   ↓
2. AI classify: "Bu nedir?"
   - product_catalog (multi-product PDF/Excel)
   - product_datasheet (single product)
   - material_certificate (3.1, EN 10204)
   - compliance_doc (CE, PED, etc.)
   - test_report (basınç/sızdırmazlık)
   - msds
   - vendor_profile
   - product_photo (vision: identify product)
   - migration_excel (eski sistem)
   - unknown (kullanıcıya manuel parse)
   ↓
3. Type-aware extraction
   - catalog → multi-product extract, her satır için fields populate
   - cert → product match (fuzzy) + cert details extract
   - datasheet → single product, populate
   ↓
4. Matching (hibrit)
   - Yüksek güven (DN+sınıf+isim tam eşleşme): otomatik link
   - Düşük güven: "Bu hangi ürün?" sorusu (top 3 aday)
   - Eşleşme yok: "Yeni ürün önereyim mi?"
   ↓
5. Review screen
   - Multi-product: tek liste, batch onay/düzenle/iptal
   - Single product update: diff (önce/sonra)
   - Çakışma varsa: "A105 mi A105+ENP mi?" sorusu
   ↓
6. Apply
   - Yeni ürün(ler) yaratılır
   - Mevcut ürün(ler) güncellenir
   - Belge `product_attachments`'a yazılır + dosya Storage'a yüklenir
   - Sertifika ise `product_batches`'a yeni parti açılır
   - Eski versiyon "önceki versiyon" işaretlenir (superseded_by)
   ↓
7. Audit log + toast
```

### AI Sınıflandırma Promptu (taslak)

```
SYSTEM: Sen bir endüstriyel ekipman ERP sistemi için belge analiz asistanısın.
Yüklenen dosyayı incele ve tipini tespit et:

- product_catalog: çoklu ürün listesi (üretici/tedarikçi kataloğu)
- product_datasheet: tekil ürün teknik veri sayfası
- material_certificate: belirli parti için sertifika (3.1, EN 10204)
- compliance_doc: CE, PED, ATEX uygunluk belgesi
- test_report: basınç, sızdırmazlık, hidrostatik test sonucu
- msds: malzeme güvenlik bilgi formu
- vendor_profile: tedarikçi tanıtım/bilgi belgesi
- product_photo: ürün fotoğrafı (vision)
- unknown: belirsiz

Çıktı JSON:
{
  "document_type": "...",
  "confidence": 0-100,
  "language": "...",
  "summary": "kısa açıklama",
  "suggested_product_type": "vana/conta/flans/..." (varsa)
}
```

### Çoklu Dosya
- Drag-drop'a 10 dosya bırak → **bounded parallel (concurrency cap 3)** işlenir
  - Karar (Faz 3a kapanış, 2026-05-19): saf sıralı (1'er 1'er) yerine cap 3.
  - Gerekçe: Anthropic Haiku 50 req/min limiti içinde güvenli; 10 dosya sıralı
    ~30-50s sürer (UI uzun durur), cap 3 ile ~10-17s. AI cost aynı (her dosya
    bir kez işlenir).
  - Implementation: `ClassifierQueue.tsx` `CONCURRENCY = 3` + per-item `started`
    flag (duplicate fetch koruma) + cancellation-safe cleanup.
  - Sonuç sırası: kullanıcı için belirleyici değil — her kart bağımsız tamamlanır;
    apply aşamasında (3c) kullanıcı sıralayabilir.
- Her dosya için ayrı onay ekranı (kullanıcı isterse "tümünü atla" / "tümünü onayla" )

### Versiyonlama Uygulaması
- Yeni sertifika geldi, aynı ürüne bağlı eski sertifika var
- Yeni record `product_attachments`'a yazılır
- Eski record'un `superseded_by` alanı yeni record'a set edilir
- UI'da "Aktif" + "Önceki versiyonlar" şeklinde gösterilir

### Type-Aware Extraction
- AI promptuna `available_product_types` ve her tipin `fields` listesi context olarak verilir
- AI extraction'da bu alanlara mapping yapar
- Output: `{ product_type_id, attributes: { dn: 50, pn_class: "600LB", ... } }`

### Kabul Kriterleri
- Spiral Wound katalog PDF (gerçek örnek) → 6+ conta ürünü taslağı, kullanıcı onayıyla eklenir
- 3.1 sertifika Excel → 1 ürün eşleştirilir (high confidence) veya sorulur (low confidence) + parti açılır + dosya eklenir
- Çoklu dosya yükleme → sıralı onay ekranları
- Eski/yeni sertifika versiyonlama çalışır
- Eski 7-adım wizard kaldırılır veya "Klasik Mod" altına gizlenir
- Test: belge sınıflandırma, extraction, matching, versiyonlama (40+ yeni test)

---

## Faz 4 — Teklif Modülü Revize

### Hedef
PMT brand PDF formatına uygun teklif çıktısı. Yeni alanlar (Ölçü/Teslimat/Ödeme), bilingual, auto-build description.

### DB Değişiklikleri

#### `quotes` tablosuna yeni alanlar
```sql
ALTER TABLE quotes ADD COLUMN delivery_method text;        -- "İSTANBUL PMT DEPO TESLİMİ / EXWORKS PMT İSTANBUL DEPO"
ALTER TABLE quotes ADD COLUMN payment_method  text;        -- "%50 AVANS, %50 SEVKE HAZIR OLUNCA"
```

#### `quote_lines` tablosuna yeni alan
```sql
ALTER TABLE quote_lines ADD COLUMN size_text text;         -- "3/4''", "DN50", "8\""
```

### Auto-Build Description
- Ürün seçilince satır description otomatik oluşturulur
- Şablon: `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM`
- Örnek: `GATE VALVE A105 GÖVDE, CLASS 600 SW, SS TRİM`
- Kullanıcı override edebilir (manuel düzenleme)

### PDF Yeniden Tasarım

`src/components/QuoteDocument.tsx` (mevcut) → PMT brand template'e güncellenir:

#### Layout
```
┌────────────────────────────────────────┐
│ [LOGO] PMT ENDÜSTRİYEL EKIPMANLAR ...  │
├────────────────────────────────────────┤
│ TEKLİF FORMU / COMMERCIAL OFFER        │
├──────┬─────────────┬───────────────────┤
│ Teklif No / Offer No | PMT.02.001       │
│ Tarih / Date         | 11 Şubat 2026    │
├──────────────────────────────────────────┤
│ MÜŞTERİ BİLGİLERİ / CUSTOMER INFORMATION │
│ Müşteri / Customer | 4k METAL             │
│ Adres / Address    | DÖRTYOL HATAY        │
│ İlgili / Relevant  | AHMET YÜKSEL         │
├────┬──────┬──────────────────┬──────┬────┬──────┬──────┤
│Sıra│Ölçü  │Ürün Tanımı       │Miktar│Birim│B.Fiyat│Toplam│ ← bilingual üst başlık
│Item│Size  │Product Desc.     │Qty   │Unit │U.Price│Total │
├────┼──────┼──────────────────┼──────┼────┼──────┼──────┤
│ 1  │3/4'' │GATE VALVE A105...│ 176  │ADET│$30,00 │$5.280│
│... │      │                  │      │    │       │      │
├────┴──────┴──────────────────┴──────┴────┴──────┴──────┤
│                                    TOPLAM USD: $32.392 │
├──────────────────┬─────────────────┬───────────────────┤
│ Teslimat Şekli   │ Geçerlilik       │ Ödeme             │
│ Delivery Method  │ Validity Period  │ Payment Method    │
│ İSTANBUL PMT...  │ 30 GÜN / 30 DAYS │ %50 AVANS...      │
├────────────────────────────────────────────────────────┤
│ NOT: FİYATLARIMIZ NET FİYATLARDIR. KDV İLAVE EDİLECEK. │
│      TESLİM SÜRESİ: ...                                │
├────────────────────────────────────────────────────────┤
│ HAZIRLAYAN     ONAY        MÜŞTERİ ONAYI               │
│ [imza alanı]   [imza]      [imza]                      │
├────────────────────────────────────────────────────────┤
│ Fabrika: ... | Merkez: ... | Tel: ... | Web: ...       │
└────────────────────────────────────────────────────────┘
```

### Bilingual Strings
- Tüm sabit etiketler TR/EN birleşik render edilir
- Component'te `LABELS` constant: `{ quoteNo: "Teklif No / Offer No", customer: "Müşteri / Customer", ... }`

### Form UI
- Yeni alanlar: Teslimat Şekli (textarea), Ödeme Şekli (textarea), Ölçü per satır (text input)
- Mevcut alanlar değişmez

### Kabul Kriterleri
- PDF çıktısı PMT brand template'e uygun
- Auto-build description çalışır (override edilebilir)
- Yeni alanlar kayıt/düzenleme/render çalışır
- Bilingual etiketler doğru
- HS code + weight per line korunur
- Mevcut sipariş dönüşümü manuel buton çalışır
- Test: 15+ yeni test (auto-build, PDF render, yeni alanlar)

---

## Bağımlılıklar / Risk

| Risk | Etki | Azaltma |
|---|---|---|
| `attributes` JSONB query performance | Büyük listede arama yavaşlar | GIN index + sık alanlar için generated column |
| Tip değişimi attribute kaybı | Veri kaybı | Tip değiştirirken eski attribute'leri arşivle, uyarı göster |
| AI extraction belirsizliği | Yanlış ürün/alan eşleşmesi | Confidence threshold + her zaman review screen |
| Belge depolama maliyeti | Supabase Storage ücret artışı | Dosya boyut limiti + duplicate detection |
| PDF rendering server-side | Performance | mevcut server-side HTML print paterni |
| Mevcut import wizard kullanıcılarını şaşırtma | UX regression | Eski mod "Klasik İçe Aktar" altında kalır (opsiyonel) |

---

## Test Stratejisi

Her faz için:
- DB migration test (idempotent + rollback)
- Helper birim testleri (CRUD)
- Service katmanı testleri (iş kuralları)
- Route testleri (auth + validation)
- UI smoke testleri (source-regex paterni)
- Integration testleri (uçtan uca senaryolar)

**Hedef test sayıları:**
- Faz 1: +30 test
- Faz 2: +30 test
- Faz 3: +40 test
- Faz 4: +15 test
- **Toplam: +115 test** (mevcut 2794 → 2909)

---

## Sonraki Adım

**Faz 1'e başla.** Sıralama:
1. Migration: `product_types` + `product_type_fields` + `products` ALTER
2. Seed: 8 hazır tip + alanları
3. Helper'lar: `dbListProductTypes`, `dbGetProductTypeWithFields`, CRUD
4. Admin paneli: `/dashboard/settings/product-types`
5. Test + commit

Sonra Faz 2 başlanır.
