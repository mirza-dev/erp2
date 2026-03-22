import { createServiceClient } from "./service";
import type { ProductRow, ProductWithStock } from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────

export interface CreateProductInput {
    name: string;
    sku: string;
    category?: string;
    unit: string;
    price?: number;
    currency?: string;
    on_hand?: number;
    min_stock_level?: number;
    product_type?: "finished" | "raw_material";
    warehouse?: string;
    reorder_qty?: number;
    preferred_vendor?: string;
    daily_usage?: number;
}

export interface ListProductsFilter {
    category?: string;
    product_type?: "finished" | "raw_material";
    is_active?: boolean;
    low_stock?: boolean;  // available_now <= min_stock_level
    page?: number;
    pageSize?: number;
}

// ── Queries ──────────────────────────────────────────────────

export async function dbGetProductById(id: string): Promise<ProductWithStock | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();
    if (error || !data) return null;
    return { ...data, available_now: data.on_hand - data.reserved };
}

export async function dbListProducts(filter: ListProductsFilter = {}): Promise<ProductWithStock[]> {
    const supabase = createServiceClient();
    const { page = 1, pageSize = 100, category, product_type, is_active } = filter;

    let query = supabase
        .from("products")
        .select("*")
        .order("name")
        .range((page - 1) * pageSize, page * pageSize - 1);

    if (category) query = query.eq("category", category);
    if (product_type) query = query.eq("product_type", product_type);
    if (is_active !== undefined) query = query.eq("is_active", is_active);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map(p => ({ ...p, available_now: p.on_hand - p.reserved }));
}

export async function dbCreateProduct(input: CreateProductInput): Promise<ProductWithStock> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .insert({
            name: input.name,
            sku: input.sku,
            category: input.category ?? null,
            unit: input.unit,
            price: input.price ?? null,
            currency: input.currency ?? "USD",
            on_hand: input.on_hand ?? 0,
            reserved: 0,
            min_stock_level: input.min_stock_level ?? 0,
            is_active: true,
            product_type: input.product_type ?? "finished",
            warehouse: input.warehouse ?? null,
            reorder_qty: input.reorder_qty ?? null,
            preferred_vendor: input.preferred_vendor ?? null,
            daily_usage: input.daily_usage ?? null,
        })
        .select("*")
        .single();

    if (error || !data) throw new Error(error?.message ?? "Product creation failed");
    return { ...data, available_now: data.on_hand - data.reserved };
}

export async function dbUpdateProduct(
    id: string,
    updates: Partial<CreateProductInput>
): Promise<ProductWithStock> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Product update failed");
    return { ...data, available_now: data.on_hand - data.reserved };
}

export async function dbDeleteProduct(id: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", id);
    if (error) throw new Error(error.message);
}

// ── Inventory Movements ──────────────────────────────────────

export interface RecordMovementInput {
    product_id: string;
    movement_type: "production" | "receipt" | "adjustment";
    quantity: number;  // positive = in, negative = out
    reference_type?: "order" | "production_entry" | "manual";
    reference_id?: string;
    notes?: string;
    created_by?: string;
}

/** @deprecated Use dbRecordMovementAtomic() — atomik DB transaction */
export async function dbRecordMovement(input: RecordMovementInput): Promise<void> {
    const supabase = createServiceClient();

    // Record movement
    const { error: mErr } = await supabase.from("inventory_movements").insert({
        product_id: input.product_id,
        movement_type: input.movement_type,
        quantity: input.quantity,
        reference_type: input.reference_type ?? "manual",
        reference_id: input.reference_id ?? null,
        notes: input.notes ?? null,
        created_by: input.created_by ?? null,
        source: "ui",
    });
    if (mErr) throw new Error(mErr.message);

    // Update on_hand projection
    const { error: pErr } = await supabase.rpc("adjust_on_hand", {
        p_product_id: input.product_id,
        p_delta: input.quantity,
    });
    if (pErr) throw new Error(pErr.message);
}

// ── Atomic Inventory Operations ─────────────────────────────

export interface RecordMovementResult {
    success: boolean;
    error?: string;
    new_on_hand?: number;
    movement_id?: string;
}

/** Atomic stock movement: insert + on_hand update in a single DB transaction */
export async function dbRecordMovementAtomic(input: RecordMovementInput): Promise<RecordMovementResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("record_stock_movement", {
        p_product_id: input.product_id,
        p_movement_type: input.movement_type,
        p_quantity: input.quantity,
        p_reference_type: input.reference_type ?? "manual",
        p_reference_id: input.reference_id ?? null,
        p_notes: input.notes ?? null,
        p_source: "ui",
    });
    if (error) throw new Error(error.message);
    return data as RecordMovementResult;
}

export interface ResolveShortagesResult {
    success: boolean;
    shortages_resolved: number;
    shortages_partially_resolved: number;
    total_allocated: number;
}

/** Resolve open shortages for a product using available stock (FIFO) */
export async function dbTryResolveShortages(productId: string): Promise<ResolveShortagesResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("try_resolve_shortages", {
        p_product_id: productId,
    });
    if (error) throw new Error(error.message);
    return data as ResolveShortagesResult;
}

export async function dbListMovements(productId: string, limit = 50) {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("inventory_movements")
        .select("*")
        .eq("product_id", productId)
        .order("occurred_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
}
