import { NextRequest, NextResponse } from "next/server";
import {
    dbGetProductById,
    dbUpdateProduct,
    dbDeleteProduct,
    dbGetQuotedQuantities,
    type CreateProductInput,
} from "@/lib/supabase/products";
import { dbGetIncomingQuantities } from "@/lib/supabase/purchase-commitments";
import { dbBatchResolveAlerts } from "@/lib/supabase/alerts";
import { dbExpireEntityRecommendations } from "@/lib/supabase/recommendations";
import type { AlertType } from "@/lib/database.types";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { getCurrentUserPermissions, requirePermission } from "@/lib/auth/role-guard";
import { redactProductsForPerms } from "@/lib/auth/redact";
import { revalidateTag } from "next/cache";

const PRODUCT_ALERT_TYPES: AlertType[] = [
    "stock_critical", "stock_risk", "order_deadline", "order_shortage", "purchase_recommended",
];

async function resolveProductAlerts(productId: string, reason: string): Promise<void> {
    await dbBatchResolveAlerts(
        PRODUCT_ALERT_TYPES.map(type => ({ type, entityId: productId, reason }))
    ).catch(() => { /* best-effort — alert cleanup must not block product response */ });
}

// GET /api/products/[id]
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const product = await dbGetProductById(id);
        if (!product) {
            return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
        }
        const [quotedMap, incomingMap] = await Promise.all([
            dbGetQuotedQuantities(),
            dbGetIncomingQuantities(),
        ]);
        const quoted   = quotedMap.get(id)   ?? 0;
        const incoming = incomingMap.get(id) ?? 0;
        const enriched = {
            ...product,
            quoted,
            incoming,
            promisable: product.available_now - quoted,
            forecasted: product.available_now + incoming - quoted,
        };
        // RBAC R3: price (view_sales_prices) + cost_price (view_purchase_costs)
        // per-request redaksiyon — liste route'undaki pattern (cache DIŞINDA).
        const perms = await getCurrentUserPermissions(req);
        return NextResponse.json(redactProductsForPerms([enriched], perms)[0]);
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]");
    }
}

// PATCH /api/products/[id] — update fields
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const guard = await requirePermission(req, "manage_product_master");
        if (guard) return guard;

        const { id } = await params;
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Partial<CreateProductInput> & { is_active?: boolean };
        const product = await dbUpdateProduct(id, body);
        revalidateTag("products", "max");
        // Ürün deaktif edildiyse ilgili aktif uyarıları ve önerileri kapat
        if (body.is_active === false) {
            await resolveProductAlerts(id, "product_deactivated");
            await dbExpireEntityRecommendations(id, "product").catch(() => {});
        }
        // RBAC R3: PATCH yapan purchasing/sales kendi yetkisi dışındaki fiyatı
        // response'ta görmesin (per-request, cache'siz).
        const perms = await getCurrentUserPermissions(req);
        return NextResponse.json(redactProductsForPerms([product], perms)[0]);
    } catch (err) {
        return handleApiError(err, "PATCH /api/products/[id]");
    }
}

// DELETE /api/products/[id] — soft delete (is_active = false)
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const guard = await requirePermission(_req, "manage_product_master");
        if (guard) return guard;

        const { id } = await params;
        await dbDeleteProduct(id);
        // Silinen ürünün aktif uyarılarını ve önerilerini hemen kapat
        await resolveProductAlerts(id, "product_deleted");
        await dbExpireEntityRecommendations(id, "product").catch(() => {});
        revalidateTag("products", "max");
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/products/[id]");
    }
}
