# Veri Aktarım — Yazma Yolları Geliştirme (Master Plan)

> **Durum:** Faz A·B·C·D ✅ TAMAMLANDI + **Faz D-POC tam-otomatik katalog→görsel (mupdf WASM) ✅ UYGULANDI (2026-06-07)**. İki worktree (erp2/main + proje-codex/codex-experiment) birebir-ayna. Migration 086 push öncesi kullanıcı uygular.

## Amaç

Kullanıcı vizyonu: **"Katalog/dosya yüklendiğinde AI, ürünün her bilgisini (ad, kod, kategori, teknik özellikler, malzeme, menşei, standart, sertifika…) ve görselini bile çıkarıp ürün kartına eksiksiz, hatasız, doğru yere yazsın."** + yazma yollarının sağlamlaştırılması.

İki yazma yolu var, ikisi de bugün **güvenli ama eksik**:
- **AI akışı** (`import-apply-service.ts`): atomik, null-silmez, finansal-korumalı — ama yalnız `name/sku/unit/product_type_id/attributes` yazıyor; zengin master-data kolonlarını boş bırakıyor.
- **Klasik Excel** (`import-service.ts`): 21 sabit kolon yazıyor (allow-list, finansal-gate'li) — ama ürün-tipi teknik attributes (DN/PN/gövde) yazmıyor; clear işlevsiz; atomik değil.

## Ortak güvenlik invariyantları (her fazda korunur)
- Onaysız kayıt yazılmaz (kullanıcı review/confirm).
- Boş/null değer mevcut veriyi SİLMEZ.
- `price`/`cost_price` ayrı yetki (`canApplyFinancialField`) + açık onay olmadan yazılmaz.
- Yazılan alanlar allow-list ile sınırlı (rastgele alan DB'ye sızmaz).
- Her apply `audit_log`'a (evidence ile).

---

## Faz A — Zengin master-data extraction + apply  ⟵ AKTİF

**Hedef:** AI katalog/datasheet extraction'ı + apply'ı, finansal-olmayan zengin master-data kolonlarını da çıkarıp ürün kartına yazsın.

**Kapsam (CORE alan whitelist, finansal HARİÇ):** `category, unit, currency, min_stock_level, reorder_qty, product_family, sub_category, material_quality, origin_country, production_site, standards, certifications, use_cases, industries, weight_kg, lead_time_days`. (Hepsi `CreateProductInput` + `dbCreateProduct`'ta mevcut.)

**Ana dosyalar:** `ai-service.ts` (`ExtractedProductLine`+core_fields, prompt JSON şema, `parseExtractionResponse` whitelist/normalize) · `import-center.ts` (`IMPORT_CORE_PRODUCT_FIELDS` tek-kaynak sabit + normalize helper) · `import_document_lines` migration (`extracted_core_fields jsonb`) · `import-document-lines.ts` helper · `extract/route.ts` (persist) · `import-apply-service.ts` (create+update'e core map, boş-silmez, finansal-drop) · `ExtractionReview.tsx` (göster+onay).

**Kabul kriterleri:** Katalogdan **yeni ürün** açıldığında çıkarılabilen master-data kolonları eksiksiz dolu gelir; **eşleşen ürün**de core alanlar YALNIZ boş alanları doldurur (kullanıcı kararı — mevcut/elle düzeltilmiş değerleri EZMEZ; `unit`/`currency` gibi kritik alanlar yanlış katalogdan bozulmaz); price/cost_price asla yazılmaz; boş değer mevcut veriyi silmez; kullanıcı çıkarılan alanları review'da görür; tsc/lint/test/build temiz.

**Matched-update kuralı (DURUM: uygulandı):** core alan yalnız `current[k]` boş/null ise patch'e girer ("fill-empty"). Faz C bu kuralı genişletir (alan-bazında koru/üzerine-yaz/temizle seçimi). Yeni ürün yolu tüm dolu core alanları yazar (ezilecek bir şey yok).

**Sınır:** Görsel (D) ve Excel-teknik (B) bu fazda DEĞİL. Faz A review ekranı core alanları **read-only** gösterir (per-core-field onay toggle'ı Faz C).

---

## Faz B — Excel toplu akışına teknik attributes  ✅ TAMAMLANDI

**Yapıldı (kullanıcı kararı: tip-özel şablon indir):**
- `/api/import/templates?kind=product_type&typeId=<uuid>` → o tipin field_key'lerini SÜTUN olarak içeren Excel (sku/name/unit + `urun_tipi` prefill + core + teknik kolonlar); Meta'da product_type_id.
- `import-center.ts`: `buildProductTypeTemplateColumns` + `collectTypeAttributesFromRow` (number/select/multiselect/boolean normalize, boş drop) + `PRODUCT_TYPE_TEMPLATE_COLUMN`.
- **Parse-survival (advisor blocker):** `apply-mappings` route teknik kolonları (field_key) + `urun_tipi`'yi product satırlarında ham passthrough eder (IMPORT_FIELD_SET'te olmadıkları için normal mapping'de düşerlerdi); yabancı kolon passthrough EDİLMEZ (yalnız aktif tip field_key union'ı). `parse` route legacy/kullanılmıyor (UI: detect-columns→apply-mappings→confirm).
- `import-service` confirm: `urun_tipi`/`product_type` → normalize ad eşleşmesi → tip; `collectTypeAttributesFromRow` ile attributes. **Create:** product_type_id + attributes. **Update:** fill-empty (mevcut attribute dolu → korunur).
- ImportGuide'da tip seçici + "Şablonu indir".
- +20 test (helper/route/confirm/render). tsc/lint/test/build temiz.

**Sınır/sonraki:** Meta `product_type_id` fallback (urun_tipi boş satırda) eklenmedi — şablon urun_tipi'yi prefill ediyor; kullanıcı satır eklerken doldurmalı (Faz C'de fallback eklenebilir). Sabit kolon (unit/currency vb.) klasik update'te hâlâ koşulsuz overwrite → **Faz C**.

---

## Faz C — Akıllı güncelleme + sağlamlık  ✅ TAMAMLANDI

**Yapıldı (kullanıcı kararı: boş doldur + isteğe bağlı üzerine-yaz; satır başarısızsa diğerleri + net hata raporu):**
- **Güncelleme modu (tüm sabit kolonlar + teknik attributes):** `pickUpdate` fill-empty default — mevcut dolu değer korunur (unit/currency/category bozulmaz); `overwrite` flag ile dolu da tazelenir. `ConfirmBatchOptions.overwrite` + confirm route `body.overwrite` + import sayfası önizleme checkbox ("Mevcut dolu alanların üzerine yaz").
- **Elle düzeltme istisnası (kritik UX):** `user_corrections` (önizlemede elle değiştirilen alan) fill-empty'de bile her zaman uygulanır (explicit kullanıcı niyeti); yalnız dosyadan-otomatik değerler kısıtlanır.
- **`dbUpdateProduct` allow-list (advisor):** ham `.update(updates)` → `PRODUCT_UPDATE_ALLOWED_FIELDS` whitelist + undefined-drop (reserved/id/rastgele kolon yazılamaz; fill-empty undefined = "yazma").
- **Advisor carry-over giderildi:** klasik update'teki sabit kolonlar (unit/currency vb.) artık koşulsuz overwrite DEĞİL — fill-empty/overwrite kuralı altında.
- **Hata raporu:** confirm `errors[]` zaten satır+neden ("Satır N: SKU eksik / tip bulunamadı") üretip UI'da gösteriyor (mevcut, korundu).
- +13 test (fill-empty/overwrite/corrections/allow-list/wiring). tsc/lint/test/build temiz.

**Kapsam dışı (kullanıcı seçmedi):** "clear/temizle" niyeti; alan-bazında koru/yaz/temizle UI; tam-atomik (ya hep ya hiç) RPC — mevcut per-row + net rapor yeterli görüldü. AI apply tarafı: teknik attributes zaten per-field review-onaylı (granular); core fill-empty (Faz A). Excel toplu akışı = fill-empty/overwrite toggle.

---

## Faz D — Katalogdan ürün görseli  ✅ TAMAMLANDI (pragmatik kapsam)

**Probe (advisor: varsayma, doğrula):** base image `node:20-alpine` + yalnız `libc6-compat`; görsel/PDF işleme deps'in HİÇBİRİ kurulu değil. `mupdf` (Artifex WASM, **native-dep yok**, ESM) Alpine'da teknik olarak uygulanabilir — ama tam-otomatik katalog→görsel→**ürün eşleme** büyük/deneysel (yeni WASM dep + Dockerfile + bundle + AI eşleme doğruluğu belirsiz).

**Kullanıcı kararı (AskUserQuestion):** Pragmatik — mevcut görsel akışını güçlendir; yeni ağır bağımlılık YOK.

**Mevcut (zaten çalışıyor):** "Görsel/doküman/sertifika ekle" işlemi (`product_documents` scope) → kullanıcı görsel(ler) yükler (DropZone `multiple`) → AI hedef ürünü eşler → `dbCreateAttachment` (kind=image) + `ensurePrimaryImageIfMissing` (ilk görsel = kapak/primary).

**Bu fazda yapılan (görünürlük/rehber):** `ai-import-operations` `product_documents` metni görsel+kapak vurgulu güçlendirildi (description/evidenceHint/safetyNote: "ilk görsel ürün kapak görseli olur", "katalogdaki görselleri kaydedip yükleyin", çoklu dosya); `import-guide` hedef haritası `product_document` → "Ürün Ekleri & Kapak Görseli" + primary açıklaması. +1 test.

### Faz D-POC — Tam-otomatik katalog→görsel (mupdf WASM)  ✅ UYGULANDI (2026-06-07)

**Kullanıcı kararı:** tam POC planı + uygula; görsel kapsamı **Hibrit** (AI bbox güvenliyse kırp, değilse tam sayfa; review önizleme + apply-onay güvenlik ağı).

**Fizibilite probe (gate):** `mupdf@1.27.0` (MuPDF.js, WASM, native-dep yok) lokalde render+crop doğrulandı (tam sayfa + DrawDevice clip → geçerli PNG). Build: `serverExternalPackages:["mupdf"]` + `outputFileTracingIncludes` → wasm standalone'a doğru konuma trace edildi (`import.meta.url` node_modules'ı gösterir; external stub runtime'da yükler). **Alpine/musl runtime smoke = Coolify deploy'da** (WASM mimari-bağımsız, düşük risk).

**Pipeline:** `pdf-render.ts` (`renderPdfPageToPng` lazy mupdf import + `pickRenderClip` saf hibrit eşik 0.6) · `ai-service` extraction `source_page`+`image_region` (yalnız PDF prompt) · migration **086** (`source_page`/`image_region` kolonları) · lazy `GET .../lines/[lineId]/preview-image` (storage'a yazmaz) · apply'da product satırında render→`dbCreateAttachment(kind=image)`→`ensurePrimaryImageIfMissing` (NON-FATAL, görsel hatası ürün yazımını bozmaz) · `ExtractionReview` per-satır "📷 Katalog görseli" önizleme + apply özeti `images_extracted`.

**Mevcut altyapı yeniden kullanıldı:** `dbCreateAttachment` (3-adım orphan-safe), `ensurePrimaryImageIfMissing`, storage download (apply'da bir kez).

**+39 test** (pdf-render render+crop+clip / parse source_page+image_region / apply image-attach+non-fatal+no-op-görsel / preview-route 400/404/502/200 / extract persist / UI source-regression / extraction cardinality+max_tokens kuralı). tsc 0 · lint 0 · 4757→4796 test · build 0 (wasm trace doğrulandı). **Migration 086 KULLANICI UYGULAR (push öncesi).**

**CANLI PROBE (gerçek key + gerçek PMT datasheet, salt-okuma):** mupdf gerçek katalog PDF'ini render etti (A4 1190×1686 @2x, kırpma çalışıyor). Gerçek Claude extraction'ı çağrıldı → **iki bulgu:**

1. **Pre-existing truncation bug:** `max_tokens` zengin attributes+evidence+bbox ile dolup JSON'u truncate ediyordu → parse 0 ürün. Tüm katalog extraction'ını etkiliyordu, mock'lu testler göremezdi.

2. **Granülarite kararı (advisor + canlı `products` doğrulaması):** İlk fix denemem "ölçü tablosu = tek modele topla" idi ama canlı veri PMT'nin **DN/basınç/malzeme bazında ayrı ürün** tuttuğunu gösterdi (`KV-3P-DN50-PN40-CF8M` ≠ `KV-3P-DN80-300LB-WCB`; 9/7 DN-spesifik SKU). Toplama kuralı **under-extract** ederdi. **Kullanıcı kararı:** PMT modeline hizala — cardinality prompt'u "PMT DN/basınç/malzeme bazında ayrı ürün tutar; gerçekten farklı varyantları AYRI çıkar AMA satır UYDURMA/ÇOĞALTMA" şeklinde yumuşatıldı. Bu Faz A/B production extraction'ını da etkiler (doğru yönde).

**FIX:** `max_tokens` 4096→**16384** (per-DN granülarite gerçek datasheet'te 14-17 meşru ürün üretti; 4096 ve 8192 truncate ediyordu).

**Re-probe #2 (yumuşatılmış kural, gerçek key, salt-okuma) — DOĞRULANDI:** GLOB VALF datasheet → **17 temiz ürün** (`stop_reason=end_turn`, truncation YOK), PMT-doğru per-DN: DN15/20/25/32/40/50 × CLASS 800 (SW+Threaded) × CLASS 1500 (SW), her biri Vana tipine bağlı + zengin teknik attributes (dn/pn_class/valve_type/end_connection/body_material/max_pressure_bar/face_to_face_mm). bbox hibrit doğru: datasheet'te 2-3 ürün fotoğrafı var → AI yalnız onlara güvenli bbox verdi (kırpılır), kalan boyut-varyantları `image_region:null` → tam sayfa fallback (tasarlandığı gibi). İlk probe'da kırpılmış görsel gözle doğrulandı = gerçek valf fotoğrafı.

**Bilinen sınırlar (dürüst):**
- **null SKU (dominant pratik sınır):** datasheet'ler model/spec verir, SKU değil → 17 ürünün hepsi `sku=null`. `buildCreateProductInput` boş SKU'da "SKU eksik" fırlatır → **bu datasheet'ten yeni ürün açma yolu 17 üründe de per-row hata verir** (çökmez, raporlanır). "Katalog→yeni ürün→otomatik kapak" vizyonu SKU kaynağı gerektirir: (a) eşleşen ürün yolu görseli sorunsuz ekler, (b) Excel şablonu (Faz B) SKU kolonu taşır, (c) kullanıcı review'da SKU girer / (d) AI-SKU üretimi = ayrı tur. **POC bunu ölçüp ortaya çıkardı.**
- **source_page** yalnız tek-sayfa datasheet'te kanıtlandı; çok-sayfalı sayfa-atfı doğrulanmadı.
- **Büyük fiyat listesi (50+ SKU)** 16384'ü de aşabilir → sayfalama ayrı tur (POC kapsamı tipik 1-2 sayfa datasheet).
- **Alpine/musl runtime smoke** yalnız Coolify deploy'da (WASM mimari-bağımsız, düşük risk).

**Önceki pragmatik tur (görünürlük):** `ai-import-operations` `product_documents` + `import-guide` görsel→kapak metinleri güçlendirilmişti (korundu); bu POC tam-otomatik katalog→render→kapak zincirini ekledi.

---

## Notlar
- Finansal alanlar (`price`/`cost_price`) tüm fazlarda yetki+onay kapısının arkasında kalır.
- Stok (`on_hand`) ürün master-data akışından güncellenmez (domain kuralı; ayrı Stok Sayım/Hareket işlemi) — bu bilinçli, fazlarda değiştirilmez.
- Her faz: tsc 0 · lint 0 · vitest yeşil · build 0; migration varsa kullanıcı apply eder; iki branch birebir-ayna push.
