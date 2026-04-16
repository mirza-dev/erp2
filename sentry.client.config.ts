import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Prod'da 10% trace örnekleme — performans overhead'i önler
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    // Sadece production'da replay aktif (privacy + quota)
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
});
