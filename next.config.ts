import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Coolify/Docker self-hosting için minimal Node server üretir (.next/standalone/)
    output: "standalone",
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
                            "script-src 'self' 'unsafe-inline'",
                            "style-src 'self' 'unsafe-inline'",
                            "font-src 'self' data:",
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
