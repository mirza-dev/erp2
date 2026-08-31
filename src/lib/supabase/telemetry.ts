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

/**
 * Bileşik imleç (2026-08 O2).
 *
 * İKİ kusur vardı:
 *   (a) Tie-breaker yoktu. İmleç yalnız zaman damgasıydı ve sorgu `strict <`
 *       kullanıyordu → aynı ms'ye düşen iki satır SONRAKİ sayfada ikisi birden
 *       atlanıyordu. Eşitlik gerçekçi: `occurred_at` istemciden gelen
 *       milisaniye hassasiyetli değerdir, hata fırtınasında çakışır.
 *   (b) Hata gruplarında imleç kolonu (`last_seen_at`) HER yeni oluşumda
 *       GÜNCELLENİYOR → 1. sayfa okunurken yeniden patlayan grup imlecin
 *       ötesine taşınıyor ve 2. sayfada da çıkmıyordu; yani EN AKTİF hata
 *       grubu listeden düşüyordu.
 *
 * Çözüm: imleç `<snapshot>|<ts>|<id>`. `snapshot` ilk sayfanın tepe zamanıdır
 * ve sonraki sayfalar `<= snapshot` ile sınırlanır — sayfalama boyunca sabit
 * bir küme üzerinde ilerlenir. Kolonu snapshot'ın ÜSTÜNE taşınan grup listeden
 * düşmez, tazelemede en tepede görünür.
 */
interface DecodedCursor {
    snapshot: string;
    ts: string;
    id: string | null;
}

export function encodeCursor(snapshot: string, ts: string, id: string): string {
    return `${snapshot}|${ts}|${id}`;
}

export function decodeCursor(raw: string | null | undefined): DecodedCursor | null {
    if (!raw) return null;
    const parts = raw.split("|");
    // Eski biçim (yalnız zaman damgası) geriye dönük kabul edilir.
    if (parts.length === 1) return { snapshot: parts[0], ts: parts[0], id: null };
    if (parts.length === 3) return { snapshot: parts[0], ts: parts[1], id: parts[2] };
    return null;
}

/** PostgREST `or()` değeri: `.` ve `:` ayraç olduğu için tırnaklanır. */
function quoted(value: string): string {
    return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

/** `.or()` gövdesi: `(col < ts) OR (col = ts AND id < id)`. */
function cursorOrExpr(col: string, ts: string, id: string): string {
    return `${col}.lt.${quoted(ts)},and(${col}.eq.${quoted(ts)},id.lt.${quoted(id)})`;
}

function clampLimit(limit?: number): number {
    if (!limit || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
    return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

export async function dbListErrorGroups(
    filters: ErrorGroupFilters = {},
): Promise<CursorPage<SystemErrorGroupRow>> {
    const supabase = createServiceClient();
    const limit = clampLimit(filters.limit);

    const cursor = decodeCursor(filters.before);

    let query = supabase
        .from("system_error_groups")
        .select("*")
        .order("last_seen_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);

    if (filters.severity) query = query.eq("severity", filters.severity);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.module) query = query.eq("module", filters.module);
    if (filters.environment) query = query.eq("environment", filters.environment);
    if (filters.errorType) query = query.eq("error_type", filters.errorType);
    if (filters.endpoint) query = query.ilike("endpoint", `%${filters.endpoint}%`);
    if (filters.since) query = query.gte("last_seen_at", filters.since);
    if (cursor) {
        // Sayfalama boyunca sabit küme: kolonu snapshot'ın üstüne taşınan grup
        // sonraki sayfalarda görünmez (tazelemede en tepede çıkar).
        query = query.lte("last_seen_at", cursor.snapshot);
        query = cursor.id
            ? query.or(cursorOrExpr("last_seen_at", cursor.ts, cursor.id))
            : query.lt("last_seen_at", cursor.ts);
    }
    if (filters.search?.trim()) {
        query = query.or(orIlikeFilter(["title", "normalized_message", "endpoint"], filters.search));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const all = (data ?? []) as SystemErrorGroupRow[];
    const rows = all.slice(0, limit);
    const last = rows[rows.length - 1];
    const snapshot = cursor?.snapshot ?? rows[0]?.last_seen_at ?? null;
    const nextCursor = all.length > limit && last && snapshot
        ? encodeCursor(snapshot, last.last_seen_at, last.id)
        : null;
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
export const ERROR_WINDOW_SCAN_LIMIT = 20_000;

export async function dbErrorWindowStats(
    sinceISO: string,
    environment?: string | null,
): Promise<ErrorWindowStats> {
    const supabase = createServiceClient();

    // 2026-08 O3: ciddiyet artık OLAYIN kendi kolonundan okunur (mig.111).
    // Eskiden gruba join edilip GRUBUN mevcut seviyesi sayılıyordu; grup
    // seviyesi monoton olduğu için "son 15 dakikada N kritik hata" ifadesi o
    // pencerede kritik sınıflanmamış oluşumlarla üretilebiliyordu.
    // 2026-08 Y7: ortam filtresi — panel kendini `environment` ile etiketliyor,
    // sayılar da o ortamdan gelmeli.
    let query = supabase
        .from("system_error_events")
        .select("group_id, severity")
        .gte("occurred_at", sinceISO);
    if (environment) query = query.eq("environment", environment);

    const { data, error } = await query
        .order("occurred_at", { ascending: false })
        .limit(ERROR_WINDOW_SCAN_LIMIT + 1);
    if (error) throw new Error(error.message);

    // limit + 1 → tavana dayandık mı, ayrımı sonuçta taşı (2026-08 D1):
    // kırpılmış tarama kesin sayı değil ALT SINIRDIR ve panelde "≥" ile yazılır.
    const all = (data ?? []) as Array<{ group_id: string; severity: TelemetrySeverity }>;
    const truncated = all.length > ERROR_WINDOW_SCAN_LIMIT;
    const scanned = truncated ? all.slice(0, ERROR_WINDOW_SCAN_LIMIT) : all;

    const bySeverity = { ...EMPTY_SEVERITY };
    const groups = new Set<string>();
    for (const row of scanned) {
        groups.add(row.group_id);
        if (row.severity && row.severity in bySeverity) bySeverity[row.severity]++;
    }

    return {
        sampledEvents: Math.min(scanned.length, ERROR_WINDOW_SCAN_LIMIT),
        bySeverity,
        activeGroups: groups.size,
        truncated,
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

    // `occurred_at` DEĞİŞMEZ → snapshot sınırı gerekmez, yalnız tie-breaker.
    const cursor = decodeCursor(filters.before);

    let query = supabase
        .from("system_events")
        .select("*")
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);

    if (filters.level) query = query.eq("level", filters.level);
    if (filters.module) query = query.eq("module", filters.module);
    if (filters.requestId) query = query.eq("request_id", filters.requestId);
    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.since) query = query.gte("occurred_at", filters.since);
    if (cursor) {
        query = cursor.id
            ? query.or(cursorOrExpr("occurred_at", cursor.ts, cursor.id))
            : query.lt("occurred_at", cursor.ts);
    }
    if (filters.search?.trim()) {
        query = query.or(orIlikeFilter(["message", "module", "endpoint"], filters.search));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const all = (data ?? []) as SystemEventRow[];
    const rows = all.slice(0, limit);
    const last = rows[rows.length - 1];
    const nextCursor = all.length > limit && last
        ? encodeCursor(last.occurred_at, last.occurred_at, last.id)
        : null;
    return { rows, nextCursor };
}

// ── İstek metrikleri — okuma ─────────────────────────────────────────────

export const PERFORMANCE_SCAN_LIMIT = 10_000;

export async function dbPerformanceSummary(sinceISO: string): Promise<PerformanceSummary> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("request_metrics")
        .select("*")
        // YALNIZ API uçları (2026-08-31, madde #14). Aynı tablo artık sayfa
        // görüntülemelerini de taşıyor ve onlar birer İSTEK DEĞİL: süreleri 0,
        // statüleri her zaman 200. Karışsalardı p95 aşağı çekilir, hata oranı
        // suni olarak düşer ve `errorRateCorroborated` sağlık kararı bozulurdu —
        // yani panel "her şey yolunda" derken gerçek uçlar yavaşlıyor olabilirdi.
        .like("endpoint", "/api/%")
        .gte("bucket_at", sinceISO)
        .order("bucket_at", { ascending: false })
        .limit(PERFORMANCE_SCAN_LIMIT + 1);
    if (error) throw new Error(error.message);

    const allRows = (data ?? []) as RequestMetricRow[];
    const truncated = allRows.length > PERFORMANCE_SCAN_LIMIT;
    const rows = truncated ? allRows.slice(0, PERFORMANCE_SCAN_LIMIT) : allRows;
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
            const p50 = percentileFromHistogram(a.histogram, 0.5);
            const p95 = percentileFromHistogram(a.histogram, 0.95);
            const p99 = percentileFromHistogram(a.histogram, 0.99);
            return {
                endpoint: a.endpoint,
                method: a.method,
                count: a.count,
                // 2026-08 D2: örnek yoksa `0` DEĞİL `null` — "0 ms · %0 hata"
                // ölçülmüş ve sağlıklı gibi okunuyordu. Aynı dosyanın genel
                // toplamı zaten `null` dönüyordu; iki sözleşme birleşti.
                avgMs: a.count > 0 ? Math.round(a.sumMs / a.count) : null,
                maxMs: a.maxMs,
                p50Ms: p50?.ms ?? null,
                p95Ms: p95?.ms ?? null,
                p99Ms: p99?.ms ?? null,
                p95Overflow: p95?.overflow ?? false,
                p99Overflow: p99?.overflow ?? false,
                status2xx: a.s2,
                status3xx: a.s3,
                status4xx: a.s4,
                status5xx: a.s5,
                errorRate: a.count > 0 ? (a.s4 + a.s5) / a.count : null,
            };
        })
        // En yavaş uç en üstte. Taşma kovasındaki uçlar p95 olarak EŞİT
        // göründüğü için (hepsi 12800) sıralama orada `maxMs`'e düşer (O1).
        .sort((a, b) => sortWeight(b) - sortWeight(a));

    const totalErrors = endpoints.reduce((s, e) => s + e.status4xx + e.status5xx, 0);
    const totalServerErrors = endpoints.reduce((s, e) => s + e.status5xx, 0);
    const overallP95 = percentileFromHistogram(overallHistogram, 0.95);

    return {
        endpoints,
        totalRequests: overallCount,
        totalErrors,
        totalServerErrors,
        overall: {
            avgMs: overallCount > 0 ? Math.round(overallSum / overallCount) : null,
            p95Ms: overallP95?.ms ?? null,
            p95Overflow: overallP95?.overflow ?? false,
        },
        buckets: DURATION_BUCKETS.map(b => (Number.isFinite(b) ? b : -1)),
        truncated,
    };
}

/** Sıralama ağırlığı: taşma kovasında p95 ayırt edici değil → maxMs kullanılır. */
function sortWeight(e: EndpointPerformance): number {
    if (e.p95Overflow) return Math.max(e.maxMs, e.p95Ms ?? 0);
    return e.p95Ms ?? e.avgMs ?? 0;
}

// ── Modül kullanımı (madde #14) ──────────────────────────────────────────

export interface PageUsageRow {
    /** Normalize sayfa yolu — `/dashboard/products/[id]` gibi. */
    path: string;
    /** Görüntüleme sayısı. */
    views: number;
}

/**
 * Hangi modül ne sıklıkta açılıyor.
 *
 * `dbPerformanceSummary`'nin aynadaki karşılığı: o `/api/%`, bu `/dashboard/%`.
 * Ayrı tablo YOK — `request_metrics` zaten saatlik kovalarda topluyor, RLS'i ve
 * 30 günlük retention'ı var. Süre/statü alanları burada anlamsız olduğu için
 * yalnız sayım okunur.
 */
export async function dbPageUsageSummary(sinceISO: string): Promise<PageUsageRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("request_metrics")
        .select("endpoint, sample_count")
        .like("endpoint", "/dashboard%")
        .gte("bucket_at", sinceISO)
        .order("bucket_at", { ascending: false })
        .limit(PERFORMANCE_SCAN_LIMIT);
    if (error) throw new Error(error.message);

    const byPath = new Map<string, number>();
    for (const r of (data ?? []) as { endpoint: string; sample_count: number }[]) {
        byPath.set(r.endpoint, (byPath.get(r.endpoint) ?? 0) + r.sample_count);
    }
    return [...byPath.entries()]
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views);
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
