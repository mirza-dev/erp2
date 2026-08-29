import { NextRequest, NextResponse } from "next/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbTelemetryTableSizes } from "@/lib/supabase/telemetry";
import { telemetryDiagnostics } from "@/lib/telemetry/record";
import { readServiceEnv } from "@/lib/telemetry/service-health";
import { DURATION_BUCKETS } from "@/lib/telemetry/endpoint";
import { HEALTH_THRESHOLDS, HEALTH_WINDOW_MINUTES } from "@/lib/telemetry/health";
import { SERVICE_THRESHOLDS } from "@/lib/telemetry/service-health";

/** Telemetri boru hattının kendi durumu (§20 — arıza sessiz kalmasın). */
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const [tableSizes] = await Promise.all([
            dbTelemetryTableSizes().catch(() => ({} as Record<string, number | null>)),
        ]);

        return NextResponse.json({
            telemetry: telemetryDiagnostics(),
            tableSizes,
            // Sır DEĞERİ değil, yalnız VARLIĞI — panelin kendisi sızıntı yüzeyi olmasın (§10).
            env: {
                ...readServiceEnv(),
                internalOperatorAllowlistConfigured: !!process.env.INTERNAL_OPERATOR_EMAILS,
                cronSecretConfigured: !!process.env.CRON_SECRET,
                anthropicKeyPresent: !!process.env.ANTHROPIC_API_KEY,
            },
            thresholds: {
                healthWindowMinutes: HEALTH_WINDOW_MINUTES,
                health: HEALTH_THRESHOLDS,
                services: SERVICE_THRESHOLDS,
                durationBucketsMs: DURATION_BUCKETS.map(b => (Number.isFinite(b) ? b : null)),
            },
            uptimeSeconds: process.uptime(),
            nodeVersion: process.version,
            generatedAt: new Date().toISOString(),
        });
    } catch (err) {
        return handleApiError(err, "GET /api/developer/diagnostics");
    }
}

/**
 * `action: "test-error"` — boru hattını uçtan uca sınar.
 *
 * Bilerek GERÇEK bir hata fırlatır: sahte bir kayıt yazmak yerine asıl
 * yakalama noktasından (`handleApiError`) geçmesi gerekir, yoksa test
 * "kayıt yazılabiliyor mu"yu doğrular ama "yakalama bağlı mı"yı doğrulamaz.
 * Yanıt 500'dür; `X-Request-Id` başlığı üretilen kaydın korelasyon kimliğidir.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        if (body.action !== "test-error") {
            return NextResponse.json(
                { error: 'Geçersiz işlem. Beklenen: { "action": "test-error" }' },
                { status: 400 },
            );
        }

        throw new Error(
            "Developer Console tanılama testi — bu hata bilerek üretildi, "
            + "sistemde bir arıza yok.",
        );
    } catch (err) {
        return handleApiError(err, "POST /api/developer/diagnostics");
    }
}
