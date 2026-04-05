import { createServiceClient } from "./service";
import type { AlertRow, AlertType, AlertSeverity, AlertStatus } from "@/lib/database.types";

export interface CreateAlertInput {
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    description?: string;
    entity_type?: string;
    entity_id?: string;
    ai_inputs_summary?: Record<string, unknown>;
    source?: "system" | "ai" | "ui";
    ai_confidence?: number;
    ai_reason?: string;
    ai_model_version?: string;
}

export interface ListAlertsFilter {
    status?: AlertStatus;
    severity?: AlertSeverity;
    type?: AlertType;
    entity_type?: string;
    entity_id?: string;
}

// ── Queries ──────────────────────────────────────────────────

export async function dbListAlerts(filter: ListAlertsFilter = {}): Promise<AlertRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false });

    if (filter.status)      query = query.eq("status", filter.status);
    if (filter.severity)    query = query.eq("severity", filter.severity);
    if (filter.type)        query = query.eq("type", filter.type);
    if (filter.entity_type) query = query.eq("entity_type", filter.entity_type);
    if (filter.entity_id)   query = query.eq("entity_id", filter.entity_id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetAlertById(id: string): Promise<AlertRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("alerts").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

/**
 * Check if an active (open OR acknowledged) alert already exists for this entity.
 * Acknowledged alerts are still active — user has seen them but condition persists.
 * Both statuses block new alert creation (deduplicate).
 */
export async function dbOpenAlertExists(type: AlertType, entityId: string): Promise<boolean> {
    const supabase = createServiceClient();
    const { count } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("type", type)
        .eq("entity_id", entityId)
        .in("status", ["open", "acknowledged"]);
    return (count ?? 0) > 0;
}

/**
 * Creates an alert. Returns null if a duplicate active alert exists
 * (unique index idx_alerts_active_dedup blocks it — error code 23505).
 */
export async function dbCreateAlert(input: CreateAlertInput): Promise<AlertRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("alerts")
        .insert({
            type: input.type,
            severity: input.severity,
            title: input.title,
            description: input.description ?? null,
            entity_type: input.entity_type ?? null,
            entity_id: input.entity_id ?? null,
            ai_inputs_summary: input.ai_inputs_summary ?? null,
            status: "open",
            source: input.source ?? "system",
            ai_confidence: input.ai_confidence ?? null,
            ai_reason: input.ai_reason ?? null,
            ai_model_version: input.ai_model_version ?? null,
        })
        .select("*")
        .single();
    if (error) {
        // 23505 = unique_violation — duplicate active alert, safe to ignore
        if (error.code === "23505") return null;
        throw new Error(error.message);
    }
    return data;
}

export async function dbUpdateAlertStatus(
    id: string,
    status: AlertStatus,
    reason?: string
): Promise<AlertRow> {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };

    if (status === "acknowledged") updates.acknowledged_at = now;
    if (status === "resolved")     { updates.resolved_at = now; if (reason) updates.resolution_reason = reason; }
    if (status === "dismissed")    { updates.dismissed_at = now; if (reason) updates.resolution_reason = reason; }

    const { data, error } = await supabase
        .from("alerts").update(updates).eq("id", id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Alert update failed");
    return data;
}

/**
 * Dismiss all active (open OR acknowledged) alerts from a given source (e.g. "ai").
 * Acknowledged AI alerts are still active and should be replaced on regeneration.
 */
export async function dbDismissAlertsBySource(source: "system" | "ai" | "ui"): Promise<number> {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("alerts")
        .update({ status: "dismissed", dismissed_at: now, resolution_reason: "replaced_by_new_generation" })
        .eq("source", source)
        .in("status", ["open", "acknowledged"])
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * Resolve all active (open OR acknowledged) alerts of a given type for an entity.
 * Acknowledged alerts represent a condition the user has seen but not yet resolved;
 * when the underlying condition clears, they must be auto-resolved too.
 */
export async function dbResolveAlertsForEntity(
    type: AlertType,
    entityId: string,
    reason = "stock_recovered"
): Promise<number> {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("alerts")
        .update({ status: "resolved", resolved_at: now, resolution_reason: reason })
        .eq("type", type)
        .eq("entity_id", entityId)
        .in("status", ["open", "acknowledged"])
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

// ── Batch operations (N+1 optimization) ─────────────────────────

/**
 * Fetch all active (open + acknowledged) alerts in one query.
 * Used by serviceScanStockAlerts to build an in-memory dedup Set
 * instead of querying dbOpenAlertExists per product.
 */
export async function dbListActiveAlerts(): Promise<AlertRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .in("status", ["open", "acknowledged"]);
    if (error) throw new Error(error.message);
    return data ?? [];
}

export interface BatchResolveEntry {
    type: AlertType;
    entityId: string;
    reason: string;
}

/**
 * Batch-resolve active alerts, grouped by type+reason for efficient DB calls.
 * Replaces per-product dbResolveAlertsForEntity calls in the scan loop.
 */
export async function dbBatchResolveAlerts(entries: BatchResolveEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    let total = 0;

    // Group by type::reason → entityIds[]
    const groups = new Map<string, string[]>();
    for (const e of entries) {
        const key = `${e.type}::${e.reason}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(e.entityId);
    }

    for (const [key, entityIds] of groups) {
        const [type, reason] = key.split("::");
        const { data, error } = await supabase
            .from("alerts")
            .update({ status: "resolved", resolved_at: now, resolution_reason: reason })
            .eq("type", type)
            .in("entity_id", entityIds)
            .in("status", ["open", "acknowledged"])
            .select("id");
        if (error) throw new Error(error.message);
        total += data?.length ?? 0;
    }

    return total;
}
