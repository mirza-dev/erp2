import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { revalidateTag } from "next/cache";
import { serviceExpireQuotes } from "@/lib/services/quote-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/quotes/expire
// CRON: Süresi dolmuş teklifleri (draft/sent + valid_until < today) expired yapar.
export async function POST(req?: NextRequest) {
    // Denetim D4 (2026-06): route-içi CRON_SECRET (derinlemesine savunma —
    // proxy CRON_PATHS tek hat olmasın). `req` opsiyonel: unit testler POST()
    // ile çağırır (stock-risk guardAiRoute kalıbı); prod'da Next her zaman geçirir.
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
    }

    try {
        const result = await serviceExpireQuotes();
        if (result.expired > 0) {
            revalidateTag("quotes", "max");
            for (const id of result.expiredIds) {
                revalidateTag(`quote-${id}`, "max");
            }
        }
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/expire");
    }
}
