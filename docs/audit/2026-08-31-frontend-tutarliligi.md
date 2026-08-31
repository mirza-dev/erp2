# Frontend tutarlılığı — form etiketleri, sayfa başlıkları, yeni yüzeyler

**Tarih:** 2026-08-31 · **Tetikleyen:** Kullanıcı son turların frontend'ine
odaklanmak istedi ("developer console falan o son yapılan işlerin frontend
iyileştirmelerine odaklanmalıyız").

Ölçüm sonucu: kod **çalışıyordu** ama uygulama **ekrandan ekrana farklı
görünüyordu**. İki kusur da `memory/project_frontend_renewal.md`'nin
"Faz B liste tarafı ✅ / form tarafı AÇIK" borcunun karşılığıydı.

**Migration YOK · yeni bileşen YOK** (mevcut `Input.tsx` ve `PageHeader.tsx`
genişletildi).

---

## Bulgu 1 — form etiketleri: 10 kopya, 5 varyant

| Varyant | Dosya sayısı |
|---|---|
| `12px / 500 / secondary` | 3 |
| `12px / --font-label-weight / secondary / BÜYÜK / 0.04em` | 1 |
| `12px / secondary / BÜYÜK / 0.04em` | 1 |
| `11px / tertiary / BÜYÜK / 0.04em` | 2 |
| `11px / tertiary` | 1 |
| `11px / tertiary / block / margin 3px` | 2 |

Tedarikçi formunu doldurup RFQ formuna geçen kullanıcı etiketlerin **boyut, renk
ve BÜYÜK HARF** olarak değiştiğini görüyordu. İki aile tam eşit bölünmüştü (5-5),
BÜYÜK HARF 4 dosyada vardı 6'sında yoktu — yani "çoğunluk ne yapıyorsa o" kuralı
karar veremiyordu.

**Kanonik (kullanıcı kararı): `11px / var(--font-label-weight) / --text-secondary`,
BÜYÜK HARF YOK.** Gerekçe: `.login-field > .lbl` — login repodaki en son
tasarlanmış yüzey ve etiketi tam bu. BÜYÜK HARF Türkçe uzun etiketlerde satır
kaplamasını artırıyor (`İLGİLİ KİŞİ` vs `İlgili kişi`).

**Çözüm:** `Input.tsx`'e `labelStyle()` eklendi ve 10 yerel sabitin **gövdesi**
ona bağlandı — çağrı yerleri (`style={labelStyle}`) hiç değişmedi. Bu, aynı
dosyadaki `fieldStyle(size)`'ın 2026-08-24'te kurduğu emsalin tekrarı: **blast
radius sıfır**.

Yardımcı **yalnız tipografi** taşır; `display`/`marginBottom` gibi yerleşim
özellikleri çağıranda kalır — çünkü onlar forma göre değişir ve merkezde
sabitlenirse her ekranı aynı boşluğa zorlar.

**Ek:** 3 dosyada `inputStyle` hâlâ elle yazılıydı. `vendors` ve `production`
`fieldStyle("md")` ile **birebir aynıydı** (saf sadeleştirme); `settings` ise
sürüklenmiş olandı — eski `--border-secondary` token'ında kalmıştı, `Input.tsx`'in
kendi yorumu bu drift'i zaten anlatıyor.

---

## Bulgu 2 — sayfa başlıkları: 16 elle yazılmış `<h1>`, 5 farklı boyut

Ölçülen boyutlar **16 · 18 · 19 · 20 · 24 px**, ağırlıklar **600 · 650 · 760**.
`PageHeader` bileşeni **vardı** ve 15 dosyada kullanılıyordu — uygulama başlık
konusunda tam ikiye bölünmüştü. (Panonun kendi yorumu bile `{/* PageHeader */}`
diyordu ama bileşeni kullanmıyordu.)

**Göç edilenler**

- **Görsel değişim SIFIR (6):** `production` · `purchase/suggested` ·
  `rfqs/new` · `rfqs/[id]` · `orders/new` · `orders/[id]` — zaten tam `20px/600`.
- **Boyut değişen (5):** `dashboard` (19→20) · `parasut` (16→20) ·
  `settings/users` (16→20) · `email-deliveries` (ağırlık kazandı) ·
  `settings` (CSS sınıfı: 16→20 **ve** 650→600).

**`PageHeader`'a eklenen iki yuva** — ikisi de gerçek ihtiyaçtan doğdu, ikisi de
isteğe bağlı ve varsayılan davranışı değiştirmiyor:

| Prop | Neden |
|---|---|
| `titleAdornment` | Belge ekranlarında başlığın YANINDA durum rozeti var (sipariş no + "Onaylandı"). `title`'ı `ReactNode` yapmak da olurdu ama o zaman `refreshAriaLabel` varsayılanı metin üretemezdi. **Süs yoksa sarmalayıcı düğüm de üretilmiyor** — mevcut 20+ çağıranın DOM'u birebir aynı kaldı |
| `align="start"` | Üretim ekranının sağ bloğu çok satırlı (etiketli tarih seçici + düğme + durum satırı); `center` başlığı gözle görülür biçimde aşağı kaydırırdı |

**Kasıtlı istisnalar** (kapı testinde gerekçesiyle kayıtlı, 8 dosya):
`product-types/[id]` detay kahramanı · `products/[id]` (başlığın SOLUNDA 80px
ürün görseli) · `developer/errors/[id]` (`<h1>` bir **hata mesajı**) ·
`developer/layout` ("console kapalı" uyarısı) · `RfqDocument` (baskı belgesi) ·
`not-found` · `global-error` · `offline` (üçü de uygulama kabuğu dışında).

---

## Bulgu 3 — var olmayan CSS değişkenleri (kapı testi buldu)

Token doğrulaması yazılırken **iki gerçek kusur** çıktı, ikisi de sessizdi:

1. **`/sifre-yenile` hata kutusu** → `var(--danger-soft-bg, transparent)`.
   Böyle bir token **yok** (repodaki benzer ad `--button-danger-soft-bg`, ayrı
   bir şey) → arka plan sessizce `transparent`a düşüyordu. Bugün yazdığım kod.
2. **`import/excel` satır vurgusu** → `rgba(var(--danger-rgb,248,81,73),0.06)`.
   `--danger-rgb` de yok ve satır içi yedek **koyu tema kırmızısı** → eksik veri
   içeren satır **aydınlık temada yanlış renkte** vurgulanıyordu. Mevcut kusur.

İkisi de repo standardına (`--danger-bg`/`--danger-border`/`--danger-text`)
bağlandı. Bantlardaki ölü fallback zincirleri de temizlendi.

**Ders:** `var(--x, yedek)` sözdizimi hatayı **yutar**. Yanlış yazılmış bir token
uyarı üretmez, yalnız yanlış görünür.

---

## Kapı testi

**YENİ `src/__tests__/gate/form-consistency.test.ts` (8 test).** Bu iş tek
seferlik bir temizlik olduğu için asıl risk **geri kaymak**: yeni bir ekran kendi
etiketini/başlığını yazar, kimse fark etmez, ayrışma yeniden başlar.

1. Hiçbir dosya kendi etiket **tipografisini** yazmaz (ortak yardımcıyı çağırmalı).
2. Hiçbir `inputStyle` elle yazılmaz.
3. Elle yazılmış `<h1 style={…}>` yalnız **gerekçesi yazılı** istisnalarda olabilir.
4. Kanonik etiket login referansıyla aynı ve **yerleşim taşımıyor**.
5. Hiçbir yüzey var olmayan CSS değişkenine başvurmaz.
6. `PageHeader` benimsemesi ≥ 20 dosya (biri geri alırsa yanar).

**Yorumlar soyuluyor** — aynı gün `global-error` kırmızı-kanıtı tam bu yüzden
yanmamıştı (dosyanın yorumu `<html>` içeriyordu, test kodu değil kendi
açıklamasını doğruluyordu).

**Kural bir kez de ölçümle sertleştirildi:** ilk hâli `<h1 style={{…}}` arıyordu;
ölçümde `/gizlilik` ve `/sifre-yenile`'nin stili `const h1Style` diye çıkarıp
kuralın **altından geçtiği** görüldü. Desen `<h1 style={` olarak daraltıldı ve o
iki sayfa gerekçesiyle istisna listesine eklendi.

**6/6 kural kırmızı yandığı kanıtlanarak** eklendi.

---

## Doğrulama

`tsc` 0 · `lint` 0 · **493 dosya / 6881 test** · `build` 0 · migration yok.

**Hesaplanmış stil ölçümü** (ekran görüntüsü değil — iddianın asıl kanıtı):
prod build üzerinde `getComputedStyle` ile altı ekranda başlık okundu →
**hepsi `20px/600`**. Ayarlar ilk turda `20px/**650**` çıktı (CSS sınıfı
`--font-heading-weight` taşıyordu; yalnız boyutu değiştirmiştim) — düzeltilip
yeniden ölçüldü.

Yatay taşma: ölçülen ekranların hepsinde **0px**. Ayarlar başlığı 20px'e çıkınca
kabuk kenarlığına sıkışmadı (plandaki risk gerçekleşmedi).

### Ölçüm kapsamının SINIRI

Demo/viewer oturumu RBAC nedeniyle `production`, `vendors`, `settings/users`,
`rfqs/*`, `purchase/*`, `parasut` ekranlarına **giremiyor** (hepsi `/dashboard`'a
döner). Bu ekranların göçü kaynak + tip + test düzeyinde doğrulandı; **görsel
doğrulaması kullanıcıda**.

Aynı sınır **Developer Console** için daha katı: `INTERNAL_OPERATOR_EMAILS`
`.env.local`'de **boş**, yani console kimseye açık değil ve sidebar linki bile
render edilmiyor. `developer/bugs` ve `developer/errors/[id]`'deki etiket
değişikliği o env açıldıktan sonra doğrulanmalı.

---

## React Doctor — sıfır regresyon (kıyasla doğrulandı)

Bir önceki turda "staged regressions" uyarısı **gerçekti** (2 ham `<a>` linki), o
yüzden bu sefer de körlemesine reddedilmedi. `HEAD~1`'de geçici worktree açılıp
aynı komut koşuldu ve **kural bazında** karşılaştırıldı:

| | temel (`1f07b16`) | bu commit |
|---|---|---|
| hata | 87 | 91 |
| uyarı | 565 | 566 |

Fark **tamamen gitignore'lu üretilmiş dosyalardan**: `supabase/schema-bundle/*.sql`
(4 hata, `npm run schema:bundle` çıktısı) ve `.next/static/chunks/*.js` (1 uyarı,
derleme çıktısı). Taze worktree'de ikisi de yok. **Kural bazında kaynak kodda
fark YOK** (`diff` boş).

Not: `.next` çıktısındaki uyarı *"BaaS authority map shipped in browser artifact"* —
Supabase'i tarayıcıdan kullanan her uygulamada tablo adları ve anon anahtar
istemci paketine girer; savunma RLS'tedir ve 2026-08-30 denetiminde **65/65
tabloda anon ile 0 satır** ölçülmüştü.
