import { NextRequest, NextResponse } from "next/server";
import { dbGetPurchaseOrderById } from "@/lib/supabase/purchase-orders";
import { serviceCancelPO } from "@/lib/services/purchase-order-service";
import { requireRole } from "@/lib/auth/role-guard";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

// POST /api/purchase-orders/[id]/cancel — admin only (B7)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requireRole(req, ["admin"]);
        if (guard) return guard;

        const { id } = await params;

        const existing = await dbGetPurchaseOrderById(id);
        if (!existing) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });

        if (existing.status === "received" || existing.status === "cancelled") {
            return NextResponse.json(
                { error: `PO iptal edilemez (status=${existing.status}).` },
                { status: 409 },
            );
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const reason = String(body.reason ?? "").trim();
        if (!reason) {
            return NextResponse.json({ error: "İptal gerekçesi zorunludur." }, { status: 400 });
        }

        const actor = (body.actor as string | undefined) ?? "system";
        const result = await serviceCancelPO(id, reason, actor);
        revalidateTag("purchase-orders", "max");
        revalidateTag("products", "max");  // pending commitment cancel → incoming etkilenir
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof Error && err.message.includes("iptal edilemez")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "POST /api/purchase-orders/[id]/cancel");
    }
}
