import { NextResponse } from "next/server";
import { dbGetOpenOrderCountByProduct } from "@/lib/supabase/orders";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";

export async function GET() {
    // Denetim Y1 (2026-06): tüketici satınalma/önerilen sayfası — purchasing'de
    // view_sales_orders YOK, bu yüzden OR: view_purchase_suggestions VEYA
    // view_sales_orders. Demo-dostu: viewer fallback geçer (yalnız adet döner).
    const authCtx = await resolveAuthContext();
    const permGuard = requirePermissionFor(authCtx, ["view_purchase_suggestions", "view_sales_orders"]);
    if (permGuard) return permGuard;

    try {
        const map = await dbGetOpenOrderCountByProduct();
        return NextResponse.json(Object.fromEntries(map));
    } catch (err) {
        return handleApiError(err, "GET /api/orders/open-count-by-product");
    }
}
