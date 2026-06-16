/**
 * POST /api/email/retry-failed — CRON endpoint
 *
 * Auth: middleware CRON_PATHS via CRON_SECRET Bearer.
 * status='failed' + attempt_count<3 + son 24 saat → yeniden gönderim denemesi.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { retryFailedEmails } from "@/lib/services/email-service";
import { handleApiError } from "@/lib/api-error";

export async function POST(req?: NextRequest) {
    // Denetim D1 (2026-06): route-içi CRON_SECRET (derinlemesine savunma; proxy
    // CRON_PATHS tek hat olmasın). `req` opsiyonel: unit testler POST() ile çağırır.
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
    }
    try {
        const result = await retryFailedEmails();
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        return handleApiError(err, "POST /api/email/retry-failed");
    }
}
