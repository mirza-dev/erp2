---
name: reference_quote_line_columns
description: Teklif satır tablosu kolon modeli + PMT ürün-adı/size_text ilişkisi (Ölçü kolonu neden kaldırıldı)
metadata: 
  node_type: memory
  type: project
  originSessionId: 3db100be-70e2-404d-9834-ee5b61f72929
---

Teklif satır tablosunun kolon modeli ve **niçin** böyle olduğu (regresyon önleme):

**PMT katalog gerçeği:** Ürün **adı zaten DN + basınç sınıfını içerir** — ör.
`name: "Küresel Vana Class 600 DN20 A105 SW"`, `"Dövme Gate Valf 800LB DN25 A105 NPT"`.
`buildQuoteLineDescription` (src/lib/quote-description-builder.ts) açıklamayı **ürün
adıyla başlatır** → DN açıklamada zaten görünür. Bu yüzden `size_text` ("DN20·CL600")
**redundant** — ürün adının tekrarı.

**Karar (kullanıcı, 2026-06-16): "Ölçü (Size) kolonu KALDIRILDI"** — form + HTML belge +
PDF. Açıklamaya GÖMÜLMEZ de (çift yazım olur). Gelecekte tekrar Ölçü kolonu/spec alanı
EKLEME. `size_text` veri alanı dormant korunur (auto-fill/payload/RPC/mapper hattı sürer,
migration yok), yalnız **görüntülenmez**.

**İki eksen — semantik (karıştırma):**
- **Birim** (`unit`, mig.099) = miktarın ölçüsü ("10 adet"); katalogda neredeyse hep "adet".
- **Ölçü** (`size_text`, DN50) = ürün kimliği/spec → ürün adında zaten var → kolon YOK.
- **Ağırlık** (`weight_kg`) = **kolon TAMAMEN KALDIRILDI** (2026-06-16, kullanıcı): birim
  zaten karşılıyor (kg seçilirse miktar kütle; adet seçilirse ağırlık gereksiz). Toplam
  Ağırlık satırı da kaldırıldı. `isWeightBasedUnit` helper + "Ağırlık" toggle + form kg
  input + handleKgChange SİLİNDİ. weight_kg veri hattı dormant (auto qty×unitWeightKg,
  payload/RPC sürer; migration yok). Gelecekte Ağırlık kolonu tekrar EKLEME.

**Kolon yapısı (üç yüzey aynı, SABİT):** #, Kod, Lead, Açıklama, Miktar+Birim, Birim Fiyat,
Toplam, GTİP. Form'da ek "İşlemler" kolonu. colSpan sabit (`baseCols=8` belge /
`formBaseCols=9` form). Ne Ölçü ne Ağırlık kolonu var. İlişkili: [[project_quotes]].
