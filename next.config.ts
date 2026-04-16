import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

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
