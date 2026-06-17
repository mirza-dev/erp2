import { NextRequest, NextResponse } from "next/server";
import { dbGetProductListCounts } from "@/lib/supabase/products";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/counts
// A1 (Stok & Ürünler sunucu tarafı sayfalama): başlık + kategori dropdown +
// kritik sayaçları sayfalamadan bağımsız (tüm-katalog) hesaplanır. Sinyal
// sayaçları (riskli/uyarılı/öneri) overlay uçlarından gelir, burada DEĞİL.
// Auth proxy/middleware seviyesinde — sayaçlar hassas (fiyat/maliyet) içermez.
export async function GET(_req: NextRequest) {
    try {
        const counts = await dbGetProductListCounts({ is_active: true });
        return NextResponse.json(counts);
    } catch (err) {
        return handleApiError(err, "GET /api/products/counts");
    }
}
