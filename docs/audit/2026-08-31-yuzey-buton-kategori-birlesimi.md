# Kart yüzeyi + buton/kategori dili (2026-08-31)

Kullanıcı beş sayfayı işaret etti — **Öneriler · Teknik Şablonlar · Uyarılar ·
Veri Aktarım Merkezi · Paraşüt** — "arka plan rengi kartlar vs güzel değil ve
sistemin geri kalanıyla paralel değil" dedi. Ayrıca bütün sistemde butonlar ve
kategoriler beyaz, mavi olması gerekenler mavi, "Yenile" beyaz olsun istedi.

Referans olarak kendi tarayıcısından aldığı iki ekran görüntüsü verdi; görüntüler
bana ulaşmadı ama kullanıcı "örnekleri sistemde var, oradan bakabilirsin" dedi —
referans **login ekranı** çıktı (aşağıda ölçüldü).

## Kök sebep — tek satır

`--bg-secondary` **her iki temada sayfa zeminiyle BİREBİR aynı renk**:

| | `--app-bg` (zemin) | `--bg-secondary` | `--surface-raised` |
|---|---|---|---|
| Koyu | `#131518` | **`#131518`** ⟵ aynı | `#1a1d23` |
| Aydınlık | `#e8eef5` | **`#e8eef5`** ⟵ aynı | `#ffffff` |

Token bozuk DEĞİL: `--bg-secondary` bir **iç oyuk** rengi, zeminle aynı olması
tasarım gereği doğru. Kusur, oyuk renginin **yükseltilmiş kart** olarak
kullanılmasıydı. Bu yüzden token'a dokunulmadı, kullanım düzeltildi.

## Ölçüm — önce (tarayıcı, aydınlık tema, Öneriler)

| Ölçülen | Değer |
|---|---|
| 3 metrik kartının `backgroundColor` | `rgb(232,238,245)` = **zeminle aynı**, `box-shadow: none` |
| Tablo sarmalayıcı | `rgba(0,0,0,0)` — tamamen şeffaf |
| **Yenile** butonu | `rgb(232,238,245)` = **zemin rengi** (`toolbar` = `transparent`) |
| Aktif çip | `rgba(18,63,115,0.10)` — %10 tint |
| Pasif çip | `rgba(0,0,0,0)` — şeffaf |

Ayrıca: **Uyarılar'ın hiç `<h1>`'i yoktu** (dashboard'daki tek başlıksız ekran),
**Veri Aktarım'ınki 14px `<div>`**'di (kanonik 20px).

## Referans — sistemde zaten vardı

Login ekranı ölçüldü; istenen dil birebir `Button.tsx`'te:

| Rol | Ölçülen | Varyant |
|---|---|---|
| **MAVİ** (Giriş Yap) | `linear-gradient(#1f609d→#123f73)`, beyaz metin, 650 | `primary` |
| **BEYAZ** (Google ile devam et) | `linear-gradient(#ffffff→#f4f7fa)`, kenar `#b8c7d5` | `secondary` |

**Yeni token yok, yeni buton tasarımı yok** — hedef zaten uygulanmıştı.

## Yapılanlar

**YENİ `src/components/ui/FilterChips.tsx`** — kendi rengini YAZMAZ, doğrudan
`Button`'ı sürer (`active ? primary : secondary`). "Butonlar ve kategoriler aynı
tasarım" isteği böylece yapısal olarak garanti; ayrışacak ikinci palet yok.
Yan kazanç: `tap-44` dokunma hedefi `Button`'dan bedava geliyor.

Sistemde kategori sekmesi için **dört ayrı dil** vardı; hepsi tek bileşene indi.
`UnderlinedFilterTabs.tsx` ve `ClassificationTabs.tsx` **silindi** (plan onayıyla).

**`PageHeader.tsx`** — Yenile `toolbar` → `secondary`. **Tek satır, 12 sayfa.**

**`Card.tsx`** — `as` + HTML attribute geçişi eklendi. Bir kart aynı zamanda
landmark olabiliyor (`<section aria-label>`); bu kol olmadan o yüzeyler kartı
elle örüyor ve token'lar ayrışıyordu.

**Beş sayfa** kanonik kalıba: yüzey → `Card`/`--surface-raised`, başlık →
`PageHeader`, elle buton → `Button`.

**Saf yardımcı:** uyarı kategori sayaçları `ClassificationTabs`'in içindeydi →
`buildAlertClassItems` (`src/lib/alert-calendar.ts`), DOM'suz test edilebilir.

## Bilerek dokunulmayanlar

- **İç oyuklar** — Paraşüt'teki 10 `--bg-tertiary` (ilerleme çubuğu, filtre
  satırları, küçük çipler), Öneriler'in AI çekmecesindeki bloklar, tablo
  `<thead>` bandı. Beyaz kartın içinde doğru okunuyorlar.
- **Paraşüt'ün adım/hata dağılım listeleri** — plan bunları `FilterChips`'e
  taşıyacaktı; kodu okuyunca yanlış olduğu görüldü: bunlar YATAY çip satırı
  değil, DİKEY dağılım listesi ve biri (hata tipi) aktifken kırmızı — anlam
  taşıyor. Yapıları korundu, yalnız ebeveyn kartları beyazladı.
- **Ürün detayının sekmeleri** (`products/[id]`) — `aria-controls` taşıyan
  PANEL DEĞİŞTİRİCİ; listeyi süzmez, bölme değiştirir. Alt çizgili kalması
  doğru. Gate kuralı bu ayrımı `aria-controls` ile yapıyor (whitelist değil).
- **`ghost` / `icon` varyantları** — bilinçli sessiz kontroller (modal X'i).
- **Yeniden dene butonu** (Paraşüt log) — `--warning` rengi anlam taşıyor.

## Kapı testi

**YENİ `src/__tests__/gate/surface-consistency.test.ts` (7 kural).**
İlk kural bir iddia değil **gerekçe**: `--bg-secondary === --app-bg` iki temada
da doğrulanır; biri token'ları ayırırsa yasak gevşetilebilir.

**7/7 kırmızı yandığı kanıtlandı**, her dosya SHA-256 ile geri yüklendiği
doğrulanarak. Kanıt turu bir kuralın **zayıf** olduğunu ortaya çıkardı: sayfa
başlığı kuralı `PageHeader`'ı yalnız IMPORT edip render etmeyen dosyada da yeşil
yanıyordu → `<PageHeader` etiketine bakacak biçimde güçlendirildi.

## Sonra — tarayıcı ölçümü

| Ölçüm | Önce | Sonra |
|---|---|---|
| Öneriler kart yüzeyi | `rgb(232,238,245)` = zemin, gölge yok | **`rgb(255,255,255)`**, gölge var (4/4) |
| Yenile butonu | `rgb(232,238,245)` = zemin | **`linear-gradient(#fff→#f4f7fa)`** = login'deki beyaz |
| Aktif çip | `rgba(18,63,115,0.10)` tint | **`linear-gradient(#1f609d→#123f73)`** = login'deki mavi |
| Pasif çip | `rgba(0,0,0,0)` şeffaf | **beyaz gradyan** |
| Paraşüt (KOYU tema) | 7/7 kart zeminle aynı | **0/7** — hepsi `#1a1d23` / zemin `#131518` |
| Uyarılar `<h1>` | **YOK** | 20px / 600 |
| Veri Aktarım `<h1>` | 14px `<div>` | 20px / 600 |
| Yatay taşma | yok | yok |

## 390px mobil turu — SONRADAN KOŞULDU

Yerel dev veritabanı kurulunca (bkz. `docs/yerel-gelistirme.md`) Playwright
viewport'uyla koşuldu: **25 rota × 2 tema = 50 ölçüm.**

| | Sonuç |
|---|---|
| Yatay taşma | **0 / 50** |
| Yüklenemeyen | 0 |
| Başlıksız sayfa | **1** |

**İki kusur buldu, ikisi de bu turun EKSİĞİYDİ:**

1. **`products/aging`'in hiç `<h1>`'i yokmuş** — başlık 14px `<div>`, yani Veri
   Aktarım Merkezi'nde düzeltilen kusurun birebir aynısı. 25 rotadan tek
   başlıksız olan. `PageHeader`'a taşındı.

2. **BEŞİNCİ çip lehçesi: `purchase/rfqs`** — `Tümü/Taslak/Gönderildi` elle
   örülmüş, pasifi `--bg-tertiary` (beyaz değil). **Kapı kuralı kaçırdı çünkü o
   butonlar `role="tab"` taşımıyordu** — kural bir YAZIMI kilitliyordu, kavramı
   değil; bu turun kendi dersine ikinci kez düşülmüş. `FilterChips`'e taşındı.

**Kuralı genelleştirme denendi ve GERİ ALINDI.** "Aktiflikle zemini değişen her
buton çiptir" 5 yanlış pozitif verdi (dosya-bırakma alanları, açma/kapama
anahtarı, kategori kutucukları, Paraşüt'ün bilerek bırakılan dikey listesi).
Gürültülü kural kapatılır → yerine `filter-chips-source`'ta **pozitif benimseme
kilidi**. Kuralın bilinen sınırı testin içine yazıldı.

**Dokunma hedefi ölçümü ilk denemede YANLIŞTI:** `tap-44` hit-area'sı CSS'te bir
SINIF LİSTESİNE veriliyor (`.topbar-brand`, `.seg button`, `.hamburger-btn`,
`.field-link`, `.row-link`), yalnız `tap-44` sınıfına değil. Sınıf adına bakan
tespit 50 sayfa "kusurlu" dedi; gerçek `::after` ölçüsüne göre **36**. Kalan 36
çoğunlukla 30–43px bandında ve önceki turun "kritik aileler kapatıldı" kararının
dışında olabilir — **doğrulanmadan bulgu sayılmadı.**

## Gate

tsc 0 · lint 0 · **495 dosya / 6902 test** · build 0 · migration YOK · 7/7 kırmızı-kanıtlı.
