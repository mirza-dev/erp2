import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/** Yalnız yerel `next dev` için gevşetmeler; üretim derlemesinde false. */
const isDev = process.env.NODE_ENV !== "production";

/**
 * `next dev` kaynaklarına çapraz-origin erişim Next 16'da VARSAYILAN OLARAK KAPALI:
 * yalnız `localhost` geçer. Telefondan `http://192.168.x.x:3000` açıldığında dev
 * bundle'ı bloklanır, React HİÇ hidratlanmaz ve sayfa SESSİZCE ölür — hata kutusu
 * yok, tıklamalar hiçbir şey yapmaz. 2026-08-31'de tam olarak bu yaşandı
 * ("giriş yapamıyorum": tema düğmesi de ölüydü, Supabase'e hiç istek gitmiyordu;
 * `localhost` ile aynı sunucu sorunsuz çalışıyordu).
 *
 * IP'yi sabit yazmak yerine makinenin KENDİ IPv4 adresleri okunuyor: DHCP adresi
 * değiştirdiğinde kendiliğinden güncellenir. Yalnız development'ta etkili.
 */
const devOrigins = isDev
    ? [
          "127.0.0.1",
          ...Object.values(networkInterfaces())
              .flatMap((ifaces) => ifaces ?? [])
              .filter((i) => i.family === "IPv4" && !i.internal)
              .map((i) => i.address),
      ]
    : [];

const nextConfig: NextConfig = {
    // Yalnız development'ta dolu — üretim derlemesinde boş dizi (bkz. devOrigins).
    allowedDevOrigins: devOrigins,
    // Coolify/Docker self-hosting için minimal Node server üretir (.next/standalone/)
    output: "standalone",
    // Faz D — mupdf'i bundle'a ALMA (external bırak). Loader wasm'ı
    // `new URL("mupdf-wasm.wasm", import.meta.url)` ile yükler; chunk'a
    // bundle edilirse import.meta.url chunk konumunu gösterir ve wasm
    // (node_modules/mupdf/dist/) bulunamaz. External → node_modules'tan
    // require edilir, import.meta.url doğru konumu gösterir.
    // @react-pdf/renderer da external: yoga/reconciler bundling sürprizleri yerine
    // standalone node_modules'tan require edilir (teklif PDF eki — quote-pdf modülü).
    serverExternalPackages: ["mupdf", "@react-pdf/renderer"],
    // WASM dosyası import.meta.url ile runtime'da yüklenir; nft bunu güvenilir
    // trace etmez → render eden route'lara açıkça dahil et, standalone'a kopyalansın.
    outputFileTracingIncludes: {
        "/api/import/documents/**": ["./node_modules/mupdf/dist/mupdf-wasm.wasm"],
        // Teklif PDF fontları: Font.register fs path ile okur (path.join(process.cwd()));
        // nft fs.readFileSync olmayan path'i trace etmez → quotes route'larına açıkça
        // dahil et, .next/standalone/src/lib/quote-pdf/fonts/ altına kopyalansın.
        "/api/quotes/**": ["./src/lib/quote-pdf/fonts/*.ttf"],
    },
    // Self-hosted'da Vercel Image Optimization CDN yok; next/image tek yerde
    // (QuoteDocument.tsx PDF render — intentional <img>), unoptimize güvenli.
    images: { unoptimized: true },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "X-Content-Type-Options",  value: "nosniff" },
                    { key: "X-Frame-Options",          value: "SAMEORIGIN" },
                    { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
                    // H-1: Content-Security-Policy
                    // 'unsafe-inline' gerekli — proje inline styles + dangerouslySetInnerHTML CSS kullanıyor
                    {
                        key: "Content-Security-Policy",
                        value: [
                            "default-src 'self'",
                            "img-src 'self' data: blob: https:",
                            // 'unsafe-eval' YALNIZ development'ta: Next'in dev sunucusu
                            // (React Refresh / HMR) modülleri eval ile sarar. Kural
                            // olmadan `next dev` sayfası CSP'ye takılır, React HİÇ
                            // hidratlanmaz ve sayfa sessizce ölür — hata kutusu bile
                            // çıkmaz, tıklamalar hiçbir şey yapmaz. 2026-08-31'de tam
                            // olarak bu yaşandı ("giriş yapamıyorum": tema düğmesi de
                            // ölüydü, Supabase'e hiç istek gitmiyordu).
                            // ÜRETİM STRING'İ DEĞİŞMEDİ — gate testi bunu kilitliyor.
                            isDev
                                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                                : "script-src 'self' 'unsafe-inline'",
                            "style-src 'self' 'unsafe-inline'",
                            "font-src 'self' data:",
                            // PWA: service worker ve manifest. İkisi de bugün
                            // default-src fallback'iyle çalışıyor; açık yazmak
                            // ileride default-src daraltılırsa sessizce
                            // kırılmalarını engeller.
                            "worker-src 'self'",
                            "manifest-src 'self'",
                            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io",
                            "frame-ancestors 'none'",
                        ].join("; "),
                    },
                    // M-2: HSTS — HTTPS zorunlu, 2 yıl
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains; preload",
                    },
                    // L-1: Permissions-Policy
                    // microphone=(self) — sesli üretim girişi (/dashboard/production) için
                    // mikrofon kendi origin'imize açık; 3rd-party iframe'lere izin verilmez.
                    // camera ve geolocation kapalı (bu uygulamada kullanılmıyor).
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(self), geolocation=()",
                    },
                ],
            },
        ];
    },
};

export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // DSN yoksa source map upload'ı sessizce atla — local ve CI'da build kırılmasın
    silent: !process.env.SENTRY_AUTH_TOKEN,
    widenClientFileUpload: true,
    sourcemaps: {
        // Source map'leri prod bundle'dan çıkar (güvenlik)
        deleteSourcemapsAfterUpload: true,
    },
    webpack: {
        treeshake: {
            removeDebugLogging: true,
        },
    },
});
