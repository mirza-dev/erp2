import { createServiceClient } from "./service";
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

    const { data: order, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !order) return null;

    const { data: lines } = await supabase
        .from("order_lines")
        .select("*")
        .eq("order_id", id)
        .order("sort_order");

    return { ...order, lines: lines ?? [] };
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

export async function dbCreateOrder(input: CreateOrderInput): Promise<{ id: string; order_number: string }> {
    const supabase = createServiceClient();

    // Concurrency-safe order number via Postgres counter RPC
    const order_number = await dbGenerateOrderNumber();

    const { data: order, error: orderError } = await supabase
        .from("sales_orders")
        .insert({
            order_number,
            customer_id: input.customer_id ?? null,
            customer_name: input.customer_name,
            customer_email: input.customer_email ?? null,
            customer_country: input.customer_country ?? null,
            customer_tax_office: input.customer_tax_office ?? null,
            customer_tax_number: input.customer_tax_number ?? null,
            commercial_status: input.commercial_status,
            fulfillment_status: "unallocated",
            currency: input.currency,
            subtotal: input.subtotal,
            vat_total: input.vat_total,
            grand_total: input.grand_total,
            notes: input.notes ?? null,
            item_count: input.lines.length,
            created_by: input.created_by ?? null,
            incoterm: input.incoterm ?? null,
            planned_shipment_date: input.planned_shipment_date ?? null,
            quote_id: input.quote_id ?? null,
            original_order_number: input.original_order_number ?? null,
        })
        .select("id, order_number")
        .single();

    if (orderError || !order) throw new Error(orderError?.message ?? "Order creation failed");

    if (input.lines.length > 0) {
        const { error: linesError } = await supabase.from("order_lines").insert(
            input.lines.map((l, i) => ({
                order_id: order.id,
                product_id: l.product_id,
                product_name: l.product_name,
                product_sku: l.product_sku,
                unit: l.unit,
                quantity: l.quantity,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct,
                line_total: l.line_total,
                sort_order: i,
            }))
        );
        if (linesError) throw new Error(linesError.message);
    }

    return { id: order.id, order_number: order.order_number };
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

export async function dbApproveOrder(orderId: string): Promise<ApproveOrderResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("approve_order_with_allocation", {
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

// ── Stock helpers (DEPRECATED) ──────────────────────────────

/** @deprecated Use ApproveOrderResult.shortages instead */
export interface StockConflict {
    product_id: string;
    product_name: string;
    requested: number;
    available: number;
}

/** @deprecated approve_order_with_allocation RPC handles stock checks internally */
export async function dbGetProductStocks(
    productIds: string[]
): Promise<Map<string, { on_hand: number; reserved: number; available_now: number }>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("id, on_hand, reserved")
        .in("id", productIds);
    if (error) throw new Error(error.message);

    const map = new Map<string, { on_hand: number; reserved: number; available_now: number }>();
    for (const row of data ?? []) {
        map.set(row.id, {
            on_hand: row.on_hand,
            reserved: row.reserved,
            available_now: row.on_hand - row.reserved,
        });
    }
    return map;
}

/** @deprecated Use approve_order_with_allocation RPC via dbApproveOrder() */
export async function dbReserveStock(
    orderId: string,
    lines: OrderLineRow[]
): Promise<void> {
    const supabase = createServiceClient();

    for (const line of lines) {
        // Increment reserved on product
        const { error: pErr } = await supabase.rpc("increment_reserved", {
            p_product_id: line.product_id,
            p_qty: line.quantity,
        });
        if (pErr) throw new Error(pErr.message);

        // Create reservation record
        const { error: rErr } = await supabase.from("stock_reservations").insert({
            product_id: line.product_id,
            order_id: orderId,
            order_line_id: line.id,
            reserved_qty: line.quantity,
            status: "open",
        });
        if (rErr) throw new Error(rErr.message);
    }
}

/** @deprecated Use cancel_order RPC via dbCancelOrder() */
export async function dbReleaseStock(orderId: string): Promise<void> {
    const supabase = createServiceClient();

    // Get open reservations for this order
    const { data: reservations } = await supabase
        .from("stock_reservations")
        .select("*")
        .eq("order_id", orderId)
        .eq("status", "open");

    if (!reservations?.length) return;

    for (const res of reservations) {
        const { error: pErr } = await supabase.rpc("decrement_reserved", {
            p_product_id: res.product_id,
            p_qty: res.reserved_qty,
        });
        if (pErr) throw new Error(pErr.message);
    }

    await supabase
        .from("stock_reservations")
        .update({ status: "released", released_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .eq("status", "open");
}

/** @deprecated Use ship_order_full RPC via dbShipOrderFull() */
export async function dbShipOrder(orderId: string, lines: OrderLineRow[]): Promise<void> {
    const supabase = createServiceClient();

    for (const line of lines) {
        // Decrement on_hand
        const { error } = await supabase.rpc("decrement_on_hand", {
            p_product_id: line.product_id,
            p_qty: line.quantity,
        });
        if (error) throw new Error(error.message);

        // Record movement
        await supabase.from("inventory_movements").insert({
            product_id: line.product_id,
            movement_type: "shipment",
            quantity: -line.quantity,
            reference_type: "order",
            reference_id: orderId,
            source: "ui",
        });
    }

    // Release reservations
    await supabase
        .from("stock_reservations")
        .update({ status: "shipped", released_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .eq("status", "open");
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
