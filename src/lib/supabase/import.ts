import { createServiceClient } from "./service";
import type { ImportBatchRow, ImportDraftRow, ImportBatchStatus, ImportDraftStatus, Json } from "@/lib/database.types";

// ── Batch ────────────────────────────────────────────────────

export async function dbCreateBatch(input: {
    file_name?: string;
    file_size?: number;
    created_by?: string;
}): Promise<ImportBatchRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_batches")
        .insert({
            file_name: input.file_name ?? null,
            file_size: input.file_size ?? null,
            status: "pending",
            created_by: input.created_by ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Batch creation failed");
    return data;
}

export async function dbGetBatch(id: string): Promise<ImportBatchRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_batches").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

export async function dbListBatches(): Promise<ImportBatchRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbUpdateBatchStatus(
    id: string,
    status: ImportBatchStatus,
    parseResult?: Json,
    confidence?: number
): Promise<ImportBatchRow> {
    const supabase = createServiceClient();
    const updates: Record<string, unknown> = { status };
    if (parseResult !== undefined) updates.parse_result = parseResult;
    if (confidence !== undefined) updates.confidence = confidence;
    if (status === "confirmed") updates.confirmed_at = new Date().toISOString();

    const { data, error } = await supabase
        .from("import_batches").update(updates).eq("id", id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Batch update failed");
    return data;
}

// ── Drafts ───────────────────────────────────────────────────

export interface CreateDraftInput {
    batch_id: string;
    entity_type: "customer" | "product" | "order" | "order_line" | "stock" | "quote" | "shipment" | "invoice" | "payment";
    raw_data?: Json;
    parsed_data?: Json;
    matched_entity_id?: string;
    confidence?: number;
    ai_reason?: string;
    unmatched_fields?: Json;
}

export async function dbCreateDrafts(inputs: CreateDraftInput[]): Promise<ImportDraftRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_drafts")
        .insert(inputs.map(d => ({
            batch_id: d.batch_id,
            entity_type: d.entity_type,
            raw_data: d.raw_data ?? null,
            parsed_data: d.parsed_data ?? null,
            matched_entity_id: d.matched_entity_id ?? null,
            confidence: d.confidence ?? null,
            ai_reason: d.ai_reason ?? null,
            unmatched_fields: d.unmatched_fields ?? null,
            status: "pending",
        })))
        .select("*");
    if (error || !data) throw new Error(error?.message ?? "Draft creation failed");
    return data;
}

export async function dbListDrafts(batchId: string): Promise<ImportDraftRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_drafts")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetDraft(id: string): Promise<ImportDraftRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_drafts").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

export async function dbUpdateDraft(
    id: string,
    updates: {
        status?: ImportDraftStatus;
        user_corrections?: Json;
        matched_entity_id?: string;
    }
): Promise<ImportDraftRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_drafts").update(updates).eq("id", id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Draft update failed");
    return data;
}
