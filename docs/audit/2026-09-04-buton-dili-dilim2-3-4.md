# Buton dili — Dilim 2·3·4 (satınalma · ayarlar · dağınık)

_2026-09-04 · migration YOK · davranış değişikliği YOK (saf sunum)_

Dilim 1 (`b780f5e`, Veri Aktarım sihirbazı) sonrası kullanıcı "kalanlarla devam
et" dedi. Bu tur kalan üç dilimi kapatıyor + iki yeni kapsam kararını uyguluyor.

## Sonuç

**Elle örülmüş `<button>`: 101 → 60** (bu turda 41 dönüşüm; Dilim 1 ile birlikte
127 → 60). **Buton görünümlü `<Link>`: 3 → 1.**

Kalan 60'ın tamamı bilinçli dışarıda bırakılan kümede: altyapı (`Toast` ·
`Pagination` · `DemoBanner` · `Topbar` · `ThemeToggle` · `Sidebar`), `login`
(referansın kendisi), 3 hata sınırı, `.seg` dönem segmenti, Ayarlar'ın dikey
nav şeridi, dosya-bırakma alanı, bildirim toggle anahtarı, menü bileşenleri,
anlam taşıyan rozetler ve satır içi bağlantı-benzeri metinler.

## İki kapsam kararı (kullanıcı, bu tur)

### Karar 1 — panel sekmeleri de beyaz/mavi dile geçti

2026-08-31 turu `aria-controls`'lu panel sekmelerini *bilerek* dışarıda
bırakmıştı ("alt çizgili kalması doğrudur"). Kullanıcı bu kararı tersine
çevirdi: kullanıcı gözüyle onlar da kategori.

- `purchase/rfqs/[id]` sekmeleri → `FilterChips` (bu sekmelerin **hiç** tab
  semantiği yoktu, rolsüz düz düğmelerdi — bileşen `tablist`/`tab`'i de getirdi).
- `products/[id]` sekmeleri → işaretleme **elde kaldı** (`role="tab"` +
  `aria-controls` panel bağı için gerekli; `FilterChips` `aria-controls`
  üretmiyor), yalnız **yüzey** `Button`'dan geliyor. Alt çizgi şeridi kalktı:
  hap çipiyle birlikte iki ayrı aktiflik göstergesi olurdu.

`gate/surface-consistency`'deki muafiyetin **gerekçesi yeniden yazıldı** ve
ayrı bir kural eklendi: muaf sekmeler de `Button` varyantından beslenmek zorunda.

### Karar 2 — ikon-only kontroller `Button`'a geçti

**Uygulamada inceltildi:** `icon` varyantı `--border-tertiary` kenarlık çiziyor.
Körlemesine uygulamak, bugün kenarlıksız duran ikonların görünümünü değiştirirdi.
Kural: **kenarlıklı olan → `icon`, kenarlıksız olan → `ghost`**. İkisi de
`tap-44` kazanıyor, görünüm korunuyor.

Ölçüldü (ürün tipi detayı, 1440px): ikon kutuları **28→26px**, satır yüksekliği
**109px** — satırı ikon kutusu belirlemiyor, 2px'lik küçülme hiçbir şeyi
kaydırmadı. Yatay taşma 0.

## Silinen üç yerel lehçe

| helper | yer | neydi |
|---|---|---|
| `btn()` | `purchase/rfqs/[id]` | **altıncı** buton lehçesi; kendi `"primary" \| "ghost" \| "danger"` mini varyant sistemi. `ghost` adı yanıltıcıydı — şeffaf değil, **bordürlü beyaz** butonun ta kendisi (`secondary`). |
| `iconButtonStyle` | `settings/product-types/[id]` | 28×28 kenarlıklı ikon kutusu |
| `.tap-row-gap` | `globals.css` | sarma kaynaklı hit-alanı çakışması yaması |

`.tap-row-gap`'in silinmesi bir **kural değişimi**: sorunu CSS yamasıyla değil
yerleşimle çözüyoruz artık. Tek çip-satırı üreticisi `FilterChips` ve o
**sarmıyor** (`nowrap` + `overflow-x: auto`) → ikinci satır hiç oluşmaz, kusur
yapısal olarak imkânsız. `nowrap` bileşende **açıkça** yazıldı (flex varsayılanı
zaten buydu ama örtük kalırsa kilitlenemiyordu) ve `gate/touch-targets` bunu
arıyor. Ölçüm (390px, eskime filtresi): **6/6 çip 44×44, gövde taşması 0**.

## Çip lehçeleri — üçü de karara bağlandı

| yer | karar |
|---|---|
| `products/aging` (sayaçlı filtre) | `FilterChips` |
| `products/page` kategori tetikleyicisi | açılır menü tetikleyicisi — `Button` varyantı (aktif mavi/pasif beyaz); elle `onMouseEnter/Leave` DOM mutasyonu da kalktı |
| `developer/logs` kaynak filtreleri | **ÇOK SEÇİMLİ** (`aria-pressed`, bağımsız açılıp kapanıyor) → `FilterChips` DEĞİL (o tek seçimli tablist üretir), ama palet aynı: `variant={active ? "primary" : "secondary"}` |
| `DynamicFieldEdit`, `NoteFormModal` | **dokunulmadı** — form kontrolü, filtre değil |
| Paraşüt log filtreleri | **dokunulmadı** — bilinçli dikey liste (2026-08-31 kaydı) |

## Bilerek dokunulmayan iki yüzey

- **`PurchaseOrderDocument` araç çubuğu** — sayfa **tema-muaf baskı yüzeyi**
  (`#eee` kâğıt zemin, sabit hex'ler; `reference_theming`'de kayıtlı istisna).
  Temaya duyarlı `Button` oraya yanlış olur: koyu temada kalıcı açık kâğıdın
  üstünde koyu buton çıkardı.
- **`DosyalarTab` silme ikonu** — `.file-action-btn.is-danger` hover'da kırmızı
  veriyor (yıkıcı aksiyon işareti). `Button`'da karşılığı olan varyant **yok**:
  `ghost` nötr hover, `dangerSoft` sürekli kırmızı dolgu — satır ikonunda ikisi
  de yanlış. Sinyali kaybetmemek için sınıf korundu; ihtiyaç backlog'a yazıldı.
  (Önizle/İndir `ghost`'a geçti.)

## Doğrulama — hesaplanmış stil, referans canlı DOM'dan

| | referans (aydınlık / koyu) | dönüşen |
|---|---|---|
| primary | `rgb(31,96,157)→rgb(18,63,115)` / `rgb(103,179,255)→rgb(74,152,245)` | eskime aktif çipi ✓ · ürün panel sekmesi ✓ · "Raporu yazdır" ✓ |
| secondary | `rgb(255,255,255)→rgb(244,247,250)` / `rgba(255,255,255,.075)→rgba(255,255,255,.035)` | eskime pasif çipi ✓ · pasif panel sekmesi ✓ |

Hepsi `tap-44`; yatay taşma 0.

## Kapı

`button-source-regression`'a Dilim 2·3·4 pozitif benimseme kilidi;
`surface-consistency`'ye panel-sekmesi kuralı; `touch-targets`'ta sarma kuralı
`FilterChips` garantisiyle değiştirildi. **7/7 kırmızı kanıtlı** (dosya-başına
yedek + SHA-256 geri yükleme).

## Dersler

1. **Dinamik içerik dönüşümde sessizce düşebiliyor — iki kez oldu.** Öneriler'de
   `({acceptedAndEditedCount})`, Paraşüt'te `(n/3)` deneme sayacı. İkisi de
   yakalandı çünkü dönüşüm sonrası **kaldırılan her etiketi yeni kodda arayan**
   bir denetim koştum. Bu adım dönüşüm turlarının parçası olmalı.
2. **Kaynak-kilidi testleri "en az N tane olmalı" dememeli.** `production-ui`
   "en az bir `<button>`" diyordu; hepsi `Button`'a geçince kırıldı. O iddia
   değişmezi değil o günkü sayıyı kilitliyordu — kural "varsa `type` taşımalı"
   olarak korundu.
3. **Bir CSS yaması silinirken yerine geçen garanti kilitlenmeli.**
   `.tap-row-gap` kaldırıldı ama `FilterChips`'in `nowrap`'i açıkça yazılıp
   kapıya bağlandı; yoksa koruma sessizce kaybolurdu.

## Kalan

Topbar 390px taşması (§A7) · `Button`'da ghost-danger varyantı ihtiyacı ·
A4 Developer Console URL filtreleri.
