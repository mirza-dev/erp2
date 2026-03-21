/**
 * Paraşüt Integration Service — domain-rules §10
 * ERP → Paraşüt fatura sync.
 * Paraşüt muhasebe/fatura durumunun authoritative kaynağıdır (§10.1).
 * ERP stok/sipariş durumunu değiştirmez — sadece fatura durumunu senkronize eder.
 */

import { dbGetOrderById } from "@/lib/supabase/orders";
import { dbCreateSyncLog } from "@/lib/supabase/sync-log";
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
