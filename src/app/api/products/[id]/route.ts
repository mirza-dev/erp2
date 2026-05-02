import { NextRequest, NextResponse } from "next/server";
import {
    dbGetProductById,
    dbUpdateProduct,
    dbDeleteProduct,
    type CreateProductInput,
} from "@/lib/supabase/products";
import { dbBatchResolveAlerts } from "@/lib/supabase/alerts";
import { dbExpireEntityRecommendations } from "@/lib/supabase/recommendations";
import type { AlertType } from "@/lib/database.types";
import { handleApiError, safeParseJson } from "@/lib/api-error";
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
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const product = await dbGetProductById(id);
        if (!product) {
            return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
        }
        return NextResponse.json(product);
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
        return NextResponse.json(product);
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
