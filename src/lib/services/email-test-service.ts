/**
 * Örnek (test) bildirim e-postası gönderim gövdesi.
 *
 * 2026-08-29'da `/api/email/test`'ten çıkarıldı çünkü ikinci bir tüketici doğdu:
 * `POST /api/settings/user/notifications/test` — fabrika admininin bildirim
 * e-postalarının kendisine ulaşıp ulaşmadığını doğrulaması için. İki uç aynı
 * zinciri paylaşır, kopya kod yoktur; AYRIŞTIKLARI tek yer kimin kime
 * gönderebildiğidir (guard + alıcı seçimi çağıranda kalır).
 *
 * Zincir: örnek içerik üret → `dbCreateEmailLog` (pending) → Resend DOĞRUDAN
 * gönderim → `dbUpdateEmailLogStatus`. `notifyUsersByEmail` içindeki alıcı
 * çözümleme ve dedup BİLİNÇLİ olarak atlanır: test her seferinde gitmeli.
 */
import { Resend } from "resend";
import {
    renderEmail,
    renderQuoteToCustomer,
    type EmailContent,
    type RenderContext,
} from "@/lib/email/templates";
import { NOTIFICATION_TYPE_KEYS, type NotificationTypeKey } from "@/lib/notification-types";
import { dbCreateEmailLog, dbUpdateEmailLogStatus } from "@/lib/supabase/email-logs";

export const QUOTE_TEST_TYPE = "quote_customer_send";

/** Test edilebilir tipler: 4 iç bildirim + müşteriye giden teklif e-postası. */
export const EMAIL_TEST_TYPES = new Set<string>([...NOTIFICATION_TYPE_KEYS, QUOTE_TEST_TYPE]);

/**
 * `failed` ile `send_error` BİLİNÇLİ olarak ayrı: ilki Resend'in yapılandırılmış
 * hata yanıtı (`sendRes.error` — reddedildi), ikincisi isteğin fırlatması (ağ /
 * SDK). `/api/email/test`'in eski sözleşmesi bu ikisini farklı `status`
 * değerleriyle döndürüyordu; helper'a taşınırken ayrım korundu.
 */
export type EmailTestResult =
    | { status: "sent"; logId: string; to: string; subject: string; messageId?: string }
    | { status: "config_missing" }
    | { status: "log_failed"; error: string }
    | { status: "failed"; error: string; logId: string }
    | { status: "send_error"; error: string; logId: string };

function buildSampleContext(type: NotificationTypeKey): RenderContext {
    switch (type) {
        case "stock_critical":
            return { type, ctx: { productId: "00000000-0000-0000-0000-000000000001", productName: "Test Ürün", sku: "TST-001", available: 0, min: 10 } };
        case "order_pending":
            return { type, ctx: { orderId: "00000000-0000-0000-0000-000000000002", orderNumber: "TST-2026-001", customerName: "Test Müşteri Ltd. Şti.", total: 1500, currency: "TRY", actorLabel: "Test Satış Kullanıcısı" } };
        case "sync_error":
            return { type, ctx: { entityName: "Test Müşteri (Paraşüt sync)", errorMessage: "Bu bir test hata mesajıdır — gerçek sync hatası değil." } };
        case "order_shipped":
            return { type, ctx: { orderId: "00000000-0000-0000-0000-000000000002", orderNumber: "TST-2026-001", customerName: "Test Müşteri Ltd. Şti.", actorLabel: "Test Üretim Kullanıcısı" } };
    }
}

export function buildSampleContent(type: string): EmailContent {
    if (type === QUOTE_TEST_TYPE) {
        return renderQuoteToCustomer({
            quoteNumber: "TST-2026-001",
            customerName: "Örnek Müşteri A.Ş.",
            validUntil: "2026-06-30",
            companyName: "Örnek Endüstriyel A.Ş.",
            companyPhone: "+90 212 555 01 23",
            companyEmail: "teklif@example.com",
            companyWebsite: "https://example.com",
        });
    }
    return renderEmail(buildSampleContext(type as NotificationTypeKey));
}

/**
 * Örnek e-postayı gönderir ve `email_logs`'a yazar.
 *
 * YETKİ KONTROLÜ YAPMAZ ve alıcıyı SEÇMEZ — ikisi de çağıranın sorumluluğu.
 * `/api/email/test` iç operatöre serbest `to` verir; kullanıcı ucu alıcıyı
 * oturum sahibinin adresine sabitler.
 */
export async function sendSampleNotificationEmail(opts: {
    userId: string;
    to: string;
    type: string;
}): Promise<EmailTestResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) return { status: "config_missing" };

    const content = buildSampleContent(opts.type);

    let logId: string;
    try {
        logId = await dbCreateEmailLog({
            user_id: opts.userId,
            notification_type: opts.type,
            entity_type: "test_email",
            entity_id: null,
            recipient_email: opts.to,
            subject: content.subject,
        });
    } catch (err) {
        return { status: "log_failed", error: err instanceof Error ? err.message : "unknown" };
    }

    try {
        const sendRes = await new Resend(apiKey).emails.send({
            from,
            to: opts.to,
            subject: content.subject,
            html: content.html,
            text: content.text,
        });
        if (sendRes.error) {
            await dbUpdateEmailLogStatus(logId, "failed", { error: sendRes.error.message });
            return { status: "failed", error: sendRes.error.message, logId };
        }
        await dbUpdateEmailLogStatus(logId, "sent", { resend_message_id: sendRes.data?.id });
        return { status: "sent", logId, to: opts.to, subject: content.subject, messageId: sendRes.data?.id };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Resend send error";
        try { await dbUpdateEmailLogStatus(logId, "failed", { error: msg }); }
        catch { /* best-effort */ }
        return { status: "send_error", error: msg, logId };
    }
}
