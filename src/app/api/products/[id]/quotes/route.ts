import { NextRequest, NextResponse } from "next/server";
import {
    dbGetQuotedBreakdownByProduct,
    dbLookupUserEmails,
} from "@/lib/supabase/products";
import { getCurrentUserPermissions } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/[id]/quotes
// Returns the breakdown of active quotes (draft + pending_approval) for a product.
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const rows = await dbGetQuotedBreakdownByProduct(id);

        const uuids = rows
            .map(r => r.createdBy)
            .filter((x): x is string => !!x);
        const emailMap = await dbLookupUserEmails(uuids);

        // RBAC R3: sales-financial — view_sales_prices yoksa unitPrice null
        // (ürün detayı "tekliflerde" widget'ı sales fiyatı içerir; per-request).
        const perms = await getCurrentUserPermissions(req);
        const canViewSalesPrices = perms.has("view_sales_prices");

        const items = rows.map(r => ({
            ...r,
            unitPrice: canViewSalesPrices ? r.unitPrice : null,
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
