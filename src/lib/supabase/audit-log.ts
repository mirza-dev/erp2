import { createServiceClient } from "./service";

export interface AuditEntry {
    id: string;
    action: string;
    before_state: unknown;
    after_state: unknown;
    actor: string | null;
    occurred_at: string;
    source: string;
}

/** Bir entity (örn. purchase_order) için audit_log kayıtlarını kronolojik döner. */
export async function dbListAuditLog(
    entityType: string,
    entityId: string,
): Promise<AuditEntry[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, before_state, after_state, actor, occurred_at, source")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("occurred_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as AuditEntry[];
}
