import { NextRequest, NextResponse } from "next/server";
import { dbListVendorLinks } from "@/lib/supabase/product-vendor-links";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";
import { redactVendorLinksForPerms } from "@/lib/auth/redact";

// GET /api/product-vendor-links?vendor_id=<uuid>   (PO formu: tedarikçi son fiyatları)
//   veya ?product_ids=a,b,c                          (RFQ formu: ürünleri tedarik edenler)
// last_unit_price view_purchase_costs ile redakte.
export async function GET(req: NextRequest) {
    try {
        const ctx = await resolveAuthContext();
        // Satın alma yüzeyleri: ürün VEYA tedarikçi görme yetkisi yeterli.
        const guard = requirePermissionFor(ctx, ["view_products", "view_vendors"]);
        if (guard) return guard;

        const { searchParams } = new URL(req.url);
        const vendorId = searchParams.get("vendor_id") ?? undefined;
        const productIdsRaw = searchParams.get("product_ids");
        const productIds = productIdsRaw ? productIdsRaw.split(",").map(s => s.trim()).filter(Boolean) : undefined;

        if (!vendorId && (!productIds || productIds.length === 0)) {
            return NextResponse.json([]);
        }

        const links = await dbListVendorLinks({ vendorId, productIds });
        return NextResponse.json(redactVendorLinksForPerms(links, ctx.perms));
    } catch (err) {
        return handleApiError(err, "GET /api/product-vendor-links");
    }
}
