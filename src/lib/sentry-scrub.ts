/**
 * Sentry beforeSend PII temizliği (denetim O6, 2026-06).
 *
 * Sentry varsayılanı request gövdesi/çerez/yetki başlıkları ve breadcrumb
 * verilerini olduğu gibi taşıyabilir — ERP bağlamında bunlar müşteri adı/VKN/
 * e-posta ve fiyat içerebilir. Kural: hata mesajı + stack kalır (teşhis için
 * yeterli), istek gövdeleri ve kimlik taşıyan alanlar maskelenir.
 *
 * Tip notu: @sentry/nextjs'in Event tipine bağlanmamak için yapısal minimal
 * tip kullanılır (üç config de — server/client/edge — aynı helper'ı paylaşır).
 */

interface ScrubbableEvent {
    request?: {
        data?: unknown;
        cookies?: unknown;
        headers?: { [key: string]: string };
    };
    user?: { id?: unknown; email?: unknown; ip_address?: unknown; username?: unknown };
    breadcrumbs?: Array<{ data?: { [key: string]: unknown } }>;
}

const SENSITIVE_HEADERS = ["authorization", "cookie", "x-supabase-auth", "apikey"];

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
    if (event.request) {
        if (event.request.data !== undefined) event.request.data = "[REDACTED]";
        if (event.request.cookies !== undefined) event.request.cookies = "[REDACTED]";
        if (event.request.headers) {
            for (const h of Object.keys(event.request.headers)) {
                if (SENSITIVE_HEADERS.includes(h.toLowerCase())) {
                    event.request.headers[h] = "[REDACTED]";
                }
            }
        }
    }
    if (event.user) {
        // id korelasyon için kalır; e-posta/IP/kullanıcı adı PII → düşür.
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
    }
    if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
            if (bc.data && ("body" in bc.data || "response" in bc.data)) {
                if ("body" in bc.data) bc.data.body = "[REDACTED]";
                if ("response" in bc.data) bc.data.response = "[REDACTED]";
            }
        }
    }
    return event;
}
