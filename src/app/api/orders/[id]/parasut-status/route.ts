/**
 * Faz 11.3 — Sipariş detay sayfasında Paraşüt step badge'leri için status endpoint.
 * GET /api/orders/[id]/parasut-status
 *
 * Döndürür:
 *   - parasutStep: aktif step
 *   - errorKind, error, nextRetryAt, retryCount
 *   - eDoc: { status, error, invoiceType }
 *   - badges: { contact, product, shipment, invoice, edoc }
 *     - contactDone: customer.parasut_contact_id != null
 *     - productDone: lines.every(l => products[l.product_id]?.parasut_product_id != null)
 *     - shipmentDone: parasut_shipment_document_id != null
 *     - invoiceDone:  parasut_invoice_id != null
 *     - edocStatus:   'done'|'running'|'error'|'skipped'|null
 */
import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { dbGetOrderById } from "@/lib/supabase/orders";
import { dbGetCustomerById } from "@/lib/supabase/customers";
import { dbGetProductById } from "@/lib/supabase/products";
import { dbCountRecentSyncLogsByStep } from "@/lib/supabase/sync-log";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const order = await dbGetOrderById(id);
        if (!order) return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });

        const contactDone = order.customer_id
            ? !!(await dbGetCustomerById(order.customer_id))?.parasut_contact_id
            : false;

        let productDone = order.lines.length > 0;
        for (const line of order.lines) {
            if (!line.product_id) continue;
            const product = await dbGetProductById(line.product_id);
            if (!product?.parasut_product_id) {
                productDone = false;
                break;
            }
        }

        // Faz 11.3 (M2 fix) — son 24h step başına sync log denemesi sayısı (audit)
        let attemptsLast24h: Record<string, number> = {};
        try {
            attemptsLast24h = await dbCountRecentSyncLogsByStep(id, 24);
        } catch (err) {
            console.error(JSON.stringify({ parasut_status_attempts_count_fail: String(err), orderId: id }));
        }

        return NextResponse.json({
            orderNumber:    order.order_number,
            parasutStep:    order.parasut_step,
            errorKind:      order.parasut_error_kind,
            error:          order.parasut_error,
            lastFailedStep: order.parasut_last_failed_step,
            retryCount:     order.parasut_retry_count,
            nextRetryAt:    order.parasut_next_retry_at,
            invoiceId:      order.parasut_invoice_id,
            invoiceNo:      order.parasut_invoice_no,
            invoiceType:    order.parasut_invoice_type,
            shipmentDocId:  order.parasut_shipment_document_id,
            attemptsLast24h,
            eDoc: {
                status: order.parasut_e_document_status,
                error:  order.parasut_e_document_error,
                id:     order.parasut_e_document_id,
            },
            badges: {
                contactDone,
                productDone,
                shipmentDone: !!order.parasut_shipment_document_id,
                invoiceDone:  !!order.parasut_invoice_id,
                edocStatus:   order.parasut_e_document_status,
            },
        });
    } catch (err) {
        return handleApiError(err, "GET /api/orders/[id]/parasut-status");
    }
}
