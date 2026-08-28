import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { serviceReconcileParasutStock } from "@/lib/services/parasut-stock-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/parasut/reconcile-stock — CRON.
// ERP `products.on_hand` ile Paraşüt `inventory_levels` karşılaştırılır.
// VARSAYILAN: yalnız rapor + uyarı. Yazma yalnız PARASUT_STOCK_AUTOCORRECT=true
// iken yapılır (mutlak `stock_updates`).
export async function POST(req?: NextRequest) {
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
    }

    try {
        const result = await serviceReconcileParasutStock();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/reconcile-stock");
    }
}
