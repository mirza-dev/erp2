import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Roven — AI Destekli ERP",
  description:
    "AI destekli sipariş ve stok yönetim sistemi — PMT Endüstriyel",
  manifest: "/manifest.webmanifest",
  // iOS ana ekrandan açıldığında tarayıcı çubuğu olmadan çalışsın.
  appleWebApp: { capable: true, title: "Roven", statusBarStyle: "default" },
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
