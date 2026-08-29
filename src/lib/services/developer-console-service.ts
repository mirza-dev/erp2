import { probeAIKey } from "@/lib/services/ai-service";
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
import type { DeveloperBugStatus } from "@/lib/database.types";
// Yanıt tipleri istemciyle paylaşılır → tek kaynak console-types.
import type {
    ErrorWindowStats,
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

    const [db, jobs, external, errorStats, perf, ai] = await Promise.all([
        dbPingDatabase(),
        dbBackgroundJobHealth(),
        dbExternalServiceHealth(since),
        safe(() => dbErrorWindowStats(since), emptyErrorStats()),
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

    const errorRate = perf && perf.totalRequests > 0
        ? perf.totalErrors / perf.totalRequests
        : null;

    const overall = computeOverallHealth({
        services,
        recentCriticalErrors: errorStats.bySeverity.critical,
        recentErrors: errorStats.sampledEvents,
        errorRate,
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
        safe(() => dbErrorWindowStats(since), emptyErrorStats()),
        safe(() => dbPerformanceSummary(since), null),
        safe(() => dbActivityFeed({ since, limit: 12 }), { entries: [], nextCursor: null }),
        safe(() => dbActiveUserCount(since), null),
        safe(() => dbBugCounts(), null),
    ]);

    const counts = bugCounts ?? emptyBugCounts();

    return {
        range,
        since,
        environment: telemetryEnvironment(),
        metrics: {
            sampledErrorEvents: errorStats.sampledEvents,
            criticalErrors: errorStats.bySeverity.critical,
            warnings: errorStats.bySeverity.warning,
            activeErrorGroups: errorStats.activeGroups,
            requests: perf && perf.totalRequests > 0 ? perf.totalRequests : null,
            errorRate: perf && perf.totalRequests > 0
                ? perf.totalErrors / perf.totalRequests
                : null,
            avgResponseMs: perf?.overall.avgMs ?? null,
            p95ResponseMs: perf?.overall.p95Ms ?? null,
            activeUsers,
            uptimeSeconds: process.uptime(),
            openBugs: counts.open + counts.investigating + counts.in_progress,
        },
        health,
        recentActivity: activity.entries,
        bugCounts: counts,
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

function emptyErrorStats(): ErrorWindowStats {
    return {
        sampledEvents: 0,
        bySeverity: { info: 0, warning: 0, error: 0, critical: 0 },
        activeGroups: 0,
    };
}

function emptyBugCounts(): Record<DeveloperBugStatus, number> {
    return {
        open: 0, investigating: 0, in_progress: 0, fixed: 0, closed: 0, ignored: 0,
    };
}
