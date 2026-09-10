# Dokunma tabanı + kalan yedi borç — 2026-09-10

**Kapsam:** 2026-09-08 `QuoteForm` turunun beş gerekçeli ertelemesi +
`deferred_backlog` §A5 (Developer Console mobil) ve §A6 artığı (30–43px bandı).
Kullanıcı: *"bu kalan işlerin hepsini detaylı planla ve kapat"*.

**Sonuç:** yedi maddenin yedisi kapandı; ölçüm planda olmayan **dört** kusur
daha çıkardı ve onlar da kapandı. Migration YOK · RBAC YOK · veri yolu
değişikliği YOK — saf sunum.

---

## 1 — Ölçüm: kayıtlı üç sayının üçü de yanlıştı

`390×844 · 2 tema · 29 rota`, etkin kutu = eleman kutusu ∪ mutlak `::after`.
**Sınıf adına bakılmadı** (2026-08-31 ölçümü tam bunu yapıp 50 yanlış pozitif
üretmişti).

| kayıtlı | ölçülen |
|---|---|
| "36 kontrol 30–43px bandında" | **1664 kontrolün 584'ü** 44px altında |
| "geri bağlantısı 5 kopya" | **beş lehçe / 11 yüzey** |
| "Developer Console'da `tap-44` sıfır" | doğru — **ve konsol erişilebilir** (kayıtlı "kimseye açık değil" notu bayat) |

Tür dağılımı (44 altı): `field` 256 · `checkbox` 150 · `link` 142 · `button` 36.
`field` (input/select, 30–36px) **kullanıcı kararıyla kapsam dışı** — WCAG AA
tabanını (24px) zaten geçiyorlar ve büyütmek her formun dikey ritmini
değiştirirdi.

### Asıl bulgu: uygulamanın ANA GEZİNMESİ tabanın altındaydı

`.nav-rail-item` (Sidebar'ın 16 bağlantısı + Ayarlar rayı) **222×36, `::after`
YOK**. `tap-44` seçici listesi 2026-08-31'de yazılmıştı ama bu sınıf listeye
hiç girmedi — ve **ölçüm de göremedi, çünkü mobil çekmece KAPALIYKEN
ölçülüyordu**. Ayarlar rayı mobilde ayrıca 34px'e *indiriliyordu*.

*Bir envanter, ölçmediği durumu kapsayamaz.*

---

## 2 — Ölçüm aracı dört kez bulgu oldu

| # | bulgu |
|---|---|
| a | **Bekleme koşulu her zaman doğruydu.** İlk ölçüm `main`i bekliyordu; `main` anında var → altı rota YÜKLENMEDEN ölçüldü ve "0 başlık" raporlandı. Beşi yarıştı, **biri gerçek kusurdu** (`import/excel`). Bekleme React fiber + `networkidle`e bağlandı. |
| b | **Çakışma ölçüsü fazla kabaydı.** İlk sürüm iki ETKİN kutunun kesişmesine bakıyordu → 42 satır; çoğu iki düğmenin aradaki BOŞ oluğa taşmasıydı. Asıl kusur bir kutunun komşusunun **GÖRÜNÜR** dikdörtgenini örtmesi. Ölçü ona çevrildi. |
| c | **Kör nokta: çekmece.** Sidebar mobilde `display:none` olan masaüstü rayını değil, açılan çekmeceyi çiziyor. Ayrı probe gerekti. |
| d | **Ajan tahmini ölçümle çürüdü.** "DataTable satırları ~38px" statik bir tahmindi; ölçüm 75–94px verdi → `DataTable` düzeltmesi **gerekmedi**. |

---

## 3 — Planın bir varsayımı ölçümle çürüdü

Plan `::after` hit-area'sının `<input>` üzerinde çalışmadığını varsayıyor ve
sarmalayıcı `<label>` öngörüyordu. **Tarayıcıda `elementFromPoint` ile
ölçüldü:** 14px'lik checkbox'ın merkezinden 20px aşağıdaki tıklama hâlâ
input'a düşüyor.

Ara adım da kayda değer: `getComputedStyle(el, "::after")` kutuyu 44×44
gösteriyordu ama **hesaplanmış stil boyanmış demek değildir** — gerçek testi
isabet testi verdi.

Sonuç: 32 checkbox/radio doğrudan `className="tap-44"` aldı, yeni yardımcı
gerekmedi. *Bir varsayım, ölçülene kadar plandır.*

---

## 4 — Yapılanlar

### Geri gezinme → tek bileşen (kullanıcı kararı: buton dili)

YENİ `src/components/ui/BackLink.tsx` — `ButtonLink`i sürer, kendi rengini
yazmaz (`FilterChips` emsali). **11 yüzey, beş lehçe → bir dil.** `←` metin
oku `ArrowLeft` ikonuna döndü (ekran okuyucuda "sol ok" diye seslendiriliyordu).

| lehçe | ölçülen | yüzey |
|---|---|---|
| düz metin 13px | 65.3×**16** | `QuoteForm` · `quotes/[id]` · `product-types/[id]` ×2 |
| düz metin 12px | — | `products/[id]` · `purchase/orders/[id]` |
| elle ikon+metin | 129.3×**16.5** | `developer/errors/[id]` · `import/excel` |
| `ButtonLink` | 44 ✓ | `OrderForm` · `orders/[id]` · `products/aging` |
| boş-durum çıkışı | — | `purchase/orders/[id]` (çıkmazdan tek çıkış) |

### Merkezî hit-area

- **`.nav-rail-item`** → `tap-44` ailesine. Kutu tek başına yetmedi: bir
  gruptaki bağlantılar **bitişik**; 36px satıra 44px kutu → komşusuyla 8px
  çakışma. YENİ `.nav-rail-group` mobilde `gap: 8px` → merkez mesafesi tam 44,
  kutular değer ama kesişmez. **Görsel satır yüksekliği 36px KALDI.**
- **`Pagination`** → 32×32 düğmeler `tap-44`; numara satırı aralığı 4→12px
  (yan yana duruyorlar).
- **`Toast`** → kapat düğmesi + aksiyon bağlantısı.
- **`DataTable`** → **dokunulmadı**, ölçüm gerek olmadığını gösterdi.

### Developer Console (§A5)

Sekme şeridi `flexWrap: wrap`tı ve dar ekranda iki satır üretiyordu → 44px
kutular alt satırın görünür alanına giriyordu. **CSS yaması değil YERLEŞİM**
(2026-09-04'te `.tap-row-gap` tam bu yüzden silinmişti): YENİ
`.tab-strip-scroll` — nowrap + kendi kabında kayar, Ayarlar rayının mobil
dilinin aynısı. Ayrıca `logs` "temizle"/requestId, `errors/[id]` bug başlığı,
`developer` "Tümü →" (yerel `linkStyle` kopyası → ortak `.row-link`).

### Sarabilen kontrol satırları

Aksiyon düğmeleri **sarmak zorunda** (dar ekranda tek satıra sığmazlar; yatay
kaydırma bir AKSİYONU gizlemek olurdu). YENİ `.tap-wrap-row` — mobilde
`row-gap: 18px` (en küçük boy xs=26px + 18 = 44). Beş satırda uygulandı.

### Yapısal borçlar

| madde | yapılan |
|---|---|
| `/quotes/preview` başlıksız | araç çubuğundaki `{no · durum}` `<span>`ı **gerçek `<h1>`** (piksel farkı 0) + boş-durum başlığı; `HEADER_EXCEPTIONS`e gerekçeli girdi. `QuoteDocument` **baskı belgesi olarak muaf** (emsal `RfqDocument`). |
| **YENİ:** `/import/excel` h1'siz | 41 rota tarandı, tek başlıksız olan buydu ve başlığı tam olarak kapının YASAKLADIĞI imzayla yazılmıştı (`14px/600/--text-primary`) → `PageHeader` + `BackLink`. |
| `OrderForm`da `pageHeader` yok | `QuoteForm` ile **birebir** sözleşme (varsayılan `true`). Davranış değişmedi; kural taşıyıcı-bağımsız oldu. |
| Diyalog başlıklarının anlamsal rengi | `SectionHeader`a **`tone`** eklendi → `quotes/[id]` onay diyaloğu ve **`ConfirmModal`ın kendisi** ortak kaynağa girdi. |

---

## 5 — `SectionHeader.style`: sözleşme yorumdaydı, tipte açıktı

`style` prop'u 2026-09-05'ten beri "yalnız BOŞLUK" diyordu — ama yalnız
**yorumda**. Tip `CSSProperties`ti ve slot'suz çağrıda `style` en son
yayıldığı için tipografiyi ezebiliyordu.

Tip `SectionHeaderSpacing`e daraltılınca **beş çağrı yeri sözleşmeyi zaten
deliyordu:**

| dosya | sızdırdığı |
|---|---|
| `products/[id]:1033` | `color: --warning-text` |
| `AISummaryCard:377` | `color: --danger-text` |
| `ResetDemoSection:119` | `color: --danger-text` |
| `email-deliveries:247` | `lineHeight: 1.35` |
| `CalendarNoteDetailModal:44` | `lineHeight: 1.35` |

Üçü `tone`a (`danger`/`warning`) geçti. İkisi **aynı değeri bağımsız olarak
yazmıştı** → `dialog` varyantının kendi tipografisine indi
(`feedback_global_over_hardcode`).

**Ders: bir sözleşme yorumda yaşıyorsa, yaşamıyordur.**

### `ConfirmModal` — davranış değişikliği, gizlenmiyor

Ortak onay diyaloğu `tone="danger"` iken bile başlığı `--text-primary`
bırakıyordu; yıkıcılık işareti YALNIZ butondaydı. Artık ton başlığa da iniyor.
`tone` varsayılanı `"danger"` olduğu için aksini belirtmeyen her çağrı yeri
kırmızı başlık gösterir — **altı çağrı yerinin altısı da yıkıcı** (sil ·
pasife al · iptal et · retention temizliği), yani doğru sonuç. Ayrıca elle
yazılmış 13px/600 başlık `dialog` varyantına yakınsadı (16px/650).

---

## 6 — Kapı

| # | kural | dosya |
|---|---|---|
| K1 | gezinme rayı hit-area listesinde | `touch-targets` |
| K2 | ray grubu boşluğu 8px (çakışma) | `touch-targets` |
| K3 | sayfalama satırı aralığı 12px | `touch-targets` |
| K4 | her seçim kutusu 44'e bağlı | `touch-targets` |
| K5 | konsol şeridi sarmaz + kaydırır | `touch-targets` |
| K6 | `.tap-wrap-row` var ve kullanılıyor | `touch-targets` |
| K7 | elle geri bağlantısı kalmadı | `touch-targets` |
| K8 | `SectionHeader` rengi `style`la sızmaz | `form-consistency` |
| K9 | `ConfirmModal` tonu başlığa iner | `form-consistency` |
| K10 | her formun `pageHeader` kolu var | `form-consistency` |
| K11 | **başlıksız rota kalmaz — TÜM rotalar** | `surface-consistency` |
| K12 | taşıyıcı kapatma kolunu kullanır (taşıyıcı-bağımsız) | `form-consistency` |
| K13 | `preview` başlık kaynağı | `form-consistency` |
| K14 | konsol kontrolleri adıyla kilitli | `touch-targets` |

**14/14 kırmızı-kanıtlı.** Tur dört zayıflık yakaladı ve dördü de deponun
tekrarlayan derslerinin yeni yüzleriydi:

1. **K3 — desen komşusuna tutunuyordu.** `gap: "12px"` dosyada iki kez geçiyor;
   numara satırının aralığını 4px'e düşürdüm, kural yeşil kaldı. *Bir kaynak
   iddiası, iddia ettiği SINIRIN içinde kalmalı* — **6. tekrar**.
2. **K4 — kural boş kümeyi denetliyordu.** `<input[\s\S]{0,400}?/>` deseni
   **sıfır** eşleşme üretiyordu (gerçek etiketler 400 karakteri aşıyor). Her
   mutasyonda yeşil kalırdı. Etiket çıkarımı `{}` derinliği sayarak dengeli
   hale getirildi + `scanned >= 30` anti-vacuous kilidi.
3. **K14 — kural kendi gerekçesine tutundu.** Dosyanın yorumu "…`tap-44`
   ailesinde değildi" diyor; yorum soyulmadan sınıf silinse bile yeşil.
   **Aynı tuzağa 7. düşüş** → `stripSrcComments`.
4. **K14 — "en az bir dosya" bir sayı iddiasıydı.** Sekme şeridinin sınıfı
   silinince başka bir dosya sayıyı dolduruyordu. Kural adıyla kilitli kümeye
   çevrildi (2026-09-04 dersi).

Ayrıca **kapının kendi ayrıştırıcısı zayıftı:** `rules()` yorumları
virgülle bölünmüş parçalar üzerinde soyuyordu; virgül içeren çok satırlı bir
gerekçe yorumu seçici listesine yapışıyor ve ondan sonraki kural
`sels.includes(".x")` ile **hiç bulunamıyordu**. Yorumlar artık bölmeden önce
soyuluyor.

**Mutasyon da sınırın içine düşmeli** (3. kez): K13'ün ilk mutasyonu
`preview`in üç `<h1>`inden yalnız birini değiştirdi; dosya hâlâ manuel h1
taşıdığı için kural HAKLI olarak yeşil kaldı.

---

## 7 — Kapsam dışı, gerekçeli

- **`input`/`select` (30–36px, 256 hit)** — kullanıcı kararı; AA tabanını
  geçiyorlar, büyütmek her formun dikey ritmini değiştirirdi.
- **Yoğun tablo hücresi içindeki bağlantılar** (`product-types` satır başlığı
  16px, `purchase/orders` PO numarası 39.5px genişlik) — satırın kendisi
  tıklanabilir ya da satırda 44px'lik bir aksiyon butonu var; bu bağlantıları
  büyütmek **komşu SATIRIN görünür alanını** yerdi, yani `q-note-btn`
  dersinin tersine düşerdi.
- **Cümle içi düz yazı bağlantıları** (13–15px, 2 yüzey) — dokunma hedefi
  değil, metin.
- **`.seg button` genişliği** (36.1px) — segmentler bitişik; genişletmek
  komşusunun görünür alanına girer. Şerit bütün olarak tek hedef.
- **Baskı belgeleri** (`QuoteDocument` · `QuotePdfDocument` · `RfqDocument` ·
  `PurchaseOrderDocument`) ve landing/`gizlilik` — uygulama kabuğu değil.

---

## 8 — Doğrulama

| ölçüt | sonuç |
|---|---|
| `tsc` | 0 |
| `lint` | 0 |
| test | **501 dosya / 7017 test** |
| kırmızı-kanıt | **14/14** |
| migration | YOK |
