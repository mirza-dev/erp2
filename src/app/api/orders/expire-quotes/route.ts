import { NextResponse } from "next/server";
import { serviceExpireQuotes } from "@/lib/services/order-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/orders/expire-quotes
// Scans for expired quotes: auto-cancels drafts, alerts pending_approval orders.
// Callable via CRON_SECRET Bearer token (see middleware.ts CRON_PATHS).
export async function POST() {
    try {
        const result = await serviceExpireQuotes();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/orders/expire-quotes");
    }
}
