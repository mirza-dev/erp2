import { NextRequest, NextResponse } from "next/server";
import {
    dbGetQuotedBreakdownByProduct,
    dbLookupUserEmails,
} from "@/lib/supabase/products";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/[id]/quotes
// Returns the breakdown of active quotes (draft + pending_approval) for a product.
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        // RBAC: view_products guard (kardeş shortages/supplier-prices kalıbı).
        // Guard'sız bırakılınca aktif teklif kırılımı (müşteri + miktar +
        // createdByEmail satışçı e-postası) view_products'sız accounting'e ve
        // proxy-fail-open/anon'a sızıyordu. Tek auth çağrısı → ctx.perms redaction'a.
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "view_products");
        if (guard) return guard;

        const { id } = await params;
        const rows = await dbGetQuotedBreakdownByProduct(id);

        const uuids = rows
            .map(r => r.createdBy)
            .filter((x): x is string => !!x);
        const emailMap = await dbLookupUserEmails(uuids);

        // RBAC R3: sales-financial — view_sales_prices yoksa unitPrice VE lineTotal
        // null (ürün detayı "tekliflerde" widget'ı sales fiyatı içerir; per-request).
        // lineTotal ham bırakılırsa lineTotal/quantity ile birim fiyat türetilebilir.
        const canViewSalesPrices = ctx.perms.has("view_sales_prices");

        const items = rows.map(r => ({
            ...r,
            unitPrice: canViewSalesPrices ? r.unitPrice : null,
            lineTotal: canViewSalesPrices ? r.lineTotal : null,
            createdByEmail: r.createdBy ? emailMap.get(r.createdBy) ?? null : null,
        }));

        return NextResponse.json({
            items,
            totalQuoted: rows.reduce((sum, r) => sum + r.quantity, 0),
        });
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/quotes");
    }
}
