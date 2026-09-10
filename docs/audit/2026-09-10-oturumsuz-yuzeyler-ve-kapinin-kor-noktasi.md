# Oturumsuz yüzeyler + kapının kör noktası — 2026-09-10 (ikinci tur)

**Tetikleyen:** kullanıcı, aynı gün kapanan dokunma-tabanı turunun ardından
kalan iki maddeyi seçti: **C1 (LoginMonolith UI yenilemesi)** ve
**küçük borçlar turu** (AI route RBAC · audit actor trigger · `view_import`
açık sorusu · `DemoButton`).

---

## 1 — Asıl bulgu: uygulamanın giriş kapısı başlıksızdı

`/login` deponun **başlık elemanı hiç olmayan tek yüzeyiydi**. Ölçüm
(390×844, iki tema, **oturumsuz**) h1/h2/h3 sayısını **0** buldu. Karşılaştırma
için: `/`, `/gizlilik`, `/offline`, `/sifre-yenile` ve 404'ün hepsinde h1 vardı.

İşaretlemede niyet zaten duruyordu — `<div className="mono-heading-block">`
adında, flex-kolon, `gap: 10px` bir sarmalayıcı vardı ve **içinde yalnız bir
`<p>` bulunuyordu**. Başlık için ayrılmış yer, başlıksız kalmıştı. Yanındaki
CSS yorumu bile `/* Form (bare — başlık formun dışında) */` diyordu.

**Uydurma başlık metni eklenmedi.** Bir giriş ekranında sayfanın görünen
kimliği wordmark'ın kendisidir; `<h1>` logoyu **sarıyor** ve erişilebilir adı
`"Roven"` oluyor. `mono-brand-tag` ("Endüstriyel ERP") kaşlık olarak kalıyor ve
`aria-labelledby` hedefi olmayı sürdürüyor.

**Görsel nötrlük iddia değil, ölçüm:**

| görünüm | h1 kutusu | çocuk kutusu | margin | font-size |
|---|---|---|---|---|
| 390px | `22,167,118,32` | `22,167,118,32` | `0/0/0/0` | 14px (miras) |
| 1440px | `115,167,118,32` | `115,167,118,32` | `0/0/0/0` | 14px (miras) |

Tarayıcının h1 varsayılanları (2em, bold, blok, dikey margin) `.mono-brand`
flex satırını bozardı; `.mono-brand-title` hepsini geri alıyor.

---

## 2 — Neden kaçmıştı: envanterin altıncı bölgesi

Aynı günün dokunma turu **29 `/dashboard/*` rotası** gezdi ve "kapandı" dedi.
Oturum açmamış birinin gördüğü **her** yüzey o listenin dışındaydı.

*Bir envanter, ölçmediği durumu kapsayamaz* — dersin **ikinci** tekrarı; ilki
aynı gün, mobil çekmece kapalıyken ölçülen Sidebar'dı.

Kapı da aynı yerden kördü: `surface-consistency`in *"başlıksız sayfa kalmaz —
**TÜM** rotalar"* kuralı `src/app/dashboard` ağacını tarıyor. İsim "tüm" diyor,
kapsam demiyor.

### Ölçüm — önce / sonra (390×844, 2 tema, 6 rota, oturumsuz)

| | önce | sonra |
|---|---|---|
| toplam kontrol | 78 | 78 |
| 44px altı | **50** | **24** |
| bağlantı | 8 | **0** |
| buton | 30 | **12** |
| alan (input) | 12 | 12 |
| başlıksız rota | 1 | **0** |
| yatay taşma | 0 | 0 |
| komşu çakışması | 0 | 0 |

**Masaüstü nötrlüğü (1440px):** 86 kontrol, `::after` üreten eleman **0**,
taşma 0, çakışma 0 — `tap-44` ailesi yalnız ≤768px'te tanımlı.

### Düzeltilenler

| yüzey | önce | çözüm |
|---|---|---|
| login tema düğmesi `.icon-btn` | 32×32 | `tap-44` ailesi (görsel 32×32 kalır) |
| "Beni hatırla" `.check` | 91.7×**18** | yalnız **dikey** büyür (aşağıda) |
| "Parolayı göster" `.trail` | 42×42 | `tap-44` ailesi |
| açılış "Giriş Yap" | 55.5×**20.3** | `tap-44` |
| açılış "Demo Gez" | 116.2×**35.5** | `tap-44` |
| `/offline` "Tekrar dene" | 108.1×**37.5** | `tap-44` |
| `/gizlilik` geri bağlantısı | 128.6×**16** | `tap-44` (dili korundu) |

**`.check` neden yalnız dikey:** ölçümde 91.7px genişti, yani yatay taban
zaten iki katı. Yatay büyütmek onu aynı satırdaki `.field-link`in
("Şifremi unuttum") üzerine iterdi — geçen turun `q-note-btn` dersinin aynısı.

**Geri bağlantısının ALTINCI lehçesi** `/gizlilik`te bulundu; sabah beşi
`BackLink`te birleştirilmişti. `BackLink`e **çevrilmedi**: `/gizlilik`
bilinçli olarak uygulama kabuğunun dışında ve kendi sessiz hukuk-metni dilini
taşıyor — aynı gerekçeyle geçen turun da kapsamı dışındaydı. Değişen yalnız
dokunma alanı.

---

## 3 — Kapının kör noktası: hız sınırlayıcı guard sayılıyordu

`route-guard-matrix`in `GUARD_PATTERNS` listesinde `guardAiRoute(` duruyor,
yanında `// IP rate-limit (AI maliyet kapısı — bilinçli sınıf)` yorumuyla.
Fonksiyon okundu: gövdesi **yalnız** `extractClientIp` + sayaç. **Sıfır
kimlik, sıfır yetki kontrolü.** Yani yetkilendirme matrisi bir **hız
sınırlayıcıyı** yetkilendirme sayıyordu.

**Bugün bir bedeli yok** — kesişim ölçüldü ve **boş**:

| uç | proxy | kendi guard'ı |
|---|---|---|
| `/api/ai/parse` | oturum ister | yalnız rate-limit |
| `/api/ai/score` | oturum ister | yalnız rate-limit |
| `/api/ai/purchase-copilot` | **ALWAYS_PUBLIC** | kendi `checkAuth`ı (CRON_SECRET veya oturum) |

Tehlike **gizil ve iki dosyalık**: biri `proxy.ts`nin `ALWAYS_PUBLIC`
listesine yeni bir `/api/ai/*` eklerse ve route yalnız `guardAiRoute` taşırsa,
uç **tamamen açık** olur — ve matris yeşil kalır. Hiçbir dosyanın kendi testi
bu bileşimi görmüyor. Yeni kural tam olarak kesişimi kilitliyor
(mutasyonla doğrulandı: `ai/parse` `ALWAYS_PUBLIC`e eklenince kural kırmızı).

**Backlog'un kaydı düzeltildi.** Eski not "gate bunları zaten guarded sayar →
gerçek borç değil" diyordu. Sonuç doğru (proxy oturumu doğruluyor) ama
**gerekçe yanlıştı**. Kalan gerçek boşluk izin seviyesinde: `viewer` rolü de
`ai/parse`i çağırabiliyor (IP başına 10/dk).

**Kullanıcı kararı: izin eklenmedi, kayda geçirildi.** Sebep: `view_import`
bugün yalnız admin+satınalmada; izin koymak içe aktarma sihirbazını başka bir
rol için sessizce kesebilir ve bu yerelde doğrulanamıyor.

---

## 4 — Kapı: 4 yeni kural, 7 mutasyon, 7 kırmızı

| # | kural | dosya |
|---|---|---|
| K1 | oturumsuz yüzeylerin sınıfları hit-area **kutusunu yaratan** kuralda | `touch-targets` |
| K2 | tekil oturumsuz eylemler (`açılış ×2`, `offline`, `gizlilik`) `tap-44` taşır | `touch-targets` |
| K3 | oturumsuz rotalar başlıksız kalamaz + `/login`in h1'i **logoyu sarar** | `surface-consistency` |
| K4 | `ALWAYS_PUBLIC` ∩ yalnız-hız-sınırlayıcı = **boş** | `route-guard-matrix` |

### K1'in ilk yazımı ZAYIFTI ve mutasyon yakaladı

İlk hâli *"seçici mobil blokta bir yerde geçiyor mu"* diye bakıyordu:

```ts
const hit = MOBILE_RULES.some((r) => r.sels.includes(sel + "::after"));
```

`.icon-btn::after` **kutu kuralından** düşürüldü — kural **yeşil kaldı**.
Sebep: aynı seçici `min-width` kuralında da duruyor ve `some()` onu oradan
buluyordu. `min-width` tek başına kutu yaratmaz (`content` ve konumlandırma
öteki kuralda). İddia, kutuyu **gerçekten yaratan** kurala bağlandı:

```ts
const boxRule = MOBILE_RULES.find(
    (r) => /content:\s*""/.test(r.body) && /min-height:\s*44px/.test(r.body),
);
```

*Desen komşusuna tutundu* — deponun tekrarlayan dersinin **8. kaydı**.

### Kırmızı kanıt tablosu

| mutasyon | sonuç |
|---|---|
| `.icon-btn::after` kutu kuralından düşürüldü (1. deneme) | 🟢 **kural zayıf** → düzeltildi |
| `.icon-btn::after` kutu kuralından düşürüldü (2. deneme) | 🔴 |
| `.trail::after` kutu kuralından düşürüldü | 🔴 |
| `.check::after` yatay da büyütüldü | 🔴 |
| `offline` "Tekrar dene" `tap-44`ü silindi | 🔴 |
| login `<h1>` → `<div>` | 🔴 |
| login h1 logoyu sarmıyor (uydurma metin) | 🔴 |
| `ai/parse` `ALWAYS_PUBLIC`e eklendi | 🔴 |

---

## 5 — Küçük borçlar: üçü zaten kapalı ya da aksiyon alınabilir değil

Bu turun ikinci yarısı, beklenenden **çok daha az iş** çıkardı — çünkü
maddelerin çoğu kayıtta borç görünüp fiilen borç değildi:

- **AI route RBAC** — proxy zaten oturum doğruluyor; kalan boşluk izin
  seviyesinde ve kullanıcı kararıyla kayda geçti (§3).
- **audit actor (trigger)** — `project_quotes`ta zaten *"actor'sız =
  codebase-tutarlı; trigger ayrı faz"* diye **karar** olarak yazılı. Kapatmak
  bir migration + canlı APPLY ister; APPLY kullanıcı tarafında ve şu an bloklu.
  **Aksiyon alınabilir değil.**
- **`view_import` yalnız admin+satınalma** — bir ürün kararı, kod borcu değil.
- **`DemoButton.tsx`** — tüketicisi **sıfır** doğrulandı: tüm depoda tek
  gönderme bir test **yorumunun** içindeydi, üstelik o yorum iki kere yanlıştı
  (`<Link>` diyordu, dosya `<a>` kullanıyordu). **Kullanıcı onayıyla silindi**
  (47 satır); yorum canlı yüzeye (`src/app/page.tsx`) yönlendirildi.

---

## 6 — Gerekçeli kapsam dışı

- **TR/EN dil segmentleri** (37.2×44 · 37.7×44) — bitişik segmentler; ikisi de
  zaten 44px yüksek kutu taşıyor. Her birini 44px **genişletmek** ~6px üst üste
  bindirirdi ve DOM'da sonra gelen (EN) TR'nin alanını yerdi. Şerit bütün
  olarak tek hedef — geçen turun `.seg` kararıyla aynı.
- **login'in iki input'u** (42px) — kullanıcının `input`/`select` kararı;
  WCAG AA tabanını (24px) geçiyorlar.
- **`/gizlilik` dili** — kabuk dışı hukuk metni, kendi sessiz bağlantı dili
  korundu (yalnız dokunma alanı düzeltildi).
- **açılış sayfasının `rv-*` dili** — sayfa kendi stil sistemini taşıyor;
  yalnız iki birincil eylemin hit alanı düzeltildi, görsel dil değişmedi.

---

## 7 — Doğrulama

```
tsc 0 · lint 0 · 501 dosya / 7021 test (7017 → +4 kural) · build uyarısız
E2E 94/94 retries=0 (2.3 dk) · kırmızı kanıt 7/7 · migration YOK
```

Ayrıca **bellek kayması** kapatıldı (ayrı commit): `~/.claude/.../memory`
sembolik bağı `erp2/memory`yi gösterirken commit'ler hep proje-codex
kopyasından atılıyordu → dört dosya (179 satır) hiçbir commit'te yoktu.
Bir `reset --hard` onları sessizce silerdi. İki worktree artık aynı SHA'da.

## 8 — Açık madde

Bu turdan **çıkan açık madde yok.** Kapsam dışı bırakılanların hepsi ölçümle
gerekçeli ve §6'da kayıtlı; ikisi (audit actor trigger, `view_import`)
zaten kullanıcı-tarafı ya da ürün kararı olarak başka yerde izleniyor.
