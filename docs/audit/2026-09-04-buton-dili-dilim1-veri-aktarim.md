# Buton dili — Dilim 1: Veri Aktarım sihirbazı

_2026-09-04 · migration YOK · davranış değişikliği YOK (saf sunum)_

## Neden

2026-08-31 yüzey turunda kullanıcı **bütün sistem** için istemişti: *"butonlar
ve kategoriler beyaz olsun, mavi olması gerekenler mavi olsun"*. O tur beş
sayfayı kanonik yüzeye taşıdı ve 16 butonu `Button`'a bağladı; gerisi
`deferred_backlog` §A6'ya "ayrı tur" diye yazıldı.

Bu turda ölçülen: **50 dosyada 127 elle örülmüş `<button>`**, `gate/surface-
consistency` kapsamı dışında. Dilim 1 = **Veri Aktarım sihirbazı** — en yoğun
küme ve `project_import_module`'e göre **kurulum aracı**, yani yeni müşterinin
ilk dokunduğu ekran.

## Ölçüm (önce)

Buton gövdelerinde yazılı `background` değerleri, 127 buton tarandı:

| değer | adet |
|---|---|
| `"transparent"` | 35 |
| `"none"` | 10 |
| `var(--bg-tertiary)` | 5 |
| `var(--accent)` | 5 |
| **`var(--accent-bg)`** | **3** |
| `var(--danger-bg)` / `var(--warning-bg)` / `var(--surface-raised)` / `var(--bg-primary)` / `rgba(0,0,0,0.38)` | 2/1/1/1/1 |

`--accent-bg` = `rgba(18,63,115,0.10)` — kullanıcının açıkça reddettiği **%10
tint**. Üçü de sihirbazdaydı: `"Dosya Seç"` (`--accent`), `"Eşleştirmeyi
Uygula →"` ve `"Kolon Eşleştirmeye Geç →"` (`--accent-bg`). Yani **kurulum
akışının ana aksiyonları ne maviydi ne beyaz.**

### `<button>` taraması yetmedi

Sihirbazın bitiş ekranında **beş buton-görünümlü `<Link>`** vardı: ikisi
`--bg-secondary` (yani `--app-bg` ile birebir aynı → yüzeyi yok, beş sayfa
turunun kök kusurunun aynısı), üçü `--accent-bg`. `<button` araması bunları
kaçırıyordu. Depo geneline bakıldı: bu sınıftan geriye **3 tane** kaldı
(`PurchaseOrderDocument`, `AiPanel`, ve dönüştürülen `ClassifierQueue`).

## Yapılan

**26 → 8 buton** (4 dosya). Dönüşen 18'i `Button`/`ButtonLink`/`FilterChips`.

- `import/excel/page.tsx` 17 → 3 · `ExtractionReview` 4 → 2 ·
  `ClassifierQueue` 3 → 2 (+1 `<Link>` → `ButtonLink`) · `SetupStatusPanel` 2 → 1
- **`tabBtnStyle` SİLİNDİ** — sheet ve kayıt-türü sekmeleri `FilterChips`e
  geçti. Bu, depodaki **dördüncü** hap-çipi lehçesiydi: aktif `--accent-bg`
  (%10 tint), pasif `transparent`.
- **`btnSecondary` SİLİNDİ** — "Yeni"/"Atla" satır aksiyonları `secondary xs`.
- Bitiş ekranındaki 5 `<Link>` → `ButtonLink`. Üçü eşit hedef olduğu için
  hiçbiri `primary` yapılmadı (keyfî bir "asıl aksiyon" seçmek yanlış olurdu).

### Bilerek dokunulmayan 8 buton

| yer | sebep |
|---|---|
| hata bandı kapatma `×` | ikon-only sessiz kontrol (`background: none`) |
| "AI ile analiz et →" | altı çizili, bağlantı gibi davranan satır içi metin |
| hücre içi düzenle | tablo hücresinin kendi affordance'ı (`padding: 0`) |
| teknik alan çoklu-seçim çipleri | form kontrolü; geçen tur "kategori onay kutuları" bu sınıfta yanlış pozitif üretmişti |
| katalog görseli önizle | `background: none`, bağlantı görünümlü |
| "Excel sihirbazında aç →" | `--warning-bg`; **yanındaki `<span>` ile eşleşen çift** — biri aksiyon, diğeri statik not, aynı uyarı yüzeyini paylaşıyorlar |
| kuyruktan kaldır `×` | ikon-only |
| kurulum paneli açılır başlığı | disclosure header, buton yüzeyi değil |

Ayrıca **3 hata sınırı** (`global-error` · `error` · `dashboard/error`)
kapsam dışı: ölçüldü, yalnız `react` + `@sentry/nextjs` import ediyorlar.
Uygulama çöktüğünde çalışan son çare arayüzü, hata verebilecek bir bileşene
bağlamak yanlış olur.

## Doğrulama — hesaplanmış stil (ekran görüntüsü değil)

Referans hatırlanan hex'lerden değil **canlı DOM'dan** alındı: aynı oturumda
zaten kanonik olan iki yüzey — PageHeader "Yenile" ve aktif FilterChip.

| | referans | sihirbaz |
|---|---|---|
| primary (aydınlık) | `linear-gradient(rgb(31,96,157)→rgb(18,63,115))` · `#fff` · 650 | Dosya Seç ✓ · Kolon Eşleştirmeye Geç ✓ |
| secondary (aydınlık) | `linear-gradient(rgb(255,255,255)→rgb(244,247,250))` · `rgb(23,32,51)` · kenar `rgb(184,199,213)` · 560 | ← Geri ✓ · Yeni Dosya ✓ |
| primary (koyu) | `linear-gradient(rgb(103,179,255)→rgb(74,152,245))` | ✓ |
| secondary (koyu) | `linear-gradient(rgba(255,255,255,.075)→rgba(255,255,255,.035))` | ✓ |

`--app-bg` aydınlık `#e8eef5` / koyu `#131518`; **hiçbir buton zemin renginde
değil**, hepsi `tap-44` taşıyor.

## Bulunan ama düzeltilmeyen: 390px taşma

`/dashboard/import/excel` 390px'te **6px yatay taşıyor** (`scrollWidth` 396 vs
`clientWidth` 390). Ölçülen 7 rotanın yalnız bu birinde var.

**Benim turumdan gelmiyor:** dosya geçici olarak `HEAD`e döndürülüp aynı ölçüm
tekrarlandı → **396, birebir aynı**. Sonra değişikliklerim SHA-256 doğrulamasıyla
geri yüklendi.

**Sebep:** `.topbar-right` hem `min-width: 0` hem **`flex-shrink: 0`** taşıyor —
sağ küme (döviz ticker'ı) küçülmeyi reddediyor. Bu rotanın başlığı uzun
("Excel Aktarım Sihirbazı") olduğu için satır 390'a sığmıyor ve kabuk 396'ya
itiliyor. Taşan elemanlar `topbar-wrapper` / `topbar-shell` / `MAIN` — yani
sayfa içeriği değil **paylaşılan üst bar**.

Düzeltmesi 34 rotayı ve iki temayı etkiler; bu dilimin kapsamı buton dili.
Ayrı tur olarak `deferred_backlog`'a yazıldı.

## Kapı

`button-source-regression.test.ts`'e 1 test eklendi (yeni bir rakip kapı
açmak yerine mevcut ev genişletildi). Kural **pozitif**: dosya `Button`'ı
kullanıyor + ölü lehçe geri gelmemiş + ana aksiyonlar `primary` + iki
`FilterChips` + beş `ButtonLink`.

Depo geneline "buton şekli" araması **yapılmadı** — 2026-08-31'de o yaklaşım
5 yanlış pozitif üretip kuralın geri alınmasına yol açmıştı.

**6/6 kırmızı kanıtlı** (dosya-başına yedek + SHA-256 ile geri yükleme):
primary→secondary · `tabBtnStyle` dönüşü · `FilterChips` kaldırma ·
`ButtonLink`→`Link` · `Button` importunun düşmesi · `btnSecondary` dönüşü.

## Dersler

1. **Yorum self-match tuzağı, dördüncü kez.** Kuralın aradığı
   `tabBtnStyle`/`btnSecondary` adları, o helper'ları silerken bıraktığım
   *gerekçe yorumlarında* geçiyor. `stripComments` olmasa kural kendi
   açıklamasına takılıp hep kırmızı yanardı.
2. **Kaynak-iddiası kuralı mesafeye değil yapıya bağlanmalı.** İlk hâli
   "varyant ile etiket arası en fazla 320 karakter" diyordu; derin girinti onu
   aştı. `(?:(?!</Button>)[\s\S])*?` ile "aynı eleman içinde" kuralına çevrildi.
3. **Mock'un yüzeyi bileşenin yüzeyiyle birlikte büyür.**
   `classifier-queue-interaction` `@/components/ui/Button`'ı yalnız `default`
   ile mock'luyordu; `ButtonLink` eklenince `undefined` kalıp React render'da
   patladı ve **8 test "elementi bulamadım" diye DOLAYLI** hata verdi. Gerçek
   sebep boş gövdeydi. İzole koşumda görünmüyordu — tam suite yakaladı.
4. **`role` locator'ı bileşenin işaretlemesini takip eder.** `FilterChips`
   `role="tab"` basar, liste CTA'sı `ButtonLink` yani `role="link"`;
   `getByRole("button")` ikisini de bulamaz.

## Kapsam dışı — sıradaki dilimler

Dilim 2 satınalma/RFQ (32 buton / 7 dosya) · Dilim 3 ayarlar (15 / 4) ·
Dilim 4 dağınık (~20 / 12). Ayrıca topbar 390px taşması ve
`PurchaseOrderDocument`/`AiPanel`'deki 2 buton-görünümlü `<Link>`.
