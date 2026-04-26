import { createServiceClient } from "./service";
import type { IntegrationSyncLogRow } from "@/lib/database.types";

export interface CreateSyncLogInput {
    entity_type: string;
    entity_id?: string;
    direction: "push" | "pull";
    status: "success" | "error" | "pending" | "retrying";
    external_id?: string;
    error_message?: string;
    source?: "ui" | "system" | "scheduled";
    step?: string;
    error_kind?: string;
    metadata?: Record<string, unknown>;
}

export async function dbCreateSyncLog(input: CreateSyncLogInput): Promise<IntegrationSyncLogRow> {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("integration_sync_logs")
        .insert({
            entity_type: input.entity_type,
            entity_id: input.entity_id ?? null,
            direction: input.direction,
            status: input.status,
            external_id: input.external_id ?? null,
            error_message: input.error_message ?? null,
            retry_count: 0,
            source: input.source ?? "system",
            requested_at: now,
            completed_at: input.status === "pending" ? null : now,
            step: input.step ?? null,
            error_kind: input.error_kind ?? null,
            metadata: input.metadata ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Sync log creation failed");
    return data;
}

export interface ListSyncLogsFilter {
    entityType?: string;
    step?:       string;
    errorKind?:  string;
    status?:     string;
    limit?:      number;
}

export async function dbListSyncLogs(
    entityTypeOrFilter?: string | ListSyncLogsFilter,
    limitArg = 50,
): Promise<IntegrationSyncLogRow[]> {
    const supabase = createServiceClient();
    const filter: ListSyncLogsFilter = typeof entityTypeOrFilter === "string"
        ? { entityType: entityTypeOrFilter, limit: limitArg }
        : entityTypeOrFilter ?? { limit: limitArg };

    let query = supabase
        .from("integration_sync_logs")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(filter.limit ?? 50);

    if (filter.entityType) query = query.eq("entity_type", filter.entityType);
    if (filter.step)       query = query.eq("step",        filter.step);
    if (filter.errorKind)  query = query.eq("error_kind",  filter.errorKind);
    if (filter.status)     query = query.eq("status",      filter.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetSyncLog(id: string): Promise<IntegrationSyncLogRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("integration_sync_logs")
        .select("*")
        .eq("id", id)
        .single();
    if (error || !data) return null;
    return data;
}

export async function dbUpdateSyncLog(
    id: string,
    updates: {
        status?: "success" | "error" | "pending" | "retrying";
        retry_count?: number;
        error_message?: string | null;
        completed_at?: string | null;
        external_id?: string | null;
    }
): Promise<IntegrationSyncLogRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("integration_sync_logs")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Sync log update failed");
    return data;
}

/**
 * Faz 11.3 — Bir entity_id için son 24 saatteki sync log sayılarını
 * step başına döndürür. Tooltip "son 24h X deneme" göstermek için.
 */
export async function dbCountRecentSyncLogsByStep(
    entityId: string,
    sinceHours = 24,
): Promise<Record<string, number>> {
    const supabase = createServiceClient();
    const sinceISO = new Date(Date.now() - sinceHours * 3600_000).toISOString();
    const { data, error } = await supabase
        .from("integration_sync_logs")
        .select("step")
        .eq("entity_id", entityId)
        .gte("requested_at", sinceISO);
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { step: string | null }[]) {
        const k = row.step ?? "unknown";
        counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
}

export async function dbListFailedSyncLogs(limit = 20): Promise<IntegrationSyncLogRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("integration_sync_logs")
        .select("*")
        .eq("status", "error")
        .lt("retry_count", 3)
        .order("requested_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
}
