import { randomUUID } from "node:crypto";
import type { Json, NotificationOutboxRow } from "@/lib/database.types";
import type { NotificationTypeKey } from "@/lib/notification-types";
import { renderEmail, type RenderContext } from "@/lib/email/templates";
import { getEmailRuntimeStatus, sendDirectEmail } from "@/lib/services/email-service";
import { dbListUsersForEmailNotification } from "@/lib/supabase/users-with-prefs";
import {
    dbClaimNotificationOutbox,
    dbDeleteOldCompletedOutbox,
    dbEnqueueNotification,
    dbUpdateOutboxState,
} from "@/lib/supabase/notification-outbox";
import {
    dbCreateEmailLog,
    dbClearEmailSnapshotsForOutbox,
    dbGetEmailLogById,
    dbGetEmailLogForOutboxRecipient,
    dbMarkEmailLogSuppressed,
    dbUpdateEmailLogStatus,
} from "@/lib/supabase/email-logs";
import {
    dbDeleteOldEmailDeliveryAudit,
    dbFindActiveSuppression,
    dbOpenMaintenanceIncident,
    dbResolveMaintenanceIncidentByKey,
} from "@/lib/supabase/email-maintenance";

const RETRY_BODY_TTL_HOURS = 24;
const MAX_OUTBOX_ATTEMPTS = 3;
const CONFIG_INCIDENT_KEY = "email:runtime-config";

export interface EnqueueInternalNotificationInput {
    eventKey: string;
    notificationType: NotificationTypeKey;
    entityType?: string | null;
    entityId?: string | null;
    render: RenderContext;
    actorUserId?: string | null;
    actorLabel?: string | null;
}

export async function enqueueInternalNotification(
    input: EnqueueInternalNotificationInput,
): Promise<{ id: string; created: boolean }> {
    if (input.render.type !== input.notificationType) {
        throw new Error("Bildirim türü ile render payload eşleşmiyor.");
    }
    const { row, created } = await dbEnqueueNotification({
        event_key: input.eventKey,
        notification_type: input.notificationType,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        render_payload: input.render as unknown as Json,
        actor_user_id: input.actorUserId ?? null,
        actor_label: input.actorLabel ?? null,
    });

    if (created) {
        queueMicrotask(() => {
            processNotificationOutbox({ limit: 1, onlyId: row.id })
                .catch(err => console.error("[notification-outbox] opportunistic dispatch failed", err));
        });
    }
    return { id: row.id, created };
}

function retryAt(attemptCount: number): string {
    const seconds = Math.min(5 * 60, 30 * 2 ** Math.max(attemptCount, 0));
    return new Date(Date.now() + seconds * 1000).toISOString();
}

async function markWaitingForConfig(event: NotificationOutboxRow): Promise<void> {
    await dbUpdateOutboxState(event.id, {
        status: "waiting_config",
        next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        last_error: "E-posta çalışma zamanı konfigürasyonu eksik.",
    });
    await dbOpenMaintenanceIncident({
        incidentKey: CONFIG_INCIDENT_KEY,
        kind: "email_config",
        severity: "critical",
        title: "E-posta gönderim konfigürasyonu eksik",
        description: "Internal bildirimler kuyrukta bekliyor. Resend, gönderen adresi ve webhook ayarlarını kontrol edin.",
    });
}

async function processOutboxEvent(event: NotificationOutboxRow): Promise<{
    sent: number;
    suppressed: number;
    failed: number;
}> {
    const stats = { sent: 0, suppressed: 0, failed: 0 };
    const render = event.render_payload as unknown as RenderContext;
    if (render.type !== event.notification_type) {
        throw new Error("Outbox render payload türü geçersiz.");
    }
    const content = renderEmail(render);
    const recipients = await dbListUsersForEmailNotification(event.notification_type, {
        actorUserId: event.actor_user_id,
    });
    const bodyExpiresAt = new Date(Date.now() + RETRY_BODY_TTL_HOURS * 60 * 60 * 1000).toISOString();

    for (const recipient of recipients) {
        const existing = await dbGetEmailLogForOutboxRecipient(event.id, recipient.userId);
        if (existing?.status === "sent" || existing?.delivery_status === "suppressed") continue;

        const suppression = await dbFindActiveSuppression(recipient.email, event.notification_type);
        if (suppression) {
            if (!existing) {
                await dbMarkEmailLogSuppressed({
                    user_id: recipient.userId,
                    outbox_id: event.id,
                    notification_type: event.notification_type,
                    entity_type: event.entity_type,
                    entity_id: event.entity_id,
                    recipient_email: recipient.email,
                    subject: content.subject,
                });
            }
            stats.suppressed++;
            continue;
        }

        let logId = existing?.id ?? null;
        if (!logId) {
            logId = await dbCreateEmailLog({
                user_id: recipient.userId,
                outbox_id: event.id,
                notification_type: event.notification_type,
                entity_type: event.entity_type,
                entity_id: event.entity_id,
                recipient_email: recipient.email,
                subject: content.subject,
                html_body: content.html,
                text_body: content.text,
                body_expires_at: bodyExpiresAt,
            });
        }

        const result = await sendDirectEmail({
            to: recipient.email,
            subject: existing?.subject ?? content.subject,
            html: existing?.html_body ?? content.html,
            text: existing?.text_body ?? content.text,
            idempotencyKey: `internal-email-log-${logId}`,
        });
        if (result.ok) {
            await dbUpdateEmailLogStatus(logId, "sent", { resend_message_id: result.messageId });
            stats.sent++;
        } else {
            await dbUpdateEmailLogStatus(logId, "failed", { error: result.error ?? "E-posta gönderilemedi." });
            stats.failed++;
        }
    }
    return stats;
}

async function finalizeEvent(
    event: NotificationOutboxRow,
    failedDeliveries: number,
): Promise<void> {
    if (failedDeliveries === 0) {
        await dbUpdateOutboxState(event.id, {
            status: "completed",
            completed_at: new Date().toISOString(),
            last_error: null,
        });
        return;
    }

    const nextAttemptCount = event.attempt_count + 1;
    await dbUpdateOutboxState(event.id, {
        status: "failed",
        attempt_count: nextAttemptCount,
        next_attempt_at: retryAt(nextAttemptCount),
        last_error: `${failedDeliveries} alıcıya gönderim başarısız.`,
    });
    if (nextAttemptCount >= MAX_OUTBOX_ATTEMPTS) {
        await dbClearEmailSnapshotsForOutbox(event.id);
        await dbOpenMaintenanceIncident({
            incidentKey: `email:retry-exhausted:${event.id}`,
            kind: "email_retry_exhausted",
            severity: "warning",
            title: "E-posta yeniden deneme hakkı tükendi",
            description: `${event.notification_type} bildirimi için ${failedDeliveries} teslimat tamamlanamadı.`,
            metadata: { outboxId: event.id, notificationType: event.notification_type },
        });
    }
}

export async function processNotificationOutbox(opts: {
    limit?: number;
    onlyId?: string | null;
} = {}): Promise<{ claimed: number; sent: number; suppressed: number; failed: number }> {
    const result = { claimed: 0, sent: 0, suppressed: 0, failed: 0 };
    const runtime = getEmailRuntimeStatus();
    const claimed = await dbClaimNotificationOutbox(`worker-${randomUUID()}`, opts);
    result.claimed = claimed.length;

    for (const event of claimed) {
        if (!runtime.configured) {
            await markWaitingForConfig(event);
            continue;
        }
        try {
            await dbResolveMaintenanceIncidentByKey(CONFIG_INCIDENT_KEY);
            const stats = await processOutboxEvent(event);
            result.sent += stats.sent;
            result.suppressed += stats.suppressed;
            result.failed += stats.failed;
            await finalizeEvent(event, stats.failed);
        } catch (err) {
            result.failed++;
            const nextAttemptCount = event.attempt_count + 1;
            const message = err instanceof Error ? err.message : "Outbox işleme hatası";
            await dbUpdateOutboxState(event.id, {
                status: "failed",
                attempt_count: nextAttemptCount,
                next_attempt_at: retryAt(nextAttemptCount),
                last_error: message.slice(0, 500),
            });
            if (nextAttemptCount >= MAX_OUTBOX_ATTEMPTS) {
                await dbClearEmailSnapshotsForOutbox(event.id);
                await dbOpenMaintenanceIncident({
                    incidentKey: `email:retry-exhausted:${event.id}`,
                    kind: "email_retry_exhausted",
                    severity: "warning",
                    title: "E-posta olayı işlenemedi",
                    description: message.slice(0, 500),
                    metadata: { outboxId: event.id, notificationType: event.notification_type },
                });
            }
        }
    }

    await Promise.allSettled([
        dbDeleteOldCompletedOutbox(90),
        dbDeleteOldEmailDeliveryAudit(90),
    ]);
    return result;
}

export async function retryInternalEmailDelivery(
    emailLogId: string,
): Promise<{ ok: boolean; reason?: "not_found" | "not_retryable" | "expired" | "suppressed" | "config_missing"; error?: string }> {
    const log = await dbGetEmailLogById(emailLogId);
    if (!log) return { ok: false, reason: "not_found" };
    if (
        !log.outbox_id
        || log.entity_type === "quote"
        || log.status !== "failed"
        || log.delivery_status === "suppressed"
        || log.delivery_status === "bounced"
        || log.delivery_status === "complained"
        || !log.html_body
        || !log.text_body
    ) {
        return { ok: false, reason: "not_retryable" };
    }
    if (!log.body_expires_at || log.body_expires_at <= new Date().toISOString()) {
        return { ok: false, reason: "expired" };
    }
    if (await dbFindActiveSuppression(log.recipient_email, log.notification_type)) {
        return { ok: false, reason: "suppressed" };
    }
    if (!getEmailRuntimeStatus().configured) {
        return { ok: false, reason: "config_missing" };
    }
    const result = await sendDirectEmail({
        to: log.recipient_email,
        subject: log.subject,
        html: log.html_body,
        text: log.text_body,
        idempotencyKey: `internal-email-log-${log.id}`,
    });
    await dbUpdateEmailLogStatus(
        log.id,
        result.ok ? "sent" : "failed",
        result.ok
            ? { resend_message_id: result.messageId }
            : { error: result.error ?? "E-posta gönderilemedi." },
    );
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}
