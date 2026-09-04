# Kalan üç madde — §A7 taşma · `Button` ghost-danger · A4 konsol URL filtreleri

_2026-09-04 · migration YOK · RBAC değişikliği YOK · veri yolu değişikliği YOK_

Buton dili turu (`21c8344`) üç açık madde bırakmıştı. Kullanıcı "planla ve
bitir" dedi; kapsam kararı: **hepsi kapansın** (ölçümün bulduğu sayfa-bazlı
taşmalar dâhil).

---

## 1) §A7 — dar ekranda yatay taşma

### Kayıtlı teşhis YANLIŞTI

Dilim 1 raporu sebebi `.topbar-right`'ın `flex-shrink: 0`'ına ve döviz
ticker'ının küçülmeyi reddetmesine bağlamıştı. Ölçüm bunu çürüttü: o küme
`@media (max-width: 768px)` altında **zaten `display: none`** ve toplam
genişliği **76px** — bağlayıcı kısıt o değil.

### Gerçek sebep — ölçülmüş

| ölçü | değer |
|---|---|
| `.topbar-wrapper` hesaplanan `min-width` | **`auto`** |
| `<main>` hesaplanan `min-width` | `0px` |
| `.topbar-shell` min-content | **396px** (= 24 dolgu + 287 sol + 9 boşluk + 76 sağ) |
| `.topbar-left` min-content | 287px — içinde başlık **139px** |
| başlık (`Excel Aktarım Sihirbazı`) | `white-space: nowrap`, `overflow: hidden` |

`.dashboard-grid` dar ekranda **tek kolon** (`1fr`) ve bir ızgara kolonunun
otomatik minimumu `auto`'dur → kolon, çocuklarının **min-content**'i kadar
taban alır. `overflow: hidden` min-content'i **küçültmez**, `nowrap` da onu
tam metin genişliğinde tutar. `<main>` `minWidth: 0` taşıdığı için katkı
vermiyordu; **`.topbar-wrapper` taşımıyordu** → kolon başlık kadar
genişliyor, üç noktalı kısaltma **hiç devreye girmiyordu**.

Kanıt niteliğinde tek satır: taşan beş rota, başlık uzunluğuna göre sıralı.

| rota | başlık | gövde genişliği (360px'te) |
|---|---|---|
| `/dashboard/import/excel` | Excel Aktarım Sihirbazı | **396** |
| `/dashboard/purchase/orders` | Satın Alma Siparişleri | 386 |
| `/dashboard/import` | Veri Aktarım Merkezi | 383 |
| `/dashboard/settings/email-deliveries` | E-posta Teslimatları | 378 |
| `/dashboard/developer` | Developer Console | 371 |

390px'te yalnız ilki taşıyordu: **396 − 390 = 6px** — 2026-09-04 kaydındaki
sayı birebir yeniden üretildi.

### Ölçüm yönteminin kendi kusuru da düzeltildi

İlk metrik `documentElement.scrollWidth − clientWidth`'ti ve
`/dashboard/quotes/new`'de **285px taşma** raporladı. Yanlıştı: mobil
emülasyonda shrink-to-fit `window.innerWidth`i içeriğe göre şişiriyor (675).
Doğru ölçü **`document.body.scrollWidth` ↔ yerleşim görüntü alanı**: kendi
kabında kayan geniş tablo (tasarım) taşma sayılmaz, gövdeyi iten şey sayılır.
Bu metrikle `quotes/new` **temiz** (360→360, 390→390) çıkıyor.

### Düzeltme

- `dashboard/layout.tsx` → `.topbar-wrapper`'a **`minWidth: 0`**; artık iki
  ızgara çocuğu simetrik.
- `globals.css` → `.topbar-right`'taki **`min-width: 0` silindi**:
  `flex-shrink: 0` ile birlikte ölü koddu ve ilk yanlış teşhisin kaynağıydı.
  `flex-shrink: 0` kasıtlı kaldı (tema/profil düğmeleri sıkışmamalı).

### Doğrulama

**30 rota × {360, 390} × {aydınlık, koyu} = 120 ölçüm → taşma 0, hata 0.**
Karşılığında görünüm kaybı yok: başlık artık tasarlandığı gibi kısalıyor
(`scrollWidth 139 > clientWidth 132`), kontrol kutuları aynı (tema düğmesi
30×30), `tap-44` hit-area'ları yerinde.

---

## 2) `Button` — `ghostDanger` varyantı

Dilim 3'ün tek bilinçli istisnası kapandı. `.file-action-btn.is-danger:hover`
depodaki **tek `--danger` hover kuralıydı** (`globals.css` tarandı; JS ile
hover'da kırmızıya dönen kontrol de yok) — yani "dinlenirken sessiz, dokununca
kırmızı" tonunun sistemde karşılığı yoktu: `ghost` nötr hover verir (silme
uyarısı kaybolur), `dangerSoft` sürekli kırmızı dolgudur (satırdaki üç ikondan
birini sürekli alarma çevirir).

**Yeni varyant** `ghostDanger`: `ghost`un aynısı, hover'ı `--danger-bg` /
`--danger-text` / `--danger-border` — yani **silinen kuralın tam kendisi**,
taşınmış hâli. `.file-action-btn` ailesi (3 kural) silindi; sıfır kalan tüketici
grep ile doğrulandı.

Dinlenme rengi bilinçli olarak `--text-tertiary` → **`--text-secondary`**:
komşuları (Önizle/İndir) Dilim 3'te `ghost`a geçince satırdaki üç ikondan biri
daha soluk kalmıştı.

### Ölçüm (hesaplanmış stil, canlı DOM)

| | aydınlık | koyu |
|---|---|---|
| dinlenme (üç ikon da) | `rgb(67,80,100)` | `rgb(174,183,196)` |
| hover metin | `rgb(207,34,46)` = `--danger-text` | `rgb(248,81,73)` = `--danger-text` |
| hover zemin | `rgba(207,34,46,0.1)` = `--danger-bg` | `rgba(248,81,73,0.15)` = `--danger-bg` |
| hover kenarlık | `rgb(207,34,46)` = `--danger-border` | `rgb(218,54,51)` = `--danger-border` |

12 satır aksiyonunun hepsi **26×26** ve **`tap-44`** — kontrol dokunma hedefini
de kazandı (eski sınıf 28×28'di ve hit-area'sı yoktu).

---

## 3) A4 — Developer Console filtreleri URL'e

2026-08-31'den beri açıktı: filtreli görünüm paylaşılamıyor, yenileme filtreyi
siliyor, "şu request-id'ye bak" demenin adresi yok.

**YENİ `src/hooks/useUrlFilters.ts`** — `useListUrlState`in istemci kardeşi.
Ayrı olmasının sebebi yapısal: liste sayfaları RSC'dir ve filtreyi **sunucu**
`searchParams`'tan okur; konsol sayfaları `"use client"` + SWR'dir ve URL'i
**kendileri geri okumak** zorundadır (`useSearchParams`).

Sözleşme tek cümle: **parametre YOKSA varsayılan, VARSA (boş olsa bile) o
değer.** Hatalar ekranının varsayılanı `open` olan `status` alanı bu sayede
"Tüm durumlar" (`""`) seçilince `?status=` olarak yazılabiliyor — uydurma bir
`all` sentinel'i gerekmedi. Varsayılana eşit değer URL'e hiç yazılmaz.

Bağlanan filtreler: Genel Bakış (`range`) · Performans (`range`) · Hatalar
(`range·severity·status·module·search`) · Kayıtlar
(`range·level·sources·requestId·search`) · Bug'lar (`status·priority·search`).
Tanılama'da filtre yok, dokunulmadı.

**İmleçler (`cursors`) URL'e YAZILMAZ** — biriken sayfa yığını bir filtre değil,
oturum içi gezinme durumu; linki açan kişide yeniden kurulamaz.

**Suspense sınırı kabuğa kondu** (`developer/layout.tsx`, `{children}` sarıldı):
`useSearchParams` sınırsızken Next build'i kırar (Faz 4 dersi). Altı sayfaya
ayrı ayrı değil tek yerde — yeni konsol sayfası eklendiğinde kimse hatırlamak
zorunda kalmasın. Build sonrası altı rota da hâlâ statik (`○`).

**Yan kazanç:** metin filtreleri artık `useDebouncedSearch` (350ms) üzerinden
gidiyor. Eskiden her tuş vuruşu yeni bir SWR anahtarı — yani yeni bir istek —
üretiyordu.

**RUM riski ölçüldü, yok:** `TelemetryBridge` `usePathname()` kullanıyor (query
string içermez) → URL'e filtre yazmak `page_usage`/`known-endpoints`
kardinalitesini büyütmüyor (Y1 dersi).

### Tarayıcıda doğrulandı

```
ilk URL             → (boş — varsayılanlar yazılmadı)
ciddiyet=error      → ?severity=error
durum=Tüm durumlar  → ?severity=error&status=          ← boş ≠ yokluk
modül=quotes        → ?severity=error&status=&module=quotes   (debounce sonrası)
YENİLEME            → üç filtre de korundu, URL değişmedi
Kayıtlar 2 kaynak   → ?sources=telemetry,audit → yenilemede 2 düğme basılı
derin link          → ?requestId=abc-123 alana yazıldı
konsol/sayfa hatası → yok
```

---

## Kapı

**8/8 kırmızı kanıtlı** (dosya-başına yedek + SHA-256 geri yükleme doğrulaması).

Yeni rakip kapı açılmadı: kurallar mevcut evlerine eklendi —
`gate/touch-targets` (§A7 · ≤768px kabuk değişmezlerinin sahibi),
`button-source-regression` (ghostDanger), `gate/console-consistency` (A4).
Yeni test dosyası yalnız `url-filters.test.tsx` (hook davranışı).

`npx tsc --noEmit` 0 · `npm run lint` 0 · **496 dosya / 6917 test** ·
`npm run build` 0 uyarı 0 hata.

---

## Ders — kırmızı-kanıt turu ZAYIF bir kural yakaladı (bu, üçüncüsü)

A4'ün "her filtre URL'e bağlı" kuralı ilk hâlinde şöyleydi:

```
useUrlFilters\(\{[\s\S]*?\bpriority\s*:
```

`priority` varsayılan sözlükten silindiğinde kural **yeşil kaldı**: `[\s\S]*?`
nesne literalinden çıkabiliyor ve dosyanın ilerisindeki başka bir `priority:`
(rozet haritası, modal state'i) desene yetiyor. Kural, sözlüğün **gövdesini**
(`useUrlFilters\(\{([^}]*)\}`) ayrıştırıp iddiayı yalnız onun içinde yapacak
biçimde yeniden yazıldı; ek olarak setter'sız yıkım (`const [priority] =
useState()`) da negatif desene alındı.

**Genel kural: bir kaynak iddiası, iddia ettiği SINIRIN içinde kalmalı.**
Bu, "mesafeye değil yapıya bağla" dersinin (Dilim 1) ikinci yüzü.

## İkinci ders — ölçü aracının kendisi de bulgudur

`documentElement.scrollWidth` mobil emülasyonda shrink-to-fit yüzünden
güvenilmez ve `/dashboard/quotes/new`'de **285px'lik hayalet taşma** üretti.
Bir sayfayı "kırık" diye rapor etmeden önce **metriğin doğru şeyi ölçtüğü**
gösterilmeli: burada ayrım "kendi kabında kayan tablo" (tasarım) ile "gövdeyi
iten kutu" (kusur) arasındaydı.

## Kalan

Bu turdan açık madde çıkmadı. Devreden: 36 sayfadaki 30–43px dokunma hedefleri
(2026-08-31 kullanıcı kararıyla kapsam dışı) · kullanıcı-tarafı env
(`ANTHROPIC_API_KEY` · `EMAIL_FROM` · `ADMIN_EMAILS` · `NEXT_PUBLIC_APP_URL`).
