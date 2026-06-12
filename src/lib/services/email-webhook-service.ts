import { Resend, type WebhookEventPayload } from "resend";
import {
    dbGetEmailLogByResendMessageId,
    dbUpdateEmailDeliveryFromProvider,
} from "@/lib/supabase/email-logs";
import {
    dbDeleteWebhookEvent,
    dbRecordWebhookEvent,
    dbUpsertSuppression,
} from "@/lib/supabase/email-maintenance";

const EVENT_STATUS = {
    "email.sent": "accepted",
    "email.delivered": "delivered",
    "email.failed": "failed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.suppressed": "suppressed",
} as const;

export function verifyResendWebhook(input: {
    payload: string;
    id: string;
    timestamp: string;
    signature: string;
}): WebhookEventPayload {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) throw new Error("Webhook konfigürasyonu eksik.");
    return new Resend(process.env.RESEND_API_KEY).webhooks.verify({
        payload: input.payload,
        headers: {
            id: input.id,
            timestamp: input.timestamp,
            signature: input.signature,
        },
        webhookSecret: secret,
    });
}

export async function processResendWebhook(
    event: WebhookEventPayload,
    svixId: string,
): Promise<{ duplicate: boolean; matched: boolean }> {
    const providerEventAt = event.created_at;
    const inserted = await dbRecordWebhookEvent(svixId, event.type, providerEventAt);
    if (!inserted) return { duplicate: true, matched: false };
    try {
        if (!(event.type in EVENT_STATUS) || !("email_id" in event.data)) {
            return { duplicate: false, matched: false };
        }
        const log = await dbGetEmailLogByResendMessageId(event.data.email_id);
        if (!log) return { duplicate: false, matched: false };

        const deliveryStatus = EVENT_STATUS[event.type as keyof typeof EVENT_STATUS];
        await dbUpdateEmailDeliveryFromProvider({
            id: log.id,
            deliveryStatus,
            providerEventAt,
        });

        if (event.type === "email.bounced" || event.type === "email.suppressed") {
            await dbUpsertSuppression({
                recipientEmail: log.recipient_email,
                scopeKey: "*",
                reason: "hard_bounce",
                sourceEmailLogId: log.id,
            });
        } else if (event.type === "email.complained") {
            await dbUpsertSuppression({
                recipientEmail: log.recipient_email,
                scopeKey: log.notification_type,
                reason: "complaint",
                sourceEmailLogId: log.id,
            });
        }
        return { duplicate: false, matched: true };
    } catch (err) {
        // İşleme yarıda kalırsa Resend'in aynı svix-id ile yaptığı retry tekrar
        // denenebilsin. Delivery update ve suppression upsert idempotenttir.
        await dbDeleteWebhookEvent(svixId).catch(() => undefined);
        throw err;
    }
}
