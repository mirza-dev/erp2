import { createServiceClient } from "./service";
import type { BillOfMaterialsRow, ProductionEntryRow } from "@/lib/database.types";

// ── BOM ──────────────────────────────────────────────────────

/** BOM satırlarını bitmiş ürüne göre listeler */
export async function dbGetBOM(finishedProductId: string): Promise<BillOfMaterialsRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("bills_of_materials")
        .select("*")
        .eq("finished_product_id", finishedProductId);
    if (error) throw new Error(error.message);
    return data ?? [];
}

// ── Production Entries ────────────────────────────────────────

export interface CreateProductionEntryInput {
    product_id: string;
    product_name: string;
    product_sku: string;
    produced_qty: number;
    scrap_qty?: number;
    waste_reason?: string;
    production_date: string;   // ISO date string (YYYY-MM-DD)
    notes?: string;
    related_order_id?: string;
    entered_by?: string;
}

export async function dbCreateProductionEntry(
    input: CreateProductionEntryInput
): Promise<ProductionEntryRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("production_entries")
        .insert({
            product_id: input.product_id,
            product_name: input.product_name,
            product_sku: input.product_sku,
            produced_qty: input.produced_qty,
            scrap_qty: input.scrap_qty ?? 0,
            waste_reason: input.waste_reason ?? null,
            production_date: input.production_date,
            notes: input.notes ?? null,
            related_order_id: input.related_order_id ?? null,
            entered_by: input.entered_by ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Production entry creation failed");
    return data;
}

export async function dbListProductionEntries(productId?: string, limit = 50): Promise<ProductionEntryRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("production_entries")
        .select("*")
        .order("production_date", { ascending: false })
        .limit(limit);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetProductionEntry(id: string): Promise<ProductionEntryRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("production_entries")
        .select("*")
        .eq("id", id)
        .single();
    if (error || !data) return null;
    return data;
}

export async function dbDeleteProductionEntry(id: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("production_entries")
        .delete()
        .eq("id", id);
    if (error) throw new Error(error.message);
}

// ── Atomic Production ───────────────────────────────────────

export interface CompleteProductionInput {
    product_id: string;
    produced_qty: number;
    scrap_qty?: number;
    waste_reason?: string;
    production_date?: string;
    notes?: string;
    related_order_id?: string;
    entered_by?: string;
}

export interface CompleteProductionResult {
    success: boolean;
    entry_id?: string;
    new_on_hand?: number;
    error?: string;
    shortages?: { component_product_id: string; required_qty: number; available_qty: number }[];
}

// ── Reverse Production (atomic delete + stock rollback) ──────

export interface ReverseProductionResult {
    success: boolean;
    error?: string;
}

export async function dbReverseProduction(entryId: string): Promise<ReverseProductionResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("reverse_production", {
        p_entry_id: entryId,
    });
    if (error) throw new Error(error.message);
    return data as ReverseProductionResult;
}

/** Atomic production: BOM validation → component consumption → finished good receipt → all in one transaction */
export async function dbCompleteProduction(input: CompleteProductionInput): Promise<CompleteProductionResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("complete_production", {
        p_product_id: input.product_id,
        p_produced_qty: input.produced_qty,
        p_scrap_qty: input.scrap_qty ?? 0,
        p_waste_reason: input.waste_reason ?? null,
        p_production_date: input.production_date ?? new Date().toISOString().split("T")[0],
        p_notes: input.notes ?? null,
        p_related_order_id: input.related_order_id ?? null,
        p_entered_by: input.entered_by ?? null,
    });
    if (error) throw new Error(error.message);
    return data as CompleteProductionResult;
}
