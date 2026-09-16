import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

/**
 * iOS açılış ekranları — `scripts/build-pwa-icons.ts` içindeki SPLASH listesiyle
 * BİREBİR eşleşmek zorunda; kapı testi bunu dosya sistemine karşı doğruluyor.
 * Medya sorgusu iOS'un eşleştirme kuralı: cihaz noktası cinsinden boyut + oran.
 */
const APPLE_SPLASH = ([
  [1179, 2556, 3], [1290, 2796, 3], [1170, 2532, 3], [1284, 2778, 3],
  [1125, 2436, 3], [828, 1792, 2], [750, 1334, 2],
  [1536, 2048, 2], [1668, 2224, 2], [2048, 2732, 2],
] as [number, number, number][]).map(([w, h, r]) => ({
  url: `/splash/apple-splash-${w}x${h}.png`,
  media:
    `(device-width: ${w / r}px) and (device-height: ${h / r}px) ` +
    `and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));

/**
 * Marka metinleri `docs/brand/roven-marka-rehberi.md` §1.3/§2'den gelir:
 * kategori etiketi "Yapay Zeka Destekli ERP" (kullanıcıya görünen metinde
 * "AI" değil "yapay zeka"), alt cümle tek akış vaadi. `metadataBase`
 * olmadan Next OG görselinin URL'ini göreli basar ve paylaşım kartı
 * (WhatsApp/LinkedIn) görseli çözemez.
 */
const SITE_TITLE = "Roven — Yapay Zeka Destekli ERP";
const SITE_DESCRIPTION =
  "Teklif, sipariş, stok, üretim ve muhasebe tek akışta. KOBİ'ler için yapay zeka destekli ERP.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://erp.getmedspace.com"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Roven",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Roven",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // Statik PNG, dinamik `opengraph-image` rotası DEĞİL: bağlantı tarayıcıları
    // (WhatsApp/LinkedIn/Slack) oturumsuzdur, dinamik rota `src/proxy.ts`
    // kapısından `/login`e düşerdi; `.png` matcher'dan muaf. Üretim: `npm run og:image`.
    images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  manifest: "/manifest.webmanifest",
  // iOS ana ekrandan açıldığında tarayıcı çubuğu olmadan çalışsın.
  //
  // statusBarStyle "default" BİLİNÇLİ: içerik durum çubuğunun ALTINDA başlar.
  // "black-translucent" içeriği çubuğun altına iter ve uygulama genelinde
  // safe-area-inset düzeni ister — bugün olmayan bir sorunu yaratırdı.
  //
  // startupImage: bunlar olmadan iOS ana ekrandan açılışta beyaz bir kare gösterir.
  appleWebApp: {
    capable: true,
    title: "Roven",
    statusBarStyle: "default",
    startupImage: APPLE_SPLASH,
  },
  // Next `appleWebApp.capable` için YALNIZ standart `mobile-web-app-capable`
  // metasını basıyor (tarayıcıda doğrulandı). iOS 16.4 öncesi ana ekrandan
  // tam ekran açılış için Apple'ın kendi metasını hâlâ istiyor — yoksa uygulama
  // Safari kabuğuyla açılır. İkisi bir arada zararsız.
  other: { "apple-mobile-web-app-capable": "yes" },
};

/**
 * Tarayıcı kabuğunu (adres çubuğu, durum çubuğu) sayfanın zeminine boyar.
 * İki tema için AYRI verilmek zorunda: tek renk verilirse aydınlık temada
 * koyu bir şerit, koyu temada beyaz bir şerit kalır.
 * Değerler globals.css ile birebir — `:root`/`[data-theme="dark"]` #1a1d23,
 * `[data-theme="light"]` #ffffff.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d23" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        {/* FOUC-suz tema bootstrap: boyamadan ÖNCE data-theme'i ayarla.
            localStorage 'dark'|'light' ise onu; 'system'/yok ise OS tercihi.
            Hata → 'dark' (mevcut varsayılan). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var r=(t==='dark'||t==='light')?t:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
