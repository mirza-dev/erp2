---
name: project_brand
description: Roven marka çalışması (2026-09-15/16) — kararlar (geniş KOBİ, Roven ana aday + Tekakış alternatifi), marka rehberi/isim raporu konumu, logo seçimi bekliyor, OG statik PNG gerekçesi, ajanlar arası koordinasyon protokolü
metadata:
  type: project
---

# Roven marka çalışması (marka ajanı, dal `worktree-brand-roven`)

**Kullanıcı kararları (2026-09-15):** konumlandırma **GENİŞ — her sektörden KOBİ** (PMT ilk referans; "vana/endüstriyel" pazarlama dilinden çıktı) · isim: **Roven ana aday + alternatif araştırması** · logo: **konseptler sunulur, kullanıcı seçer** · çıktılar: rehber + logo + landing/OG + isim/domain/tescil.

**Tek kaynak:** `docs/brand/roven-marka-rehberi.md` (§1.5 **dürüstlük tablosu: vaat ≤ canlı** — AI/Paraşüt koşullu yazılır; §2 "yapay zeka" ≠ "AI" kuralı; §4.4 üç ayrı mavi: UI accent `#58a6ff/#123f73`, e-posta `#2563eb` [sapma], belge `#0072BC` = **müşterinin** rengi, Roven'ın değil) · `docs/brand/isim-arastirmasi.md` (roven.com/.com.tr DOLU — .com.tr Roven Çikolata; **`tekakis.com/.com.tr/.tr` MÜSAİT**, "tek akış"; `rovenerp.com` müsait; "Raven Software Lab" sesteş ERP satıcısı; TÜRKPATENT/TMview sorgusu **kullanıcı adımı**).

**Logo:** 3 konsept artifact'ta (A Akış Altıgeni [önerilen] · B Geometrik R · C Tek Akış) — https://claude.ai/artifact/EpgzWaavtH8o4MmhkomtyF — **SEÇİM BEKLİYOR.** Seçilince: `RovenLogo.tsx` + `icon.svg` + `scripts/brand-mark.ts` (raster tek kaynak) + `build-pwa-icons.ts`'i brand-mark'a bağla + `npm run pwa:icons` + `roven-logo.test.tsx` `<polygon>` sözleşmesi + `page.tsx` strip inline polygon. Manifest `id`/SW DEĞİŞMEZ.

**OG görseli statik `public/og.png`** (`npm run og:image`, Playwright + gömülü Geist) — dinamik `opengraph-image` rotası proxy oturum kapısından `/login`e düşerdi (bağlantı tarayıcıları oturumsuz); `.png` matcher'dan muaf. Script `PLAYWRIGHT_CHROMIUM_PATH` ile yerel Chromium'a yönlendirilebilir (bu makinede `ms-playwright/chromium_headless_shell-1228`).

**E-posta kabuğu logosu barındırılan PNG** (`/icons/icon-192.png`) — Gmail/Outlook inline SVG ve data-URI'yi siler.

**Koordinasyon:** ERP [eb31fd] (A1–A7 kod işleri) ve ERP EKSİKLER [ac3797] (onboarding, `templates.ts` sonuna `renderUserInvite`) ajanlarıyla protokol: marka yüzeylerine (page.tsx, RovenLogo, icons/splash, manifest, layout metadata, globals marka token'ları) dokunmadan önce mesaj. ERP ajanının ölçümü: AI PDF okuma + Paraşüt bugün KAPALI; kural tabanlı uyarılar, öneri motoru, teklif→sipariş zinciri, PDF teklif e-postası, PWA, tema, RBAC CANLI.

**Why:** marka vaatleri koddan bağımsız yazılırsa kapalı özellik satılır; rehber §1.5 tablosu bunu kilitler.
**How to apply:** yeni pazarlama metni yazmadan önce rehber §1.5'i güncelle; logo/isim değişirse §6.3 / isim raporu §5 listesini tek commit'te uygula; [[project_delivery]] tek-kiracılı modeli "verileriniz size ait" mesajının dayanağı.
