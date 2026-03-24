/**
 * Paraşüt Integration Service — domain-rules §10
 * ERP → Paraşüt fatura sync.
 * Paraşüt muhasebe/fatura durumunun authoritative kaynağıdır (§10.1).
 * ERP stok/sipariş durumunu değiştirmez — sadece fatura durumunu senkronize eder.
 */

import { dbGetOrderById } from "@/lib/supabase/orders";
import { dbCreateSyncLog, dbGetSyncLog, dbUpdateSyncLog } from "@/lib/supabase/sync-log";
import { sendInvoiceToParasut } from "@/lib/parasut";
import { createServiceClient } from "@/lib/supabase/service";
import type { ParasutInvoicePayload } from "@/lib/parasut";
import type { OrderWithLines } from "@/lib/supabase/orders";

// ── Mapping ──────────────────────────────────────────────────

function mapCurrency(c: string): "TRL" | "USD" | "EUR" {
    if (c === "USD") return "USD";
    if (c === "EUR") return "EUR";
    return "TRL";
}

/** SalesOrderWithLines → Paraşüt invoice payload */
function mapOrderToParasut(order: OrderWithLines): ParasutInvoicePayload {
    const issued = new Date(order.created_at);
    const due = new Date(issued);
    due.setDate(due.getDate() + 30);

    // "ORD-2026-0042" → 20260042
    const parts = order.order_number.split("-");
    const invoiceId = parts.length >= 3
        ? parseInt(parts[1] + parts[2], 10)
        : Date.now();

    return {
        data: {
            type: "sales_invoices",
            attributes: {
                item_type: "invoice",
                description: `KokpitERP #${order.order_number}`,
                issue_date: order.created_at.slice(0, 10),
                due_date: due.toISOString().slice(0, 10),
                currency: mapCurrency(order.currency),
                invoice_series: "KE",
                invoice_id: invoiceId,
                details_attributes: order.lines.map(line => ({
                    quantity: line.quantity,
                    unit_price: line.unit_price,
                    vat_rate: 20,
                    description: `${line.product_name} (${line.product_sku})`,
                    discount_type: "percentage",
                    discount_value: line.discount_pct,
                    product: { data: { type: "products", id: line.product_id } },
                })),
            },
            relationships: {
                contact: {
                    data: { type: "contacts", id: order.customer_id ?? order.customer_name },
                },
            },
        },
    };
}

// ── Sync ─────────────────────────────────────────────────────

export interface SyncOrderResult {
    success: boolean;
    invoice_id?: string;
    sent_at?: string;
    error?: string;
}

export async function serviceSyncOrderToParasut(orderId: string): Promise<SyncOrderResult> {
    const order = await dbGetOrderById(orderId);
    if (!order) return { success: false, error: "Sipariş bulunamadı." };
    if (order.commercial_status !== "approved") {
        return { success: false, error: "Yalnızca onaylı siparişler Paraşüt'e gönderilebilir." };
    }

    const payload = mapOrderToParasut(order);
    const result = await sendInvoiceToParasut(payload);

    const supabase = createServiceClient();

    if (result.success) {
        // Order'da parasut alanlarını güncelle
        await supabase.from("sales_orders").update({
            parasut_invoice_id: result.invoiceId,
            parasut_sent_at: result.sentAt,
            parasut_error: null,
        }).eq("id", orderId);

        await dbCreateSyncLog({
            entity_type: "sales_order",
            entity_id: orderId,
            direction: "push",
            status: "success",
            external_id: result.invoiceId,
        });

        return { success: true, invoice_id: result.invoiceId, sent_at: result.sentAt };
    } else {
        // Hata durumunda order'da parasut_error güncelle
        await supabase.from("sales_orders").update({
            parasut_error: result.error,
        }).eq("id", orderId);

        await dbCreateSyncLog({
            entity_type: "sales_order",
            entity_id: orderId,
            direction: "push",
            status: "error",
            error_message: result.error,
        });

        return { success: false, error: result.error };
    }
}

// ── Retry ────────────────────────────────────────────────────

export async function serviceRetrySyncLog(syncLogId: string): Promise<SyncOrderResult> {
    const log = await dbGetSyncLog(syncLogId);
    if (!log) return { success: false, error: "Sync log bulunamadı." };
    if (!log.entity_id) return { success: false, error: "entity_id eksik." };
    if (log.retry_count >= 3) return { success: false, error: "Maks. deneme sayısı (3) aşıldı." };

    // Mark as retrying
    await dbUpdateSyncLog(syncLogId, {
        status: "retrying",
        retry_count: log.retry_count + 1,
    });

    const result = await serviceSyncOrderToParasut(log.entity_id);

    // Update the original log based on result
    await dbUpdateSyncLog(syncLogId, {
        status: result.success ? "success" : "error",
        error_message: result.success ? null : (result.error ?? null),
        completed_at: result.success ? new Date().toISOString() : null,
        external_id: result.invoice_id ?? null,
    });

    return result;
}

// ── Sync All Pending ─────────────────────────────────────────

export async function serviceSyncAllPending(): Promise<{
    synced: number;
    failed: number;
    errors: string[];
}> {
    const supabase = createServiceClient();

    // Find approved orders with no parasut_invoice_id and no parasut_error
    const { data: pendingOrders, error } = await supabase
        .from("sales_orders")
        .select("id, order_number")
        .eq("commercial_status", "approved")
        .is("parasut_invoice_id", null)
        .is("parasut_error", null)
        .limit(50);

    if (error) throw new Error(error.message);

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const order of pendingOrders ?? []) {
        const result = await serviceSyncOrderToParasut(order.id);
        if (result.success) {
            synced++;
        } else {
            failed++;
            errors.push(`${order.order_number}: ${result.error}`);
        }
    }

    return { synced, failed, errors };
}
