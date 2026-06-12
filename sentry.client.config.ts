import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/lib/sentry-scrub";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // NEXT_PUBLIC_SENTRY_ENVIRONMENT explicit set edilirse onu kullan
    // (staging build args'tan client bundle'a yazılır)
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Prod'da 10% trace örnekleme — performans overhead'i önler
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    // Denetim O6 (2026-06): PII scrub — istek gövdesi/çerez/auth header +
    // breadcrumb body maskelenir; hata mesajı + stack teşhis için kalır.
    beforeSend(event) {
        return scrubSentryEvent(event);
    },
    // Sadece production'da replay aktif (privacy + quota)
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
});
