import { createServiceClient } from "./service";
import type { ProductBatchRow } from "@/lib/database.types";

export interface CreateBatchInput {
    product_id: string;
    heat_no: string;
    batch_date?: string | null;
    initial_qty: number;
    remaining_qty?: number;
    certificate_attachment_id?: string | null;
    notes?: string | null;
}

export interface UpdateBatchInput {
    heat_no?: string;
    batch_date?: string | null;
    initial_qty?: number;
    remaining_qty?: number;
    certificate_attachment_id?: string | null;
    notes?: string | null;
}

function validateBatchInput(input: CreateBatchInput | UpdateBatchInput): string | null {
    if ("heat_no" in input && input.heat_no !== undefined) {
        if (!input.heat_no || input.heat_no.trim().length === 0) return "Parti numarası (heat_no) zorunludur.";
    }
    if (input.initial_qty !== undefined) {
        if (!Number.isFinite(input.initial_qty) || input.initial_qty <= 0) {
            return "Başlangıç miktarı pozitif sayı olmalıdır.";
        }
    }
    if (input.remaining_qty !== undefined && input.remaining_qty !== null) {
        if (!Number.isFinite(input.remaining_qty) || input.remaining_qty < 0) {
            return "Kalan miktar sıfır veya pozitif sayı olmalıdır.";
        }
    }
    if (input.initial_qty !== undefined && input.remaining_qty !== undefined && input.remaining_qty !== null) {
        if (input.remaining_qty > input.initial_qty) {
            return "Kalan miktar başlangıç miktarından büyük olamaz.";
        }
    }
    if (input.batch_date && typeof input.batch_date === "string") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.batch_date)) {
            return "Parti tarihi YYYY-MM-DD formatında olmalıdır.";
        }
    }
    return null;
}

export async function dbListBatchesByProduct(productId: string): Promise<ProductBatchRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("product_batches")
        .select("*")
        .eq("product_id", productId)
        .order("batch_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetBatch(id: string): Promise<ProductBatchRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("product_batches").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

export async function dbCreateBatch(input: CreateBatchInput): Promise<ProductBatchRow> {
    if (!input.product_id) throw new Error("Ürün id'si zorunludur.");
    const err = validateBatchInput(input);
    if (err) throw new Error(err);
    if (!input.heat_no || input.heat_no.trim().length === 0) throw new Error("Parti numarası (heat_no) zorunludur.");
    if (input.initial_qty === undefined) throw new Error("Başlangıç miktarı zorunludur.");

    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("product_batches")
        .insert({
            product_id: input.product_id,
            heat_no: input.heat_no.trim(),
            batch_date: input.batch_date ?? null,
            initial_qty: input.initial_qty,
            remaining_qty: input.remaining_qty ?? input.initial_qty,
            certificate_attachment_id: input.certificate_attachment_id ?? null,
            notes: input.notes ?? null,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Parti oluşturulamadı.");
    return data;
}

export async function dbUpdateBatch(id: string, patch: UpdateBatchInput): Promise<ProductBatchRow> {
    const supabase = createServiceClient();

    // initial/remaining cross-check için mevcut satır gerekli (patch tek alan getirebilir)
    let existing: ProductBatchRow | null = null;
    if (patch.initial_qty !== undefined || patch.remaining_qty !== undefined) {
        existing = await dbGetBatch(id);
        if (!existing) throw new Error("Parti bulunamadı.");
    }
    const finalInitial = patch.initial_qty ?? existing?.initial_qty;
    const finalRemaining = patch.remaining_qty ?? existing?.remaining_qty;
    const err = validateBatchInput({
        ...patch,
        initial_qty: finalInitial as number | undefined,
        remaining_qty: finalRemaining as number | undefined,
    });
    if (err) throw new Error(err);

    const updatePayload: Record<string, unknown> = {};
    if (patch.heat_no !== undefined) updatePayload.heat_no = patch.heat_no.trim();
    if (patch.batch_date !== undefined) updatePayload.batch_date = patch.batch_date;
    if (patch.initial_qty !== undefined) updatePayload.initial_qty = patch.initial_qty;
    if (patch.remaining_qty !== undefined) updatePayload.remaining_qty = patch.remaining_qty;
    if (patch.certificate_attachment_id !== undefined) updatePayload.certificate_attachment_id = patch.certificate_attachment_id;
    if (patch.notes !== undefined) updatePayload.notes = patch.notes;

    const { data, error } = await supabase
        .from("product_batches")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Parti bulunamadı.");
    return data;
}

export async function dbDeleteBatch(id: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.from("product_batches").delete().eq("id", id);
    if (error) throw new Error(error.message);
}
