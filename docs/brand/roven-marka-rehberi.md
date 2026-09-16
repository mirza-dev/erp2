# Roven — Marka Rehberi

Status: Accepted (v1)
Last Updated: 2026-09-16 (2)
Applies To: Roven — tüm kullanıcıya görünür yüzeyler (landing, uygulama kabuğu, e-posta, belge, PWA, hata sayfaları, dış yazışma)
Sahibi: marka ajanı · Kaynak kararlar: kullanıcı (2026-09-15) — bkz. §0

> Bu belge **tek doğruluk kaynağıdır**: bir yüzey markayı nasıl gösterecek, hangi kelimeyi kullanacak, hangi rengi alacak — cevabı burada yoksa buraya eklenir, yüzeyde uydurulmaz. Kodda yaşayan sözleşmeler (token adları, bileşen prop'ları, dosya yolları) burada yalnız *işaret edilir*; kural koddaki kapı testlerinde yürür.

---

## 0. Kararlar (kullanıcı, 2026-09-15)

| Konu | Karar |
|---|---|
| İsim | **Roven KALIR** (karar 2026-09-16); alternatifler araştırıldı ve elendi (`docs/brand/isim-arastirmasi.md`). Domain: **`rovenerp.com`** — bkz. §9 |
| Konumlandırma | **Geniş: her sektörden KOBİ.** PMT Endüstriyel ilk referans müşteri; "vana/endüstriyel" vurgusu pazarlama dilinden çıkar |
| Teslim modeli | Tek kiracılı, müşteri başına ayrı kurulum (`docs/musteri-kurulum.md`) — pazarlamada "verileriniz size ait, ayrı veritabanı" olarak söylenir |
| Logo | 3 konsept sunuldu; **A — Akış Altıgeni seçildi (2026-09-16)** ve uygulandı (§6.3) |
| Çıktılar | Bu rehber · logo yenileme · landing + OG görseli · isim/domain/tescil araştırması |

---

## 1. Marka özü

### 1.1 Ne
Roven, küçük ve orta ölçekli işletmelerin **teklif → sipariş → stok → üretim → satın alma → muhasebe** zincirini tek akışta yöneten, yapay zekâ destekli bir ERP'dir.

### 1.2 Kime
- **Birincil:** 5–100 çalışanlı, ürün satan/üreten/ticaretini yapan KOBİ'ler — patron ve 2–10 kişilik ofis ekibi (satış, satın alma, depo, muhasebe).
- **Karar verici:** işletme sahibi / genel müdür. **Günlük kullanıcı:** satış temsilcisi, satın almacı, depo sorumlusu, ön muhasebe.
- **Bugünkü alışkanlık:** Excel'de teklif, WhatsApp'ta sipariş, deftere/Excel'e stok, muhasebeye ayrı giriş. Roven bu dağınıklığın karşısına konumlanır.

### 1.3 Tek cümlelik değer önermesi
> **İşletmenin tamamı, tek ekranda.** Teklif, sipariş, stok, üretim ve muhasebe artık dağınık tablolarda değil.

Kısa varyantlar (bağlama göre):
- Slogan (landing h1): **İşletmenin tamamı, tek ekranda.**
- Alt cümle (meta description / manifest): **Teklif, sipariş, stok, üretim ve muhasebe tek akışta.**
- Kategori etiketi (title suffix, manifest name): **Yapay Zeka Destekli ERP**
- Problem→çözüm bandı: *Excel'de teklif. WhatsApp'ta sipariş. Deftere stok. Muhasebeye ayrı giriş.* → **Roven hepsini tek akışa bağlar.**

### 1.4 Mesaj sütunları (öncelik sırasıyla)
1. **Tek akış** — bir belge bir kez girilir; teklif kabul edilince sipariş, sipariş onaylanınca rezervasyon, sevk edilince fatura kendiliğinden oluşur. (Kanıt: teklif→sipariş atomik zinciri, mig.088; stok rezervasyon motoru.)
2. **Aynı stoğu iki kez satmama** — fiziksel / rezerve / satılabilir / yoldaki mal ayrımı; teklif gönderilince rezervasyon. (KOBİ'nin en pahalı hatası; rakiplerin çoğu yalnız "stok adedi" gösterir.)
3. **Riskleri önceden söyler** — 9 kural tabanlı uyarı tipi (kritik stok, geciken sevkiyat, süresi dolan teklif, vadesi gelen PO…), takvim görünümü, kullanıcı notları. **Yapay zekâ bunun üstüne** gelir (bkz. §1.5 dürüstlük kuralı).
4. **Kurulumu bir öğleden sonra** — Excel'inizi bırakın, kolon eşleştirme deterministik (yapay zekâ olmadan da doğru), 5 adımlı kurulum paneli.
5. **Verileriniz size ait** — müşteri başına ayrı veritabanı, AB bölgesi (Frankfurt), KDV/Türkçe/Paraşüt uyumu, yedek/geri yükleme provası.

### 1.5 Dürüstlük kuralı (vaat ≤ canlı)
Pazarlama metni **yalnız canlı olanı** düz cümleyle vaat eder; anahtara/entegrasyona bağlı olanı **koşullu** yazar. 2026-09-16 ölçümü (ERP mimar ajanı):

| Özellik | Durum | Nasıl yazılır |
|---|---|---|
| Excel içe aktarma, kolon eşleştirme | CANLI (deterministik) | düz vaat |
| PDF/görsel belge okuma | anahtara bağlı (`ANTHROPIC_API_KEY`) | "yapay zekâ anahtarı tanımlıyken" / "isteğe bağlı" |
| Kural tabanlı uyarılar (9 tip) + takvim | CANLI | düz vaat |
| Yapay zekâ bulguları / satın alma kopilotu | anahtara bağlı | koşullu |
| Satın alma önerisi (deterministik motor) | CANLI | düz vaat |
| Teklif → sipariş → rezervasyon | CANLI | düz vaat |
| Teklif PDF e-postası | CANLI (`EMAIL_FROM` ister) | düz vaat |
| Paraşüt entegrasyonu | kod tamam, teslim KAPALI | "hazır, isteğe bağlı açılır" — asla "otomatik akar" deme |
| PWA, koyu/aydınlık tema, 6 rol, yedek/geri yükleme | CANLI | düz vaat |

Yeni bir vaat eklemeden önce bu tablo güncellenir; tablo yoksa vaat de yoktur.

---

## 2. İsim ve yazım

- Ürün adı **Roven** — ilk harf büyük, gerisi küçük. `ROVEN`, `roven` (metin içinde), `RovenERP`, `Roven ERP™` **yazılmaz**. Kod tanımlayıcıları (`RovenLogo`, `roven_remember`) bu kuralın dışındadır.
- Kategori sıfatı ayrı yazılır: **Roven — Yapay Zeka Destekli ERP** (uzun tire, boşluklu). Sekme başlığı deseni: `Sayfa · Roven` (ürün içi), `Roven — Yapay Zeka Destekli ERP` (giriş kapıları).
- **"Yapay zekâ" / "yapay zeka"**: kullanıcıya görünen Türkçe metinde **"yapay zeka"** (şapkasız, gövde metniyle tutarlı; başlıkta "Yapay Zeka"). **"AI"** yalnız kod, teknik doküman ve `ai_*` tanımlayıcılarında. → `manifest.webmanifest` `name` ve `layout.tsx` `title` bu kurala hizalanır (bkz. §7 sapmalar).
- Modül adları (sidebar ile birebir; pazarlamada da aynı ad): Genel Bakış · Teklifler · Satış Siparişleri · Cariler · Stok & Ürünler · Üretim · Uyarılar · Satın Alma Önerileri · Fiyat Talepleri · Satın Alma Siparişleri · Tedarikçiler · Veri Aktarım Merkezi · Paraşüt · Ayarlar. "Müşteriler" değil **Cariler**; "Envanter" değil **Stok**.
- Rakip/marka adları metinde geçebilir (Excel, WhatsApp, Paraşüt) — kıyaslama değil, bağlam olarak.

---

## 3. Ses tonu

**Kişilik:** işini bilen, sakin, kısa konuşan bir operasyon müdürü. Ne heyecanlı satışçı ne de soğuk kurumsal.

| İlke | Yap | Yapma |
|---|---|---|
| Somut | "Aynı stoğu iki kez satma riski yok — sistem rezervasyonu yönetir." | "Devrim niteliğinde stok yönetimi" |
| Kısa | "Belgeni bırak. Sistem işler. Önde kal." | üç satırlık özellik cümleleri |
| Dürüst | "Yapay zekâ anahtarı tanımlıyken PDF'i de okur." | "Her belgeyi anında anlar" |
| Kullanıcı tarafından | "Tahmin etme — gör." | "Sistemimiz size sunar" |
| Sektör-nötr | "ürün", "kalem", "cari", "sevkiyat" | "vana", "DN", "flanş" (yalnız PMT referans hikâyesinde) |

**Hitap:**
- **Pazarlama yüzeyleri** (landing, sosyal, tanıtım e-postası): **sen** — "İşletmeni tek ekrandan yönet." Mevcut landing bu dili kuruyor; korunur.
- **Ürün içi ve işlem e-postaları** (uygulama, 404/500, bildirim, teklif e-postası, belgeler): **siz** — "Aradığınız sayfa taşınmış olabilir." Müşteriye giden her şey **siz**.
- İkisi aynı yüzeyde karışmaz.

**Noktalama:** Türkçe tipografi — uzun tire (—) boşluklu, kesme işareti düz ('), tırnak "…" (düz çift tırnak; kıvrık tırnak yalnız tasarım yüzeylerinde). Ünlem pazarlamada bile en fazla bir kez.

---

## 4. Renk

Kaynak: `src/app/globals.css` (`:root` koyu, `[data-theme="light"]` aydınlık). **Kural (reference_theming): renk her zaman CSS değişkeninden; sabit hex yalnız tema-muaf yüzeylerde** (landing pinli koyu palet, PDF/baskı, e-posta, PWA ikonları, OG görseli).

### 4.1 Roven mavisi (accent)
| Tema | Token | Değer | Kullanım |
|---|---|---|---|
| Koyu | `--accent` / `--accent-text` | `#58a6ff` | bağlantı, vurgu, aktif durum, landing h1 gradyanı (`#79c0ff → #58a6ff → #9fd0ff`) |
| Koyu | `--accent-border` | `#388bfd` | birincil buton alt tonu, kenarlık |
| Aydınlık | `--accent` / `--accent-text` | `#123f73` | bağlantı, vurgu |
| Aydınlık | `--accent-border` | `#1c568e` | kenarlık |
| Birincil buton (uygulama) | `Button primary` | koyu `#67b3ff→#4a98f5`, aydınlık `#1f609d→#123f73` gradyan | login ekranı referans |

### 4.2 Zemin ve metin
| Rol | Koyu | Aydınlık |
|---|---|---|
| Sayfa zemini `--app-bg` / `--bg-secondary` | `#131518` | `#e8eef5` |
| Yükseltilmiş yüzey `--surface-raised` / `--bg-primary` | `#1a1d23` | `#ffffff` |
| Birincil metin `--text-primary` | `#e6edf3` | `#172033` |
| İkincil metin `--text-secondary` | `#aeb7c4` | `#435064` |

### 4.3 Anlamsal renkler (accent DEĞİL — durum için)
`--success` `#3fb950`/`#1a7f37` · `--warning` `#d29922`/`#9a6700` · `--danger` `#f85149`/`#cf222e`. Pazarlamada vurgu olarak **kullanılmaz**; yalnız durum rozetlerinde.

### 4.4 Tema-muaf yüzeylerin sabitleri
| Yüzey | Sabit | Not |
|---|---|---|
| Landing (`page.tsx` `.rv-root`) | koyu palet birebir | ziyaretçinin OS temasından bağımsız, imza koyu |
| PWA ikonları (`scripts/build-pwa-icons.ts`) | zemin `#1a1d23`, işaret `#e6edf3` | ham `icon.svg` rasterlenmez (medya sorgusu uygulanmaz) |
| E-posta (`src/lib/email/templates.ts` `COLORS`) | metin `#172033`, accent `#2563eb` | **sapma**: e-posta accent'i Roven mavisi değil (§7) |
| Teklif/PO belgesi (`QuoteDocument` `C.brand`) | `#0072BC` | **Roven'ın değil, müşterinin belge rengi** (PMT). Ürünleştirmede `company_settings`'e taşınmalı (§7) |

---

## 5. Tipografi

- **Arayüz ve pazarlama:** Geist Sans (`--font-geist-sans`, `next/font` ile gömülü). Yedek: `system-ui, sans-serif`.
- **Mono (kod, etiket, eyebrow):** Geist Mono (`--font-geist-mono`). Landing eyebrow'u: 11.5px, `letter-spacing .12em`, büyük harf.
- **Ağırlık token'ları** (`globals.css`): gövde 450 · UI 500 · etiket 600 · başlık 650 · tablo hücresi 500 / tablo başlığı 650. Pazarlama h1: 680, `letter-spacing -.035em`, `line-height 1.02`.
- **Wordmark:** Geist **700**, `letter-spacing: 0`, `line-height: 1`. Başka font, ağırlık, harf aralığı, italik **yok**.
- **PDF (react-pdf):** Montserrat 600/700/800 + Inter 400/500/600 gömülü TTF (`src/lib/quote-pdf/fonts/`) — Geist react-pdf'te gömülmediği için belge yüzeyi bilinçli farklı. Türkçe karakter için TTF gömme zorunlu.
- **E-posta:** sistem yığını (`-apple-system, Segoe UI, Arial`) — web fontu yüklenmez.

---

## 6. Logo

### 6.1 Bileşen ve dosyalar
| Varlık | Yol | Not |
|---|---|---|
| Bileşen (tek kaynak) | `src/components/layout/RovenLogo.tsx` | `size`, `showWordmark`, `wordmarkSize`, `gap` |
| Favicon | `src/app/icon.svg` | `prefers-color-scheme` ile iki renk |
| iOS ikonu | `src/app/apple-icon.png` (180) | Next `<link rel="apple-touch-icon">` üretir |
| PWA ikonları | `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `npm run pwa:icons` ile yeniden üretilir, PNG'ler commit'lenir |
| Açılış ekranları | `public/splash/*.png` (10 boyut) | aynı script |
| Kilit testi | `src/__tests__/roven-logo.test.tsx` | mark biçimi değişirse sözleşme burada güncellenir (gevşetilmez) |

### 6.2 Kullanım kuralları
- **Varsayılan lockup:** işaret + wordmark, `gap` 5px, ikisi de `currentColor` → bulunduğu yüzeyin `--text-primary`'sini alır. Logo hiçbir zaman kendi rengini taşımaz (accent'e boyanmaz).
- **Yalnız işaret** (`showWordmark={false}`): 16px altına inmez; `role="img" aria-label="Roven"` bileşenden gelir.
- **Boyutlar (ölçülmüş):** topbar 20/17 · landing nav 19/17 · footer 16/14 · login kartı `<h1>` sarar (erişilebilir ad "Roven", uydurma başlık yok — `surface-consistency` kilidi).
- **Boşluk:** işaretin kenar uzunluğu kadar (en az `size`) her yönde temiz alan. Uygulama ikonunda %16, maskable'da %26 kenar payı (script sabitleri).
- **Yapma:** gölge, degrade, dış çizgi, döndürme, yatay/dikey sıkıştırma, wordmark'ı ayrı fontla yazma, "Roven" kelimesini düz metin olarak işaretin yanına elle yazma (test kırar: `>\s*Roven\s*<` yasak).
- **Koyu/aydınlık:** ayrı varlık yok — tek SVG, renk miras. Tema-muaf yüzeylerde (e-posta, PDF, OG) sabit `#e6edf3` üzerine `#1a1d23` zemin (koyu) veya `#172033` üzerine beyaz (aydınlık).

### 6.3 İşaret: Akış Altıgeni (karar: kullanıcı, 2026-09-16)
Üç konsept sunuldu (`docs/brand/logo-konseptleri.html` / `.png`: A Akış Altıgeni · B Geometrik R · C Tek Akış); **A seçildi ve uygulandı.**

- **Anlam:** altıgen = işletmenin hücresi (teklif, sipariş, stok, üretim); içinden sol→sağ geçen ve ortada bir kademe atlayan kanal = "Roven hepsini tek akışa bağlar". Kademe, akışın ERP'de bir dönüşümden geçtiğini söyler.
- **Geometri (24×24):** köşeler `12,2.8 19.97,7.4 19.97,16.6 12,21.2 4.03,16.6 4.03,7.4`, stroke 2.6 round-join; kanal `M1.5 9.6 H10.2 L13.8 14.4 H22.5`, genişlik 2.4, round cap/join, **negatif alan** (`<mask>`: beyaz zemin + siyah yol) → işaret tek renkle çalışır.
- **Dört kaynak, aynı sayılar** (test `roven-logo.test.tsx` kilitler): `RovenLogo.tsx` (React; mask id `useId`'den, sayfada birden çok logo olabilir) · `src/app/icon.svg` · `scripts/brand-mark.ts` (raster tek kaynak → `pwa:icons` + `og:image`) · `src/app/global-error.tsx` (inline kopya; uygulama bileşeni import edemez).
- **Alt sınır:** 16 px (sekme ikonu); altında kanal kapanır. Uygulama ikonu %16, maskable %26 kenar payı.
- `RovenMark` (dekoratif, `aria-hidden`) landing modül çiplerinde kullanılır; `RovenLogo showWordmark={false}` erişilebilir ad taşır.

---

## 7. Yüzey envanteri ve bilinen sapmalar

| Yüzey | Marka nasıl görünüyor | Durum |
|---|---|---|
| `/` landing | RovenLogo nav+footer, koyu pin, "sen" dili | geniş-KOBİ revizyonu bu turda |
| `/login` | `<h1>` logoyu sarar | ✅ |
| Topbar (dashboard) | RovenLogo → `/dashboard` linki | ✅ |
| `/offline`, `/gizlilik`, `/sifre-yenile` | logo/`<h1>` var | ✅ |
| `not-found.tsx` (404) | **logo yok** | bu turda eklenir (RovenLogo import serbest — sunucu bileşeni) |
| `global-error.tsx` (500) | **logo yok**; uygulama bileşeni import **edemez** | bu turda **inline SVG** ile eklenir |
| E-posta kabuğu (`templates.ts` `internalShell`) | düz metin "Roven" 18px/800; `[Roven]` konu öneki ✅ | bu turda header'a inline SVG işaret; accent `#2563eb` → Roven mavisine hizalama **ayrı iş** |
| Teklif e-postası (müşteriye) | firma adı/logosu (müşterinin) | doğru — müşteriye giden yüzeyde Roven arka planda kalır |
| Teklif/PO belgesi | müşteri logosu (`company.logo_url`), `#0072BC` | `C.brand` sabiti müşteri ayarına taşınmalı (ürünleştirme borcu, kod işi ERP ajanına) |
| PWA manifest | `name: "Roven — AI Destekli ERP"` | §2 kuralına göre "Yapay Zeka Destekli ERP" (bu turda) |
| `layout.tsx` metadata | title "Roven — AI Destekli ERP", description "…— PMT Endüstriyel" | başlık §2'ye, açıklama §1.3'e hizalanır; `openGraph`/`twitter` **yok** → bu turda eklenir + `opengraph-image` |
| README | "PMT Endüstriyel için geliştirilmiş" | konumlandırma cümlesi güncellenir (PMT = ilk referans) |

---

## 8. Sosyal / paylaşım görseli (OG)

- Üretim: `src/app/opengraph-image.tsx` (Next `ImageResponse`, 1200×630) — koyu zemin `#131518`, sol üst lockup, ortada slogan (§1.3), alt şeritte üç kanıt cümlesi. Tema-muaf sabitler §4.4.
- Metadata: `openGraph.title` = sayfa başlığı, `description` = §1.3 alt cümle, `locale: "tr_TR"`, `type: "website"`; `twitter.card = "summary_large_image"`.
- Görselde ürün ekranı **yok** (gerçek müşteri verisi sızmasın — manifest `screenshots`'ın atlanma gerekçesiyle aynı).

---

## 9. Domain: `rovenerp.com` (karar: kullanıcı, 2026-09-16)

`roven.com` ve `roven.com.tr` başkasında (ikincisi Roven Çikolata) → ürünün adresi **`rovenerp.com`**. Pazarlamada isim yine yalnız **Roven**; "ERP" eki yalnız domainde ve arama sonuçlarında ("Roven ERP") görünür.

**Alınacaklar (aynı gün, kullanıcı):** `rovenerp.com` (birincil) · `rovenerp.com.tr` (Türk müşteri yazımı; `.com`'a yönlendirir) · isteğe bağlı `rovenerp.tr`, `rovenerp.io` (savunma). Whois 2026-09-16 18:50: dördü de müsait.

**Alt alan planı:**
| Alan | Ne |
|---|---|
| `rovenerp.com` | landing (`/`) + uygulama (`/dashboard`) — tek Next uygulaması, ayrı host gerekmez |
| `www.rovenerp.com` | → apex'e 301 |
| `app.rovenerp.com` | **açılmaz** — uygulama apex'te; ikinci host PWA `id`/çerez/OAuth allowlist'ini ikiye bölerdi |
| `mail`/`send` alt alanı | Resend'in DKIM/SPF kayıtları için Resend'in verdiği alt alan (ör. `send.rovenerp.com`) |

**Geçiş listesi (domain alındıktan sonra; hepsi env/panel, kod DEĞİŞMEZ):**
1. DNS: apex A/AAAA veya CNAME → Coolify; `www` → apex.
2. Coolify: domain `rovenerp.com`, TLS.
3. Env (`docs/deploy-env-matrix.md`): `NEXT_PUBLIC_APP_URL=https://rovenerp.com` — e-posta bağlantıları, OG `metadataBase`, teklif paylaşım linkleri buradan üretilir; **kod fallback'i `erp.getmedspace.com` bilerek değiştirilmedi** (env yokken ölü hosta link üretmesin diye eski canlı adres kalır; domain canlıya alınınca fallback da güncellenir — tek satır × 3: `layout.tsx`, `email/templates.ts`, `.env.example`).
4. Supabase → Auth → URL Configuration: Site URL + Redirect URLs'e `https://rovenerp.com/auth/callback` (Google girişi ve parola kurtarma buna bağlı — `memory/project_auth.md`).
5. Resend: `rovenerp.com` domain doğrulaması → `EMAIL_FROM=Roven <bildirim@rovenerp.com>`.
6. Sentry `SENTRY_ENVIRONMENT`/allowed origins; CSP'de `connect-src` Supabase'e bakıyor, domain'den bağımsız.
7. Eski adres (`erp.getmedspace.com`) 6 ay 301 → yeni; kurulu PWA'lar `start_url` ile eski hosta bakar — kullanıcı ana ekrana yeniden ekler (manifest `id` değişmez, yalnız host).

## 10. Bu rehber nasıl değişir
- Vaat eklemek → önce §1.5 tablosu.
- Renk/tipografi eklemek → önce `globals.css` token'ı, sonra buraya satır.
- Logo değişmek → §6.3 listesi + test sözleşmesi aynı commit'te.
- Her değişiklik `docs/brand/CHANGELOG` yerine bu dosyanın "Last Updated" satırı + git geçmişi.
