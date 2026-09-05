# Yan çekmeceler → ortak `Drawer` (Faz B'nin açık yarısı)

_2026-09-05 · migration YOK · RBAC YOK · saf sunum/istemci_

2026-08-30 Modal turu repodaki 9 diyaloğu ortak `Modal`'a taşımıştı ama yan
çekmeceleri **bilerek** kapsam dışı bıraktı: "Modal yanlış yüzey". Gerekçe
doğruydu — merkezî bir kutu ile sağa yaslı tam-boy bir panel aynı yerleşim
değil. Ama boşluk kapatılmadı. Bu tur onu kapatıyor.

## Ölçüm — kayıtlı sayı yanlıştı

Backlog "4 yan çekmece" diyordu. Ölçüm **yedi** buldu.

| # | çekmece | z-index | genişlik | dikey teknik | yüzey | `role=dialog` | Escape | odak tuzağı | odak dönüşü |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `CustomerDetailPanel` | **50** | 380px | `height:100vh` | `--bg-primary` | ✅ | ❌ | ❌ | ❌ |
| 2 | `VendorDetailPanel` | **50** | 460px | `height:100vh` | `--bg-primary` | ✅ | ❌ | ❌ | ❌ |
| 3 | `AlertCalendarDrawer` | 200/201 | min(480,100vw) | `top/right/bottom:0` | `--bg-primary` | ✅ | ✅ | ❌ | ✅ |
| 4 | `PurchaseOrderModal` | 200/201 | min(520,100vw) | `top/right/bottom:0` | `--bg-primary` | ✅ | ✅ | ❌ | ❌ |
| 5 | `AIDetailDrawer` | 200/201 | min(400,100vw) | `top/right/bottom:0` | `--bg-primary` | ✅ | ✅ | ✅ | ✅ |
| 6 | `VendorsClient` (satır içi) | 200 | 420px | `height:100vh` | `--surface-raised` | ✅ | ❌ | ❌ | ❌ |
| 7 | `email-deliveries` (satır içi) | **80/81** | min(420,100vw−16) | `height:100dvh` | `--surface-raised` | **❌** | ❌ | ❌ | ❌ |

**#6 ve #7 sayfaların İÇİNE gömülüydü** ve ilk taramada çıkmadılar: biri
`justifyContent:"flex-end"` ile sağa yaslanıyor, diğeri `<aside>`. Ders:
**çekmece sayımı imzaya göre yapılmalı, tek desene göre değil** — `role="dialog"`
+ `right: 0` araması ikisini de kaçırdı.

### Beş kusur sınıfı

1. **A11y.** 4 çekmecede Escape yok, 6'sında odak tuzağı yok, 5'inde odak
   dönüşü yok. **Beşi buna rağmen `role="dialog"` İLAN EDİYORDU** — yani
   ekran okuyucuya "ben bir modalım" diyip klavyeyle kapatılamıyorlardı.
   #7'de işaretlemenin kendisi de yoktu (düz `<aside>`), üstelik backdrop'ı
   `<button>` olduğu için tab sırasına anlamsız bir durak koyuyordu.
2. **Katman.** Dört ayrı z-index katmanı. #1 ve #2 uygulamadaki **tek**
   "kabuğun kendi mobil menüsünün (z=99/100) ALTINDA kalan" diyaloglardı;
   diğer her diyalog (Modal dahil) 200/201'de.
3. **Dikey teknik üç türlü.** `height:100vh` (3) · `100dvh` (1) ·
   `top/bottom:0` (3). `100vh` iOS Safari'de görüntü alanından **büyüktür**
   (tarayıcı çubuğu sayılmaz) → panelin dibi çubuğun altında kalır ve oraya
   kaydırılamaz. **Hiç ölçülmemişti:** 2026-08-31 mobil turu "70/70 taşmasız"
   dedi ama o tarama **hiçbir çekmeceyi açmadı**.
4. **Token ayrışması.** `--bg-primary` vs `--surface-raised`; `--border-tertiary`
   vs `--border-secondary` vs `--surface-border`; `0.5px` sabiti vs
   `var(--line-width)`.
5. **Gövde kaydırma kilidi hiçbirinde yok** — `Modal` dahil. Kapsam dışı
   bırakıldı (aşağıda).

## Yapılan

### A11y çekirdeği paylaşıma çıktı — YENİ `src/components/ui/dialog-a11y.ts`

`Modal`'daki tek `useEffect` dört işi birden yapıyordu (açılış odağı · Escape ·
Tab tuzağı · odak dönüşü) ve aynı mantığın **eksik kopyaları** çekmecelere
dağılmıştı: `AIDetailDrawer` kendi tuzağını, `PurchaseOrderModal` "focus trap"
adı taşıyan ama tuzak OLMAYAN bir sürümü, `AlertCalendarDrawer` üçüncü bir
sürümü. Mantık `useDialogA11y` hook'una taşındı; `Modal` ve YENİ `Drawer` aynı
çekirdeği sürüyor.

**Davranış-nötrlük kanıtı:** `modal-ui.test.tsx`'in **17 testi, dosyaya hiç
dokunulmadan** yeşil kaldı. Çıkarma davranışı değiştirmiş olsaydı orada
patlardı.

### YENİ `src/components/ui/Drawer.tsx`

Sözleşmesi `Modal` ile kasten aynı (`ariaLabel`/`labelledBy`/`width`/
`dismissible`/`padded`/`surfaceStyle`), yerleşimi farklı. Üç karar ölçüme
dayanıyor:

- **`height` HİÇ yazılmaz** — `top:0` + `bottom:0`. `100dvh`'den de iyi:
  birim seçimi diye bir tartışma kalmıyor.
- **Katman 200/201** — `Modal` ile birebir.
- **Yüzey `--surface-raised` + `--surface-border`** — `Card`'ın kanonik ikilisi.
  **Ölçüldü: `--bg-primary` ile `--surface-raised` bugün iki temada da BİREBİR
  aynı** (`#1a1d23` / `#ffffff`) → dört çekmecenin yüzey değişimi **sıfır
  piksel**. Ayrışma bugün görünmüyordu ama token'lardan biri ayarlandığı an
  ortaya çıkardı.

`padded={false}`da **bir fark bilinçli**: `Modal`'da `display:block`a düşülüyor,
`Drawer`da **flex sütun korunuyor** — çekmecenin dikey iskeleti (sabit başlık +
esneyen gövde) ona bağlı.

### Görünür iki yakınsama — gizlenmiyor

| | eski | yeni | kimde değişti |
|---|---|---|---|
| backdrop | `rgba(0,0,0,0.4–0.5)`, blur yok | `rgba(0,0,0,0.54)` + `blur(4px)` | 4 çekmece (kanonik zemin Modal turunda kararlaşmıştı) |
| kayma | 2 çekmecede var, 5'inde yok | hepsinde `slide-in-right 0.2s` | 5 çekmece |

Kayma kararı CLAUDE.md'nin "animasyon **sadece gerekli yerde**" kuralına göre
alındı: kenara yaslı bir panelin nereden geldiğini göstermesi o durum, ve
`Modal`'ın backdrop `fade-in`'i aynı gerekçeyle zaten kabul edilmişti.
`prefers-reduced-motion` global kural (globals.css:649) ikisini de susturuyor.

### Silinenler

| ne | nerede | yerine geçen garanti |
|---|---|---|
| `drawerOverlayStyle` + `drawerPanelStyle` | `VendorsClient` | `ui/Drawer` + `gate/surface-consistency` |
| kendi Escape + "focus trap" effect'i | `PurchaseOrderModal` | `dialog-a11y` (o kopya tuzak DEĞİLDİ) |
| kendi Escape + odak effect'i + `closeBtnRef` | `AlertCalendarDrawer` | `dialog-a11y` |
| kendi Escape/tuzak/dönüş effect'leri + `closeBtnRef` | `AIDetailDrawer` | `dialog-a11y` |
| `<aside>` + `<button>` backdrop | `email-deliveries` | `ui/Drawer` |

**net −68 satır** (331 eklendi / 399 silindi), üstüne 401 satır yeni bileşen+test.

## Doğrulama — tarayıcı, iki tema, iki genişlik

**24 ölçüm** (6 çekmece × 2 tema × {1440, 390}) — **hepsi temiz**:

| ölçülen | sonuç |
|---|---|
| katman | 24/24 panel `z=201`, backdrop `z=200` |
| dikey | 24/24 `top/bottom/right = 0px`, hesaplanan yükseklik = görüntü alanı (900/844) |
| **panelin dibi görüntü alanında** | **24/24** — `100vh`→`bottom:0` geçişinin asıl kazancı, ilk kez ölçüldü |
| yüzey | aydınlık `rgb(255,255,255)` · koyu `rgb(26,29,35)` — 24/24 aynı |
| kenarlık | aydınlık `1px rgb(189,202,217)` · koyu `1px rgb(68,77,88)` — 24/24 aynı |
| Escape kapatıyor | 24/24 |
| açılışta odak panel içinde | 24/24 |
| **odak dönüşü** | 24/24 gerçek tetikleyiciye: `TR:Abdi İbrahim İlaç` · `BUTTON:Yeni Tedarikçi` · `BUTTON:İncele` · `BUTTON:Sipariş Aç` · `BUTTON:✦ AI` |
| yatay taşma | 24/24 sıfır |

390px'te genişlikler doğru kısılıyor: 380 → x=10 · 420/480/520 → 390'a
oturuyor · `email-deliveries` 374 (`100vw−16`).

### Ölçü aracının kendisi de bulguydu — yine

İlk koşum `rect.x=1341, w=380` verdi; toplamı **1721**, görüntü alanı 1440.
Sebep panel değil ölçüm: **kayma animasyonu sürerken yakalanmıştı.** 500 ms
bekleme eklenince gerçek değer çıktı (x=1060, sağ kenar tam 1440). Geçen tur
`documentElement.scrollWidth`'in hayalet 285px üretmesiyle aynı sınıf.

### Yedinci çekmece: tarayıcıda ölçülemedi, sebebi kayıtlı

`AlertCalendarDrawer` dört koşumda da açılamadı. Sebep seçici değil **veri**:
yerel DB'de sıfır uyarı olayı var (`Stok 0 · Sipariş 0 · Vadeler 0 · Sistem 0`,
yalnız 1 takvim notu) → onu açan "Detay" butonu hiç çizilmiyor. Not farklı bir
yüzey (`CalendarNoteDetailModal`) açıyor.

Bunun yerine **gerçek React render'ıyla** kanıtlandı: `alerts-calendar-faz3`
zaten odağın açılışta Kapat'a gidip kapanışta tetikleyiciye döndüğünü test
ediyordu ve dönüşümden sonra **değişmeden** geçti; üstüne Escape + `aria-modal`
+ "`height` yazılmıyor" iddiaları eklendi.

## Kapı

- **YENİ** `src/__tests__/drawer-ui.test.tsx` — 15 davranış testi (gerçek
  render): kapatma yolları · erişilebilir ad · odak yönetimi (ilk odak, dönüş,
  Tab, Shift+Tab) · **çekmeceye özgü dördü**: `height` yazılmaz · katman
  200/201 · `padded={false}` flex sütunu korur · `surfaceStyle` yalnız görünümü
  ezer.
- `gate/surface-consistency` — üç yeni kural: elle yazılmış diyalog **kümesi**
  tam olarak allowlist (sayı değil KÜME — "en az N" dersi) · yedi çekmecenin
  hepsi `Drawer`'dan besleniyor ve kendi katmanını/yüksekliğini geri yazamıyor ·
  davranış tek kaynakta (iki çerçeve de kendi `keydown`'ını yazmaz).
- Üç mevcut kaynak kilidi (`customers-ui` · `vendors-ui` ·
  `reliable-internal-email`) Modal turunun emsaline göre güncellendi: iddia
  ortak çerçeveye taşındı, yerine garantinin nerede yaşadığını söyleyen yorum.

**10/10 kırmızı kanıtlı** (dosya-başına yedek + SHA-256 geri yükleme).

**tsc 0 · lint 0 · 498 dosya / 6947 test · build 0 uyarı · E2E 94/94 (2,3 dk,
retries=0) · migration YOK.**

## React Doctor — ALTINCI yanlış alarm, üstelik tersi doğru

Commit kancası "staged regressions" dedi. Kayıtlı yöntemle (HEAD~1 geçici
worktree'de dosya-başına JSON karşılaştırması) ölçüldü:

| | önce | sonra |
|---|---|---|
| depo geneli bulgu | 1516 | **1486** (−30) |
| dönüşen 7 dosyadaki bulgu | 124 | **92** (−32) |
| YENİ bulgu | — | **1 tane** |

Tek yeni bulgu `prefer-tag-over-role` → yeni `Drawer.tsx`. Bu, önceden **beş
ayrı çekmecede** yanan aynı kuralın tek yere toplanmış hâli; `Modal.tsx` da onu
önce de sonra da taşıyor (x2, değişmedi). Kural "`role="dialog"` yerine yerel
`<dialog>` kullan" diyor — benimsemek üst-katman/`::backdrop`/`showModal()`
demek, `Modal`'ı da kapsayan ayrı bir mimari karar ve `modal-ui`nin "backdrop
İLK kardeş" yapısal varsayımını kırar. **Bilerek benimsenmedi.**

Araç yeni dosyadaki bulguyu görüyor, kaldırdığı beşini saymıyor. Ders değişmedi:
**"staged regression" iddiası tek başına kanıt değildir.**

## Dersler

1. **Bir yüzeyin diyalog İLAN etmesi, diyalog gibi DAVRANDIĞI anlamına gelmez.**
   Beş çekmece `role="dialog"` + `aria-modal="true"` taşıyordu ve
   `customers-ui`'nin kuralı tam da bunu arayıp **yeşil yanıyordu** — panel
   klavyeyle kapatılamazken. Kural işaretlemeyi görüyor, davranışı görmüyordu.
2. **Kırmızı-kanıt koşumunun kendisi de kanıtlanmalı.** Bir mutasyonum
   `Card.tsx`'te `<div` aradı, dosya `<Tag` kullanıyor → `str.replace` sessizce
   boşa gitti ve koşum "kural zayıf" raporladı. **Boşa giden mutasyon, zayıf
   kuraldan ayırt edilemez.** Betiğe "mutasyon dosyayı gerçekten değiştirdi mi"
   kontrolü eklendi (SHA karşılaştırması); kural aslında sağlamdı.
3. **Gerekçe yorumu kuralı tetikledi — beşinci kez.** "Elle dialog kalmadı"
   iddiası, taşınmayı ANLATAN yorumdaki `role="dialog"`a takıldı.
   `stripComments` emsali uygulandı: **kural KODU iddia etmeli, kodun
   anlatısını değil.**

## Kapsam dışı — bilerek, kayıtlı

- **`SectionHeader`/`NavLink`/`Stat`** — kullanıcı kararı: bu iş bittikten
  sonra **ayrı tur**. (Bu oturumdaki tarama ön veriyi topladı: `SectionHeader`
  ~45 çağırı / 6 varyant · `NavLink` 3 yüzey ama gerçekte 2 birleştirilebilir ·
  `Stat` 2 hazır bileşen + ~28 elle yazılmış / 9 varyant. **Uyarı:**
  `gate/surface-consistency`'nin `var(--surface-raised)` ≥7/≥3 sayaçları
  `parasut` ve `purchase/suggested` sayfalarına bakıyor — `Stat` çıkarımı o
  literalleri sileceği için o kuralı kıracak.)
- **Gövde kaydırma kilidi** — `Modal` dahil hiçbir diyalogda yok; tek istisna
  `products/[id]` ışık kutusu. Ortak çekirdeğe eklemek 19 çalışan Modal
  tüketicisinin davranışını değiştirir ve kaydırma çubuğu kaybı yerleşim
  sıçratabilir. Ayrı karar.
- **`products/[id]`'nin üç diyaloğu** — `product-detail-page-ekler.test.ts:84-94`
  onları çerçeveye taşınmamaya **kilitliyor** (kendi keydown'ı ve
  `body.style.overflow`u testle isteniyor). Kasıtlı istisna.
- **`DosyalarTab` diyaloğu** — merkezî önizleme, sağa yaslı değil.
- **`Modal`'ın kendi `maxHeight: calc(100vh - 28px)`'i** — aynı birim sorusu,
  merkezî modalda; bu turun konusu değil.
- **Çekmecelerin İÇİNDEKİ `0.5px` kenarlıklar** — başlık şeridi ayırıcıları.
  Çerçeve değil içerik stili; ayrı tur.
