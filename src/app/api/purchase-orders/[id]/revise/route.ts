import { NextRequest, NextResponse } from "next/server";
import { dbGetPurchaseOrderById } from "@/lib/supabase/purchase-orders";
import { serviceRevisePO } from "@/lib/services/purchase-order-service";
import { handleApiError } from "@/lib/api-error";
import { requirePermission, getCurrentUserId } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

// POST /api/purchase-orders/[id]/revise — sent → draft (M1)
// sent_at otomatik NULL'a set edilir (dbTransitionPurchaseOrder içinde).
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "manage_purchase_orders");
        if (guard) return guard;

        const { id } = await params;

        const existing = await dbGetPurchaseOrderById(id);
        if (!existing) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });

        // O1: actor sunucu-otoriter (oturum kullanıcısı) — istemci gövdesi DEĞİL.
        const actor = (await getCurrentUserId()) ?? undefined;

        const result = await serviceRevisePO(id, actor);
        revalidateTag("purchase-orders", "max");
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("Geçersiz durum geçişi") ||
            err.message.includes("yarış")
        )) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "POST /api/purchase-orders/[id]/revise");
    }
}
