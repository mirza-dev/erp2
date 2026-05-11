import { NextRequest, NextResponse } from "next/server";
import { dbGetPurchaseOrderById } from "@/lib/supabase/purchase-orders";
import { serviceConfirmPO } from "@/lib/services/purchase-order-service";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

// POST /api/purchase-orders/[id]/confirm — draft|sent → confirmed (B4 guards in RPC)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;

        const existing = await dbGetPurchaseOrderById(id);
        if (!existing) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });

        const parsed = await safeParseJson(req);
        const actor = parsed.ok ? ((parsed.data as Record<string, unknown>).actor as string | undefined) : undefined;

        const result = await serviceConfirmPO(id, actor);
        revalidateTag("purchase-orders", "max");
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("Geçersiz durum geçişi") ||
            err.message.includes("expected_date zorunludur") ||
            err.message.includes("en az 1 line") ||
            err.message.includes("vendor pasif")
        )) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "POST /api/purchase-orders/[id]/confirm");
    }
}
