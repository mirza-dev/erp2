import { NextRequest, NextResponse } from "next/server";
import { dbGetActiveRecommendationsForEntities } from "@/lib/supabase/recommendations";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";

/**
 * GET /api/products/[id]/recommendation
 *
 * Bu ürün için aktif satın alma önerisi var mı — Uyarılar drawer'ındaki çapraz
 * link için.
 *
 * 2026-08-24: Aynı ürün hakkında "Öneriler" ve "Uyarılar" sayfaları birbirinden
 * habersiz kayıt üretiyordu (canlıda tek üründe 10 öneri + 40 uyarı). Kullanıcı
 * iki ekranda iki ayrı gerçek görüyordu. Bu uç ikisini birbirine bağlar.
 *
 * Yalnız VARLIK + kimlik döner; tutar/miktar taşımaz → ek redaction gerekmez.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, ["view_purchase_suggestions", "view_products"]);
        if (guard) return guard;
        void req;

        const { id } = await params;
        const [rec] = await dbGetActiveRecommendationsForEntities("product", [id], "purchase_suggestion");
        if (!rec) return NextResponse.json({ recommendation: null });

        return NextResponse.json({
            recommendation: {
                id: rec.id,
                status: rec.status,
                severity: rec.severity,
                title: rec.title,
            },
        });
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/recommendation");
    }
}
