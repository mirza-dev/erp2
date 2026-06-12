import { NextRequest, NextResponse } from "next/server";
import { dbGetOpenShortagesByProductId } from "@/lib/supabase/products";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";

// GET /api/products/[id]/shortages
// Returns open shortage detail rows (order_id/order_number/customer_name/qty)
// for a product. Used by the order_shortage alert drawer (Faz 10 §9.4.4).
// Auth: view_products şartı (Denetim Y1 2026-06) — tüketici uyarı drawer'ı;
// view_alerts'li her rolde view_products da var, UI davranışı değişmez.
// Demo-dostu: anonim→viewer fallback bilinçli (drawer demoda çalışır).
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authCtx = await resolveAuthContext();
    const permGuard = requirePermissionFor(authCtx, "view_products");
    if (permGuard) return permGuard;

    try {
        const { id } = await params;
        const rows = await dbGetOpenShortagesByProductId(id);

        return NextResponse.json({
            items: rows,
            totalShortage: rows.reduce((sum, r) => sum + r.shortageQty, 0),
        });
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/shortages");
    }
}
