import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { dbCountOrdersByCommercialStatus } from "@/lib/supabase/orders";
import { dbCountActiveAlerts } from "@/lib/supabase/alerts";
import { dbListAllActiveProducts, dbGetQuotedQuantities } from "@/lib/supabase/products";
import { isReorderCandidateRow } from "@/lib/stock-utils";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/counters — Sidebar rozet sayaçları (perf Faz 2).
 *
 * Eskiden Sidebar bu 3 sayıyı global DataProvider'ın indirdiği TAM listelerden
 * (orders?all=1 ~3.5MB + products?all=1 ~5MB + alerts) türetiyordu. Artık
 * yalnız 3 sayı döner (~100 byte).
 *
 * Guard'sız (emsal: GET /api/alerts) — proxy session + demo-GET aynen geçerli;
 * sayaçlar tutar/fiyat sızdırmaz, adetler zaten her role görünüyordu.
 *
 *  - pendingOrders: commercial_status='pending_approval' head+count
 *  - activeAlerts:  status IN (open, acknowledged) head+count (data-context tanımı)
 *  - reorderCount:  isReorderCandidateRow (copilot ile TEK kaynak) — products
 *    tag'li 60sn cache (order/production/quote mutasyonları revalidateTag("products")
 *    attığı için tazelik garantili; head+count'a göre pahalı tek sayaç bu).
 */
const getCachedReorderCount = unstable_cache(
    async () => {
        const [products, quotedMap] = await Promise.all([
            dbListAllActiveProducts(),
            dbGetQuotedQuantities(),
        ]);
        return products.filter(p => isReorderCandidateRow(p, quotedMap.get(p.id) ?? 0)).length;
    },
    ["dashboard-reorder-count"],
    { tags: ["products"], revalidate: 60 },
);

export async function GET() {
    try {
        const [pendingOrders, activeAlerts, reorderCount] = await Promise.all([
            dbCountOrdersByCommercialStatus("pending_approval"),
            dbCountActiveAlerts(),
            getCachedReorderCount(),
        ]);
        return NextResponse.json({ pendingOrders, reorderCount, activeAlerts });
    } catch (err) {
        return handleApiError(err, "GET /api/dashboard/counters");
    }
}
