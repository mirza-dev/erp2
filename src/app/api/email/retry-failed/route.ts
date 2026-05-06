/**
 * POST /api/email/retry-failed — CRON endpoint
 *
 * Auth: middleware CRON_PATHS via CRON_SECRET Bearer.
 * status='failed' + attempt_count<3 + son 24 saat → yeniden gönderim denemesi.
 */
import { NextResponse } from "next/server";
import { retryFailedEmails } from "@/lib/services/email-service";
import { handleApiError } from "@/lib/api-error";

export async function POST() {
    try {
        const result = await retryFailedEmails();
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        return handleApiError(err, "POST /api/email/retry-failed");
    }
}
