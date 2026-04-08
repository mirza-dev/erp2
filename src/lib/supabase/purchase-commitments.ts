import { createServiceClient } from "./service";
import type { PurchaseCommitmentRow } from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────

export interface CreateCommitmentInput {
    product_id: string;
    quantity: number;
    expected_date: string;  // "YYYY-MM-DD"
    supplier_name?: string;
    notes?: string;
}

// ── Queries ──────────────────────────────────────────────────

export async function dbListCommitments(filter?: {
    product_id?: string;
    status?: string;
}): Promise<PurchaseCommitmentRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("purchase_commitments")
        .select("*")
        .order("expected_date", { ascending: true });

    if (filter?.product_id) query = query.eq("product_id", filter.product_id);
    if (filter?.status) query = query.eq("status", filter.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as PurchaseCommitmentRow[];
}

export async function dbGetCommitment(id: string): Promise<PurchaseCommitmentRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("purchase_commitments")
        .select("*")
        .eq("id", id)
        .single();
    if (error || !data) return null;
    return data as PurchaseCommitmentRow;
}

export async function dbCreateCommitment(input: CreateCommitmentInput): Promise<PurchaseCommitmentRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("purchase_commitments")
        .insert({
            product_id:    input.product_id,
            quantity:      input.quantity,
            expected_date: input.expected_date,
            supplier_name: input.supplier_name ?? null,
            notes:         input.notes ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Commitment oluşturulamadı");
    return data as PurchaseCommitmentRow;
}

export async function dbReceiveCommitment(id: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("receive_purchase_commitment", {
        p_commitment_id: id,
    });
    if (error) throw new Error(error.message);
}

export async function dbCancelCommitment(id: string): Promise<void> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("purchase_commitments")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("status", "pending")
        .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("Commitment bulunamadı veya zaten iptal edilmiş.");
}

/** Ürün bazlı bekleyen (pending) commitment toplamları */
export async function dbGetIncomingQuantities(): Promise<Map<string, number>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("purchase_commitments")
        .select("product_id, quantity")
        .eq("status", "pending");
    if (error || !data) return new Map();
    const map = new Map<string, number>();
    for (const row of data) {
        map.set(row.product_id, (map.get(row.product_id) ?? 0) + row.quantity);
    }
    return map;
}
