import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbPurgeTelemetry } from "@/lib/supabase/telemetry";
import { recordEvent } from "@/lib/telemetry/record";

/**
 * Telemetri retention turu (§16, §23).
 *
 * İki çağıran var, ikisi de meşru:
 *   · `crons.yml` saatlik işi — `Authorization: Bearer <CRON_SECRET>`
 *   · Tanılama ekranındaki "Şimdi temizle" — oturumlu internalOperator
 *
 * `/api/seed` emsali: iki kapıdan biri açılmalı, ikisi de kapalıysa 401.
 * Silme kuralları SQL'de (`purge_telemetry`): süresi dolmuş olaylar + 90 gün
 * kapalı ve hiçbir bug'a bağlı OLMAYAN gruplar.
 */
export async function POST(req: NextRequest) {
    try {
        const cronBlocked = requireCronSecret(req);
        if (cronBlocked) {
            // Cron sırrı yok → oturum yolunu dene.
            const auth = await resolveAuthContext();
            const guard = requireInternalOperatorFor(auth);
            if (guard) return guard;
        }

        const result = await dbPurgeTelemetry();

        // Temizliğin kendisi de bir olaydır — "neden kayıt azaldı" sorusunun
        // cevabı panelde dursun.
        await recordEvent({
            level: "info",
            message: `Retention turu: ${result.error_events} hata olayı, `
                + `${result.system_events} sistem olayı, ${result.request_metrics} metrik, `
                + `${result.error_groups} grup silindi.`,
            module: "telemetry",
        });

        return NextResponse.json({ ...result, purgedAt: new Date().toISOString() });
    } catch (err) {
        return handleApiError(err, "POST /api/developer/retention");
    }
}
