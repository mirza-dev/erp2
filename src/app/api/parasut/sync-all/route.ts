import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { serviceSyncAllPending } from "@/lib/services/parasut-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/parasut/sync-all
export async function POST(req?: NextRequest) {
    // Denetim D4 (2026-06): route-içi CRON_SECRET (derinlemesine savunma —
    // proxy CRON_PATHS tek hat olmasın). `req` opsiyonel: unit testler POST()
    // ile çağırır (stock-risk guardAiRoute kalıbı); prod'da Next her zaman geçirir.
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
    }

    try {
        const result = await serviceSyncAllPending();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/sync-all");
    }
}
