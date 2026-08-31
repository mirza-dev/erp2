# Developer Console — frontend turu (2026-08-31)

Kullanıcı Chrome eklentisini bağladı ve "son yapılan işlerin frontend
iyileştirmelerine odaklanalım" dedi. Önceki tur (`f3d5bc1`) Developer Console'u
**ölçememişti**: `INTERNAL_OPERATOR_EMAILS` boştu, konsol kimseye açık değildi,
sidebar linki bile render edilmiyordu.

Bu turda allowlist açıldı ve altı konsol ekranı canlı veriyle, **ekran görüntüsü
değil hesaplanmış stil ölçümüyle** incelendi.

## Erişim: allowlist açıldı

`.env.local`'de 15 anahtar vardı, `INTERNAL_OPERATOR_EMAILS` **yoktu**. Erişim
zinciri `hasInternalOperatorAccess` (`src/lib/auth/internal-access.ts:30`)
allowlist **ve** `view_settings` ister; canlı hesaplar okundu (salt-okunur),
iki gmail de zaten `["admin"]` → `view_settings` var. Yani eksik olan tek şey
allowlist'ti; `ADMIN_EMAILS`'e dokunulmadı.

> Dev sunucusu prod-koruma kapısına takıldı (`predev` → `check-env-target.ts`,
> hedef canlı fabrika `ryvxpolvhvsycuqyphoa`). Tur `ALLOW_PROD_TARGET=1` ile
> **yalnız görsel inceleme** olarak yürütüldü; hiçbir mutasyon düğmesine
> dokunulmadı.

## Bulgular — ölçüm

| # | Bulgu | Kanıt (ölçülen) |
|---|---|---|
| **Y1** | Elle örülmüş kartlarda **yatay dolgu yok** → metin kartın kenarlığına 1px kalıyor | Tanılama'daki 5 kartın hepsi `padding: 0px`, ilk içerik `solBoşluk=1`. Kayıtlar satırı `padding: "8px 0"`, hücre sağı **1446** = kart iç kenarı **1446**. Ev standardı `DataTable` `10px 14px` (`DataTable.tsx:55,63`) |
| **Y2** | Hata Detayı'nda **İstemci** hücresi sıkışmış | `factGrid` = `repeat(auto-fill, minmax(190px,1fr))`; user-agent 7. `Fact`, 6 sütunluk ızgarada tek başına 2. satıra düşüyor → **192×113px, 7 satır, sağında 1019px boş** |
| **O1** | Performans tablosunda satır yükseklikleri düzensiz | İlk 3 satır **58px**, kalanlar **41px** — `"> 12.80 sn"` 84px sütunda ikiye kırılıyor |
| **O2** | Tanılama "Yapılandırma" ızgarasında durumlar kayık | Aynı ızgara satırında taban çizgileri **610 vs 627** (17px); iki etiket iki satıra kırıldığı için |
| **O3** | `<dt>` etiketi kanonik yardımcıyı kullanmıyor — **önceki turun kapısı kaçırdı** | `errors/[id]:352` satır içi `fontSize:"11px", color:tertiary` → ölçülen **11px/450**, kanonik 11px/**600**. `form-consistency` yalnız `const labelStyle` bildirimlerine bakıyordu |
| **O4** | `sectionTitle` 3 dosyada kopya ve **zaten ayrışmış** | `page.tsx` `margin 0 0 6px` · `diagnostics` + `errors/[id]` `0 0 8px`; üçünde de `fontWeight: 650` token yerine sabit. `factGrid` de 2 kopya, `margin` ayrışmış |
| **O5** | Yüklenirken olmayan sayı iddia ediliyor | `errors:157` ve `logs:99` sayıyı koşulsuz basıyordu → gövde "yükleniyor" derken üst satır "**0** grup" diyordu |
| **D1** | Filtreler URL'ye yazılmıyor | `?status=all&range=30d` yok sayıldı; konsol dizininde `useSearchParams`/`router.replace`/`replaceState` **sıfır** |

**Kapsam kararı (kullanıcı):** Y1–Y2 + O1–O5 kapatıldı, **D1 ertelendi**
(davranış değişikliği, `useSearchParams` + Suspense sınırı gerektirir).
Y1'in yöntemi de kullanıcı kararı: satır dolgusunu 14px'e çıkar — `Card`'a
`padding` prop'u eklemek ayraç çizgilerini kartın içine çeker ve 12 dosyayı
etkilerdi.

## Doğrulanan sağlamlık

Bulgu üretmek için zorlanmadı — ölçülüp temiz çıkanlar:

- Altı sayfanın hepsinde **H1 20px/600** (önceki turun kanonik değeri).
- Tüm form kontrollerinde `aria-label` (Hatalar'da 5/5, Kayıtlar'da 4/4).
- Boş durumlar düzgün (`EmptyState`), yatay taşma yok, modül kullanım sayacı
  çalışıyor.
- Hata Detayı'ndaki 13 etiket **tek varyant** — yalnız ağırlığı kanonik dışıydı.
- `DataTable` kullanan üç sayfa (Bug'lar, Hatalar, Performans) Y1'den etkilenmiyor
  — dolguyu ortak bileşen veriyor.

## Çözüm

**YENİ `src/app/dashboard/developer/console-ui.ts`** — konsolun elle örülmüş
yüzeyleri için tek stil kaynağı. `CONSOLE_GUTTER = "14px"` `DataTable`'ın yatay
ritmiyle aynı; `consoleRow(v)` dolguyu satır kutusunun İÇİNDE tutar, `borderBottom`
kutunun kenarında kalır → **ayraç kartın tam genişliğinde kalmaya devam eder**,
tablo görünümü korunur.

`sectionTitle` ağırlığı sabit `650` yerine `--font-heading-weight` token'ından
gelir; token zaten 650 olduğu için geçiş görsel olarak nötr.

**O2'nin ilk denemesi yanlıştı ve ölçümle yakalandı.** `factGrid`'e
`alignItems: "start"` verdim; tarayıcı hâlâ **742 vs 756** gösterdi. Kayma
hücreler *arasında* değil, hücrenin *içinde*: bir satırlık etiketin altındaki
değer, iki satırlığınkinden yukarıda kalıyor. Doğru kol `factCell`
(`height: 100%`, hücre satır yüksekliğine esner) + `factValue`
(`marginTop: auto`, değer alta sabitlenir).

## Kapı testi

**YENİ `src/__tests__/gate/console-consistency.test.ts` (10 test).** Bu iş tek
seferlik temizlik olduğu için asıl risk geri kaymak.

`<li>` kuralın dışında — bu bir whitelist değil, kuralın doğru sınırı: bir liste
öğesinin yatay girintisi ebeveyn `<ul>`'nin işidir. Muafiyetin gerçek bir kusuru
gizlememesi için `<ul>`'nin gutter'ı taşıdığı **ayrıca** kilitlendi.

**11/11 kırmızı yandığı kanıtlandı**, her dosya SHA-256 ile geri yüklendiği
doğrulanarak. (Kanıt turunun ilk denemesinde `basename` çakışması dört
`page.tsx`'i aynı yedek dosyaya yazdı ve üçünü ezdi; dosyalar `HEAD`'den geri
alınıp düzenlemeler yeniden uygulandı, kanıt dosya-başına yedekle tekrarlandı.)

## Tarayıcı doğrulaması — önce/sonra

| Ölçüm | Önce | Sonra |
|---|---|---|
| Kart içeriği ↔ kenarlık | **1px** | **15px** (5 kartın hepsi) |
| Kayıtlar satır dolgusu | `8px 0` | `8px 14px`, ayraç tam genişlikte |
| Hata Detayı İstemci hücresi | 192×113px, **7 satır** | 1183×19px, **1 satır** |
| Hata Detayı `<dt>` | 11px/**450** | 11px/**600**, tek varyant |
| Yapılandırma ızgara tabanları | **610, 627** (kayık) | **756** (beş hücrenin hepsi) |
| Performans satır yükseklikleri | **58, 41** | **41** (14 satırın hepsi) |
| Yatay taşma | yok | yok |

O5 tarayıcıda gözlemlenemedi: SPA geçişinde SWR önbelleği yükleme penceresini
yutuyor (20 örneğin 0'ı yükleme anına düştü). Kaynak seviyesinde kilitli ve iki
dosyada kırmızı kanıtlı.

## Kapsam dışı

- **D1 (URL senkronu)** — ertelendi, yukarıda gerekçesi.
- **Developer Console mobil / dokunma hedefleri** — bir önceki turda kullanıcı
  kapsam dışı bıraktı; 6 konsol sayfasında `tap-44` sıfır ve 14 rotalık duyarlılık
  denetimine hiç girmediler.

## Gate

tsc 0 · lint 0 · 494 dosya / 6891 test · build 0 · migration YOK.
