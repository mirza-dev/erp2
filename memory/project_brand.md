---
name: project_brand
description: Roven marka + pazarlama (2026-09-15/18) — geniş KOBİ konumu, isim/domain kararı, Akış Altıgeni logosu, fiyat modeli (kurulum + yıllık bakım), landing satış hunisi (fiyat/form/SEO), /rehber içerikleri, satış kiti
metadata:
  type: project
---

# Roven marka çalışması (marka ajanı, dal `worktree-brand-roven`)

**Kullanıcı kararları (2026-09-15/16):** konumlandırma **GENİŞ — her sektörden KOBİ** (PMT ilk referans; "vana/endüstriyel" pazarlama dilinden çıktı) · **isim: Roven KALIR, domain `rovenerp.com`** (16 Eyl; alternatifler elendi; rehber §9 geçiş listesi — DNS/Coolify/`NEXT_PUBLIC_APP_URL`/Supabase redirect/Resend; **kod fallback'i `erp.getmedspace.com` domain canlıya alınana kadar bilerek değişmez**, `app.` alt alanı AÇILMAZ) · logo: **A Akış Altıgeni** · çıktılar: rehber + logo + landing/OG + isim/domain/tescil.

**Tek kaynak:** `docs/brand/roven-marka-rehberi.md` (§1.5 **dürüstlük tablosu: vaat ≤ canlı** — AI/Paraşüt koşullu yazılır; §2 "yapay zeka" ≠ "AI" kuralı; §4.4 üç ayrı mavi: UI accent `#58a6ff/#123f73`, e-posta `#2563eb` [sapma], belge `#0072BC` = **müşterinin** rengi, Roven'ın değil) · `docs/brand/isim-arastirmasi.md` (roven.com/.com.tr DOLU — .com.tr Roven Çikolata; **`tekakis.com/.com.tr/.tr` MÜSAİT**, "tek akış"; `rovenerp.com` müsait; "Raven Software Lab" sesteş ERP satıcısı; TÜRKPATENT/TMview sorgusu **kullanıcı adımı**).

**Logo: A — Akış Altıgeni SEÇİLDİ ve UYGULANDI (2026-09-16).** Konseptler `docs/brand/logo-konseptleri.{html,png}` (artifact kullanıcıda görünmedi → yerel dosya). Geometri DÖRT kaynakta birebir (`RovenLogo.tsx` [`useId` mask], `icon.svg`, `scripts/brand-mark.ts` [raster tek kaynak → `pwa:icons` + `og:image`], `global-error.tsx` inline) — `roven-logo.test.tsx` kilitler (kırmızı-kanıtlı). PWA ikon/splash/OG yeniden üretildi; `build-pwa-icons.ts` kendi `HEX`ini bıraktı. Manifest `id`/SW değişmedi.

**OG görseli statik `public/og.png`** (`npm run og:image`, Playwright + gömülü Geist) — dinamik `opengraph-image` rotası proxy oturum kapısından `/login`e düşerdi (bağlantı tarayıcıları oturumsuz); `.png` matcher'dan muaf. Script `PLAYWRIGHT_CHROMIUM_PATH` ile yerel Chromium'a yönlendirilebilir (bu makinede `ms-playwright/chromium_headless_shell-1228`).

**E-posta kabuğu logosu barındırılan PNG** (`/icons/icon-192.png`) — Gmail/Outlook inline SVG ve data-URI'yi siler.

**Koordinasyon:** ERP [eb31fd] (A1–A7 kod işleri) ve ERP EKSİKLER [ac3797] (onboarding, `templates.ts` sonuna `renderUserInvite`) ajanlarıyla protokol: marka yüzeylerine (page.tsx, RovenLogo, icons/splash, manifest, layout metadata, globals marka token'ları) dokunmadan önce mesaj. ERP ajanının ölçümü: AI PDF okuma + Paraşüt bugün KAPALI; kural tabanlı uyarılar, öneri motoru, teklif→sipariş zinciri, PDF teklif e-postası, PWA, tema, RBAC CANLI.

## Pazarlama turu (2026-09-18) — kimlikten talep üretmeye

**Ölçüm:** marka kimliği bitmişti ama **satış hunisi yoktu** — fiyat yok, iletişim yolu yok, robots/sitemap/JSON-LD yok, analytics yok, canlı site yok. Marka ajanının işi bu noktadan sonra talep üretmek.

**Fiyat kararı (kullanıcı): tek seferlik kurulum + yıllık bakım** (abonelik DEĞİL). `docs/brand/fiyatlandirma-modeli.md` — maliyet tabanı ~$16-18/ay/müşteri (Supabase marjinal $10 + sunucu payı + Resend), pazar taraması (Netsis 5 kullanıcı ~25k TL/yıl · Wolvox 45k'dan · Paraşüt 940 TL/ay). Kurulum 45/85/150 bin TL, bakım 24/42/72 bin TL/yıl; ilk yıl bakım dahil; zam TÜFE+%5.

**Paketler modüle göre AYRILAMAZ** — kodda müşteri bazlı özellik kapısı yok, tüm kurulumlar aynı kodu çalıştırır. Bu kısıt *farka* çevrildi: "kullanıcı başına ücret yok · modül başına ücret yok · barındırma dahil". Paketler **hizmet seviyesine** göre ayrışır.

**Landing artık huni:** `#fiyat` (rakamlar açık — bu segmentte saklamak güven kaybettiriyor) + `#iletisim` (son blok üçüncü "Demoyu gez" değil FORM). YENİ `POST /api/contact`: DB'ye yazmaz/okumaz (KVKK), alıcı env'den gelir (relay imkânsız), bal küpü + `POLICIES.CONTACT` 3/15dk/IP + alan tavanları; alıcı yoksa 503 (sessizce yutmaz). Env: `CONTACT_EMAIL`, `NEXT_PUBLIC_CONTACT_EMAIL`.

**SEO:** `robots.ts` (/dashboard,/api,/login yasak — yönlendirilen yollar aramada "Giriş · Roven" kopyaları üretir) · `sitemap.ts` · JSON-LD (SoftwareApplication+Organization+FAQPage, sayfanın kendi dizilerinden türetilir) · `SITE_URL` tek kaynak (`lib/marketing/site.ts`) → metadataBase/robots/sitemap/JSON-LD ayrışamaz.

**`/rehber`** — üç Türkçe yazı (ERP fiyatları · Excel'den geçiş · stok rezervasyonu). İçerik VERİ (`lib/marketing/articles.ts`), MDX değil; vurgu `**…**` → `<strong>` React elemanı, `dangerouslySetInnerHTML` YOK → içerik dosyası etiket üretemez (testle kilitli). `page.tsx`in CSS'i `marketing-css.ts`e taşındı (Next route-segment kuralı page'den sabit export ettirmiyor); token kopyası yasak, testle kilitli.

**`docs/brand/satis-kiti.md`:** ICP (5-50 kişi, **teklif veren** işletme) · **asıl rakip Excel** · 30 dk demo senaryosu (vurucu an: teklif gönderilince satılabilir stok düşer) · itiraz karşılama ("ya bırakırsanız" en meşru itiraz; escrow maddesi sözleşmede HENÜZ YOK, o cümle kullanılmamalı) · kanal sırası **mali müşavir ortaklığı birinci** (müşavirin işini almıyoruz: beyanname/resmî muhasebe ürün kapsamı dışında).

**Why:** marka vaatleri koddan bağımsız yazılırsa kapalı özellik satılır; rehber §1.5 tablosu bunu kilitler.
**How to apply:** yeni pazarlama metni yazmadan önce rehber §1.5'i güncelle; logo/isim değişirse §6.3 / isim raporu §5 listesini tek commit'te uygula; [[project_delivery]] tek-kiracılı modeli "verileriniz size ait" mesajının dayanağı.
