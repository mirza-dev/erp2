import { NextRequest, NextResponse } from "next/server";
import { dbGetProductTypeCoverage } from "@/lib/supabase/product-types";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

/**
 * GET /api/product-types/coverage — yalnız sayılar, satır taşımaz.
 *
 * Teknik Şablonlar sayfasının kör noktası içindir: `?withStats=1` her ŞABLONUN
 * kendi ürünlerini sayar, hiçbir şablona bağlı OLMAYAN ürünler ise hiçbir
 * metriğe girmez. Ayrı uç olmasının sebebi, `/api/product-types`'in dizi
 * sözleşmesini bozmamak (detay sayfası `rows.find(...)` ile okuyor) —
 * `dashboard/counters` ve `products/counts` ile aynı kalıp.
 *
 * Guard sayfayla birebir: teknik şablon ekranını görebilen görür.
 */
export async function GET(req: NextRequest) {
    const forbidden = await requirePermission(req, "view_product_types");
    if (forbidden) return forbidden;

    try {
        return NextResponse.json(await dbGetProductTypeCoverage());
    } catch (err) {
        return handleApiError(err, "GET /api/product-types/coverage");
    }
}
