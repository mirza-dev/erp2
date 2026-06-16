import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { serviceExpireQuotes } from "@/lib/services/order-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/orders/expire-quotes
// Scans for expired quotes: auto-cancels drafts, alerts pending_approval orders.
// Callable via CRON_SECRET Bearer token (see proxy.ts CRON_PATHS).
export async function POST(req?: NextRequest) {
    // Denetim D1 (2026-06): route-içi CRON_SECRET (derinlemesine savunma — proxy
    // CRON_PATHS tek hat olmasın). `req` opsiyonel: unit testler POST() ile çağırır;
    // prod'da Next her zaman geçirir. quotes/expire kalıbının aynısı.
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
    }
    try {
        const result = await serviceExpireQuotes();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/orders/expire-quotes");
    }
}
