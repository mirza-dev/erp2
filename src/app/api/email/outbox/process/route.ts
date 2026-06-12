import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { handleApiError } from "@/lib/api-error";
import { processNotificationOutbox } from "@/lib/services/notification-outbox-service";

export async function POST(req: NextRequest) {
    const guard = requireCronSecret(req);
    if (guard) return guard;
    try {
        const result = await processNotificationOutbox({ limit: 50 });
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        return handleApiError(err, "POST /api/email/outbox/process");
    }
}
