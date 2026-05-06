/**
 * Email gönderim servisi (Resend wrapper).
 *
 * Public API:
 *   - notifyUsersByEmail(opts): tetik noktalarında fire-and-forget çağrılır
 *   - retryFailedEmails(): CRON tarafından çağrılır (status='failed' olanlar)
 *
 * Tasarım kararları:
 *   - RESEND_API_KEY veya EMAIL_FROM yoksa fonksiyon erkenden return eder
 *     (config eksik = fail-safe; trigger'lar request'i bozmasın).
 *   - Resend hatası throw edilmez, email_logs.status='failed' olarak yazılır.
 *   - Dedup penceresi 6 saat: aynı user'a aynı entity için aynı tipte 6 saatte
 *     birden fazla e-posta gitmez (CRON spam'i engellenir).
 *   - Retry: status='failed' + attempt_count<3 + son 24 saat → CRON ile yeniden dene.
 */
import { Resend } from "resend";
import {
    renderEmail,
    type RenderContext,
} from "@/lib/email/templates";
import { dbListUsersForEmailNotification } from "@/lib/supabase/users-with-prefs";
import {
    dbCreateEmailLog,
    dbUpdateEmailLogStatus,
    dbCheckRecentDuplicate,
    dbListFailedEmailsForRetry,
} from "@/lib/supabase/email-logs";
import type { NotificationTypeKey } from "@/lib/notification-types";

const DEDUP_WINDOW_HOURS = 6;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_WINDOW_HOURS = 24;

interface NotifyResult {
    sent: number;
    skipped: number;
    failed: number;
}

let cachedResend: { key: string; client: Resend } | null = null;
function getResend(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        cachedResend = null;
        return null;
    }
    if (cachedResend && cachedResend.key === apiKey) return cachedResend.client;
    cachedResend = { key: apiKey, client: new Resend(apiKey) };
    return cachedResend.client;
}

function getEmailFrom(): string | null {
    const from = process.env.EMAIL_FROM?.trim();
    return from && from.length > 0 ? from : null;
}

/**
 * Tip + context eşleşmesini sıkı tutmak için tek `RenderContext`'i alıyoruz.
 * Caller: `notifyUsersByEmail({ notificationType: "stock_critical", entityType, entityId, render: { type: "stock_critical", ctx: {...} } })`.
 */
export interface NotifyOpts {
    notificationType: NotificationTypeKey;
    entityType?: string | null;
    entityId?: string | null;
    render: RenderContext;
}

export async function notifyUsersByEmail(opts: NotifyOpts): Promise<NotifyResult> {
    const result: NotifyResult = { sent: 0, skipped: 0, failed: 0 };

    const resend = getResend();
    const from = getEmailFrom();
    if (!resend || !from) {
        // Config eksik — fail-safe: log'a yazılmaz, sessiz return
        return result;
    }

    let recipients: Awaited<ReturnType<typeof dbListUsersForEmailNotification>>;
    try {
        recipients = await dbListUsersForEmailNotification(opts.notificationType);
    } catch (err) {
        console.error("[email-service] recipient lookup failed", err);
        return result;
    }
    if (recipients.length === 0) return result;

    const content = renderEmail(opts.render);
    const entityType = opts.entityType ?? null;
    const entityId = opts.entityId ?? null;

    for (const r of recipients) {
        // Dedup: aynı user'a aynı entity için 6 saat içinde gönderildi mi?
        try {
            const dup = await dbCheckRecentDuplicate(
                r.userId,
                opts.notificationType,
                entityType,
                entityId,
                DEDUP_WINDOW_HOURS,
            );
            if (dup) { result.skipped++; continue; }
        } catch (err) {
            console.error("[email-service] dedup check failed", err);
            // dedup başarısızsa yine de göndermeyi dene (yan etki: çift gönderim mümkün)
        }

        // Log oluştur (pending)
        let logId: string | null = null;
        try {
            logId = await dbCreateEmailLog({
                user_id: r.userId,
                notification_type: opts.notificationType,
                entity_type: entityType,
                entity_id: entityId,
                recipient_email: r.email,
                subject: content.subject,
            });
        } catch (err) {
            console.error("[email-service] log create failed", err);
            result.failed++;
            continue;
        }

        // Resend send
        try {
            const sendRes = await resend.emails.send({
                from,
                to: r.email,
                subject: content.subject,
                html: content.html,
                text: content.text,
            });
            if (sendRes.error) {
                await dbUpdateEmailLogStatus(logId, "failed", { error: sendRes.error.message });
                result.failed++;
                continue;
            }
            await dbUpdateEmailLogStatus(logId, "sent", {
                resend_message_id: sendRes.data?.id,
            });
            result.sent++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Resend send error";
            try { await dbUpdateEmailLogStatus(logId, "failed", { error: msg }); }
            catch { /* log update fail — best-effort */ }
            console.error("[email-service] send failed", err);
            result.failed++;
        }
    }

    return result;
}

/**
 * CRON tarafından çağrılır — failed kayıtları yeniden dener.
 * Max 3 deneme; son 24 saat penceresi.
 */
export async function retryFailedEmails(): Promise<{ retried: number; succeeded: number; failed: number }> {
    const stats = { retried: 0, succeeded: 0, failed: 0 };

    const resend = getResend();
    const from = getEmailFrom();
    if (!resend || !from) return stats;

    const failed = await dbListFailedEmailsForRetry(RETRY_MAX_ATTEMPTS, RETRY_WINDOW_HOURS);
    for (const log of failed) {
        stats.retried++;
        try {
            // Subject ve recipient log'da var; html/text yeniden render gerekiyor.
            // Ancak entity context yok — bu yüzden "Yeniden gönderim" basit bir notice metni olarak
            // önceki subject ile gönderiyoruz (HTML body kayıp olduğu için fallback metin).
            const sendRes = await resend.emails.send({
                from,
                to: log.recipient_email,
                subject: log.subject,
                text: `${log.subject}\n\nBu bildirim daha önce iletilemedi, yeniden denendi. Detay: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/settings`,
            });
            if (sendRes.error) {
                await dbUpdateEmailLogStatus(log.id, "failed", { error: sendRes.error.message });
                stats.failed++;
                continue;
            }
            await dbUpdateEmailLogStatus(log.id, "sent", {
                resend_message_id: sendRes.data?.id,
            });
            stats.succeeded++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Resend retry error";
            try { await dbUpdateEmailLogStatus(log.id, "failed", { error: msg }); }
            catch { /* best-effort */ }
            stats.failed++;
        }
    }

    return stats;
}
