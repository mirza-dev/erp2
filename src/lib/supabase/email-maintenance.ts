import { createServiceClient } from "./service";
import type {
    EmailLogRow,
    EmailSuppressionRow,
    MaintenanceIncidentRow,
} from "@/lib/database.types";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function dbFindActiveSuppression(
    recipientEmail: string,
    notificationType: string,
): Promise<EmailSuppressionRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("email_suppressions")
        .select("*")
        .eq("recipient_email", normalizeEmail(recipientEmail))
        .eq("active", true)
        .in("scope_key", ["*", notificationType])
        .order("scope_key", { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as EmailSuppressionRow | null;
}

export async function dbUpsertSuppression(input: {
    recipientEmail: string;
    scopeKey: string;
    reason: "hard_bounce" | "complaint";
    sourceEmailLogId?: string | null;
}): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("email_suppressions")
        .upsert({
            recipient_email: normalizeEmail(input.recipientEmail),
            scope_key: input.scopeKey,
            reason: input.reason,
            active: true,
            source_email_log_id: input.sourceEmailLogId ?? null,
            resolved_at: null,
            resolved_by: null,
        }, { onConflict: "recipient_email,scope_key" });
    if (error) throw new Error(error.message);
}

export async function dbResolveSuppression(id: string, actorId: string): Promise<boolean> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("email_suppressions")
        .update({
            active: false,
            resolved_at: new Date().toISOString(),
            resolved_by: actorId,
        })
        .eq("id", id)
        .eq("active", true)
        .select("id")
        .maybeSingle();
    if (error) throw new Error(error.message);
    return !!data;
}

export async function dbListSuppressions(activeOnly = true): Promise<EmailSuppressionRow[]> {
    const supabase = createServiceClient();
    let query = supabase.from("email_suppressions").select("*").order("created_at", { ascending: false });
    if (activeOnly) query = query.eq("active", true);
    const { data, error } = await query.limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as EmailSuppressionRow[];
}

export async function dbRecordWebhookEvent(
    svixId: string,
    eventType: string,
    providerEventAt?: string | null,
): Promise<boolean> {
    const supabase = createServiceClient();
    const { error } = await supabase.from("resend_webhook_events").insert({
        svix_id: svixId,
        event_type: eventType,
        provider_event_at: providerEventAt ?? null,
    });
    if (!error) return true;
    if ((error as { code?: string }).code === "23505") return false;
    throw new Error(error.message);
}

export async function dbDeleteWebhookEvent(svixId: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("resend_webhook_events")
        .delete()
        .eq("svix_id", svixId);
    if (error) throw new Error(error.message);
}

export async function dbOpenMaintenanceIncident(input: {
    incidentKey: string;
    kind: "email_config" | "email_retry_exhausted";
    severity: "warning" | "critical";
    title: string;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
}): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("maintenance_incidents")
        .upsert({
            incident_key: input.incidentKey,
            kind: input.kind,
            severity: input.severity,
            status: "open",
            title: input.title,
            description: input.description ?? null,
            metadata: input.metadata ?? null,
            resolved_at: null,
            resolved_by: null,
            updated_at: new Date().toISOString(),
        }, { onConflict: "incident_key" });
    if (error) throw new Error(error.message);
}

export async function dbResolveMaintenanceIncident(
    id: string,
    actorId: string,
): Promise<boolean> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("maintenance_incidents")
        .update({
            status: "resolved",
            resolved_at: new Date().toISOString(),
            resolved_by: actorId,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "open")
        .select("id")
        .maybeSingle();
    if (error) throw new Error(error.message);
    return !!data;
}

export async function dbResolveMaintenanceIncidentByKey(incidentKey: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("maintenance_incidents")
        .update({
            status: "resolved",
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("incident_key", incidentKey)
        .eq("status", "open");
    if (error) throw new Error(error.message);
}

export async function dbListMaintenanceIncidents(
    status: "open" | "resolved" | "all" = "open",
): Promise<MaintenanceIncidentRow[]> {
    const supabase = createServiceClient();
    let query = supabase.from("maintenance_incidents").select("*").order("opened_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query.limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as MaintenanceIncidentRow[];
}

export async function dbCountOpenMaintenanceIncidents(): Promise<number> {
    const supabase = createServiceClient();
    const { count, error } = await supabase
        .from("maintenance_incidents")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
    if (error) throw new Error(error.message);
    return count ?? 0;
}

export async function dbListEmailDeliveries(filters: {
    status?: string;
    notificationType?: string;
    recipient?: string;
    entityType?: string;
    from?: string;
    to?: string;
    limit?: number;
} = {}): Promise<EmailLogRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("email_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500));
    if (filters.status) query = query.eq("delivery_status", filters.status);
    if (filters.notificationType) query = query.eq("notification_type", filters.notificationType);
    if (filters.recipient) query = query.ilike("recipient_email", `%${filters.recipient}%`);
    if (filters.entityType) query = query.eq("entity_type", filters.entityType);
    if (filters.from) query = query.gte("created_at", filters.from);
    if (filters.to) query = query.lte("created_at", filters.to);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as EmailLogRow[];
}

export async function dbDeleteOldEmailDeliveryAudit(retentionDays = 90): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const supabase = createServiceClient();
    const { error } = await supabase.from("email_logs").delete().lt("created_at", cutoff);
    if (error) throw new Error(error.message);
}
