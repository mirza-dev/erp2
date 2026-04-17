import { createServiceClient } from "./service";
import type { ProductWithStock } from "@/lib/database.types";
import { unstable_cache } from "next/cache";

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
    product_type?: "raw_material" | "manufactured" | "commercial";
    warehouse?: string;
    reorder_qty?: number;
    preferred_vendor?: string;
    daily_usage?: number;
    lead_time_days?: number;
    product_family?: string;
    sub_category?: string;
    sector_compatibility?: string;
    cost_price?: number;
    weight_kg?: number;
    material_quality?: string;
    origin_country?: string;
    production_site?: string;
    use_cases?: string;
    industries?: string;
    standards?: string;
    certifications?: string;
    product_notes?: string;
    is_for_sales?: boolean;
    is_for_purchase?: boolean;
}

export interface ListProductsFilter {
    category?: string;
    product_type?: "raw_material" | "manufactured" | "commercial";
    is_active?: boolean;
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

export async function dbFindProductBySku(sku: string): Promise<ProductWithStock | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("sku", sku)
        .maybeSingle();
    if (error || !data) return null;
    return { ...data, available_now: data.on_hand - data.reserved };
}

/**
 * Tüm aktif ürünleri pagination olmadan döner.
 * Alert taraması gibi iç servis işlemlerinde kullanılır — UI pagination'ına uygun değil.
 */
export async function dbListAllActiveProducts(): Promise<ProductWithStock[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map(p => ({ ...p, available_now: p.on_hand - p.reserved }));
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
            product_type: input.product_type ?? "manufactured",
            warehouse: input.warehouse ?? null,
            reorder_qty: input.reorder_qty ?? null,
            preferred_vendor: input.preferred_vendor ?? null,
            daily_usage: input.daily_usage ?? null,
            ...(input.lead_time_days !== undefined ? { lead_time_days: input.lead_time_days } : {}),
            product_family: input.product_family ?? null,
            sub_category: input.sub_category ?? null,
            sector_compatibility: input.sector_compatibility ?? null,
            cost_price: input.cost_price ?? null,
            weight_kg: input.weight_kg ?? null,
            material_quality: input.material_quality ?? null,
            origin_country: input.origin_country ?? null,
            production_site: input.production_site ?? null,
            use_cases: input.use_cases ?? null,
            industries: input.industries ?? null,
            standards: input.standards ?? null,
            certifications: input.certifications ?? null,
            product_notes: input.product_notes ?? null,
            is_for_sales: input.is_for_sales ?? true,
            is_for_purchase: input.is_for_purchase ?? true,
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

/**
 * Returns a map of product_id → total open shortage qty for approved orders.
 * Source of truth for order_shortage alert logic (domain-rules §12).
 */
export async function dbGetOpenShortagesByProduct(): Promise<Map<string, number>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("shortages")
        .select("product_id, shortage_qty, sales_orders!inner(commercial_status)")
        .eq("status", "open")
        .eq("sales_orders.commercial_status", "approved");
    if (error) throw new Error(error.message);

    const map = new Map<string, number>();
    for (const row of data ?? []) {
        const productId = row.product_id as string;
        const qty = row.shortage_qty as number;
        map.set(productId, (map.get(productId) ?? 0) + qty);
    }
    return map;
}

/**
 * Returns a map of product_id → total quoted quantity across all active
 * draft and pending_approval orders. Used to compute `promisable` stock.
 */
export async function dbGetQuotedQuantities(): Promise<Map<string, number>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("order_lines")
        .select("product_id, quantity, sales_orders!inner(commercial_status)")
        .in("sales_orders.commercial_status", ["draft", "pending_approval"]);
    if (error) throw new Error(`dbGetQuotedQuantities: ${error.message}`);
    if (!data) return new Map();
    const map = new Map<string, number>();
    for (const row of data) {
        map.set(row.product_id, (map.get(row.product_id) ?? 0) + row.quantity);
    }
    return map;
}

// ── Quoted Breakdown ─────────────────────────────────────────

export interface QuotedBreakdownRow {
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    quantity: number;
    unitPrice: number;
    discountPct: number;
    lineTotal: number;
    currency: string;
    commercialStatus: "draft" | "pending_approval";
    orderCreatedAt: string;
    createdBy: string | null;
    quoteValidUntil: string | null;
}

type SalesOrderJoin = {
    id: string;
    order_number: string;
    commercial_status: "draft" | "pending_approval";
    created_at: string;
    created_by: string | null;
    customer_id: string;
    customer_name: string;
    currency: string;
    quote_valid_until: string | null;
};

/**
 * Bir ürünün aktif tekliflerinde yer aldığı order_line satırlarını
 * sipariş ve müşteri bilgileriyle döner. Sadece draft ve pending_approval.
 * Sıralama: en yeni teklif üstte (orderCreatedAt DESC).
 */
export async function dbGetQuotedBreakdownByProduct(
    productId: string
): Promise<QuotedBreakdownRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("order_lines")
        .select(`
            quantity,
            unit_price,
            discount_pct,
            line_total,
            sales_orders!inner (
                id,
                order_number,
                commercial_status,
                created_at,
                created_by,
                customer_id,
                customer_name,
                currency,
                quote_valid_until
            )
        `)
        .eq("product_id", productId)
        .in("sales_orders.commercial_status", ["draft", "pending_approval"]);
    if (error || !data) return [];

    const rows: QuotedBreakdownRow[] = [];
    for (const raw of data as unknown as Array<{
        quantity: number;
        unit_price: number;
        discount_pct: number;
        line_total: number;
        sales_orders: SalesOrderJoin | SalesOrderJoin[];
    }>) {
        const so = Array.isArray(raw.sales_orders) ? raw.sales_orders[0] : raw.sales_orders;
        if (!so) continue;
        rows.push({
            orderId: so.id,
            orderNumber: so.order_number,
            customerId: so.customer_id,
            customerName: so.customer_name,
            quantity: raw.quantity,
            unitPrice: raw.unit_price,
            discountPct: raw.discount_pct,
            lineTotal: raw.line_total,
            currency: so.currency,
            commercialStatus: so.commercial_status,
            orderCreatedAt: so.created_at,
            createdBy: so.created_by,
            quoteValidUntil: so.quote_valid_until ?? null,
        });
    }
    rows.sort((a, b) => b.orderCreatedAt.localeCompare(a.orderCreatedAt));
    return rows;
}

// auth.users listesi 5 dakika cache'lenir — kullanıcı emailları sık değişmez.
// Pagination ile tüm kullanıcılar çekilir (200+ kullanıcıda eksik eşleşme olmaz).
const getCachedAuthUsers = unstable_cache(
    async () => {
        const supabase = createServiceClient();
        const allUsers: { id: string; email: string }[] = [];
        let page = 1;
        while (true) {
            const { data } = await supabase.auth.admin.listUsers({ perPage: 1000, page });
            const batch = data?.users ?? [];
            for (const u of batch) {
                if (u.id) allUsers.push({ id: u.id, email: u.email ?? "" });
            }
            if (batch.length < 1000) break;
            page++;
        }
        return allUsers;
    },
    ["auth-users-list"],
    { tags: ["auth-users"], revalidate: 300 }
);

/**
 * auth.users'tan UUID → email map'i döner.
 * Sonuçlar 5 dakika server-side cache'de tutulur.
 */
export async function dbLookupUserEmails(
    userIds: string[]
): Promise<Map<string, string>> {
    const unique = Array.from(new Set(userIds.filter(Boolean)));
    if (unique.length === 0) return new Map();
    const users = await getCachedAuthUsers();
    const map = new Map<string, string>();
    for (const u of users) {
        if (u.email && unique.includes(u.id)) map.set(u.id, u.email);
    }
    return map;
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
