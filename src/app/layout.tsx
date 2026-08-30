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

export const metadata: Metadata = {
  title: "Roven — AI Destekli ERP",
  description:
    "AI destekli sipariş ve stok yönetim sistemi — PMT Endüstriyel",
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
