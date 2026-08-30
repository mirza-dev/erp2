import { NextRequest, NextResponse } from "next/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { requirePermissionFor, resolveAuthContext } from "@/lib/auth/role-guard";
import { dbRecordRequestMetrics } from "@/lib/supabase/telemetry";
import { aggregateRumSamples, MAX_SAMPLES_PER_BATCH } from "@/lib/telemetry/rum-aggregate";
import { isTelemetryEnabled } from "@/lib/telemetry/record";

/**
 * RUM ingest (§12).
 *
 * YETKİ NOTU — bilinçli olarak internalOperator DEĞİL: performans verisinin
 * anlamlı olabilmesi için GERÇEK kullanıcıların trafiğinden gelmesi gerekir.
 * Yalnız geliştiricinin kendi gezinmesini ölçmek "hangi uç production'da
 * yavaş" sorusunu cevaplamaz. Bu yüzden kapı `view_dashboard` — panele
 * girebilen herkes kendi isteklerinin süresini bildirebilir. Okuma tarafı
 * (Performans ekranı) yine yalnız internalOperator'a açık.
 *
 * Yazılan veri kişisel değil: method + normalize path + status + süre.
 *
 * Doğrulama `aggregateRumSamples` içindedir ve İKİ katmanlıdır (2026-08 Y5):
 *   1. biçim — `SAFE_PATH_RE`, method allowlist, status/süre aralığı;
 *   2. ÜYELİK — normalize yol `known-endpoints.ts`'teki gerçek route şablonu
 *      kümesinde OLMALI. Eskiden yalnız (1) vardı ve yorum yanlışlıkla
 *      "tanınmayan path yazılmaz" diyordu: `/api/aaaa`, `/api/aaab`… hepsi
 *      geçiyor, `unique(bucket_at, endpoint, method)` yüzünden tekil satır
 *      sayısı sınırsız büyüyebiliyordu.
 *
 * Örnekler gerçek trafikle BAĞLI DEĞİLDİR (istemci ne derse o yazılır); bu
 * yüzden sağlık kararı bu oranı sunucu kaydıyla çapraz doğrular
 * (`errorRateCorroborated`) ve uç kendi hız tavanını taşır (`POLICIES.RUM`).
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        // Oturumsuz istek proxy'de zaten 401 alır; bu ikinci kapı derinlemesine
        // savunma (proxy matcher değişirse ingest anonim açılmasın).
        if (!auth.user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
        const guard = requirePermissionFor(auth, "view_dashboard");
        if (guard) return guard;

        // Gövde doğrulaması telemetri kapısından ÖNCE: bu uç dışarıdan
        // yazılabilir bir sınır ve bozuk/aşırı istek, telemetri açık olsa da
        // kapalı olsa da aynı yanıtı almalı. Sıra tersine çevrilirse kapalı
        // ortamda hatalı gövdeye 200 dönerdi.
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const samples = Array.isArray(body.samples) ? body.samples : null;
        if (!samples) {
            return NextResponse.json({ error: "samples dizisi zorunlu." }, { status: 400 });
        }
        if (samples.length > MAX_SAMPLES_PER_BATCH * 4) {
            // Tavan aggregate içinde de var; burada erken reddedip iş yükünü kesiyoruz.
            return NextResponse.json({ error: "Çok fazla örnek." }, { status: 413 });
        }

        if (!isTelemetryEnabled()) {
            return NextResponse.json({ accepted: 0, rejected: 0, disabled: true });
        }

        const { rows, accepted, rejected } = aggregateRumSamples(samples);
        if (rows.length > 0) await dbRecordRequestMetrics(rows);

        return NextResponse.json({ accepted, rejected, buckets: rows.length });
    } catch (err) {
        return handleApiError(err, "POST /api/developer/rum");
    }
}
