import { NextRequest, NextResponse } from "next/server";
import {
    serviceGetOrder,
    serviceTransitionOrder,
    type OrderTransition,
} from "@/lib/services/order-service";
import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";
import { handleApiError } from "@/lib/api-error";

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

        // Fire-and-forget Parasut sync when order is shipped
        if (transition === "shipped" && result.success) {
            serviceSyncOrderToParasut(id).catch(err =>
                console.error("[Parasut sync] fire-and-forget:", err)
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

// DELETE /api/orders/[id] — cancels the order
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const result = await serviceTransitionOrder(id, "cancelled");

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/orders/[id]");
    }
}
