import { probeAIKey } from "@/lib/services/ai-service";
import { FEED_SOURCES } from "@/lib/telemetry/console-types";
import {
    dbActiveUserCount,
    dbActivityFeed,
    dbBackgroundJobHealth,
    dbExternalServiceHealth,
    dbPingDatabase,
} from "@/lib/supabase/developer-feed";
import { dbErrorWindowStats, dbPerformanceSummary } from "@/lib/supabase/telemetry";
import { dbBugCounts } from "@/lib/supabase/developer-bugs";
import {
    HEALTH_WINDOW_MINUTES,
    computeOverallHealth,
    rangeStartISO,
    type TimeRange,
} from "@/lib/telemetry/health";
import { buildServiceHealth, readServiceEnv } from "@/lib/telemetry/service-health";
import { telemetryEnvironment } from "@/lib/telemetry/record";
// Yanıt tipleri istemciyle paylaşılır → tek kaynak console-types.
import type {
    HealthPayload,
    OverviewPayload,
} from "@/lib/telemetry/console-types";

export type { OverviewMetrics, OverviewPayload } from "@/lib/telemetry/console-types";

/**
 * Developer Console'un okuma tarafı servis katmanı.
 *
 * Genel Bakış ve Sağlık ekranları aynı sondaları kullanıyor; burada
 * toplanmaları iki şeyi sağlar: (1) iki ekran ASLA farklı bir gerçeklik
 * göstermez, (2) sonda sayısı ve sırası tek yerde görülür — "health check
 * gereksiz ağır olmasın" kuralı gözle denetlenebilir kalır.
 */

const HEALTH_WINDOW_MS = HEALTH_WINDOW_MINUTES * 60_000;

function healthWindowStart(): string {
    return new Date(Date.now() - HEALTH_WINDOW_MS).toISOString();
}

/** Servis satırları + karar. Tüm sondalar paralel, her biri hafif. */
export async function collectHealth(): Promise<HealthPayload> {
    const since = healthWindowStart();

    // 2026-08 O5: `dbBackgroundJobHealth` ve `dbExternalServiceHealth` ÇIPLAK
    // çağrılıyordu; patladıklarında aşağıdaki gerekçe geçersiz kalıp sağlık
    // route'unun TAMAMI 500 dönüyordu — panel "bir şey bozuk mu" sorusunu
    // tam da bozukken cevaplayamıyordu.
    const [db, jobs, external, errorStats, perf, ai] = await Promise.all([
        dbPingDatabase(),
        safe(() => dbBackgroundJobHealth(), null),
        safe(() => dbExternalServiceHealth(since), null),
        // Y4: fallback SIFIR DEĞİL `null` — sonda patladığında panel "0 kritik
        // hata" diyip yeşile boyanıyordu (§28 ihlali).
        safe(() => dbErrorWindowStats(since, telemetryEnvironment()), null),
        safe(() => dbPerformanceSummary(since), null),
        // AI sondası kendi 10 dk önbelleğine sahip; anahtar yoksa istek atmaz.
        safe(() => probeAIKey(), null),
    ]);

    const services = buildServiceHealth({
        uptimeSeconds: process.uptime(),
        db,
        jobs,
        external,
        api: perf && perf.totalRequests > 0
            ? {
                total: perf.totalRequests,
                serverErrors: perf.endpoints.reduce((s, e) => s + e.status5xx, 0),
            }
            : null,
        ai,
        env: readServiceEnv(),
    });

    // Y3: sağlık kararı YALNIZ 5xx oranını kullanır. 4xx (401 oturum tazeleme,
    // 404, 400 form doğrulama) sistem kusuru değildir; Performans ekranında
    // ayrı gösterilir. Eskiden 4xx de sayıldığı için 100 istekte 25 adet 401
    // genel durumu "Kritik" yapıyor, aynı yanıttaki API satırı ise yalnız 5xx
    // saydığı için "Sağlıklı" diyordu — panel kendi kendisiyle çelişiyordu.
    const errorRate = perf && perf.totalRequests > 0
        ? perf.totalServerErrors / perf.totalRequests
        : null;

    const overall = computeOverallHealth({
        services,
        recentCriticalErrors: errorStats?.bySeverity.critical ?? null,
        recentErrors: errorStats?.sampledEvents ?? null,
        errorRate,
        telemetryReadable: errorStats !== null,
        // Sunucunun kendi hata kaydı varsa RUM oranı doğrulanmış sayılır.
        errorRateCorroborated: (errorStats?.sampledEvents ?? 0) > 0,
    });

    return {
        services,
        overall,
        windowMinutes: HEALTH_WINDOW_MINUTES,
        checkedAt: new Date().toISOString(),
    };
}

export async function collectOverview(range: TimeRange): Promise<OverviewPayload> {
    const since = rangeStartISO(range);

    const [health, errorStats, perf, activity, activeUsers, bugCounts] = await Promise.all([
        collectHealth(),
        safe(() => dbErrorWindowStats(since, telemetryEnvironment()), null),
        safe(() => dbPerformanceSummary(since), null),
        safe(() => dbActivityFeed({ since, limit: 12 }),
            { entries: [], nextCursor: null, unavailableSources: [...FEED_SOURCES] }),
        safe(() => dbActiveUserCount(since), null),
        safe(() => dbBugCounts(), null),
    ]);

    // D1: tavana dayanan taramaların sonucu KESİN SAYI değil ALT SINIRDIR.
    const truncatedMetrics: string[] = [];
    if (errorStats?.truncated) truncatedMetrics.push("Hata olayı", "Kritik hata", "Uyarı", "Aktif hata grubu");
    if (perf?.truncated) truncatedMetrics.push("İstek", "Hata oranı");
    if (activeUsers?.truncated) truncatedMetrics.push("Aktif kullanıcı");

    return {
        range,
        since,
        environment: telemetryEnvironment(),
        metrics: {
            // `null` = ölçülemedi (MetricCard "Ölçülmüyor" yazar), `0` = ölçüldü.
            sampledErrorEvents: errorStats?.sampledEvents ?? null,
            criticalErrors: errorStats?.bySeverity.critical ?? null,
            warnings: errorStats?.bySeverity.warning ?? null,
            activeErrorGroups: errorStats?.activeGroups ?? null,
            requests: perf && perf.totalRequests > 0 ? perf.totalRequests : null,
            errorRate: perf && perf.totalRequests > 0
                ? perf.totalErrors / perf.totalRequests
                : null,
            serverErrorRate: perf && perf.totalRequests > 0
                ? perf.totalServerErrors / perf.totalRequests
                : null,
            avgResponseMs: perf?.overall.avgMs ?? null,
            p95ResponseMs: perf?.overall.p95Ms ?? null,
            activeUsers: activeUsers?.users ?? null,
            uptimeSeconds: process.uptime(),
            openBugs: bugCounts
                ? bugCounts.open + bugCounts.investigating + bugCounts.in_progress
                : null,
        },
        health,
        recentActivity: activity.entries,
        bugCounts,
        truncatedMetrics,
        unavailableSources: activity.unavailableSources,
        generatedAt: new Date().toISOString(),
    };
}

// ── Yardımcılar ──────────────────────────────────────────────────────────

/**
 * Tek bir sondanın patlaması TÜM paneli düşürmemeli — sağlık ekranının işi
 * zaten "bir şey bozuk mu" demek; kendisi 500 verirse o soruyu cevaplayamaz.
 * Başarısız sonda `fallback` döner ve ilgili satır "Ölçülmüyor" olur.
 */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await fn();
    } catch {
        return fallback;
    }
}

/**
 * `emptyErrorStats()` / `emptyBugCounts()` KALDIRILDI (2026-08 Y4).
 * Başarısız bir sondayı sıfırlarla doldurmak, "ölçtük ve sıfır çıktı" demekle
 * aynı şeydi; panel kör olduğu anda yeşile boyanıyordu. Fallback artık `null`.
 */
