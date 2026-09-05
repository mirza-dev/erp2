# Faz B'nin son üç bileşeni: `SectionHeader` · `NavLink` · `Stat`

_2026-09-05 · GREEN · migration YOK · saf sunum/istemci_

Kullanıcı "üç bileşeni de yapalım" dedi. Faz B'nin liste tarafı 2026-08'de
(7/7), diyalog tarafı 2026-08-30 (`Modal`, 9 diyalog) ve 2026-09-05 (`Drawer`,
7 çekmece) turlarında kapanmıştı. Bu tur **Faz B'yi bitiriyor**.

## Ölçüm — üç kayıtlı sayının ÜÇÜ DE düşüktü

| | kayıtlı | ölçülen |
|---|---|---|
| `SectionHeader` | ~45 çağrı / 6 varyant | **85 çağrı / 42 varyant** (41 `<h2>` × 13 tipografi + 44 BÜYÜK HARF etiket × 29) |
| `NavLink` | 3 yüzey, 2 birleşebilir | **3 yüzey — eksenler ÇAPRAZ** |
| `Stat` | 2 bileşen + ~28 elle / 9 varyant | **3 paylaşılan + 7 dosya-yerel + 26 elle / 20 değer tipografisi** |

Kayıtlı sayılar bir önceki turun *ön taraması*ndan geliyordu. Ders, çekmece
turunun dersinin tekrarı: **ön tarama envanter değildir.**

---

## Dilim 1 — `NavLink` (`4745cae`)

### İki eksen çaprazlanıyor

| | Sidebar | Ayarlar şeridi | Developer sekmeleri |
|---|---|---|---|
| öğe | `<Link>` ×16 (operatörde 18) | `<button>` ×7 | `<Link>` ×6 |
| görsel dil | ray | **ray — birebir aynı üç token** | alt çizgi (nav token'ı HİÇ kullanmaz) |
| aktif hesabı | `usePathname` + `exact ? === : startsWith` | `activeTab` state | **aynı ifade, BİREBİR ikinci kopya** |
| hover | **DOM MUTASYONU** (6 atama) | CSS | yok |
| `aria-current` | **YOK** | var | var |

Görsel eksende ikili **Sidebar+Ayarlar**, mantık ekseninde **Sidebar+Developer**.
Tek bileşen üçünü kapsayamaz → iki eksen ayrı ayrı çözüldü.

### Asıl kusur: a11y

Sidebar'ın 16-18 bağlantısında aktif durum ekran okuyucuya **hiç
bildirilmiyordu**. Altı işaret vardı — zemin · metin rengi · kenarlık ·
kalınlık · 2px şerit · ikon opaklığı — ve **altısı da yalnız görseldi**.

### Altı ölçü kayması, her birinde ölçüme dayalı bir kazanan

| ölçü | Sidebar | Ayarlar | kazanan | gerekçe |
|---|---|---|---|---|
| min-height | 36px | 38px | **36** | 38px'te 16 öğelik ray 900px'e sığmıyor |
| şerit içeriden | 7px | 8px | **7** | 36+7 ile 38+8 AYNI 22px şeridi veriyor |
| padding | `0 9px 0 10px` | `0 10px 0 12px` | **Ayarlar** | sol 12px, `left:0`daki şeride 10px nefes |
| gap | 10px | 9px | **9** | |
| ikon opaklığı | 0.72 | 0.92 | **0.92** | 0.72 pasif ikonu ikinci kez soluklaştırıyordu |
| hover kenarlığı | var | yok | **yok** | kenarlık AKTİFLİĞİN işareti olmalı |

Izgara değil **flex**: Ayarlar'ın `18px minmax(0,1fr) 8px` ızgarası sondaki
kolonu 8px'e sabitliyordu, Sidebar'ın sayaç rozeti ise değişken genişlikte.

### Doğrulama — 8 tarayıcı ölçümü (2 yüzey × 2 tema × {1440, 390})

1440'ta iki yüzey **birebir aynı**: h=36 · `0 10px 0 12px` · gap 9 · r 7 ·
fs 13 · fw 650/500 · şerit 2px/7/7. `aria-current="page"` her yüzeyde tam 1
adet. Ayarlar mobilde kendi yatay çip dilini koruyor (h=34, `0 11px`). Taşma 0.

---

## Dilim 2 — `SectionHeader` (`b05f23d`)

### Görünmek ≠ olmak

Drawer turunun **"ilan etmek ≠ davranmak"** dersinin tersten hâli: orada
işaretleme vardı davranış yoktu, burada **görünüm vardı işaretleme yoktu**.
44 bölüm etiketi (`"Genel Bilgiler"`, `"Ticari Süreç"`, `"Stok Yönetimi"`…)
`<div>` olarak yazılmıştı.

**Ölçülen sonuç: `orders/[id]` ve `quotes/[id]` sayfalarının h1/h2/h3 sayısı
SIFIRDI.** Uygulamanın en çok kullanılan iki detay sayfasında ekran
okuyucuyla başlıktan başlığa gezinmek mümkün değildi. Sipariş numarası
`<span style={{fontSize:"20px",fontWeight:700}}>` olarak çiziliyordu: görsel
başlık, semantik hiçbir şey.

### Dört rakip kanon, ikisi AYNI DOSYADA

| kaynak | çağrı | not |
|---|---|---|
| `settings/page.tsx:66` `const sectionTitle` | 7 | mb 12px |
| `settings/page.tsx:1362` `function SectionHeader` | 3 | mb 6px + mt 20px — **aynı dosya** |
| `products/[id]:159` `sectionTitleStyle` | 9 | alt çizgili |
| `console-ui.ts:22` `sectionTitle` | 12 | `<h2>`, kapı korumalı |

Üçü silindi; dördüncüsü tipografiyi bıraktı ve yalnız konsola özgü **oluk**
olarak kaldı (`sectionTitlePad`).

### Üç rol, üç ölçek

`label` (kartın İÇİNDEKİ alan grubu) · `title` (kartın KENDİSİ) · `dialog`
(diyalog adı, `aria-labelledby` hedefi). Kanonik değerler ölçülen dağılımın
tepesinden (69 blok): `11px`=38 · `--text-tertiary`=55 · `0.04em`=33 ·
`mb 10px`=9. Ağırlık için **sayı değil token** (600 ile 700 sayıca başabaştı).

**`Input.tsx`'in `labelStyle()`ından TÜRETİLMEDİ**: `form-consistency` o
yardımcının `textTransform` taşımamasını kilitliyor (kullanıcı kararı, Türkçe
uzun form etiketleri) ve bölüm etiketi ayrı bir roldür.

### Doğrulama — 16 rota×tema + 4 detay sayfası

- `orders/[id]` **sıfır başlıktan dörde** (Müşteri · Sipariş Bilgisi · Ticari
  Süreç · Lojistik; beşincisi yalnız sevk edilmişte çizilir)
- **seviye atlaması 0/16** · yatay taşma 0/16
- tipografi imzası **42 varyanttan 4'e**: h1 20px/600 (`PageHeader`,
  dokunulmadı) · h2 11px/600/uppercase · h2 13px/650 · h2 18px/650
  (`.settings-content-header`, belgelenmiş istisna)
- kaldırılan etiket denetimi: 39 aday, **kayıp yok**

77 çağrı / 29 dosya. 37 `style` kaçış kapısı — hepsi boşluk istisnası.

---

## Dilim 3 — `Stat` (`497d717`)

### Kapının kanıtladığı kusur, kapının BAKMADIĞI yerde

**Beş stat yüzeyi** (`aging` · `products/[id]` · `import/excel` ·
`CustomerDetailPanel` · `VendorDetailPanel`) kutu zemini olarak
`--bg-secondary` kullanıyordu. `gate/surface-consistency`in kendi *"kuralın
DAYANAĞI"* testi bu token'ın **iki temada da `--app-bg` ile birebir aynı**
olduğunu zaten kanıtlıyor → **görünmez kutu**. Kapı bu kusuru 2026-08-31'de
bulup düzeltti ama yalnız **beş sayfalık bir allowlist** üzerinde; bu beşi
listenin dışında kaldığı için o günden beri kusurluydular.

### Kanonik değerler

değer `21px` + `--font-heading-weight` + **`tabular-nums` HER ZAMAN**
(ızgarada alt alta duran sayılar hizalanmalı; yüzeylerin çoğunda yoktu) ·
etiket `11px`/`--text-tertiary`, **BÜYÜK HARF YOK** (26 yüzeyin yalnız 6'sı) ·
yüzey `Card` · dolgu `12px 14px`.

**`0` ölçülmüş bir değerdir** — falsy kontrolü yapılsaydı sıfır stok "—" olurdu.

### Ton haritası 4 kopya → 1

Aynı ton→token eşlemesi `Badge` · `ConsoleWidgets.VALUE_COLOR` ·
`StatsCards.subtitleColors` · `KpiCard.subColor`'a dağılmıştı.
`Badge.TONE_TOKENS` export edildi.

### Taşınanlar

34 doğrudan çağrı + 5 dosya-yerel bileşen sarmalayıcıya indi (`MetricCard`
17 çağrı · `Metric` ×2 = 9 · `SummaryCard` 5 · `StatBox` ·
`AlertCalendarDrawer.Stat`) — **çağıran sözleşmeleri değişmedi**.

### Doğrulama — 12 tarayıcı ölçümü (6 rota × 2 tema)

- kutu zemini iki temada da sayfa zemininden **ayrışıyor**
  (`#131518`→`#1a1d23`, `#e8eef5`→`#ffffff`)
- tek yüzey reçetesi (8px + `--surface-shadow-sm`), 9 reçeteden
- değer tipografisi **20 varyanttan 1'e**: `21px/650/tabular-nums`
- taşma 0 · kaldırılan etiket denetimi: 12 aday, kayıp yok

---

## Görünür yakınsamalar — gizlenmiyor

| değişiklik | nerede |
|---|---|
| Beş yüzeyin kutusu görünür oldu | `aging` · `products/[id]` · `import/excel` · Customer/Vendor panelleri |
| `MetricCard` yarıçapı 9px → 8px | konsol, 17 örnek |
| `SummaryCard` değeri 14px → 21px | `purchase/orders/[id]`, ölçümdeki en küçük değer tipografisiydi |
| `AlertCalendarDrawer` etiketi alttan üste + BÜYÜK HARF düştü | uyarı çekmecesi |
| `product-types` `Metric` ikonu sağdan sola + BÜYÜK HARF düştü | 5 örnek |
| Sidebar öğesi 36px'te kaldı, dolgu/gap/ikon opaklığı Ayarlar'a hizalandı | sol ray |

---

## Kapı

| dosya | ne eklendi |
|---|---|
| `gate/surface-consistency` | **4 nav kuralı** (aktif durum bildirimi · aktif-rota ifadesi tek kaynak · ray görünümü CSS'te · DOM mutasyonu KÜMESİ) + **3 stat kuralı** (yapı kilidi · stat yüzeyleri · değer tipografisi + ton haritası) |
| `gate/form-consistency` | **4 başlık kuralı** — `<h1>`in kapısı vardı, `<h2>` için **hiç yoktu** ve eski tarama yalnız `src/app`e bakıyordu |
| `gate/console-consistency` | `sectionTitle` kuralı **ada değil tipografiye** bağlandı (yeniden adlandırma sonrası boşa çalışıyordu) + küme iddiasıyla anti-vacuous eş kural |
| YENİ `ui/nav-link.test.tsx` · `ui/section-header.test.tsx` · `ui/stat.test.tsx` | 15 + 15 + 17 davranış testi, **gerçek render** |

**18/18 kırmızı-kanıtlı.**

### Öngörülen kırılma geldi

`surface-consistency`in sayı kilidi (`Paraşüt >= 7`, `Öneriler >= 3`) `Stat`
çıkarımıyla kırıldı: **Öneriler'in üç literalinin üçü de stat kutusuydu**
(3→0), Paraşüt 7→6. Kural, deponun kendi dersinin (*"`>= N` o günün sayısını
kilitler, DEĞİŞMEZİ değil"*) karşı örneğiydi — yorumu bile *"Ölçülen kusurun
tam sayısı"* diyordu — ve **düzeltmeyi kusur sandı**. Yapı iddiasına çevrildi.

Aynı kuralda **ikinci kusur**: `read()` çağrılıyordu, `stripComments` **yoktu**
(bir üstündeki kuralda var). Yorumdaki bir `var(--surface-raised)` metni
iddiayı yeşil tutabilirdi.

---

## React Doctor — yedinci kez, ama bu kez temiz

Dokunulan **50 dosyada 260 → 262**. İki yeni bulgu da `only-export-components`
ve **ikisi de birleştirmenin mekanizması** (`Badge`→`TONE_TOKENS`,
`NavLink`→`isActiveHref`). Depoda **7 emsali** var, `Input.tsx` dahil (aynı
kalıp: bileşen + stil yardımcısı aynı dosyada).

---

## Dersler

1. **Görünmek ≠ olmak.** Drawer turu "bir yüzeyin diyalog İLAN etmesi, diyalog
   gibi DAVRANDIĞI anlamına gelmez" demişti. Bunun tersi de doğru: **başlık
   gibi görünmek, başlık OLMAK anlamına gelmez.** 44 etiket `<div>`di ve iki
   sayfanın erişilebilirlik ağacı tamamen düzdü.
2. **Bir kapı, yalnız BAKTIĞI yerde koruma sağlar.** `--bg-secondary`nin
   görünmez kutu ürettiği 2026-08-31'de kanıtlanmıştı ve kural yazılmıştı — ama
   beş sayfalık bir allowlist üzerinde. Aynı kusuru taşıyan beş yüzey listenin
   dışındaydı ve **kapı yeşil yanmaya devam etti**. Kanıtı olan bir kuralın
   KAPSAMI da kanıtlanmalı.
3. **Bir kural iddia ettiğinden fazlasını söylememeli.** İlk yazdığım negatif
   stat kuralı "oyuk zeminli yuvarlak kutu" arıyordu ve sekme şeridini, tablo
   sarmalayıcısını, çekmece bölüm kutusunu da yakaladı. **Stat imzasına**
   (oyuk zemin + yakınında 20px+ bir sayı) daraltıldı. Aynı hata ton haritası
   kuralında da oldu: koşullu tek renk ve alan-anlamlı `HEALTH_COLOR` kopya
   sayıldı.
4. **Ön tarama envanter değildir.** Üç kayıtlı sayının üçü de düşüktü —
   çekmece turunda "4 değil YEDİ" olan şeyin aynısı.

---

## Ek tur — bilinen boşluk kapatıldı: `orders/[id]` + `quotes/[id]` `PageHeader`

Kullanıcı, turun sonunda kayda geçen boşluğu kapatmak istedi: iki detay
sayfasında hâlâ `<h1>` yoktu.

**Emsal hazırdı:** `purchase/orders/[id]` — geri-kırıntı AYRI satırda, altında
`PageHeader` (`title`=belge no · `titleAdornment`=durum rozeti · `subtitle` ·
`actions`). İki satış sayfası aynı kalıba oturdu, yani satın alma belge
sayfasıyla da hizalandılar.

| | önce | sonra |
|---|---|---|
| `orders/[id]` belge no | 14px `<div>`, kırıntının içinde | **20px `<h1>`** |
| `quotes/[id]` belge no | 12px **mono** `<span>`, kırıntının parçası | **20px `<h1>`** |
| `orders/[id]` başlık sayısı | **0** | **5** (h1 + 4 h2) |
| `quotes/[id]` başlık sayısı | **0** | **1** (h1; gövdesi `QuoteForm`) |

**Görünür değişiklikler, gizlenmiyor:** başlık ayrı satıra çıktı (tek satıra
20px başlık + kırıntı + rozetler + butonlar sığmıyor) · kırıntı ayraçları
(chevron SVG ve `/`) silindi — başlık ayrı satıra çıkınca anlamlarını
yitirdiler · teklif numarası monospace'i kaybetti (`PageHeader` tipografisi
20+ sayfada ortak) · teklif durumu açıklaması artık `subtitle`.
`quotes/[id]`'nin tam genişlikli şerit kimliği (alt kenarlık + kendi zemini)
KORUNDU; değişen yalnız şeridin içi.

**Doğrulama — 8 ölçüm (2 sayfa × 2 tema × {1440, 390}):** başlık ağacı
yukarıdaki gibi · seviye atlaması 0/8 · yatay taşma 0/8 · görünür metin kaybı
yok (silinen tek şey kırıntı ayraçları).

**Ölçü aracı yine bulguydu.** İlk koşumda `quotes/[id]` dört ölçümden
**birinde "0 başlık"** raporladı: 900ms'lik sabit bekleme o koşumda yükleniyor
ekranını yakalamıştı. Bekleme olaya bağlandı (`waitForSelector("h1")`) → 4/4
tutarlı.

**Kapı:** `gate/form-consistency`e **detay sayfası h1 kaynağı** kuralı — yedi
belge/detay sayfasının her biri ya `PageHeader`dan beslenir ya da gerekçeli
istisnadır. **Kırmızı-kanıt bir kural zayıflığı yakaladı:** `title={` deseni
`subtitle={` dizesinin İÇİNDE geçtiği için `title`ı `titleAdornment`a
çevirdiğimde kural yeşil kaldı; desene `\s` sınırı eklendi. *(Deponun
tekrarlayan tuzağı: bir kaynak iddiası, iddia ettiği SINIRIN içinde kalmalı —
bu dördüncü tekrarı.)* 3/3 kırmızı-kanıtlı.

**Kalan:** `quotes/[id]`nin gövdesi `QuoteForm` ve onun kendi bölüm başlıkları
hâlâ `<div>` — ayrı bir tur (form belgenin ekran ikizi, `#0072BC` marka
mavisiyle baskı dilinde).

---

## Kapsam dışı — bilerek, kayıtlı

- ~~**`orders/[id]` ve `quotes/[id]`ye `PageHeader`**~~ → **kapatıldı**, bkz.
  "Ek tur" bölümü. Kalan: `QuoteForm`un kendi bölüm başlıkları (baskı dilinde).
- **`KpiCard`** — sparkline + delta + `href` + `scrollIntoView`;
  `kpi-card-render` ve `dashboard-overview-preservation` uçtan uca kilitliyor
  (138px yükseklik · JS hover YASAK · ikon YASAK). Ayrı bir tür.
- **`Fact` ×2 (developer)** — `<dl>` etiket/değer çifti, 12.5px; büyük-sayı
  kutusu değil. `console-ui`nin `fact*` ailesi ve kapısı yerinde.
- **`StatsCards.tsx`** — 0 üretim importu (ÖLÜ) ama
  `dashboard-overview-preservation:37-41` silinmesini yasaklıyor. Yalnız ton
  kopyası ortak kaynağa bağlandı.
- **`ConsoleWidgets.HEALTH_COLOR`** — alan-anlamlı durum haritası (4. anahtarı
  `unknown`), ton haritası kopyası değil.
- **Baskı belgeleri** (`DashboardReport` @media print · Quote/PO/Rfq belgeleri
  · `QuoteForm`un belge ikizi, `#0072BC` marka mavisi) · **eyebrow'lar**
  (gerçek başlığın ÜST satırı) · **landing `.rv-*`** · `.settings-content-header
  h2` (CSS ile zaten tek kaynak).
- **Developer sekmelerinin alt-çizgi dili** — KASTEN korundu: yatay sekme
  şeridi, dikey ray dili orada yanlış olurdu.
- **Kalan 4 DOM-mutasyonlu hover dosyası** (`products/page` · `OrderForm` ·
  `StatsCards`(ölü) · `Button`(merkezî motor)) — artık kapı kuralının
  gerekçeli allowlist'inde, sessizce büyüyemez.

## Toplam

tsc 0 · lint 0 · **501 dosya / 7007 test** (+59) · build 0 uyarı ·
**E2E 94/94 retries=0** · **21/21 kırmızı-kanıtlı** (18 + ek turun 3'ü) ·
migration YOK. 54 dosya · üç yeni bileşen 437 satır · tüketici tarafında
**net −187 satır**. Toplam **48 tarayıcı ölçümü** (40 + ek turun 8'i), hepsi temiz.
