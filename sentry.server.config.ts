import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // SENTRY_ENVIRONMENT explicit set edilirse onu kullan (staging Resource'da "staging")
    // aksi takdirde NODE_ENV ("production"/"development") fallback.
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
});
