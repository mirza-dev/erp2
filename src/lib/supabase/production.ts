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
