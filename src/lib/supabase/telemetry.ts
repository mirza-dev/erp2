import { createServiceClient } from "./service";
import { orIlikeFilter } from "@/lib/list-query";
import type {
    DeveloperBugPriority,
    ErrorGroupStatus,
    RequestMetricRow,
    SystemErrorEventRow,
    SystemErrorGroupRow,
    SystemEventRow,
    TelemetrySeverity,
} from "@/lib/database.types";
import {
    BUCKET_COUNT,
    DURATION_BUCKETS,
    percentileFromHistogram,
} from "@/lib/telemetry/endpoint";
// Tel üzerindeki tipler istemciyle paylaşılır → tek kaynak console-types.
import type {
    CursorPage,
    EndpointPerformance,
    ErrorWindowStats,
    PerformanceSummary,
} from "@/lib/telemetry/console-types";

export type { CursorPage, EndpointPerformance, ErrorWindowStats, PerformanceSummary };

/**
 * Telemetri veri katmanı (migration 109).
 *
 * Yazma yolu fail-safe DEĞİL — burası ham DB erişimi; hataları YUKARI atar.
 * Fail-safe sarmalama `src/lib/telemetry/record.ts`'te; böylece "telemetri
 * arızası iş mantığını bozmaz" kuralı tek yerde uygulanır ve burası normal
 * bir DB modülü gibi test edilebilir.
 */

// ── Yazma ────────────────────────────────────────────────────────────────

export interface RecordErrorInput {
    fingerprint: string;
    title: string;
    errorType: string | null;
    normalizedMessage: string;
    severity: TelemetrySeverity;
    module: string | null;
    endpoint: string | null;
    environment: string;
    occurredAt: string;
    requestId?: string | null;
    method?: string | null;
    statusCode?: number | null;
    userId?: string | null;
    userAgent?: string | null;
    stack?: string | null;
    context?: Record<string, unknown> | null;
}

/** Grup upsert + örnekleme tavanlı olay insert'i TEK transaction'da. */
export async function dbRecordErrorOccurrence(input: RecordErrorInput): Promise<string> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("record_error_occurrence", {
        p_fingerprint: input.fingerprint,
        p_title: input.title,
        p_error_type: input.errorType,
        p_normalized_message: input.normalizedMessage,
        p_severity: input.severity,
        p_module: input.module,
        p_endpoint: input.endpoint,
        p_environment: input.environment,
        p_occurred_at: input.occurredAt,
        p_request_id: input.requestId ?? null,
        p_method: input.method ?? null,
        p_status_code: input.statusCode ?? null,
        p_user_id: input.userId ?? null,
        p_user_agent: input.userAgent ?? null,
        p_stack: input.stack ?? null,
        p_context: input.context ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
}

export interface RecordSystemEventInput {
    level: TelemetrySeverity;
    message: string;
    module?: string | null;
    endpoint?: string | null;
    requestId?: string | null;
    userId?: string | null;
    environment: string;
    context?: Record<string, unknown> | null;
}

export async function dbRecordSystemEvent(input: RecordSystemEventInput): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.from("system_events").insert({
        level: input.level,
        message: input.message,
        module: input.module ?? null,
        endpoint: input.endpoint ?? null,
        request_id: input.requestId ?? null,
        user_id: input.userId ?? null,
        environment: input.environment,
        context: input.context ?? null,
    });
    if (error) throw new Error(error.message);
}

/** RUM toplayıcısından gelen, önceden kovalanmış satırlar. */
export interface RequestMetricUpsertRow {
    bucket_at: string;
    endpoint: string;
    method: string;
    sample_count: number;
    sum_ms: number;
    max_ms: number;
    histogram: number[];
    status_2xx: number;
    status_3xx: number;
    status_4xx: number;
    status_5xx: number;
}

export async function dbRecordRequestMetrics(rows: RequestMetricUpsertRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("record_request_metrics", { p_rows: rows });
    if (error) throw new Error(error.message);
    return typeof data === "number" ? data : rows.length;
}

// ── Hata grupları — okuma ────────────────────────────────────────────────

export interface ErrorGroupFilters {
    severity?: TelemetrySeverity | null;
    status?: ErrorGroupStatus | null;
    module?: string | null;
    endpoint?: string | null;
    errorType?: string | null;
    environment?: string | null;
    /** last_seen_at >= since */
    since?: string | null;
    /** Cursor — bu değerden ESKİ last_seen_at'ler döner. */
    before?: string | null;
    search?: string | null;
    limit?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function clampLimit(limit?: number): number {
    if (!limit || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
    return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

export async function dbListErrorGroups(
    filters: ErrorGroupFilters = {},
): Promise<CursorPage<SystemErrorGroupRow>> {
    const supabase = createServiceClient();
    const limit = clampLimit(filters.limit);

    let query = supabase
        .from("system_error_groups")
        .select("*")
        .order("last_seen_at", { ascending: false })
        .limit(limit + 1);

    if (filters.severity) query = query.eq("severity", filters.severity);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.module) query = query.eq("module", filters.module);
    if (filters.environment) query = query.eq("environment", filters.environment);
    if (filters.errorType) query = query.eq("error_type", filters.errorType);
    if (filters.endpoint) query = query.ilike("endpoint", `%${filters.endpoint}%`);
    if (filters.since) query = query.gte("last_seen_at", filters.since);
    if (filters.before) query = query.lt("last_seen_at", filters.before);
    if (filters.search?.trim()) {
        query = query.or(orIlikeFilter(["title", "normalized_message", "endpoint"], filters.search));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const all = (data ?? []) as SystemErrorGroupRow[];
    const rows = all.slice(0, limit);
    const nextCursor = all.length > limit ? rows[rows.length - 1]?.last_seen_at ?? null : null;
    return { rows, nextCursor };
}

export async function dbGetErrorGroup(id: string): Promise<SystemErrorGroupRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("system_error_groups")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SystemErrorGroupRow | null) ?? null;
}

export async function dbListErrorEvents(
    groupId: string,
    limit = 20,
): Promise<SystemErrorEventRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("system_error_events")
        .select("*")
        .eq("group_id", groupId)
        .order("occurred_at", { ascending: false })
        .limit(clampLimit(limit));
    if (error) throw new Error(error.message);
    return (data ?? []) as SystemErrorEventRow[];
}

/**
 * Aynı request_id'yi paylaşan olaylar (§7 "Related Events"). Hem telemetri
 * olayları hem diğer hata oluşumları taranır — bir isteğin tam hikâyesi.
 */
export async function dbRelatedByRequestId(requestId: string): Promise<{
    events: SystemEventRow[];
    errors: SystemErrorEventRow[];
}> {
    const supabase = createServiceClient();
    const [eventsRes, errorsRes] = await Promise.all([
        supabase.from("system_events").select("*")
            .eq("request_id", requestId).order("occurred_at", { ascending: true }).limit(50),
        supabase.from("system_error_events").select("*")
            .eq("request_id", requestId).order("occurred_at", { ascending: true }).limit(50),
    ]);
    if (eventsRes.error) throw new Error(eventsRes.error.message);
    if (errorsRes.error) throw new Error(errorsRes.error.message);
    return {
        events: (eventsRes.data ?? []) as SystemEventRow[],
        errors: (errorsRes.data ?? []) as SystemErrorEventRow[],
    };
}

export async function dbUpdateErrorGroupStatus(
    id: string,
    status: ErrorGroupStatus,
    actorId: string | null,
): Promise<SystemErrorGroupRow | null> {
    const supabase = createServiceClient();
    const resolving = status === "resolved";
    const { data, error } = await supabase
        .from("system_error_groups")
        .update({
            status,
            resolved_at: resolving ? new Date().toISOString() : null,
            resolved_by: resolving ? actorId : null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SystemErrorGroupRow | null) ?? null;
}

// ── İstatistikler ────────────────────────────────────────────────────────

const EMPTY_SEVERITY: Record<TelemetrySeverity, number> = {
    info: 0, warning: 0, error: 0, critical: 0,
};

/**
 * Pencere istatistiği. Olaylar örneklenmiş olduğu için `sampledEvents` bir
 * ALT SINIRDIR — panelde bu açıkça yazılır (§28). Bir hatanın gerçek toplam
 * sayısı grubun `occurrence_count` alanındadır ve tamdır.
 */
export async function dbErrorWindowStats(sinceISO: string): Promise<ErrorWindowStats> {
    const supabase = createServiceClient();

    const { data, error } = await supabase
        .from("system_error_events")
        .select("group_id, system_error_groups!inner(severity)")
        .gte("occurred_at", sinceISO)
        .limit(20_000);
    if (error) throw new Error(error.message);

    const bySeverity = { ...EMPTY_SEVERITY };
    const groups = new Set<string>();
    for (const row of (data ?? []) as Array<{
        group_id: string;
        system_error_groups: { severity: TelemetrySeverity } | { severity: TelemetrySeverity }[];
    }>) {
        groups.add(row.group_id);
        const rel = Array.isArray(row.system_error_groups)
            ? row.system_error_groups[0]
            : row.system_error_groups;
        const sev = rel?.severity;
        if (sev && sev in bySeverity) bySeverity[sev]++;
    }

    return {
        sampledEvents: (data ?? []).length,
        bySeverity,
        activeGroups: groups.size,
    };
}

// ── Sistem olayları ──────────────────────────────────────────────────────

export interface SystemEventFilters {
    level?: TelemetrySeverity | null;
    module?: string | null;
    requestId?: string | null;
    userId?: string | null;
    since?: string | null;
    before?: string | null;
    search?: string | null;
    limit?: number;
}

export async function dbListSystemEvents(
    filters: SystemEventFilters = {},
): Promise<CursorPage<SystemEventRow>> {
    const supabase = createServiceClient();
    const limit = clampLimit(filters.limit);

    let query = supabase
        .from("system_events")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(limit + 1);

    if (filters.level) query = query.eq("level", filters.level);
    if (filters.module) query = query.eq("module", filters.module);
    if (filters.requestId) query = query.eq("request_id", filters.requestId);
    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.since) query = query.gte("occurred_at", filters.since);
    if (filters.before) query = query.lt("occurred_at", filters.before);
    if (filters.search?.trim()) {
        query = query.or(orIlikeFilter(["message", "module", "endpoint"], filters.search));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const all = (data ?? []) as SystemEventRow[];
    const rows = all.slice(0, limit);
    const nextCursor = all.length > limit ? rows[rows.length - 1]?.occurred_at ?? null : null;
    return { rows, nextCursor };
}

// ── İstek metrikleri — okuma ─────────────────────────────────────────────

export async function dbPerformanceSummary(sinceISO: string): Promise<PerformanceSummary> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("request_metrics")
        .select("*")
        .gte("bucket_at", sinceISO)
        .order("bucket_at", { ascending: false })
        .limit(10_000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as RequestMetricRow[];
    const byKey = new Map<string, {
        endpoint: string; method: string; count: number; sumMs: number; maxMs: number;
        histogram: number[]; s2: number; s3: number; s4: number; s5: number;
    }>();
    const overallHistogram = new Array<number>(BUCKET_COUNT).fill(0);
    let overallSum = 0;
    let overallCount = 0;

    for (const r of rows) {
        const key = `${r.method} ${r.endpoint}`;
        const acc = byKey.get(key) ?? {
            endpoint: r.endpoint, method: r.method, count: 0, sumMs: 0, maxMs: 0,
            histogram: new Array<number>(BUCKET_COUNT).fill(0), s2: 0, s3: 0, s4: 0, s5: 0,
        };
        acc.count += r.sample_count;
        acc.sumMs += Number(r.sum_ms);
        acc.maxMs = Math.max(acc.maxMs, r.max_ms);
        acc.s2 += r.status_2xx;
        acc.s3 += r.status_3xx;
        acc.s4 += r.status_4xx;
        acc.s5 += r.status_5xx;
        const hist = Array.isArray(r.histogram) ? r.histogram : [];
        for (let i = 0; i < BUCKET_COUNT; i++) {
            const v = hist[i] ?? 0;
            acc.histogram[i] += v;
            overallHistogram[i] += v;
        }
        byKey.set(key, acc);

        overallSum += Number(r.sum_ms);
        overallCount += r.sample_count;
    }

    const endpoints: EndpointPerformance[] = [...byKey.values()]
        .map(a => {
            const errors = a.s4 + a.s5;
            const total = a.count || 1;
            return {
                endpoint: a.endpoint,
                method: a.method,
                count: a.count,
                avgMs: a.count > 0 ? Math.round(a.sumMs / a.count) : 0,
                maxMs: a.maxMs,
                p50Ms: percentileFromHistogram(a.histogram, 0.5),
                p95Ms: percentileFromHistogram(a.histogram, 0.95),
                p99Ms: percentileFromHistogram(a.histogram, 0.99),
                status2xx: a.s2,
                status3xx: a.s3,
                status4xx: a.s4,
                status5xx: a.s5,
                errorRate: errors / total,
            };
        })
        // En yavaş uç en üstte — "hangi endpoint yavaşlıyor" tek bakışta.
        .sort((a, b) => (b.p95Ms ?? b.avgMs) - (a.p95Ms ?? a.avgMs));

    const totalErrors = endpoints.reduce((s, e) => s + e.status4xx + e.status5xx, 0);

    return {
        endpoints,
        totalRequests: overallCount,
        totalErrors,
        overall: {
            avgMs: overallCount > 0 ? Math.round(overallSum / overallCount) : null,
            p95Ms: percentileFromHistogram(overallHistogram, 0.95),
        },
        buckets: DURATION_BUCKETS.map(b => (Number.isFinite(b) ? b : -1)),
    };
}

// ── Retention ────────────────────────────────────────────────────────────

export interface PurgeResult {
    error_events: number;
    system_events: number;
    request_metrics: number;
    error_groups: number;
}

export async function dbPurgeTelemetry(): Promise<PurgeResult> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("purge_telemetry");
    if (error) throw new Error(error.message);
    return (data ?? {
        error_events: 0, system_events: 0, request_metrics: 0, error_groups: 0,
    }) as PurgeResult;
}

/** Tanılama ekranı için tablo satır sayıları (head+count — satır taşımaz). */
export async function dbTelemetryTableSizes(): Promise<Record<string, number | null>> {
    const supabase = createServiceClient();
    const tables = [
        "system_error_groups", "system_error_events", "system_events",
        "developer_bugs", "request_metrics",
    ];
    const results = await Promise.all(
        tables.map(async t => {
            const { count, error } = await supabase
                .from(t).select("id", { count: "exact", head: true });
            return [t, error ? null : count ?? 0] as const;
        }),
    );
    return Object.fromEntries(results);
}

export type { DeveloperBugPriority };
