import { NextRequest, NextResponse } from "next/server";
import { dbListProducts } from "@/lib/supabase/products";
import {
    dbGetLastSaleDates,
    dbGetLastIncomingDates,
    dbGetLastProductionDates,
    dbGetLastComponentUsageDates,
    pickMax,
    computeAgingCategoryRaw,
    computeAgingCategoryFinished,
} from "@/lib/supabase/aging";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/aging?type=raw_material|manufactured|commercial|all
// Aktif ürünler arasında on_hand > 0 olanlar için eskime raporu döner.
// type=raw_material  → sadece hammaddeler
// type=manufactured  → sadece mamul (firma üretimi)
// type=commercial    → sadece ticari mal (alınıp satılan)
// type=all (default) → tümü
export async function GET(req: NextRequest) {
    try {
        const type = req.nextUrl.searchParams.get("type") ?? "all";

        const [products, lastSaleDates, lastIncomingDates, lastProductionDates, lastComponentUsageDates] = await Promise.all([
            dbListProducts({ is_active: true, pageSize: 10_000 }),
            dbGetLastSaleDates(),
            dbGetLastIncomingDates(),
            dbGetLastProductionDates(),
            dbGetLastComponentUsageDates(),
        ]);

        const now = Date.now();
        const result = products
            .filter(p => p.on_hand > 0)
            .filter(p => {
                if (type === "raw_material")  return p.product_type === "raw_material";
                if (type === "manufactured")  return p.product_type === "manufactured";
                if (type === "commercial")    return p.product_type === "commercial";
                return true; // "all"
            })
            .map(p => {
                const saleDate            = lastSaleDates.get(p.id)            ?? null;
                const incomingDate        = lastIncomingDates.get(p.id)        ?? null;
                const productionDate      = lastProductionDates.get(p.id)      ?? null;
                const componentUsageDate  = lastComponentUsageDates.get(p.id)  ?? null;

                // Tip-bazlı "son hareket" semantiği:
                // Hammadde   → son tedarik alımı VEYA üretimde son tüketim (inventory_movements, quantity<0)
                // Mamul      → son üretim tarihi (production_entries) VEYA son satış
                // Ticari mal → son tedarik VEYA son satış (üretim yok)
                let lastMovement: string | null;
                if (p.product_type === "raw_material") {
                    lastMovement = pickMax(incomingDate, componentUsageDate);
                } else if (p.product_type === "manufactured") {
                    lastMovement = pickMax(productionDate, saleDate);
                } else {
                    lastMovement = pickMax(incomingDate, saleDate);
                }

                const daysWaiting = lastMovement
                    ? Math.floor((now - new Date(lastMovement).getTime()) / 86_400_000)
                    : null;

                const agingCategory = p.product_type === "raw_material"
                    ? computeAgingCategoryRaw(daysWaiting)
                    : computeAgingCategoryFinished(daysWaiting);

                return {
                    productId:          p.id,
                    productName:        p.name,
                    sku:                p.sku,
                    category:           p.category,
                    unit:               p.unit,
                    onHand:             p.on_hand,
                    price:              p.price ?? 0,
                    currency:           p.currency,
                    productType:        p.product_type as "raw_material" | "manufactured" | "commercial",
                    isForSales:         p.is_for_sales ?? true,
                    isForPurchase:      p.is_for_purchase ?? true,
                    lastMovementDate:        lastMovement,
                    lastSaleDate:            saleDate,
                    lastIncomingDate:        incomingDate,
                    lastProductionDate:      productionDate,
                    lastComponentUsageDate:  componentUsageDate,
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
