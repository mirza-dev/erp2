import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
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
