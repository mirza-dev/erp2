import { createServiceClient } from "./service";
import type { ProductWithStock } from "@/lib/database.types";
import { unstable_cache } from "next/cache";
import { orIlikeFilter } from "@/lib/list-query";

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
    product_type?: "manufactured" | "commercial";
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
    /** Faz 1 review — dinamik tip altyapısı: hangi ürün tipine ait (nullable). */
    product_type_id?: string | null;
    /** Faz 1 review — dinamik tip altyapısı: tipe özgü alanlar JSON. */
    attributes?: Record<string, unknown>;
    /** Teklif Faz 1a (V4-B3): teklif satırı auto-fill için master GTİP + ölçü. */
    hs_code?: string;
    size_text?: string;
}

export interface ListProductsFilter {
    category?: string;
    product_type?: "manufactured" | "commercial";
    is_active?: boolean;
    on_hand_gt?: number;
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

export async function dbGetAllActiveProductIds(): Promise<string[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("id")
        .eq("is_active", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map(r => r.id);
}

/**
 * Bulk fetch of minimal product fields for print/PDF documents.
 * Only id/sku/name/unit — sensitive fields (cost_price, parasut_*, on_hand, reserved,
 * product_notes, ...) MUST NOT cross the server→client boundary in print payloads.
 */
export interface ProductRef {
    id: string;
    sku: string;
    name: string;
    unit: string;
}

export async function dbGetProductRefsByIds(ids: string[]): Promise<ProductRef[]> {
    if (ids.length === 0) return [];
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, unit")
        .in("id", ids);
    if (error) throw new Error(error.message);
    return data ?? [];
}

/** Verilen ürün id'lerinin parasut_product_id eşlemesi (badge kontrolünde N+1'i önler). */
export async function dbGetProductParasutIds(ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("id, parasut_product_id")
        .in("id", ids);
    if (error) throw new Error(error.message);
    const map = new Map<string, string | null>();
    for (const r of data ?? []) map.set(r.id as string, (r.parasut_product_id as string | null) ?? null);
    return map;
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
    if (filter.on_hand_gt !== undefined) query = query.gt("on_hand", filter.on_hand_gt);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map(p => ({ ...p, available_now: p.on_hand - p.reserved }));
}

// ── A1: Stok & Ürünler sunucu tarafı sayfalama ───────────────
// Diğer 5 listenin RSC kalıbından farklı: products sayfası "use client" kalır
// (risk/alert overlay'leri AI/POST ve mount-sonrası çalışır → RSC'ye ucuza
// taşınamaz). Bu helper temel liste filtrelerini (arama/kategori/tip + sinyal
// id.in) SQL'e taşıyıp tek sorguda {rows,total} döner → client mega-fetch ölür.

export const PRODUCTS_DEFAULT_PAGE_SIZE = 50;

export interface ProductsPageQuery {
    search?: string;
    /** Çoklu kategori seçimi (UI dropdown). Boş → kategori filtresi yok. */
    categories?: string[];
    product_type?: "manufactured" | "commercial";
    is_active?: boolean;
    /** Sinyal filtresi (riskli/uyarılı/öneri) üyelik id seti → id.in. */
    ids?: string[];
    /** Sinyal filtresi aktif: ids boşsa TÜM ürünler değil BOŞ döner (tam sadakat). */
    signalActive?: boolean;
    page?: number;
    pageSize?: number;
}

export interface ProductsPageResult {
    rows: ProductWithStock[];
    total: number;
}

export async function dbListProductsPaged(query: ProductsPageQuery = {}): Promise<ProductsPageResult> {
    const {
        search, categories, product_type, is_active = true,
        ids, signalActive, page = 1, pageSize = PRODUCTS_DEFAULT_PAGE_SIZE,
    } = query;

    // Sinyal filtresi aktif ama eşleşen id yok → boş (yanlışlıkla tümünü döndürme).
    if (signalActive && (!ids || ids.length === 0)) return { rows: [], total: 0 };

    const supabase = createServiceClient();
    let q = supabase.from("products").select("*", { count: "exact" });

    if (is_active !== undefined) q = q.eq("is_active", is_active);
    if (product_type) q = q.eq("product_type", product_type);
    if (categories && categories.length > 0) q = q.in("category", categories);
    if (ids && ids.length > 0) q = q.in("id", ids);
    if (search && search.trim()) q = q.or(orIlikeFilter(["name", "sku"], search.trim()));

    q = q.order("name").range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);

    return {
        rows: (data ?? []).map(p => ({ ...p, available_now: p.on_hand - p.reserved })),
        total: count ?? 0,
    };
}

export interface ProductListCounts {
    /** Aktif ürün toplamı (başlık + "Tümü" sinyal sekmesi + kategori "Tümü"). */
    total: number;
    /** Kategori → ürün sayısı (dropdown sayaçları). Boş kategoriler hariç. */
    categories: Record<string, number>;
    /** Kritik: promisable ≤ min_stock_level (başlık rozeti). quoted aggregate gerekir. */
    critical: number;
}

/**
 * Liste başlık + kategori dropdown + kritik sayaçları — sayfalamadan bağımsız
 * (tüm-katalog). Yalnızca hafif kolonları çeker (id/category/on_hand/reserved/
 * min_stock_level) → eski full-object mega-fetch'e göre çok daha ucuz.
 * Sinyal sayaçları (riskli/uyarılı/öneri) overlay uçlarından gelir, burada DEĞİL.
 */
export async function dbGetProductListCounts(opts: { is_active?: boolean } = {}): Promise<ProductListCounts> {
    const is_active = opts.is_active ?? true;
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("id, category, on_hand, reserved, min_stock_level")
        .eq("is_active", is_active);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const quotedMap = await dbGetQuotedQuantities();
    const categories: Record<string, number> = {};
    let critical = 0;
    for (const r of rows) {
        const cat = (r.category as string | null) ?? "";
        if (cat) categories[cat] = (categories[cat] ?? 0) + 1;
        const quoted = quotedMap.get(r.id as string) ?? 0;
        const promisable = ((r.on_hand as number) - (r.reserved as number)) - quoted;
        if (promisable <= (r.min_stock_level as number)) critical++;
    }
    return { total: rows.length, categories, critical };
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
            product_type_id: input.product_type_id ?? null,
            attributes: input.attributes ?? {},
            // Teklif Faz 1a (V4-B3): master GTİP + ölçü.
            hs_code: input.hs_code ?? null,
            size_text: input.size_text ?? null,
        })
        .select("*")
        .single();

    if (error || !data) throw new Error(error?.message ?? "Product creation failed");
    return { ...data, available_now: data.on_hand - data.reserved };
}

/**
 * Faz C — dbUpdateProduct yazılabilir alan allow-list'i (savunma-derinliği).
 * Ham `.update(updates)` yerine yalnız bu alanlar geçer → import veya başka bir
 * çağıran yanlışlıkla `reserved`/`id`/rastgele kolon gönderse bile yazılmaz.
 * `undefined` değerler de düşer (fill-empty akışında "bu alanı yazma" demek).
 */
const PRODUCT_UPDATE_ALLOWED_FIELDS = new Set<string>([
    "name", "sku", "category", "unit", "price", "currency", "on_hand",
    "min_stock_level", "product_type", "warehouse", "reorder_qty",
    "preferred_vendor", "daily_usage", "lead_time_days", "product_family",
    "sub_category", "sector_compatibility", "cost_price", "weight_kg",
    "material_quality", "origin_country", "production_site", "use_cases",
    "industries", "standards", "certifications", "product_notes",
    "product_type_id", "attributes", "hs_code", "size_text", "is_active",
]);

export async function dbUpdateProduct(
    id: string,
    updates: Partial<CreateProductInput> & { is_active?: boolean }
): Promise<ProductWithStock> {
    const supabase = createServiceClient();
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
        if (PRODUCT_UPDATE_ALLOWED_FIELDS.has(k) && v !== undefined) clean[k] = v;
    }
    const { data, error } = await supabase
        .from("products")
        .update(clean)
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
    reference_type?: "order" | "production_entry" | "manual" | "import" | "stock_transfer";
    reference_id?: string;
    notes?: string;
    created_by?: string;
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

export interface RecountStockResult {
    success: boolean;
    error?: string;
    new_on_hand?: number;
    delta?: number;
    movement_id?: string;
}

/**
 * Atomik fiziksel stok sayımı: ürün satırını `for update` ile kilitler, delta'yı
 * transaction içinde hesaplar ve `on_hand`'i MUTLAK sayılan değere atar.
 *
 * D-O1: import stok sayımı eskiden JS'te `delta = counted - prod.on_hand` ile,
 * okuma RPC transaction'ının dışında hesaplıyordu → eşzamanlı dış harekette
 * `on_hand ≠ sayılan` (lost update). recount_stock bunu txn-içi kilitle çözer.
 */
export async function dbRecountStock(input: {
    product_id: string;
    counted_qty: number;
    notes?: string;
    created_by?: string;
}): Promise<RecountStockResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("recount_stock", {
        p_product_id: input.product_id,
        p_counted_qty: input.counted_qty,
        p_notes: input.notes ?? null,
        p_actor: input.created_by ?? null,
    });
    if (error) throw new Error(error.message);
    return data as RecountStockResult;
}

export interface RecordStockTransferResult {
    success: boolean;
    transfer_id?: string;
    error?: string;
}

export async function dbRecordStockTransfer(input: {
    product_id: string;
    quantity: number;
    from_location: string;
    to_location: string;
    notes?: string;
    actor?: string | null;
}): Promise<RecordStockTransferResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("record_stock_transfer", {
        p_product_id: input.product_id,
        p_quantity: input.quantity,
        p_from_location: input.from_location,
        p_to_location: input.to_location,
        p_notes: input.notes ?? null,
        p_actor: input.actor ?? null,
    });
    if (error) throw new Error(error.message);
    return data as RecordStockTransferResult;
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

/** Bir siparişin açık (open) shortage'larının distinct product_id'leri (yeniden tahsisat için). */
export async function dbGetOpenShortageProductIds(orderId: string): Promise<string[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("shortages")
        .select("product_id")
        .eq("order_id", orderId)
        .eq("status", "open");
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((r) => r.product_id as string))];
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
        // pending_approval artık HARD rezerve (migration 082) → eksiği approved kadar
        // gerçek; order_shortage uyarısı pending'i de saymalı (yoksa onaya kadar görünmez).
        .in("sales_orders.commercial_status", ["pending_approval", "approved"]);
    if (error) throw new Error(error.message);

    const map = new Map<string, number>();
    for (const row of data ?? []) {
        const productId = row.product_id as string;
        const qty = row.shortage_qty as number;
        map.set(productId, (map.get(productId) ?? 0) + qty);
    }
    return map;
}

// ── Open Shortage Detail by Product ──────────────────────────

export interface OpenShortageDetailRow {
    shortageId: string;
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    requestedQty: number;
    availableQty: number;
    shortageQty: number;
    createdAt: string;
}

type SalesOrderShortageJoin = {
    id: string;
    order_number: string;
    commercial_status: string;
    customer_id: string;
    customer_name: string;
};

/**
 * Bir ürünün açık (status='open') shortage kayıtlarını sipariş + müşteri
 * bilgileriyle döner. Yalnızca commercial_status='approved' siparişlerdeki
 * shortage'lar — order_shortage alert'inin source of truth'u.
 * Sıralama: en yeni shortage üstte (createdAt DESC).
 *
 * Plan §9.4.4 (Faz 10): drawer "tek başına yeterli bilgi" — kullanıcı linki
 * tıklamadan ürün eksik miktarı + ilgili sipariş(ler)i tam görür.
 */
export async function dbGetOpenShortagesByProductId(
    productId: string
): Promise<OpenShortageDetailRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("shortages")
        .select(`
            id,
            requested_qty,
            available_qty,
            shortage_qty,
            created_at,
            sales_orders!inner (
                id,
                order_number,
                commercial_status,
                customer_id,
                customer_name
            )
        `)
        .eq("product_id", productId)
        .eq("status", "open")
        // migration 082: pending_approval da hard-rezerve → shortage detayı (drawer)
        // aggregate uyarıyla tutarlı kalsın.
        .in("sales_orders.commercial_status", ["pending_approval", "approved"]);
    // Faz 10 review: DB/permission/query hatasını yutma — route 500 dönsün ki
    // drawer "Açık shortage kalmadı" empty branch'ine düşüp kullanıcıyı
    // yanıltmasın. PostgREST data null olmaz (empty result → [] döner);
    // defensive [] sadece beklenmedik durum için.
    if (error) throw new Error(`dbGetOpenShortagesByProductId: ${error.message}`);
    if (!data) return [];

    const rows: OpenShortageDetailRow[] = [];
    for (const raw of data as unknown as Array<{
        id: string;
        requested_qty: number;
        available_qty: number;
        shortage_qty: number;
        created_at: string;
        sales_orders: SalesOrderShortageJoin | SalesOrderShortageJoin[];
    }>) {
        const so = Array.isArray(raw.sales_orders) ? raw.sales_orders[0] : raw.sales_orders;
        if (!so) continue;
        rows.push({
            shortageId: raw.id,
            orderId: so.id,
            orderNumber: so.order_number,
            customerId: so.customer_id,
            customerName: so.customer_name,
            requestedQty: raw.requested_qty,
            availableQty: raw.available_qty,
            shortageQty: raw.shortage_qty,
            createdAt: raw.created_at,
        });
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows;
}

/**
 * Returns a map of product_id → total quoted quantity across all active
 * DRAFT orders (soft hold). Used to compute `promisable` stock.
 *
 * NOT: pending_approval artık HARD rezerve ediliyor (migration 082) →
 * products.reserved'a düşer (available_now azalır). Burada da sayılırsa
 * promisable ÇİFT düşer. Bu yüzden quoted = yalnız draft. (reserved = pending+)
 */
export async function dbGetQuotedQuantities(): Promise<Map<string, number>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("order_lines")
        .select("product_id, quantity, sales_orders!inner(commercial_status)")
        .eq("sales_orders.commercial_status", "draft");
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
 * Bir ürünün aktif TASLAK tekliflerinde yer aldığı order_line satırlarını
 * sipariş ve müşteri bilgileriyle döner. Sadece draft (soft hold).
 * Sıralama: en yeni teklif üstte (orderCreatedAt DESC).
 *
 * NOT: pending_approval artık HARD rezerve (migration 082) → "Teklifte"
 * (quoted=draft) sayısıyla tutarlı kalmak için breakdown da draft-only.
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
        .eq("sales_orders.commercial_status", "draft");
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
