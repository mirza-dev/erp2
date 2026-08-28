import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { serviceSyncAllPendingPurchaseBills } from "@/lib/services/parasut-purchase-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/parasut/sync-purchase-all — CRON emniyet ağı.
// Mal kabul anındaki best-effort tetik başarısız olduysa bekleyen PO'ları toplar.
// sync-all'ın alış ikizi: proxy CRON_PATHS + route-içi CRON_SECRET (D4).
export async function POST(req?: NextRequest) {
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
    }

    try {
        const result = await serviceSyncAllPendingPurchaseBills();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/sync-purchase-all");
    }
}
