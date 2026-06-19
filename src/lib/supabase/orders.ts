import { createServiceClient } from "./service";
import { localISODate } from "@/lib/stock-utils";
import { orIlikeFilter } from "@/lib/list-query";
import type {
    SalesOrderRow,
    OrderLineRow,
    CommercialStatus,
    FulfillmentStatus,
} from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────

export interface OrderWithLines extends SalesOrderRow {
    lines: OrderLineRow[];
}

export interface CreateOrderInput {
    customer_id?: string;
    customer_name: string;
    customer_email?: string;
    customer_country?: string;
    customer_tax_office?: string;
    customer_tax_number?: string;
    commercial_status: CommercialStatus;
    fulfillment_status: FulfillmentStatus;
    currency: string;
    subtotal: number;
    vat_total: number;
    grand_total: number;
    notes?: string;
    created_by?: string;
    incoterm?: string;
    planned_shipment_date?: string;
    quote_id?: string;
    original_order_number?: string;
    quote_valid_until?: string;
    lines: {
        product_id: string;
        product_name: string;
        product_sku: string;
        unit: string;
        quantity: number;
        unit_price: number;
        discount_pct: number;
        line_total: number;
    }[];
}

export interface ListOrdersFilter {
    commercial_status?: CommercialStatus;
    customer_id?: string;
    page?: number;
    pageSize?: number;
}

// ── Server-side pagination (A1) ──────────────────────────────
// Liste sayfaları artık "tüm satırları client'a çek → bellekte filtrele/dilimle"
// yerine sunucu tarafında filtre + sayfalama yapar. UI filtre eksenleri
// (tab/arama/tarih/döviz/müşteri) burada SQL'e çevrilir.

/** UI filtre sekmesi — commercial + fulfillment birleşik kullanıcı kovaları. */
export type OrderTab = "ALL" | "draft" | "pending_approval" | "approved" | "shipped" | "cancelled";

export interface OrdersPageQuery {
    tab?: OrderTab;
    search?: string;       // order_number VEYA customer_name (ilike)
    customer_id?: string;
    date_from?: string;    // YYYY-MM-DD (created_at >= gün başı)
    date_to?: string;      // YYYY-MM-DD (created_at <= gün sonu)
    currency?: string;
    page?: number;
    pageSize?: number;
}

export interface OrdersPageResult {
    rows: SalesOrderRow[];
    total: number;         // filtre uygulanmış toplam satır (pagination için)
}

export const ORDERS_DEFAULT_PAGE_SIZE = 50;

/**
 * Arama terimini PostgREST `.or()` filtresine güvenli göm (filtre enjeksiyonu
 * önlenir — RFQ buildRfqSearchOrFilter emsali). Çift-tırnaklı sarmalama `,` `.`
 * `()` karakterlerinin koşul ayracı sayılmasını engeller.
 */
export function buildOrderSearchOrFilter(search: string): string {
    return orIlikeFilter(["order_number", "customer_name"], search);
}

/**
 * Sunucu tarafı filtre + sayfalama. `count:"exact"` range'den bağımsız olarak
 * filtre uygulanmış TOPLAM satırı döndürür → tek sorguyla hem sayfa hem total.
 * Filtreler order/range'den ÖNCE (orijinal dbListOrders deseni — filtre
 * metotları select builder'da garanti, tip-derinliği patlamaz).
 */
export async function dbListOrdersPaged(q: OrdersPageQuery = {}): Promise<OrdersPageResult> {
    const supabase = createServiceClient();
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.max(1, q.pageSize ?? ORDERS_DEFAULT_PAGE_SIZE);

    let query = supabase.from("sales_orders").select("*", { count: "exact" });
    // Tab → commercial/fulfillment eksen çevirisi (UI matchesTab ile birebir)
    if (q.tab === "shipped") {
        query = query.eq("fulfillment_status", "shipped");
    } else if (q.tab === "approved") {
        query = query.eq("commercial_status", "approved").neq("fulfillment_status", "shipped");
    } else if (q.tab && q.tab !== "ALL") {
        query = query.eq("commercial_status", q.tab);
    }
    if (q.customer_id) query = query.eq("customer_id", q.customer_id);
    if (q.currency) query = query.eq("currency", q.currency);
    if (q.date_from) query = query.gte("created_at", `${q.date_from}T00:00:00`);
    if (q.date_to) query = query.lte("created_at", `${q.date_to}T23:59:59.999`);
    if (q.search && q.search.trim()) query = query.or(buildOrderSearchOrFilter(q.search));

    const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data ?? [], total: count ?? 0 };
}

/**
 * Sekme rozet sayaçları — her kovanın GLOBAL adedi (arama/tarih/döviz/müşteri
 * filtrelerinden bağımsız; mevcut UI davranışı birebir). 6 head+count paralel.
 */
export async function dbCountOrdersByTab(): Promise<Record<OrderTab, number>> {
    const supabase = createServiceClient();
    const head = () => supabase.from("sales_orders").select("id", { count: "exact", head: true });
    const [all, draft, pending, approved, shipped, cancelled] = await Promise.all([
        head(),
        head().eq("commercial_status", "draft"),
        head().eq("commercial_status", "pending_approval"),
        head().eq("commercial_status", "approved").neq("fulfillment_status", "shipped"),
        head().eq("fulfillment_status", "shipped"),
        head().eq("commercial_status", "cancelled"),
    ]);
    const errored = [all, draft, pending, approved, shipped, cancelled].find(r => r.error);
    if (errored?.error) throw new Error(errored.error.message);
    return {
        ALL: all.count ?? 0,
        draft: draft.count ?? 0,
        pending_approval: pending.count ?? 0,
        approved: approved.count ?? 0,
        shipped: shipped.count ?? 0,
        cancelled: cancelled.count ?? 0,
    };
}

// ── Helpers ──────────────────────────────────────────────────

/** Generate a concurrency-safe order number via Postgres counter */
export async function dbGenerateOrderNumber(): Promise<string> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("generate_order_number");
    if (error) throw new Error(error.message);
    return data as string;
}

// ── Queries ──────────────────────────────────────────────────

export async function dbFindOrderByOriginalNumber(originalNumber: string): Promise<SalesOrderRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("original_order_number", originalNumber)
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

export async function dbGetOrderById(id: string): Promise<OrderWithLines | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("sales_orders")
        .select("*, order_lines(*)")
        .eq("id", id)
        .order("sort_order", { foreignTable: "order_lines" })
        .single();
    if (error || !data) return null;
    const { order_lines, ...orderFields } = data as typeof data & { order_lines: OrderLineRow[] };
    return { ...orderFields, lines: order_lines ?? [] };
}

/**
 * Belirli ticari durumdaki sipariş ADEDİ (head+count — satır taşımaz).
 * /api/dashboard/counters: Sidebar "Satış Siparişleri" rozeti, tam listeyi
 * indirip client'ta filtrelemek yerine DB sayar (perf Faz 2).
 */
export async function dbCountOrdersByCommercialStatus(status: CommercialStatus): Promise<number> {
    const supabase = createServiceClient();
    const { count, error } = await supabase
        .from("sales_orders")
        .select("id", { count: "exact", head: true })
        .eq("commercial_status", status);
    if (error) throw new Error(error.message);
    return count ?? 0;
}

export async function dbListOrders(filter: ListOrdersFilter = {}): Promise<SalesOrderRow[]> {
    const supabase = createServiceClient();
    const { page = 1, pageSize = 50, commercial_status, customer_id } = filter;

    let query = supabase
        .from("sales_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

    if (commercial_status) query = query.eq("commercial_status", commercial_status);
    if (customer_id) query = query.eq("customer_id", customer_id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbCreateOrder(input: CreateOrderInput): Promise<SalesOrderRow> {
    const supabase = createServiceClient();

    // Atomic: header + lines in one PL/pgSQL function — Postgres rolls back
    // everything if lines fail, preventing orphan sales_orders rows.
    const { data, error } = await supabase.rpc("create_order_with_lines", {
        p_header: {
            customer_id: input.customer_id ?? null,
            customer_name: input.customer_name,
            customer_email: input.customer_email ?? null,
            customer_country: input.customer_country ?? null,
            customer_tax_office: input.customer_tax_office ?? null,
            customer_tax_number: input.customer_tax_number ?? null,
            commercial_status: input.commercial_status,
            currency: input.currency,
            subtotal: input.subtotal,
            vat_total: input.vat_total,
            grand_total: input.grand_total,
            notes: input.notes ?? null,
            created_by: input.created_by ?? null,
            incoterm: input.incoterm ?? null,
            planned_shipment_date: input.planned_shipment_date ?? null,
            quote_id: input.quote_id ?? null,
            original_order_number: input.original_order_number ?? null,
            quote_valid_until: input.quote_valid_until ?? null,
        },
        p_lines: input.lines.map((l, i) => ({
            product_id: l.product_id,
            product_name: l.product_name,
            product_sku: l.product_sku,
            unit: l.unit,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            line_total: l.line_total,
            sort_order: i,
        })),
    });

    if (error) throw new Error(error.message);
    const rpcResult = data as { order_id: string; order_number: string };

    // Fetch full row so caller gets item_count and all DB-set fields
    const { data: row, error: rowErr } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("id", rpcResult.order_id)
        .single();
    if (rowErr || !row) throw new Error("Order created but could not be fetched");
    return row;
}

// ── Draft edit (Faz 2) ───────────────────────────────────────

export interface UpdateOrderInput {
    customer_id?: string;
    customer_name: string;
    customer_email?: string;
    customer_country?: string;
    customer_tax_office?: string;
    customer_tax_number?: string;
    currency: string;
    notes?: string;
    quote_valid_until?: string;
    lines: {
        product_id: string;
        product_name: string;
        product_sku: string;
        unit: string;
        quantity: number;
        unit_price: number;
        discount_pct: number;
        line_total: number;
    }[];
}

/**
 * Taslak siparişin müşteri/kalem/not/teklif-vadesini atomik değiştirir.
 * update_order_with_lines RPC: FOR UPDATE + status='draft' guard + totals
 * yeniden hesap (sunucu tarafı). draft dışı → RPC RAISE eder (service map'ler).
 */
export async function dbUpdateOrderWithLines(
    orderId: string,
    input: UpdateOrderInput,
    actor?: string | null,
): Promise<SalesOrderRow> {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("update_order_with_lines", {
        p_order_id: orderId,
        p_header: {
            customer_id: input.customer_id ?? null,
            customer_name: input.customer_name,
            customer_email: input.customer_email ?? null,
            customer_country: input.customer_country ?? null,
            customer_tax_office: input.customer_tax_office ?? null,
            customer_tax_number: input.customer_tax_number ?? null,
            currency: input.currency,
            notes: input.notes ?? null,
            quote_valid_until: input.quote_valid_until ?? null,
        },
        p_lines: input.lines.map((l) => ({
            product_id: l.product_id,
            product_name: l.product_name,
            product_sku: l.product_sku,
            unit: l.unit,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            line_total: l.line_total,
        })),
        p_actor: actor ?? null,
    });
    if (error) throw new Error(error.message);

    const { data: row, error: rowErr } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("id", orderId)
        .single();
    if (rowErr || !row) throw new Error("Sipariş güncellendi ancak okunamadı");
    return row;
}

export async function dbUpdateOrderStatus(
    id: string,
    commercial_status: CommercialStatus,
    fulfillment_status: FulfillmentStatus
): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("sales_orders")
        .update({ commercial_status, fulfillment_status })
        .eq("id", id);
    if (error) throw new Error(error.message);
}

// ── Synced orders (Parasut) ──────────────────────────────────

export async function dbListSyncedOrders(limit = 20): Promise<SalesOrderRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .not("parasut_invoice_id", "is", null)
        .order("parasut_sent_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
}

// ── Approve / Ship / Cancel RPCs ─────────────────────────────

export interface ApproveOrderResult {
    success: boolean;
    error?: string;
    fulfillment_status?: FulfillmentStatus;
    shortages?: { product_name: string; requested: number; reserved: number; shortage: number }[];
}

/**
 * Taslak → Bekliyor: HARD rezervasyon burada oluşur (migration 082).
 * submit_order_for_approval RPC: allocate + commercial_status='pending_approval'.
 */
export async function dbSubmitOrderForApproval(orderId: string): Promise<ApproveOrderResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("submit_order_for_approval", {
        p_order_id: orderId,
    });
    if (error) throw new Error(error.message);
    return data as ApproveOrderResult;
}

/**
 * Bekliyor → Onaylı: light ticari teyit (rezervasyon zaten pending'de yapıldı).
 * approve_order RPC: commercial_status='approved' (legacy rezervsiz pending'de
 * fallback allocation çalışır). Migration 082.
 */
export async function dbApproveOrder(orderId: string): Promise<ApproveOrderResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("approve_order", {
        p_order_id: orderId,
    });
    if (error) throw new Error(error.message);
    return data as ApproveOrderResult;
}

export async function dbShipOrderFull(orderId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("ship_order_full", { p_order_id: orderId });
    if (error) throw new Error(error.message);
    return data as { success: boolean; error?: string };
}

export async function dbCancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
    if (error) throw new Error(error.message);
    return data as { success: boolean; error?: string };
}

// LEGACY dbListExpiredQuotes (sales_orders.quote_valid_until tabanlı) 2026-06-18
// quotes denetiminde KALDIRILDI (O1) — yalnız order-service.serviceExpireQuotes
// kullanıyordu, o da canonical quote-service expiry lehine silindi. Süresi dolan
// teklifler artık quotes tablosu üzerinden (quotes.dbListExpiredQuotes) ele alınır.

export async function dbFindOrderByQuoteId(quoteId: string): Promise<SalesOrderRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("quote_id", quoteId)
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
}

// ── Quote Deadline Update ────────────────────────────────────

export async function dbUpdateOrderQuoteDeadline(
    id: string,
    quoteValidUntil: string | null
): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("sales_orders")
        .update({ quote_valid_until: quoteValidUntil })
        .eq("id", id);
    if (error) throw new Error(error.message);
}

// ── Overdue Shipments ────────────────────────────────────────

/** Approved, unshipped orders that are past their planned ship date
 *  or have no ship date but were created 7+ days ago. */
export async function dbListOverdueShipments(): Promise<SalesOrderRow[]> {
    const supabase = createServiceClient();
    const today = localISODate(Date.now());
    const threshold = localISODate(Date.now() - 7 * 86_400_000);
    const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("commercial_status", "approved")
        .not("fulfillment_status", "eq", "shipped")
        .or(`planned_shipment_date.lt.${today},and(planned_shipment_date.is.null,created_at.lt.${threshold})`);
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetOpenOrderCountByProduct(): Promise<Map<string, number>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("order_lines")
        .select("product_id, order_id, sales_orders!inner(commercial_status, fulfillment_status)")
        .eq("sales_orders.commercial_status", "approved")
        .not("sales_orders.fulfillment_status", "eq", "shipped");
    if (error) throw new Error(error.message);
    const orderSets = new Map<string, Set<string>>();
    for (const row of data ?? []) {
        const pid = row.product_id as string;
        const oid = row.order_id as string;
        if (!orderSets.has(pid)) orderSets.set(pid, new Set());
        orderSets.get(pid)!.add(oid);
    }
    return new Map([...orderSets.entries()].map(([pid, s]) => [pid, s.size]));
}

// ── Hard Delete ──────────────────────────────────────────────

export async function dbHardDeleteOrder(id: string, actor?: string | null): Promise<void> {
    const supabase = createServiceClient();
    // Faz 6: before-snapshot silmeden ÖNCE; audit yalnız silme BAŞARILI olunca
    // (FK restrict — shipments/invoices — delete throw ederse yalan audit kalmasın).
    const { data: existing } = await supabase
        .from("sales_orders").select("*").eq("id", id).maybeSingle();
    const { error } = await supabase.from("sales_orders").delete().eq("id", id);
    if (error) throw new Error(error.message);
    if (existing) {
        await supabase.from("audit_log").insert({
            actor: actor ?? null,
            action: "order_hard_deleted",
            entity_type: "sales_order",
            entity_id: id,
            before_state: existing,
            source: "ui",
        });
    }
}

export async function dbCountOrdersByCustomer(customerId: string): Promise<number> {
    const supabase = createServiceClient();
    const { count, error } = await supabase
        .from("sales_orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId);
    if (error) throw new Error(error.message);
    return count ?? 0;
}

// ── Audit ────────────────────────────────────────────────────

export async function dbLogOrderAction(
    orderId: string,
    action: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>
): Promise<void> {
    const supabase = createServiceClient();
    await supabase.from("audit_log").insert({
        action,
        entity_type: "sales_order",
        entity_id: orderId,
        before_state: before,
        after_state: after,
        source: "ui",
    });
}
