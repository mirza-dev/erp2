import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/lib/sentry-scrub";

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    // Denetim O6 (2026-06): PII scrub — istek gövdesi/çerez/auth header +
    // breadcrumb body maskelenir; hata mesajı + stack teşhis için kalır.
    beforeSend(event) {
        return scrubSentryEvent(event);
    },
});
