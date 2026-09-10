---
name: roven-frontend-yenileme-plan
description: "frontend-renewal.md — DOM mutation fix, component lib, accessibility, görsel yenileme — plan var, uygulama başlamadı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 14992303-287a-4b73-b0e6-d62dbec7425c
---

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/frontend-renewal.md` (2026-04-08, gitignore'da değil)

**Durum:** PLAN HAZIR — **kısmen turlarda uygulandı** (formal frontend-renewal commit'i yok ama maddeler ayrı turlarda kapatıldı). KAPANANLAR: DOM mutation fix (orders/quotes/products/customers/PO/production turlarında `hoveredId` state'e geçildi), a11y (modal `role=dialog`/`aria-modal`/`aria-labelledby` + aria-label çoğu sayfada), `prefers-reduced-motion` global guard (tema turunda `062bfa9`), Topbar yeniden tasarım ("Sakin düz" `bf28fb0` — breadcrumb yerine sola-başlık). **Faz B BAŞLADI — pilot + yayılım sürüyor:** `src/components/ui/` altına `DataTable<T>` (generic kolon/satır + thead/boş-durum/hizalama/footer + opsiyonel `onRowClick` satır navigasyonu; seçim mantığı caller'da kalır) + `Badge` (tone token çiftleri) + `Card`. Hover = globals.css `.erp-data-table tbody tr:hover` (rerender yok, DOM-mutation yok). DataTable ayrıca `minWidth?: string` + tablo `overflow-x:auto` wrapper + (globals.css) `.row-reveal` hover-reveal utility destekler. **Dönüştürülen listeler:** (1) **VendorsClient** (`c6f46fc` — pilot); (2) **PurchaseOrdersClient** (`931c62d` — onRowClick→router.push, STATUS_BG→STATUS_TONE+Badge); (3) **CustomersClient** (`64af65d` — onRowClick→setSelectedCustomer panel, minWidth=700px, 9 kolon); (4) **OrdersClient** (`024c2d8` — onRowClick→router.push, minWidth=740px, `.row-reveal` sil/chevron, `<EmptyState>` emptyMessage, `.badge` rozetleri korundu); (5) **QuotesClient** (`cdb5be3` — Orders'ın birebir ikizi; onRowClick→router.push, minWidth=740px, 8 kolon, `.row-reveal` sil/chevron, `.badge` durum rozetleri + geçerlilik alt-rozeti korundu); (6) **3 settings tablosu** (`dceb9a8` — users/email-deliveries/product-types; Orders/Quotes ikizi DEĞİL: hover/satır-tıklama/seçim YOK → onRowClick yok; aksiyonlar her zaman görünür buton; product-types pasif-kayıt opacity için **DataTable YENİ `rowStyle?(row)`** eklendi). Her dönüşüm: thStyle/tdStyle kaldırılır, tablo→Card/DataTable, hoveredId (varsa) kaldırılır (hover/reveal CSS); davranış/RBAC/demo değişmez; migration yok. **DataTable API:** `columns/rows/rowKey/emptyMessage/footer/onRowClick/rowAriaLabel/minWidth/rowStyle`. `onRowClick` fare + **klavye** sözleşmesi verir (tabIndex=0 + Enter/Space); `rowAriaLabel` satırın erişilebilir adı. **PREMIUM LIGHT THEME** (`f550e83`, codex'ten entegre): DataTable/Card token bazlı (`--surface-raised/-border/-shadow`, `--table-header-bg/-row-hover`, `--line-width`, `--font-table-*`, `--input-bg/-border`); yeni dönüşümler bu token'ları otomatik miras alır. (7) **products/page.tsx** (`2095ae2` — Faz B #7, LİSTE TARAFINI KAPATAN dönüşüm; diğer 6'nın ikizi DEĞİLDİ: bkz. aşağıda). **LİSTE TARAFI BİTTİ 7/7** — repoda ham `<table>` tutan tek kalan yüzey `src/components/dashboard/StockDataGrid.tsx` (grid, liste değil; theme-system "temsilci tablolar" döngüsünde yalnız o kaldı).

**products dönüşümünün üç dersi (kalıbı körlemesine uygulama):**
1. **A11y sözleşmesi component'e ait.** products repodaki TEK klavye-erişilebilir liste satırıydı (`tabIndex`/`role`/`aria-label`/`onKeyDown` elle yazılmış). Düz dönüşüm regresyon olurdu → önce `DataTable`'a taşındı (`c98c579`): `onRowClick` verilince satır `tabIndex=0` + Enter/Space (`preventDefault`), YENİ `rowAriaLabel?: (row)=>string`. **`role="button"` EKLENMEDİ** — `<tr role="button">` satırı ekran okuyucuda "tablo satırı" olmaktan çıkarır. Kasıtlı yan etki: Orders/Quotes/Customers/PO da klavyeyle gezilebilir oldu.
2. **`cellStyle` KOLONA statiktir, satıra değil** → satır bazlı koşullu renk/stil hücre içeriğinde `<span style>` ile verilir (Stok/Satılabilir kritik-uyarı eşikleri).
3. **DataTable ortak stili `whiteSpace: nowrap` VERMEZ.** Sayfaların yerel tdStyle'ı çoğu zaman veriyordu → gerekiyorsa kolon bazında `headerStyle`/`cellStyle` ile geri ver (`textOverflow: ellipsis` nowrap olmadan çalışmaz). Global eklemek dönüşmüş tüm listelerin sarma davranışını değiştirir.

**Faz B #8 — DRAWER TARAFI KAPANDI (2026-09-05).** YENİ `ui/Drawer` + `ui/dialog-a11y.ts`; **YEDİ** yan çekmece taşındı (kayıtlı sayı 4'tü — ikisi sayfa İÇİNE gömülüydü: `VendorsClient` `justifyContent:"flex-end"`, `email-deliveries` `<aside>`; **çekmece sayımı İMZAYA göre yapılmalı, tek desene göre değil**). 4'ünde Escape, 6'sında odak tuzağı, 5'inde odak dönüşü yoktu ve **beşi buna rağmen `role="dialog"` İLAN EDİYORDU** — `customers-ui`'nin kuralı tam bunu arayıp YEŞİL yanıyordu. Dört z-katmanı → 1 (50'dekiler kabuğun mobil menüsünün z=99/100 ALTINDAYDI). `height:100vh` → **`top:0`+`bottom:0`** (`100dvh`ten de iyi; iOS Safari'de `100vh` görüntü alanından büyüktür → panelin dibi erişilemez; **hiç ölçülmemişti**, 2026-08-31 mobil turu hiçbir çekmece açmamıştı). `padded={false}` `Modal`'dan farklı: **flex sütunu KORUR**. Nötrlük kanıtı: `modal-ui.test.tsx`'in 17 testi **dokunulmadan** yeşil. 24 tarayıcı ölçümü temiz. Rapor `docs/audit/2026-09-05-yan-cekmeceler.md`.

**Faz B #9 — SON ÜÇ BİLEŞEN KAPANDI, FAZ B BİTTİ (2026-09-05).** Kullanıcı "üç bileşeni de yapalım" dedi. Üç dilim/üç commit: `NavLink` (`4745cae`) · `SectionHeader` (`b05f23d`) · `Stat` (`497d717`). Rapor `docs/audit/2026-09-05-uc-bilesen.md`.

**ÜÇ KAYITLI SAYININ ÜÇÜ DE DÜŞÜKTÜ** (hepsi önceki turun ÖN TARAMASINDAN geliyordu — **ders: ön tarama envanter değildir**, çekmece turundaki "4 değil YEDİ"nin aynısı): `SectionHeader` ~45 değil **85 çağrı / 42 varyant** (41 `<h2>` × 13 tipografi + 44 BÜYÜK HARF etiket × 29) · `Stat` ~28 değil **3 paylaşılan + 7 dosya-yerel + 26 elle / 20 değer tipografisi** · `NavLink`'in eksenleri ÇAPRAZ çıktı.

**`NavLink`:** görsel ikili **Sidebar+Ayarlar** (aynı üç nav token'ı + 2px sol accent şeridi, iki AYRI uygulama), mantık ikilisi **Sidebar+Developer** (`isActive` ifadesi BİREBİR iki kez yazılmış) → tek bileşen üçünü kapsayamaz, iki eksen AYRI çözüldü; Developer'ın alt-çizgi dili KASTEN korundu (yatay sekme şeridi). **ASIL KUSUR a11y: Sidebar'ın 16-18 bağlantısında `aria-current` YOKTU** — altı işaret (zemin·metin·kenarlık·kalınlık·şerit·ikon opaklığı) ve altısı da yalnız görsel. Hover'daki 6 satır DOM mutasyonu silindi, görünüm `.nav-rail-item` CSS sınıfına geçti. Altı ölçü kayması ölçümle tek değere indi (36px · şerit 7px · `0 10px 0 12px` · gap 9 · ikon 0.92 · hover kenarlığı YOK).

**`SectionHeader`: GÖRÜNMEK ≠ OLMAK** — Drawer turunun "ilan etmek ≠ davranmak" dersinin TERSTEN hâli. 44 bölüm etiketi `<div>`di → **`orders/[id]` ve `quotes/[id]`nin h1/h2/h3 sayısı SIFIRDI** (iki detay sayfasında başlıktan başlığa gezinilemiyordu). **Dört rakip kanon, ikisi AYNI DOSYADA** (`settings/page.tsx` hem `const sectionTitle` hem `function SectionHeader`; üçüncüsü `products/[id]`, dördüncüsü `console-ui`). Üç rol/üç ölçek (`label` 11px BÜYÜK HARF / `title` 13px / `dialog` 16px); **`Input.labelStyle()`ından TÜRETİLEMEZ** (o `textTransform` taşımamaya kilitli — kullanıcı kararı). Tipografi imzası 42→4, seviye atlaması 0/16.

**`Stat`: KAPININ KANITLADIĞI KUSUR, KAPININ BAKMADIĞI YERDE.** Beş yüzey (`aging`·`products/[id]`·`import/excel`·Customer/Vendor panelleri) kutu zemini olarak `--bg-secondary` kullanıyordu = gate'in kendi "kuralın DAYANAĞI" testinin kanıtladığı gibi sayfa zeminiyle BİREBİR aynı renk, **görünmez kutu**; kural 2026-08-31'de yazılmıştı ama **beş sayfalık bir allowlist üzerinde** ve bu beşi listenin dışındaydı. Ton haritası **4 KOPYA → 1** (`Badge.TONE_TOKENS` export). `0` ÖLÇÜLMÜŞ BİR DEĞERDİR. Değer tipografisi 20→1 (`21px/650/tabular-nums`). **Uyarı gerçekleşti:** gate'in ≥7/≥3 sayacı kırıldı (Öneriler 3→0, üçü de stat kutusuydu) → yapı iddiasına çevrildi + **eksik `stripComments` eklendi**.

**DERSLER:** (1) görünmek ≠ olmak · (2) **bir kapı yalnız BAKTIĞI yerde koruma sağlar** — kanıtı olan bir kuralın KAPSAMI da kanıtlanmalı · (3) **bir kural iddia ettiğinden fazlasını söylememeli** (negatif stat kuralı ilk yazımda sekme şeridini/tablo sarmalayıcısını da yakaladı → stat imzasına daraltıldı) · (4) ön tarama envanter değildir.

**Kapı:** `surface-consistency` +7 · `form-consistency` +4 (**`<h2>` için bugüne kadar HİÇ kapı yoktu**, ve eski tarama yalnız `src/app`e bakıyordu) · `console-consistency` ada değil TİPOGRAFİYE bağlandı · üç yeni davranış testi dosyası (47 test, gerçek render). **18/18 kırmızı-kanıtlı.** 40 tarayıcı ölçümü temiz. React Doctor: dokunulan 50 dosyada 260→262, ikisi de birleştirmenin mekanizması. **501 dosya / 7006 test · E2E 94/94 · net −187 satır (tüketici tarafı).**

**KAPSAM DIŞI, kayıtlı:** ~~`orders/[id]`+`quotes/[id]`ye `PageHeader`~~ → **EK TURDA KAPATILDI** (0→5 ve 0→1 başlık; `purchase/orders/[id]` emsali: kırıntı ayrı satırda, altında `PageHeader`; belge no 14px `<div>`/12px mono `<span>` → 20px `<h1>`; kırıntı ayraçları silindi, teklif no mono'yu kaybetti. Kapı: detay sayfası h1 kaynağı kuralı — kırmızı-kanıt `title={` ⊂ `subtitle={` zayıflığını yakaladı, `\s` sınırı eklendi. Kalan: `QuoteForm`un kendi bölüm başlıkları) · `KpiCard` (sparkline+delta, `kpi-card-render`+`dashboard-overview-preservation` uçtan uca kilitliyor) · `Fact` ×2 · `StatsCards` (ölü ama silinmesi testle yasak) · `HEALTH_COLOR` (alan-anlamlı) · baskı belgeleri · eyebrow'lar · landing. Kalan 4 DOM-mutasyonlu hover dosyası artık kapı allowlist'inde gerekçeli.

`Input`/`PageHeader` önceki turlarda kapandı.

---

## Sorunlar (plan gerekçesi)

- 100+ inline `style={{}}` declaration — her sayfada sıfırdan yazılıyor, bakım yükü yüksek (KISMEN: tema turunda renkler CSS var/token'a taşındı, yapısal stiller hâlâ inline)
- ~~DOM mutation antipattern~~ → **ÇOĞU KAPANDI** (`onMouseEnter`'da `e.currentTarget.style.X`→`hoveredId` state; orders/quotes/products/customers/PO/production sayfalarında uygulandı)
- Erişilebilirlik: aria-label + modal a11y çoğu sayfada eklendi; ~~`prefers-reduced-motion` yok~~ → **EKLENDİ** (tema turu global guard); kalan: `sm` buton <44px, bazı skip-link/focus-trap

---

## Faz Özeti

| Faz | Konu | Açıklama |
|-----|------|----------|
| A | Design Token Genişletme | `globals.css`'e typography scale, spacing (4pt grid), z-index, hover tokens, skip-link, ~~reduced-motion~~ ✅ + tema token'ları (`--highlight-inset` vb. ✅) |
| B | Component Kütüphanesi | DataTable(+onRowClick[klavye dahil]+rowAriaLabel+minWidth+rowStyle+`.row-reveal`), Card, Badge VAR; **liste tarafı 7/7 BİTTİ**: Vendors+PO+Customers+Orders+Quotes+3 settings tablosu+products (`c6f46fc`/`931c62d`/`64af65d`/`024c2d8`/`cdb5be3`/`dceb9a8`/`2095ae2`). Premium light theme entegre (`f550e83`). **Drawer tarafı 2026-09-05 KAPANDI** (7 çekmece). AÇIK: SectionHeader/NavLink/Stat |
| C | DOM Mutation Fix | `onMouseEnter` style mutation → `useState(hovered)` — **ÇOĞU YAPILDI** (orders/quotes/products/customers/PO/production) |
| D | Accessibility | Skip link, aria-label ✅(çoğu), focus trap (Sidebar mobile), form label-input bağlantısı — kısmen |
| E | Görsel Yenileme | Landing, Login split-screen, Sidebar, ~~Topbar breadcrumb~~ → **Topbar "Sakin düz" yapıldı** (`bf28fb0`, sola-başlık), Dashboard, Orders |

**Uygulama sırası:** globals.css → Button fix → DataTable oluştur → DOM mutation'ları kur → Accessibility → Görsel

---

## Review Bulgular (plana göre 3 revizyon gerekli)

1. ~~**Kapsam eksik:** `products/page.tsx` ve `alerts/page.tsx` uygulama listesinde yok~~ → products ✅ (`2095ae2`, Faz B #7); alerts hâlâ açık
2. **Hover useState riski:** Her satır için `useState` → gereksiz rerender; özellikle DataTable row highlight context riskli. Yumuşatılmalı
3. **Checklist'e build/typecheck ekle:** `npm run build` / `tsc --noEmit` yoktu

---

## Etkilenecek Dosyalar (mevcut)

Değiştirilecek: `globals.css`, `dashboard/layout.tsx`, `Button.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `StatsCards.tsx`, `StockDataGrid.tsx`, `dashboard/page.tsx`, `orders/page.tsx`, `page.tsx` (landing), `login/page.tsx`

Oluşturulacak (`src/components/ui/`): `DataTable.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `PageHeader.tsx`, `SectionHeader.tsx`, `NavLink.tsx`, `Stat.tsx`

**Why:** Plan hazır ve kullanıcı bu dosyayı "başka bir tane vardı" diyerek 2026-04-23'te sordu — aktif bir sonraki iş olabilir.
**How to apply:** Bu plana başlanmadan önce yukarıdaki 3 revizyon maddesini kullanıcıyla netleştir.

## 2026-08-31 — Faz B FORM TARAFI kapandı (tipografi tutarlılığı)

Ölçüm: uygulama **ekrandan ekrana farklı görünüyordu**.

- **Form etiketi 10 kopya / 5 varyant** (11px-12px · tertiary-secondary · BÜYÜK
  HARF olan-olmayan). İki aile TAM EŞİT bölünmüştü (5-5) → "çoğunluk" kuralı
  karar veremedi. **Kanonik (kullanıcı kararı): login `.lbl` referansı —
  `11px / var(--font-label-weight) / --text-secondary`, BÜYÜK HARF YOK**
  (Türkçe uzun etiketlerde satır kaplar).
  Çözüm: `Input.tsx`'e `labelStyle()`; 10 yerel sabitin GÖVDESİ bağlandı,
  çağrı yerleri değişmedi — `fieldStyle` emsali, blast radius sıfır.
  Yardımcı **yalnız tipografi** taşır; `display`/`margin` çağıranda kalır.
- **`inputStyle` 3 dosyada elle yazılıydı** → `fieldStyle("md")`. `vendors`/
  `production` birebir aynıydı; `settings` sürüklenmiş olandı (eski
  `--border-secondary`).
- **16 elle yazılmış `<h1>`, 5 boyut (16·18·19·20·24), 3 ağırlık.** 11'i
  `PageHeader`'a taşındı (6'sı görsel değişimsiz). **Ölçümle doğrulandı: 6
  ekranda başlık `20px/600`.** Ayarlar ilk turda `20px/650` çıktı (CSS sınıfı
  `--font-heading-weight` taşıyordu) → düzeltilip yeniden ölçüldü.
- **`PageHeader`'a iki isteğe bağlı yuva:** `titleAdornment` (başlık yanındaki
  durum rozeti; **süs yoksa sarmalayıcı düğüm de üretilmez** → mevcut 20+
  çağıranın DOM'u aynı kaldı) ve `align="start"` (çok satırlı aksiyon bloğu).
- **8 kasıtlı istisna** gerekçesiyle kapı testinde kayıtlı (detay kahramanları,
  hata mesajı olan h1, baskı belgesi, kabuk dışı sayfalar).

**Kapı: `gate/form-consistency.test.ts` (8 test), 6/6 kırmızı kanıtlı.**
Kural bir kez ÖLÇÜMLE sertleştirildi: ilk hâli `<h1 style={{…}}` arıyordu,
`/gizlilik` ve `/sifre-yenile` stili `const h1Style` diye çıkarıp altından
geçiyordu → desen `<h1 style={` oldu.

**İki gerçek kusur kapı testi yazılırken çıktı — ikisi de SESSİZDİ:**
`--danger-soft-bg` (yok; `/sifre-yenile` hata kutusu `transparent`a düşüyordu)
ve `--danger-rgb` (yok; `import/excel` satır vurgusu aydınlık temada KOYU tema
kırmızısı gösteriyordu). **Ders: `var(--x, yedek)` hatayı yutar.**

**ÖLÇÜM SINIRI:** demo/viewer RBAC nedeniyle production/vendors/users/rfqs/
purchase/parasut ekranlarına giremiyor; Developer Console ise
`INTERNAL_OPERATOR_EMAILS` boş olduğu için kimseye açık değil. O ekranların
görsel doğrulaması kullanıcıda.

493 dosya / 6881 test · migration yok.


## 2026-08-31 — Kart yüzeyi + buton/kategori dili tek kaynağa

Kullanıcı beş sayfayı gösterdi (Öneriler · Teknik Şablonlar · Uyarılar · Veri
Aktarım · Paraşüt): *"arka plan rengi kartlar vs güzel değil"*. Ayrıca bütün
sistemde butonlar/kategoriler beyaz, mavi olması gerekenler mavi, Yenile beyaz.

**Kök sebep — ezberlenecek tek satır: `--bg-secondary` HER İKİ TEMADA
`--app-bg` ile BİREBİR AYNI RENK** (koyu `#131518`, aydınlık `#e8eef5`). O token
bir **iç oyuk** rengi; zeminle aynı olması TASARIM GEREĞİ doğru. Kusur, oyuk
renginin **yükseltilmiş kart** olarak kullanılmasıydı → kartın yüzeyi hiç yok,
yalnız kenarlığı görünüyor. **Token'a DOKUNMA, kullanımı düzelt:** kart =
`Card` / `--surface-raised`, oyuk = `--bg-secondary`/`--bg-tertiary`.

**Referans yüzey = LOGIN** (repodaki en son tasarlanmış ekran, `Button.tsx`'te
zaten uygulanmış): MAVİ `linear-gradient(#1f609d→#123f73)` = `variant="primary"`;
BEYAZ `linear-gradient(#fff→#f4f7fa)` = `variant="secondary"`. Yeni token/tasarım
ÜRETME — bu ikisine bağla.

**YENİ `components/ui/FilterChips.tsx`** — sistemin TEK kategori sekmesi dili.
Kendi rengini yazmaz, `Button`'ı sürer (`active ? primary : secondary`), yani
çip ile buton tek palet. `UnderlinedFilterTabs` + `ClassificationTabs` SİLİNDİ
(kullanıcı onayıyla; önceki turun "hap çipi yasak" kararı bilerek tersine
çevrildi — alt çizgili sekmenin dolgusu olamaz). Sayaçlar `buildAlertClassItems`
(`lib/alert-calendar.ts`) saf yardımcısında.

**`PageHeader` Yenile: `toolbar` → `secondary`.** `toolbar` = `transparent`
demek, yani buton sayfa zemini rengindeydi. Tek satır, **12 sayfa**.
`Card`'a `as` prop'u eklendi (kart aynı zamanda `<section aria-label>` landmark
olabiliyor).

**Ayrım kuralı — `role="tab"` her zaman filtre değildir:** `aria-controls`
taşıyan sekme bir PANEL DEĞİŞTİRİCİDİR (ürün detayı), listeyi süzmez; alt
çizgili kalması doğru. Gate bu ayrımı `aria-controls` ile yapıyor — whitelist
değil, gerçek bir sınır.

**Kapı `gate/surface-consistency.test.ts` (7 kural, 7/7 kırmızı-kanıtlı).** İlk
kural bir iddia değil GEREKÇE: token eşitliği doğrulanır, biri ayırırsa yasak
gevşetilebilir. Kanıt turu bir kuralın zayıflığını yakaladı (import ≠ render).

**Ölçüm:** kartlar zemin → `#fff`/`#1a1d23` (koyu temada 7/7 → 0/7 zeminle aynı)
· Uyarılar'a ilk kez `<h1>` (dashboard'daki tek başlıksız ekrandı) · Veri
Aktarım 14px → 20px. **Ölçülemedi:** 390px mobil — pencere OS alt sınırı 1470px
ve uygulama iframe'lenmeyi (doğru biçimde) reddediyor.

495 dosya / 6902 test · migration yok.


## 2026-08-31 (2) — 390px mobil turu koşuldu (yerel dev DB sayesinde)

**25 rota × 2 tema: yatay taşma 0/50.** Duyarlılık işi dar ekranda gerçekten
tutuyor.

İki kusur buldu, ikisi de aynı günün yüzey turunun EKSİĞİ:
- `products/aging`'in hiç `<h1>`'i yokmuş (14px `<div>`) — import sayfasındaki
  kusurun eşi. `PageHeader`'a taşındı.
- **BEŞİNCİ çip lehçesi `purchase/rfqs`** — elle örülmüş, pasifi
  `--bg-tertiary`. **Kapı kaçırdı: kural `role="tab"` arıyordu, o butonlarda o
  rol yoktu.** Ders: kural yazımı değil KAVRAMI hedeflemeli — ama genelleştirme
  denemesi 5 yanlış pozitif verdi (dropzone/toggle/kutucuk), geri alındı;
  yerine pozitif benimseme kilidi kondu ve sınır teste yazıldı.

**Ölçüm tuzağı:** `tap-44` hit-area'sı CSS'te bir SINIF LİSTESİNE veriliyor
(`.topbar-brand`, `.seg button`, `.hamburger-btn`, `.field-link`, `.row-link`).
Sınıf adına bakan tespit 50 sayfa "kusurlu" dedi; gerçek `::after` ölçüsüyle 36.
Kalan 36 doğrulanmadan bulgu sayılmadı.

**Repoda ÜÇÜNCÜ kez** dosyanın kendi yorumu kaynak-testini yanlış kırmızı yaktı
→ `filter-chips-source`'a yorum soyma eklendi. · **2026-09-04 buton dili Dilim 1** (Veri Aktarım sihirbazı, 4 dosya,
26→8 buton): ana aksiyonlar `--accent-bg` %10 tint'ten `primary`e, `tabBtnStyle`
(4. çip lehçesi) + `btnSecondary` silindi, sheet/kayıt-türü sekmeleri
`FilterChips`e, bitiş ekranındaki 5 buton-görünümlü `<Link>` → `ButtonLink`.
Kapı `button-source-regression`e eklendi (yeni rakip kapı açılmadı), 6/6 kırmızı
kanıtlı. **Ölçüm sınıfı dersi: `<button>` taraması buton-görünümlü `<Link>`leri
kaçırır.** Kalan: Dilim 2-3-4 (~67 buton / 23 dosya) + topbar 390px taşması (A7). · **2026-09-04 (2) Dilim 2·3·4 KAPANDI** (101→60 buton): `btn()` +
`iconButtonStyle` + `.tap-row-gap` silindi; **panel sekmeleri de beyaz/mavi dile
geçti** (2026-08-31 kararı kullanıcı tarafından tersine çevrildi — muafiyet artık
yalnız `FilterChips` BİLEŞENİNİ kullanma zorunluluğundan, yüzey tek dilden);
ikon kontrollerinde kural **kenarlıklı→`icon` / kenarlıksız→`ghost`**;
`developer/logs` çok-seçimli olduğu için FilterChips değil ama aynı palet.
**Sarma yaması yerine yerleşim garantisi:** `FilterChips` `nowrap` açıkça
yazılıp `gate/touch-targets`'a bağlandı. · **2026-09-04 (3) KALAN ÜÇ MADDE KAPANDI:** (a) **§A7 yatay taşma** — kayıtlı teşhis (`.topbar-right` flex-shrink + ticker) YANLIŞTI; gerçek sebep ızgara kolonunun otomatik minimumu: `.topbar-wrapper`da `minWidth: 0` YOKTU, başlık `nowrap` + `overflow: hidden` (min-content'i KÜÇÜLTMEZ) → kolon başlık kadar genişliyor, ellipsis hiç devreye girmiyordu; 120 ölçüm (30 rota × 2 genişlik × 2 tema) → taşma 0. (b) **`Button.ghostDanger`** — `.file-action-btn` ailesi (depodaki tek `--danger` hover kuralı) silindi, elle buton 60 → 59. (c) **A4** konsol filtreleri URL'e (`useUrlFilters`). Rapor: `docs/audit/2026-09-04-kalan-uc-madde.md`.

## 2026-09-08 — `QuoteForm` bölüm başlıkları (Faz B'nin son açık maddesi)

**Sekiz başlık, SIFIR başlık elemanı.** Ölçüldü: `/quotes/new` **0 → 8 başlık**
(h1 + 7 h2), `quotes/[id]` 1 → 8; seviye atlaması 0, taşma 0 (2 tema ×
{1440,390}). Beşi ortak `SectionHeader`a gitti (10→11px · ls .7→.44px · renk
1 kademe). **İki marka-mavisi belge başlığı (`#0072BC`) ortak bileşene GİTMEDİ,
elle `<h2>` oldu — piksel farkı 0**: `QuoteDocument.tsx`in
`metaSectionHeadStyle`ı basılan PDF'te aynı başlıkları `C.brand` ile çiziyor,
form o belgenin **ekran aynası**; griye çevirmek aynayı kırardı (kullanıcı
kararı). Gönder diyaloğunun adı depodaki **son** elle yazılmış diyalog
başlığıydı → `variant="dialog"`, 13→16px **yakınsama**.

**ASIL BULGU — baskı seçicisi ETİKETE bağlanmıştı.** `globals.css`
`@media print`: `.q-meta-col > div:first-child`. `<div>`→`<h2>` onu **sessizce
eşleşmez** hâle getiriyordu. `page.emulateMedia({ media: "print" })` ile
ölçüldü (**depoda baskı çıktısı bugüne kadar HİÇ ölçülmemişti**): düzeltme
öncesi 10px / .7px / `rgb(17,17,17)` / gri ayraç — **marka mavisi baskıda
tamamen düşüyordu**; sonrası 7.5px / .3px / `#0072BC` / mavi ayraç. CI baskı
almaz. Seçiciler konuma bağlandı (`> :first-child`) ve etiket adı taşımaları
kapıya yasaklandı. **Ders: bir seçici, bağlandığı şeyin ETİKETİNİN
değişmeyeceğini varsayamaz** — "görünmek ≠ olmak"ın üçüncü yüzü: bu kez bir
`<div>`i anlamlı bir elemana YÜKSELTMEK ona bağlı stili düşürüyordu.

**h1 boşluğu + mükerrer gösterim.** `/quotes/new`in h1'i YOKTU (tek "başlık"
tıklanamaz bir kırıntı çubuğuydu, segmentleri bağlantı bile değildi);
`quotes/[id]`de ise geçen turun `PageHeader`ı ile formun kırıntısı **teklif
numarasını ve durum rozetini İKİ KEZ** basıyordu — geçen turun kendi
eklemesinin yan etkisi. `QuoteForm`a `pageHeader?: boolean`, **varsayılan
`true`** (prop'u unutan yeni taşıyıcı başlıksız değil, fazladan başlıklı
kalır). `enableInlineSend` bilerek yeniden KULLANILMADI: biri gönderim akışı,
diğeri sayfa kabuğu. **Ek:** kardeş `OrderForm`da da aynı kusur —
`/orders/new` + `/orders/[id]/edit` h1'siz, 14px `<div>` başlıklı → `PageHeader`
(yeni kapı kuralı doğduğu gün istisna taşımasın diye).

**Ölçü aracı iki kez bulgu oldu.** (a) **Bayat CSS bir sunucu yeniden
başlatmasını atlattı** — düzeltmeden SONRA da 10px okundu; `touch`, dev
sunucusu restart'ı ve `.next/dev/build` silmek yetmedi, yalnız **`.next`
tamamen silinince** taze CSS servis edildi. *Bir CSS iddiasını ölçmeden önce
SERVİS EDİLEN çıktıyı doğrula.* (b) **Boşa giden mutasyon zayıf kuraldan ayırt
edilemedi (2. kez)** — K1'in ilk mutasyonu dosyadaki İLK `color: "#0072BC"`ı
değiştirdi ama o dize `<h2>`de değil "TEKLİF | QUOTATION" bandındaydı; kural
HAKLI olarak yeşil kaldı, SHA denetimi de HAKLI olarak uyarmadı. *Bir mutasyon
da iddia ettiği sınırın içine düşmelidir.*

**Kapı:** `form-consistency` +3 kural — **istisna BLANKET olmasın**
(`H2_EXCEPTIONS`e bir dosya koymak o dosyanın TAMAMINI muaf tutar → `QuoteForm`
içindeki her elle `<h2 style={` `#0072BC` taşımak zorunda) · **form h1 kaynağı**
(`QuoteForm`+`OrderForm` `PageHeader` basar ve `title` verir; taşıyıcının kendi
`PageHeader`ı varsa form kendininkini KAPATIR) · `CONVERTED` girdisi.
`surface-consistency` +1: **baskı seçicisi etikete bağlanamaz**. `title`
desenine yine `\s` sınırı (**sınır dersinin 5. tekrarı**); `GLOBALS` ilk kez
`stripComments`ten geçirildi (**kendi gerekçe yorumun kuralı tetikler**,
6. kez). **6/6 kırmızı-kanıtlı.** 501 dosya / **7010 test**.

**KAPSAM DIŞI, kayıtlı:** baskı belgeleri (`QuoteDocument` 8px/.1em ·
`PurchaseOrderDocument` .1em · `RfqDocument` 0.4 — üç ayrı imza, ortak
"document" varyantı tek kullanıcılı olurdu) · meta ızgarasının form etiketleri
(başlık değil etiket) · **iki diyalog başlığı** (`quotes/[id]:533` ve ortak
`ConfirmModal`ın kendi 15px/650 başlığı) — ilki yıkıcı işlemde `--danger-text`e
dönüyor, yani ANLAMSAL renk taşıyor; `SectionHeader` bunu modellemiyor ve
`style` sözleşmesi (28 çağrının hepsinde yalnız `margin*`) renk kaçışına açık
değil. Üstelik ortak `ConfirmModal` `tone="danger"`da bile başlığı
`--text-primary` bırakıyor → kanonik davranış kırmızı başlık DEĞİL.

## 2026-09-10 — Dokunma tabanı + kalan yedi borç

**ASIL BULGU: uygulamanın ANA GEZİNMESİ 44px tabanının altındaydı.**
`.nav-rail-item` (Sidebar 16 bağlantı + Ayarlar rayı) **222×36, `::after` YOK**.
`tap-44` seçici listesi 2026-08-31'de yazılmıştı ama bu sınıf listeye hiç
girmedi — **ve ölçüm de göremedi: mobil çekmece KAPALIYKEN ölçülüyordu.**
Kutu tek başına yetmedi (bağlantılar bitişik → 8px çakışma) → YENİ
`.nav-rail-group` mobilde `gap: 8px`; **görsel yükseklik 36px KALDI.**

**YENİ `BackLink`** — beş lehçe / 11 yüzey tek dile indi (kullanıcı kararı:
**buton dili kazanır**). `←` metin oku ekran okuyucuda "sol ok" diye
okunuyordu → `ArrowLeft` `aria-hidden` süsü.

**`SectionHeader`: sözleşme yorumdaydı, TİPTE açıktı.** `style` "yalnız
boşluk" diyordu ama tip `CSSProperties`ti; daraltılınca **beş çağrı yeri
sözleşmeyi zaten deliyordu**. YENİ `tone` (`danger`/`warning`) + `dialog`
varyantına `lineHeight: 1.35` (iki çağrı yeri bağımsız olarak aynı değeri
yazmıştı). Depodaki **son iki elle yazılmış diyalog başlığı** ortak kaynağa
girdi — `ConfirmModal` `tone="danger"`da bile başlığı nötr bırakıyordu.

**`.tap-wrap-row`** — sarabilen AKSİYON satırları için (18px = xs 26 + 18 = 44).
Bu, silinen `.tap-row-gap`in geri gelmesi DEĞİL: o kural tek çip-şeridi
içindi ve yerini yerleşime bıraktı; bu kural sarmayı yasaklayamadığımız
yerler için (aksiyon düğmeleri dar ekranda sarmak zorunda).

**Ölçüm SONRA:** checkbox 150→0 · buton 36→4 · bağlantı 142→30 · başlıksız
rota 0 · taşma 0. Kapı 14 kural, **14/14 kırmızı-kanıtlı**; tur dört zayıflık
yakaladı (desen komşusuna tutundu · kural BOŞ KÜMEYİ denetliyordu · kural
kendi yorumuna tutundu [7. kez] · "en az bir dosya" sayı iddiasıydı) ve
**kapının kendi CSS ayrıştırıcısı** da düzeltildi.
