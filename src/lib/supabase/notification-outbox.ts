import { createServiceClient } from "./service";
import type { Json, NotificationOutboxRow, NotificationOutboxStatus } from "@/lib/database.types";
import type { NotificationTypeKey } from "@/lib/notification-types";

export interface CreateNotificationOutboxInput {
    event_key: string;
    notification_type: NotificationTypeKey;
    entity_type?: string | null;
    entity_id?: string | null;
    render_payload: Json;
    actor_user_id?: string | null;
    actor_label?: string | null;
}

export async function dbEnqueueNotification(
    input: CreateNotificationOutboxInput,
): Promise<{ row: NotificationOutboxRow; created: boolean }> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("notification_outbox")
        .insert({
            ...input,
            entity_type: input.entity_type ?? null,
            entity_id: input.entity_id ?? null,
            actor_user_id: input.actor_user_id ?? null,
            actor_label: input.actor_label ?? null,
        })
        .select("*")
        .single();

    if (!error && data) return { row: data as NotificationOutboxRow, created: true };
    if ((error as { code?: string } | null)?.code !== "23505") {
        throw new Error(error?.message ?? "notification outbox insert failed");
    }

    const existing = await dbGetOutboxByEventKey(input.event_key);
    if (!existing) throw new Error("notification outbox duplicate could not be read");
    return { row: existing, created: false };
}

export async function dbGetOutboxByEventKey(eventKey: string): Promise<NotificationOutboxRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("notification_outbox")
        .select("*")
        .eq("event_key", eventKey)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as NotificationOutboxRow | null;
}

export async function dbClaimNotificationOutbox(
    workerId: string,
    opts: { limit?: number; onlyId?: string | null } = {},
): Promise<NotificationOutboxRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("claim_notification_outbox", {
        p_worker_id: workerId,
        p_limit: opts.limit ?? 20,
        p_lease_seconds: 120,
        p_only_id: opts.onlyId ?? null,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as NotificationOutboxRow[];
}

export async function dbUpdateOutboxState(
    id: string,
    patch: {
        status: NotificationOutboxStatus;
        attempt_count?: number;
        next_attempt_at?: string;
        last_error?: string | null;
        completed_at?: string | null;
    },
): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("notification_outbox")
        .update({
            ...patch,
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    if (error) throw new Error(error.message);
}

export async function dbDeleteOldCompletedOutbox(retentionDays = 90): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("notification_outbox")
        .delete()
        .eq("status", "completed")
        .lt("completed_at", cutoff);
    if (error) throw new Error(error.message);
}
