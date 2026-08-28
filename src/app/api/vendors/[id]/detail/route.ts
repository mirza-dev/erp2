import { NextRequest, NextResponse } from "next/server";
import { dbGetVendorById } from "@/lib/supabase/vendors";
import { dbListVendorLinks } from "@/lib/supabase/product-vendor-links";
import { dbListPurchaseOrders } from "@/lib/supabase/purchase-orders";
import { dbGetProductRefsByIds } from "@/lib/supabase/products";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";
import { redactVendorLinksForPerms, redactPurchaseOrdersForPerms } from "@/lib/auth/redact";
import { summarizeVendorPurchases, sortVendorProducts, type VendorSuppliedProduct } from "@/lib/vendor-detail";

/**
 * GET /api/vendors/[id]/detail
 *
 * A3 (2026-08-24): Tedarikçi detay paneli için tek çağrı — tedarik ettiği
 * ürünler (son bilinen fiyatlarıyla) + satın alma özeti. Bu veri tabloda
 * ZATEN vardı ama hiçbir ekranda gösterilmiyordu; "bu vanayı kimden, kaça
 * alıyoruz?" sorusunun sorulacağı yer yoktu.
 *
 * Fiyatlar `view_purchase_costs` ile redakte edilir — panel yetkisiz kullanıcıda
 * ürün listesini gösterir, tutarları göstermez.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "view_vendors");
        if (guard) return guard;

        const { id } = await params;
        const vendor = await dbGetVendorById(id);
        if (!vendor) return NextResponse.json({ error: "Tedarikçi bulunamadı." }, { status: 404 });

        const [links, purchaseOrders] = await Promise.all([
            dbListVendorLinks({ vendorId: id }),
            dbListPurchaseOrders({ vendor_id: id }),
        ]);

        // Ürün adları ayrı çekilir — link satırı yalnız product_id taşır.
        const products = await dbGetProductRefsByIds(links.map(l => l.product_id));
        const byId = new Map(products.map(p => [p.id, p]));

        const safeLinks = redactVendorLinksForPerms(links, ctx.perms);
        const supplied: VendorSuppliedProduct[] = safeLinks.flatMap(link => {
            const p = byId.get(link.product_id);
            // Ürün silinmiş/erişilemezse link'i sessizce atla (yetim satır).
            if (!p) return [];
            return [{
                productId: link.product_id,
                sku: p.sku,
                name: p.name,
                unit: p.unit,
                vendorSku: link.vendor_sku,
                leadTimeDays: link.lead_time_days,
                moq: link.moq,
                isPreferred: link.is_preferred,
                lastUnitPrice: link.last_unit_price,
                lastPriceCurrency: link.last_price_currency,
                lastPriceAt: link.last_price_at,
            }];
        });

        return NextResponse.json({
            products: sortVendorProducts(supplied),
            purchases: summarizeVendorPurchases(
                redactPurchaseOrdersForPerms(purchaseOrders, ctx.perms) as typeof purchaseOrders,
            ),
        });
    } catch (err) {
        return handleApiError(err, "GET /api/vendors/[id]/detail");
    }
}
