import { NextRequest, NextResponse } from "next/server";
import { dbListProducts } from "@/lib/supabase/products";
import {
    dbGetLastSaleDates,
    dbGetLastIncomingDates,
    dbGetLastProductionDates,
    pickMax,
    computeAgingCategoryFinished,
} from "@/lib/supabase/aging";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/aging?type=manufactured|commercial|all
// Aktif ürünler arasında on_hand > 0 olanlar için eskime raporu döner.
// type=manufactured  → sadece mamul (firma üretimi)
// type=commercial    → sadece ticari mal (alınıp satılan)
// type=all (default) → tümü
export async function GET(req: NextRequest) {
    try {
        const type = req.nextUrl.searchParams.get("type") ?? "all";

        // DB-level filter: sadece on_hand > 0 olan aktif ürünler (idx_products_active_onhand)
        const products = await dbListProducts({ is_active: true, on_hand_gt: 0, pageSize: 10_000 });
        const productIds = products.map(p => p.id);

        // Aging sorguları sadece bu ürün kümesine sınırlı (idx_order_lines_product_id vb.)
        const [lastSaleDates, lastIncomingDates, lastProductionDates] = await Promise.all([
            dbGetLastSaleDates(productIds),
            dbGetLastIncomingDates(productIds),
            dbGetLastProductionDates(productIds),
        ]);

        const now = Date.now();
        const result = products
            .filter(p => {
                if (type === "manufactured")  return p.product_type === "manufactured";
                if (type === "commercial")    return p.product_type === "commercial";
                return true; // "all"
            })
            .map(p => {
                const saleDate       = lastSaleDates.get(p.id)       ?? null;
                const incomingDate   = lastIncomingDates.get(p.id)   ?? null;
                const productionDate = lastProductionDates.get(p.id) ?? null;

                // Tip-bazlı "son hareket" semantiği:
                // Mamul      → son üretim tarihi (production_entries) VEYA son satış
                // Ticari mal → son tedarik VEYA son satış (üretim yok)
                const lastMovement: string | null = p.product_type === "manufactured"
                    ? pickMax(productionDate, saleDate)
                    : pickMax(incomingDate, saleDate);

                const daysWaiting = lastMovement
                    ? Math.floor((now - new Date(lastMovement).getTime()) / 86_400_000)
                    : null;

                const agingCategory = computeAgingCategoryFinished(daysWaiting);

                return {
                    productId:          p.id,
                    productName:        p.name,
                    sku:                p.sku,
                    category:           p.category,
                    unit:               p.unit,
                    onHand:             p.on_hand,
                    price:              p.price ?? 0,
                    currency:           p.currency,
                    productType:        p.product_type as "manufactured" | "commercial",
                    lastMovementDate:   lastMovement,
                    lastSaleDate:       saleDate,
                    lastIncomingDate:   incomingDate,
                    lastProductionDate: productionDate,
                    daysWaiting,
                    agingCategory,
                    costPrice:          p.cost_price ?? null,
                    boundCapital:       p.on_hand * (p.cost_price ?? p.price ?? 0),
                };
            });

        // Varsayılan sort: daysWaiting DESC (en uzun bekleyen üstte, null en sona)
        result.sort((a, b) => {
            if (a.daysWaiting === null && b.daysWaiting === null) return 0;
            if (a.daysWaiting === null) return 1;
            if (b.daysWaiting === null) return -1;
            return b.daysWaiting - a.daysWaiting;
        });

        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "GET /api/products/aging");
    }
}
