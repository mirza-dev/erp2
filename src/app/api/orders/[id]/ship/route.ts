import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
    serviceTransitionOrder,
    serviceGetOrder,
    type ShipMeta,
} from "@/lib/services/order-service";
import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";
import { notifyUsersByEmail } from "@/lib/services/email-service";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { dbBatchResolveAlerts } from "@/lib/supabase/alerts";
import { getCurrentUserPermissions, requirePermission } from "@/lib/auth/role-guard";
import { redactOrderForPerms } from "@/lib/auth/redact";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FIELD_LEN = 100;

// POST /api/orders/[id]/ship
// Body: { shipDate: "YYYY-MM-DD", trackingNumber?: string, carrier?: string }
// Auth: session (middleware); demo: middleware 403 on mutasyon
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "ship_sales_orders");
        if (guard) return guard;

        const { id } = await params;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        // Validation
        if (typeof body.shipDate !== "string" || !ISO_DATE_RE.test(body.shipDate))
            return NextResponse.json(
                { error: "shipDate zorunludur ve YYYY-MM-DD formatında olmalıdır." },
                { status: 400 },
            );

        // Strict calendar check — rejects 2026-02-31 (normalizes) and 2026-99-99 (NaN).
        // Must run before serviceTransitionOrder; dbShipOrderFull commits atomically.
        const _parsedShipDate = new Date(`${body.shipDate}T12:00:00Z`);
        if (isNaN(_parsedShipDate.getTime()) || _parsedShipDate.toISOString().slice(0, 10) !== body.shipDate)
            return NextResponse.json(
                { error: "shipDate geçersiz takvim tarihi (ör. 2026-02-31 kabul edilmez)." },
                { status: 400 },
            );

        if (
            body.trackingNumber !== undefined &&
            body.trackingNumber !== null &&
            (typeof body.trackingNumber !== "string" || body.trackingNumber.length > MAX_FIELD_LEN)
        )
            return NextResponse.json(
                { error: `trackingNumber maksimum ${MAX_FIELD_LEN} karakter olabilir.` },
                { status: 400 },
            );

        if (
            body.carrier !== undefined &&
            body.carrier !== null &&
            (typeof body.carrier !== "string" || body.carrier.length > MAX_FIELD_LEN)
        )
            return NextResponse.json(
                { error: `carrier maksimum ${MAX_FIELD_LEN} karakter olabilir.` },
                { status: 400 },
            );

        const shipMeta: ShipMeta = {
            shipDate:      body.shipDate,
            trackingNumber: typeof body.trackingNumber === "string" ? body.trackingNumber || null : null,
            carrier:        typeof body.carrier === "string" ? body.carrier || null : null,
        };

        const result = await serviceTransitionOrder(id, "shipped", shipMeta);

        if (!result.success) {
            const status = result.error?.includes("bulunamadı") ? 404 : 400;
            return NextResponse.json({ error: result.error }, { status });
        }

        // Resolve overdue_shipment alert — awaited so 200 only returns after resolve completes.
        // Failure is non-fatal (ship committed); CRON check-shipments is the safety-net cleanup.
        await dbBatchResolveAlerts([{ type: "overdue_shipment", entityId: id, reason: "order_shipped" }])
            .catch(err => console.error("[alert resolve ship]:", err));

        // Paraşüt sync — await like PATCH endpoint (subsequent read returns up-to-date state)
        await serviceSyncOrderToParasut(id).catch(err =>
            console.error("[Parasut sync ship]:", err),
        );

        const updated = await serviceGetOrder(id);

        // Fire-and-forget email
        if (updated) {
            notifyUsersByEmail({
                notificationType: "order_shipped",
                entityType: "sales_order",
                entityId: id,
                render: { type: "order_shipped", ctx: {
                    orderNumber: updated.order_number,
                    customerName: updated.customer_name,
                } },
            }).catch(err => console.error("[email order_shipped ship]", err));
        }

        revalidateTag("products", "max");
        // RBAC R3/F3a: ship_sales_orders tutan production view_sales_prices tutmaz
        // → ship response'undaki satış finansalları redakte edilir (per-request).
        const perms = await getCurrentUserPermissions(req);
        return NextResponse.json(updated ? redactOrderForPerms(updated, perms) : { ok: true });
    } catch (err) {
        return handleApiError(err, "POST /api/orders/[id]/ship");
    }
}
