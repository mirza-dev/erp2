import { NextResponse } from "next/server";
import { dbListProducts } from "@/lib/supabase/products";
import { dbGetLastSaleDates, dbGetLastIncomingDates, pickMax, computeAgingCategory } from "@/lib/supabase/aging";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/aging
// Aktif ürünler arasında on_hand > 0 olanlar için eskime raporu döner.
export async function GET() {
    try {
        const [products, lastSaleDates, lastIncomingDates] = await Promise.all([
            dbListProducts({ is_active: true, pageSize: 10_000 }),
            dbGetLastSaleDates(),
            dbGetLastIncomingDates(),
        ]);

        const now = Date.now();
        const result = products
            .filter(p => p.on_hand > 0)
            .map(p => {
                const saleDate     = lastSaleDates.get(p.id)     ?? null;
                const incomingDate = lastIncomingDates.get(p.id) ?? null;
                const lastMovement = pickMax(saleDate, incomingDate);
                const daysWaiting  = lastMovement
                    ? Math.floor((now - new Date(lastMovement).getTime()) / 86_400_000)
                    : null;
                return {
                    productId:        p.id,
                    productName:      p.name,
                    sku:              p.sku,
                    category:         p.category,
                    unit:             p.unit,
                    onHand:           p.on_hand,
                    price:            p.price ?? 0,
                    currency:         p.currency,
                    lastMovementDate: lastMovement,
                    daysWaiting,
                    agingCategory:    computeAgingCategory(daysWaiting),
                    boundCapital:     p.on_hand * (p.price ?? 0),
                };
            });

        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "GET /api/products/aging");
    }
}
