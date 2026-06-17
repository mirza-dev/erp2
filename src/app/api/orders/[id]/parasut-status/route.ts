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
import { dbGetProductParasutIds } from "@/lib/supabase/products";
import { dbCountRecentSyncLogsByStep } from "@/lib/supabase/sync-log";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    // Denetim Y1 (2026-06): view_sales_orders şartı — tüketici sipariş detay
    // sayfası (sales/viewer dahil); view_parasut şartı o rolleri kırardı.
    // Demo-dostu: anonim→viewer fallback bilinçli (rozetler demoda çalışır).
    const authCtx = await resolveAuthContext();
    const permGuard = requirePermissionFor(authCtx, "view_sales_orders");
    if (permGuard) return permGuard;

    try {
        const { id } = await params;
        const order = await dbGetOrderById(id);
        if (!order) return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });

        const contactDone = order.customer_id
            ? !!(await dbGetCustomerById(order.customer_id))?.parasut_contact_id
            : false;

        // Batch: tüm satır ürünlerinin parasut_product_id'lerini tek sorguda al (N+1 yerine).
        // product_id'siz satırlar atlanır (eski davranış); kalanların hepsi link'li olmalı.
        let productDone = order.lines.length > 0;
        const lineProductIds = [...new Set(order.lines.map((l) => l.product_id).filter(Boolean) as string[])];
        if (productDone && lineProductIds.length > 0) {
            const parasutMap = await dbGetProductParasutIds(lineProductIds);
            productDone = order.lines.every((l) => !l.product_id || !!parasutMap.get(l.product_id));
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
