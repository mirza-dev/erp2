import { createServiceClient } from "./service";
import type { EmailLogRow, EmailLogStatus, Json } from "@/lib/database.types";

export interface CreateEmailLogInput {
    user_id: string;
    notification_type: string;
    entity_type?: string | null;
    entity_id?: string | null;
    recipient_email: string;
    subject: string;
}

/**
 * Yeni e-posta log satırı oluşturur, status='pending'.
 * Resend send sonucuna göre dbUpdateEmailLogStatus ile güncellenir.
 */
export async function dbCreateEmailLog(input: CreateEmailLogInput): Promise<string> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("email_logs")
        .insert({
            user_id: input.user_id,
            notification_type: input.notification_type,
            entity_type: input.entity_type ?? null,
            entity_id: input.entity_id ?? null,
            recipient_email: input.recipient_email,
            subject: input.subject,
            status: "pending",
            attempt_count: 0,
        })
        .select("id")
        .single();
    if (error || !data) throw new Error(error?.message ?? "email_log create failed");
    return data.id;
}

/**
 * Send sonucunu yazar. attempt_count++ ve last_attempt_at güncellenir.
 * status='sent' ise sent_at de set edilir.
 */
export async function dbUpdateEmailLogStatus(
    id: string,
    status: Extract<EmailLogStatus, "sent" | "failed">,
    metadata: { resend_message_id?: string; error?: string },
): Promise<void> {
    const supabase = createServiceClient();
    // attempt_count'u atomik olarak +1 etmek için RPC yerine read-modify-write yapıyoruz
    // (retry-failed CRON tek thread'li gibi davranıyor; multi-trigger race window dar).
    const { data: current, error: getErr } = await supabase
        .from("email_logs")
        .select("attempt_count, metadata")
        .eq("id", id)
        .single();
    if (getErr || !current) throw new Error(getErr?.message ?? "email_log not found");

    const now = new Date().toISOString();
    const mergedMetadata: Json = {
        ...(current.metadata as Record<string, unknown> ?? {}),
        ...metadata,
    };

    const update: Record<string, unknown> = {
        status,
        attempt_count: (current.attempt_count ?? 0) + 1,
        last_attempt_at: now,
        metadata: mergedMetadata,
    };
    if (status === "sent") {
        update.sent_at = now;
        update.error_message = null;
    } else if (metadata.error) {
        update.error_message = metadata.error.slice(0, 500);
    }

    const { error } = await supabase.from("email_logs").update(update).eq("id", id);
    if (error) throw new Error(error.message);
}

/**
 * Dedup: aynı user'a aynı entity için aynı tipte son `windowHours` saatte
 * `status in ('pending','sent')` log var mı?
 * - 'failed' kayıtlar dedup'a dahil değil (yeniden denenmesi gerek).
 */
export async function dbCheckRecentDuplicate(
    userId: string,
    notificationType: string,
    entityType: string | null,
    entityId: string | null,
    windowHours: number,
): Promise<boolean> {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    let query = supabase
        .from("email_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("notification_type", notificationType)
        .gte("created_at", cutoff)
        .in("status", ["pending", "sent"]);

    if (entityType === null) query = query.is("entity_type", null);
    else query = query.eq("entity_type", entityType);

    if (entityId === null) query = query.is("entity_id", null);
    else query = query.eq("entity_id", entityId);

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
}

/**
 * Retry CRON için: status='failed' + attempt_count<maxAttempts + son windowHours
 * içinde denenmiş kayıtları döner.
 */
export async function dbListFailedEmailsForRetry(
    maxAttempts: number,
    windowHours: number,
): Promise<EmailLogRow[]> {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .eq("status", "failed")
        .lt("attempt_count", maxAttempts)
        .gte("last_attempt_at", cutoff)
        .order("last_attempt_at", { ascending: true })
        .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as EmailLogRow[];
}
