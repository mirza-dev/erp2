import { NextRequest, NextResponse } from "next/server";
import {
    serviceGetOrder,
    serviceTransitionOrder,
    type OrderTransition,
} from "@/lib/services/order-service";

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
        console.error("[GET /api/orders/[id]]", err);
        return NextResponse.json({ error: "Sipariş alınamadı." }, { status: 500 });
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
            if (result.conflicts && result.conflicts.length > 0) {
                return NextResponse.json(
                    { error: "Stok yetersiz.", conflicts: result.conflicts },
                    { status: 409 }
                );
            }
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // Return updated order
        const updated = await serviceGetOrder(id);
        return NextResponse.json(updated);
    } catch (err) {
        console.error("[PATCH /api/orders/[id]]", err);
        return NextResponse.json({ error: "Durum güncellenemedi." }, { status: 500 });
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
        console.error("[DELETE /api/orders/[id]]", err);
        return NextResponse.json({ error: "Sipariş iptal edilemedi." }, { status: 500 });
    }
}
