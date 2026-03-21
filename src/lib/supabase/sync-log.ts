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
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Sync log creation failed");
    return data;
}

export async function dbListSyncLogs(entityType?: string, limit = 50): Promise<IntegrationSyncLogRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("integration_sync_logs")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(limit);
    if (entityType) query = query.eq("entity_type", entityType);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}
