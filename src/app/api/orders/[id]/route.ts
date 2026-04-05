import { NextRequest, NextResponse } from "next/server";
import {
    serviceGetOrder,
    serviceTransitionOrder,
    type OrderTransition,
} from "@/lib/services/order-service";
import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";
import { handleApiError } from "@/lib/api-error";
import { dbGetOrderById, dbHardDeleteOrder } from "@/lib/supabase/orders";

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
        return NextResponse.json(order);
    } catch (err) {
        return handleApiError(err, "GET /api/orders/[id]");
    }
}

// PATCH /api/orders/[id]
// Body: { transition: "pending_approval" | "approved" | "shipped" | "cancelled" }
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const transition: OrderTransition = body.transition;

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
        const response: Record<string, unknown> = { ...updated };
        if (result.shortages && result.shortages.length > 0) {
            response.shortages = result.shortages;
        }
        return NextResponse.json(response);
    } catch (err) {
        return handleApiError(err, "PATCH /api/orders/[id]");
    }
}

// DELETE /api/orders/[id] — soft cancel (default) or hard delete (?permanent=1)
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const permanent = req.nextUrl.searchParams.get("permanent") === "1";

    if (!permanent) {
        try {
            const result = await serviceTransitionOrder(id, "cancelled");
            if (!result.success) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }
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
        await dbHardDeleteOrder(id);
        return NextResponse.json({ success: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/orders/[id]?permanent=1");
    }
}
