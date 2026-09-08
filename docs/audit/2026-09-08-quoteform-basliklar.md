# QuoteForm'un bölüm başlıkları — 2026-09-08

Faz B'nin 2026-09-05 kapanış kaydında tek bir madde açık bırakılmıştı:

> Kalan: `QuoteForm`un kendi bölüm başlıkları.

Bu tur onu kapatıyor. Ölçüm iki şey daha çıkardı: aynı sayfaların **h1'i yoktu**
(komşusunda ise İKİ tane vardı) ve **baskı stil sayfası elemana etiketle
bağlanmıştı** — dönüşümün kendisi onu sessizce kıracaktı.

---

## 1 — Sekiz başlık, sıfır başlık elemanı

`QuoteForm.tsx`te `<h1>`, `<h2>`, `<h3>` sayısı **sıfırdı**. Tarayıcı ölçümü
(`/dashboard/quotes/new`, 2 tema × {1440, 390}):

| | önce | sonra |
|---|---|---|
| `/quotes/new` | **h1=0 · toplam başlık=0** | h1=1 · toplam 8 |
| `/quotes/<id>` | h1=1 · toplam 1 | h1=1 · toplam 8 |
| seviye atlaması | 0 | 0 (8/8 ölçüm) |
| yatay taşma | 0 | 0 (8/8 ölçüm) |

Sonraki başlık ağacı (her iki sayfada da aynı):

```
H1  Yeni Teklif   /   TKL-2026-004
H2  Müşteri / Customer
H2  Teklif Detayları / Quote Details
H2  Line Items / Kalemler
H2  Delivery Method / Teslimat Şekli
H2  Payment Method / Ödeme Şekli
H2  Notes & Terms / Notlar
H2  Signatures / İmzalar
```

### Ölçülen imzalar (koyu tema, 1440)

| başlık | ÖNCE | SONRA | fark |
|---|---|---|---|
| Müşteri / Customer | `div` 10px/700 `#0072BC` ls .7px | `h2` 10px/700 `#0072BC` ls .7px | **yalnız etiket** |
| Teklif Detayları / Quote Details | `div` 10px/700 `#0072BC` ls .7px | `h2` 10px/700 `#0072BC` ls .7px | **yalnız etiket** |
| Line Items / Kalemler | `div` 11px/600 `--text-secondary` ls .66px | `h2` 11px/600 `--text-tertiary` ls .44px | renk 1 kademe, ls −.22px |
| Delivery Method | `div` 10px/600 ls .7px mb8 | `h2` 11px/600 ls .44px mb8 | +1px, ls −.26px |
| Payment Method | aynı | aynı | aynı |
| Notes & Terms | aynı | aynı | aynı |
| Signatures / İmzalar | `div` 10px/600 ls .7px mb12 | `h2` 11px/600 ls .44px mb12 | +1px, ls −.26px |

**Mavi ikili neden ortak bileşene GİTMEDİ:** `QuoteDocument.tsx`in
`metaSectionHeadStyle`ı (basılan PDF) aynı iki başlığı `C.brand` mavisiyle
çiziyor — form o belgenin **ekran aynası**. Griye çevirmek aynayı kırardı.
Kullanıcı kararı: mavi kalır, eleman gerçek `<h2>` olur, piksel farkı 0.
Kapının `H2_EXCEPTIONS` listesine gerekçeli iki satır girdi ve istisnanın
blanket olmaması için dar bir refakatçi kural yazıldı (bkz. §5).

**Dönüşmeyenler, bilerek:** meta ızgarasının 10px/700 BÜYÜK HARF `<div>`leri
(`Company / Firma Adı`, `Quote No / Teklif No` …) bölüm başlığı değil **form
etiketi** — girdilerinin yanında durur, erişilebilir ad zaten girdinin
`aria-label`ında. `th` tablo başlıkları ve `Satır n notu` `<label>`ı da başlık
değil.

### Diyalog başlığı

Gönder diyaloğunun adı (`aria-labelledby` hedefi) 13px/600 bir `<div>`di:
diyaloğun ADI olarak ilan ediliyor ama başlık elemanı değildi. Depodaki **on**
diyalog başlığı 2026-09-05'te `SectionHeader variant="dialog"`a taşınmıştı; bu
son kalıntıydı. 13px/600 → 16px/650 (`--font-heading-weight`) **bir sapma
değil yakınsama**.

---

## 2 — Sayfanın h1'i yoktu, komşusunda İKİ tane vardı

`/dashboard/quotes/new` yalnız `<QuoteForm enableInlineSend />` basıyordu;
formun tek "başlığı" **tıklanamaz** bir kırıntı çubuğuydu (`<span>Satış</span>
/ <span>Teklifler</span> / …`) ve hiçbiri bağlantı bile değildi.

`quotes/[id]` ise 2026-09-05'te `PageHeader` aldı ama formun kırıntısı
kaldırılmadı — **teklif numarası ve durum rozeti aynı ekranda iki kez**
çiziliyordu:

```
h1  TKL-2026-004   ● Gönderildi          ← sayfanın PageHeader'ı
────────────────────────────────────
    Satış / Teklifler / Teklif Detay
    [TKL-2026-004]  ● Gönderildi         ← formun kırıntısı — MÜKERRER
```

Bu, geçen turun kendi eklemesinin yan etkisiydi: `PageHeader` eklendi, altındaki
formun aynı bilgiyi bastığı görülmedi.

**Çözüm** — `QuoteForm`a `pageHeader?: boolean` (varsayılan `true`):

- `true` (`/quotes/new`): `← Teklifler` bağlantısı ayrı satırda, altında
  `PageHeader` — `title` = "Yeni Teklif" / "Teklif Düzenle" / "Teklif Detay",
  `titleAdornment` = numara çipi + durum rozeti, `actions` = buton grubu.
- `false` (`quotes/[id]` geçer): kırıntı + numara + rozet basılmaz, yalnız
  buton grubu kalır.

Varsayılanın `true` olması bilinçli: prop'u unutan yeni bir taşıyıcı
**başlıksız** değil, fazladan başlıklı kalır — sessiz erişilebilirlik kaybı
yerine gürültülü fazlalık. `enableInlineSend` bu iş için **yeniden
kullanılmadı**: bugün ikisi de yalnız `/quotes/new`de doğru ama biri gönderim
akışı, diğeri sayfa kabuğu.

**Kaldırılan tek görünür metin:** kırıntının `Satış` segmenti (tıklanamazdı).
`Teklifler` artık gerçek bir bağlantı — dönüşüm gezinmeyi azaltmadı, ekledi.
Diğer 19 kullanıcı-görünür dize tek tek arandı, hepsi yerinde.

### Ek: `OrderForm`un iki sayfası

Ölçüm sırasında kardeş formda da aynı kusur çıktı: `/orders/new` ve
`/orders/[id]/edit` sayfa başlığını 14px `<div>` olarak çiziyordu, h1 yoktu.
İki satırlık aynı düzeltme yapıldı (`orders/[id]` emsali: geri bağlantısı ayrı
satırda, altında `PageHeader`). Ölçüldü: `orders/new` h1=1, atlama 0, taşma 0.

Gerekçe kapı temizliği: §5'in yeni kuralı aksi hâlde **doğduğu gün**
`OrderForm` için bir istisna taşımak zorunda kalırdı.

---

## 3 — Bu turun asıl bulgusu: baskı seçicisi ETİKETE bağlanmıştı

`globals.css`, `@media print` bloğu:

```css
.q-meta-col > div:first-child { font-size: 7.5px !important; letter-spacing: 0.04em !important;
                               color: #0072BC !important; border-bottom-color: rgba(0,114,188,0.2) !important; }
```

`<div>` → `<h2>` dönüşümü bu seçiciyi **sessizce eşleşmez** hâle getiriyor.
Ölçüldü (`page.emulateMedia({ media: "print" })` — depoda baskı çıktısı bugüne
kadar HİÇ ölçülmemişti):

| | düzeltme ÖNCESİ (h2, eski seçici) | düzeltme SONRASI |
|---|---|---|
| `fontSize` | **10px** | 7.5px |
| `letterSpacing` | **0.7px** | 0.3px |
| `color` | **rgb(17,17,17)** (genel baskı sıfırlaması) | rgb(0,114,188) |
| `borderBottomColor` | **rgb(208,208,208)** | rgba(0,114,188,0.2) |

Yani marka mavisi baskıda tamamen düşüyordu. CI baskı almaz; kusur yeşil
kapıdan geçerdi. Seçiciler konuma bağlandı (`> :first-child`, `> :not(...)`) ve
`@media print` altındaki `.q-meta-col` seçicilerinin etiket adı taşıması kapıya
yasaklandı.

Kardeş seçici `> div:not(:first-child)` etkilenmiyordu — `h2` ilk çocuk olunca
alan satırları hâlâ "ilk olmayan div". Yine de tutarlılık için o da konuma
bağlandı.

**Ders:** *bir seçici, bağlandığı şeyin etiketinin değişmeyeceğini varsayamaz.*
Deponun "görünmek ≠ olmak" dersinin üçüncü yüzü: bu kez `<div>`i anlamlı bir
elemana yükseltmek, ona bağlı bir stili düşürüyordu.

---

## 4 — Ölçü aracının kendisi iki kez bulgu oldu

**(a) Bayat CSS bir sunucu yeniden başlatmasını atlattı.** Baskı ölçümü
düzeltmeden SONRA da 10px okudu. Sunucudan doğrudan `curl` ile çekilen CSS
chunk'ı hâlâ `> div:first-child` içeriyordu. `touch` işe yaramadı, dev
sunucusunu yeniden başlatmak işe yaramadı, `.next/dev/build` silmek işe
yaramadı — yalnız **`.next` tamamen silinince** taze CSS servis edildi. Yani
düzeltmenin çalışmadığını "ölçmüş" olmak, düzeltmenin çalışmadığı anlamına
gelmiyordu. Kural: bir CSS iddiasını ölçmeden önce servis edilen çıktıyı
doğrula.

**(b) Boşa giden mutasyon zayıf kuraldan ayırt edilemiyor — ikinci kez.**
K1'in ilk mutasyonu dosyadaki İLK `color: "#0072BC"` dizesini değiştirdi; o
dize `<h2>`de değil "TEKLİF | QUOTATION" bandındaydı. Kural haklı olarak yeşil
kaldı, koşucunun SHA denetimi de haklı olarak uyarmadı (dosya gerçekten
değişti). Mutasyon `<h2 ` öneki ile hedeflenince kural kırmızı yandı.
**Bir mutasyon, iddia ettiği sınırın içine düşmelidir** — kaynak
desenleri için öğrenilen dersin mutasyon tarafındaki karşılığı.

**(c) Derinlik sorunu.** İlk ölçüm probu adayları metin uzunluğuna göre
sıralıyordu; dönüşümden sonra `<h2>` ile sarmalayıcısının metni eşitlendi ve
prob sarmalayıcıyı okudu (14px/450 — sayfa varsayılanı). DOM derinliğine göre
sıralamayla düzeltildi.

---

## 5 — Kapı

`gate/form-consistency.test.ts` (+3 kural, +2 liste girdisi):

| kural | iddia | kırmızı-kanıt |
|---|---|---|
| `H2_EXCEPTIONS` += `QuoteForm.tsx` | belge ikizi muafiyeti, gerekçe ≥25 karakter | (mevcut kural, zaten kanıtlı) |
| **YENİ** — istisna BLANKET değil | dosyadaki **her** elle `<h2 style={` `#0072BC` taşımalı **ve** dosya `<SectionHeader` içermeli | K1 🔴 · K2 🔴 |
| `CONVERTED` += `QuoteForm.tsx` | BÜYÜK HARF `<div …marginBottom>` bölüm etiketi geri yazılamaz | K4 🔴 |
| **YENİ** — form h1 kaynağı | `QuoteForm` + `OrderForm` `PageHeader` basar ve ona `title` verir; taşıyıcının kendi başlığı varsa form kendininkini KAPATIR | K3 🔴 · K6 🔴 · K7 🔴 |

`gate/surface-consistency.test.ts` (+1 kural):

| kural | iddia | kırmızı-kanıt |
|---|---|---|
| **YENİ** — baskı seçicisi etikete bağlanamaz | `@media print` içindeki `.q-meta-col` seçicileri `div` niteleyicisi taşıyamaz (+ anti-vacuous: `> :first-child` gerçekten orada) | K5 🔴 |

`title` desenine yine `\s` sınırı kondu: `subtitle={` dizesi `title={`
desenini İÇERİYOR — **sınır dersinin 5. tekrarı**.

`GLOBALS` bu turda ilk kez `stripComments`ten geçirildi: yeni kuralın kendi
gerekçe yorumu yasakladığı deseni (`> div:first-child`) içeriyor.
*Kendi yorumun kuralı tetikler* tuzağı bu depoda altıncı kez.

---

## 6 — Plandan sapma (ölçümle gerekçeli)

Plan `quotes/[id]/page.tsx:533`teki `quote-confirm-dialog-title` `<div>`ini de
`SectionHeader variant="dialog"`a taşımayı öngörüyordu. **Yapılmadı.** Ölçüm
onun aynı vaka olmadığını gösterdi: bu başlık yıkıcı işlemlerde
`var(--danger-text)`e dönüyor, yani **anlamsal bir renk** taşıyor.
`SectionHeader` bunu modellemiyor ve `style` sözleşmesi (28 çağrının hepsinde
YALNIZ `margin*`) renk kaçışına açık değil.

Üstelik deponun kendi ortak `ConfirmModal`ı (`ui/Modal.tsx:124`) başlığını
`tone="danger"`da bile `--text-primary` bırakıyor ve tehlike sinyalini BUTON
varyantına yüklüyor — yani kanonik davranış kırmızı başlık değil. İki yüzey
(bu ve `ConfirmModal`ın kendi 15px/650 elle başlığı) ayrı bir "diyalog
başlıkları" turuna kayıt edildi.

---

## 7 — Doğrulama

| adım | sonuç |
|---|---|
| kaldırılan etiket denetimi | 20 dize tarandı; yalnız `Satış` (kasten) düştü |
| tarayıcı ölçümü 2 tema × {1440, 390} × 2 sayfa | 8/8 · seviye atlaması 0 · taşma 0 |
| `orders/new` ölçümü | h1=1 · atlama 0 · taşma 0 (2 genişlik) |
| **baskı medyası ölçümü (yeni araç)** | 7.5px · .3px · `#0072BC` · mavi ayraç ✅ |
| `tsc --noEmit` | 0 |
| `eslint src` | 0 |
| `vitest` | **501 dosya / 7010 test** (öncesi 7007) |
| `next build` | 0 uyarı |
| E2E `retries=0` | **94/94** |
| kırmızı-kanıt | 6/6 🔴 (K1 mutasyon hatası düzeltildikten sonra) |
| React Doctor | dokunulan dosyalarda YENİ sınıf yok; bulgular tümü önceden var |

---

## 8 — Kapsam dışı, kayıtlı

- **Baskı belgeleri** `QuoteDocument` (8px/.1em) · `PurchaseOrderDocument`
  (.1em) · `RfqDocument` (0.4) · `QuotePdfDocument` — üç ayrı başlık imzası;
  ortak bir "document" varyantı bugün **tek kullanıcılı** olurdu, yakınsama
  üretmez. Repo bunları zaten "uygulama kabuğu değil" diye muaf tutuyor.
- **Meta ızgarasının form etiketleri** — başlık değil etiket; kanonik
  `labelStyle()` de `textTransform` taşıyamıyor (kullanıcı kararı).
- **İki diyalog başlığı** (§6) — anlamsal renk taşıyor, ayrı tur.
- Migration yok · RBAC yok · veri yolu değişikliği yok.
