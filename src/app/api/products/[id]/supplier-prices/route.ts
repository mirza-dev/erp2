import { NextRequest, NextResponse } from "next/server";
import { dbListProductPriceHistory } from "@/lib/supabase/supplier-rfqs";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";
import { redactPriceHistoryForPerms } from "@/lib/auth/redact";

// GET /api/products/[id]/supplier-prices — ürünün tedarikçi fiyat geçmişi ("kimde ne kadar").
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "view_products");
        if (guard) return guard;

        const { id } = await params;
        const history = await dbListProductPriceHistory(id);
        return NextResponse.json(redactPriceHistoryForPerms(history, ctx.perms));
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/supplier-prices");
    }
}
