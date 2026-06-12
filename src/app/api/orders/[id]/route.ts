import { NextRequest, NextResponse } from "next/server";
import {
    serviceGetOrder,
    serviceTransitionOrder,
    serviceUpdateQuoteDeadline,
    serviceUpdateOrderLines,
    type OrderTransition,
} from "@/lib/services/order-service";
import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";
import { notifyUsersByEmail } from "@/lib/services/email-service";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { dbGetOrderById, dbHardDeleteOrder, type UpdateOrderInput } from "@/lib/supabase/orders";
import { getCurrentUserPermissions, getCurrentUserId, requirePermission } from "@/lib/auth/role-guard";
import { redactOrderForPerms } from "@/lib/auth/redact";
import { revalidateTag } from "next/cache";

// GET /api/orders/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const order = await serviceGetOrder(id);
        if (!order) {
            return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
        }
        // RBAC R3: detail finansal alanlar + satır fiyatları view_sales_prices'a tabi.
        const perms = await getCurrentUserPermissions();
        return NextResponse.json(redactOrderForPerms(order, perms));
    } catch (err) {
        return handleApiError(err, "GET /api/orders/[id]");
    }
}

// PATCH /api/orders/[id]
// Body: { transition: "pending_approval" | "approved" | "shipped" | "cancelled" }
//    OR { quote_valid_until: "YYYY-MM-DD" | null }
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        // Quote deadline update — separate from state-machine transitions.
        // manage_sales_orders yeterli (sales teklif vadesini yönetir).
        if ("quote_valid_until" in body) {
            const guard = await requirePermission(req, "manage_sales_orders");
            if (guard) return guard;
            await serviceUpdateQuoteDeadline(id, (body.quote_valid_until as string | null) ?? null);
            return NextResponse.json({ ok: true });
        }

        const transition: OrderTransition = body.transition as OrderTransition;

        // RBAC F4 — per-transition guard, validation'dan ÖNCE (authz önce gelir):
        // sevk (shipped) ship_sales_orders ister (sales bu yetkiyi tutmaz → sevk
        // edemez); diğer/eksik geçiş manage_sales_orders'a düşer. Eksik transition →
        // viewer 403 (eski authz-önce davranışı korunur), yetkili kullanıcı 400 alır.
        // production ship_sales_orders tutar → detay "Sevket" butonu çalışır.
        const neededPerm = transition === "shipped" ? "ship_sales_orders" : "manage_sales_orders";
        const transitionGuard = await requirePermission(req, neededPerm);
        if (transitionGuard) return transitionGuard;

        if (!transition) {
            return NextResponse.json({ error: "'transition' alanı zorunludur." }, { status: 400 });
        }

        const result = await serviceTransitionOrder(id, transition);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // Await Parasut sync so the subsequent serviceGetOrder returns up-to-date parasut fields
        if (transition === "shipped" && result.success) {
            await serviceSyncOrderToParasut(id).catch(err =>
                console.error("[Parasut sync]:", err)
            );
        }

        // Return updated order with shortage info if partial allocation occurred
        const updated = await serviceGetOrder(id);

        // Fire-and-forget order_shipped e-posta bildirimi — updated kullanılarak
        // ekstra DB call'a gerek kalmıyor; parasut sync'den sonraki güncel state
        if (transition === "shipped" && result.success && updated) {
            notifyUsersByEmail({
                notificationType: "order_shipped",
                entityType: "sales_order",
                entityId: id,
                render: { type: "order_shipped", ctx: {
                    orderId: id,
                    orderNumber: updated.order_number,
                    customerName: updated.customer_name,
                } },
            }).catch(err => console.error("[email order_shipped]", err));
        }
        revalidateTag("products", "max");
        // RBAC R3/F3b: production (ship_sales_orders var, view_sales_prices yok)
        // PATCH ship response'unda satış finansallarını GÖRMESİN (per-request).
        const perms = await getCurrentUserPermissions(req);
        const response: Record<string, unknown> = updated ? { ...redactOrderForPerms(updated, perms) } : {};
        if (result.shortages && result.shortages.length > 0) {
            response.shortages = result.shortages;
        }
        return NextResponse.json(response);
    } catch (err) {
        return handleApiError(err, "PATCH /api/orders/[id]");
    }
}

// PUT /api/orders/[id] — taslak sipariş içeriğini düzenle (müşteri/kalem/not/
// teklif vadesi). Yalnızca draft (service + RPC guard). Totaller RPC'de
// line_total'lerden yeniden hesaplanır.
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const guard = await requirePermission(req, "manage_sales_orders");
        if (guard) return guard;

        const { id } = await params;
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as UpdateOrderInput;

        const lengthErr = validateStringLengths(body as unknown as Record<string, unknown>);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        const actor = await getCurrentUserId();
        try {
            await serviceUpdateOrderLines(id, body, actor);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Sipariş güncellenemedi.";
            // Eşleme: bulunamadı → 404, taslak değil → 409, diğer (validation) → 400
            const status = msg.includes("bulunamadı") ? 404
                : msg.includes("taslak") ? 409
                : 400;
            return NextResponse.json({ error: msg }, { status });
        }

        revalidateTag("products", "max");
        const updated = await serviceGetOrder(id);
        const perms = await getCurrentUserPermissions(req);
        return NextResponse.json(updated ? redactOrderForPerms(updated, perms) : { ok: true });
    } catch (err) {
        return handleApiError(err, "PUT /api/orders/[id]");
    }
}

// DELETE /api/orders/[id] — soft cancel (default) or hard delete (?permanent=1)
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requirePermission(req, "delete_sales_orders");
    if (guard) return guard;

    const { id } = await params;
    const permanent = req.nextUrl.searchParams.get("permanent") === "1";

    if (!permanent) {
        try {
            const result = await serviceTransitionOrder(id, "cancelled");
            if (!result.success) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }
            revalidateTag("products", "max");
            return NextResponse.json({ ok: true });
        } catch (err) {
            return handleApiError(err, "DELETE /api/orders/[id]");
        }
    }

    // Hard delete — only draft or cancelled
    try {
        const order = await dbGetOrderById(id);
        if (!order) {
            return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
        }
        if (!["draft", "cancelled"].includes(order.commercial_status)) {
            return NextResponse.json(
                { error: "Yalnızca taslak veya iptal edilmiş siparişler kalıcı silinebilir." },
                { status: 409 }
            );
        }
        const actor = await getCurrentUserId();
        await dbHardDeleteOrder(id, actor);
        revalidateTag("products", "max");
        return NextResponse.json({ success: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/orders/[id]?permanent=1");
    }
}
