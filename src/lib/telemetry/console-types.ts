import type {
    DeveloperBugPriority,
    DeveloperBugRow,
    DeveloperBugStatus,
    SystemErrorEventRow,
    SystemErrorGroupRow,
    SystemEventRow,
    TelemetrySeverity,
} from "@/lib/database.types";
import type { OverallHealth, ServiceHealth, TimeRange } from "./health";

/**
 * Developer Console'un TEL ÜZERİNDEKİ tipleri.
 *
 * Ayrı dosya olmasının sebebi mimari: bu tipleri hem sunucu modülleri
 * (`supabase/telemetry.ts`, `services/developer-console-service.ts`) hem de
 * istemci sayfaları kullanıyor. Tipler o sunucu modüllerinde kalsaydı istemci
 * `import type` ile onlara bağlanır ve tek bir dikkatsiz `import` (type
 * anahtar kelimesi düşünce) service-role Supabase istemcisini tarayıcı
 * bundle'ına sürüklerdi. Burada hiçbir çalışma zamanı bağımlılığı yok.
 */

// ── Ciddiyet ─────────────────────────────────────────────────────────────

/** Runtime allowlist. `fingerprint.ts` yerine BURADA: o modül sunucu tarafı
 *  mantığı taşır, bu sabiti ise filtre açılır menüleri (istemci) de kullanır. */
export const SEVERITIES: readonly TelemetrySeverity[] = [
    "info", "warning", "error", "critical",
] as const;

export type Severity = TelemetrySeverity;

// ── Olay akışı ───────────────────────────────────────────────────────────

export const FEED_SOURCES = [
    "telemetry", "error", "audit", "integration", "email", "incident",
] as const;
export type FeedSource = (typeof FEED_SOURCES)[number];

export const FEED_SOURCE_LABELS: Record<FeedSource, string> = {
    telemetry: "Sistem",
    error: "Hata",
    audit: "Denetim",
    integration: "Entegrasyon",
    email: "E-posta",
    incident: "Arıza",
};

export interface FeedEntry {
    id: string;
    occurredAt: string;
    level: TelemetrySeverity;
    source: FeedSource;
    message: string;
    module: string | null;
    endpoint: string | null;
    requestId: string | null;
    userId: string | null;
    /** Hata satırından detaya gidebilmek için. */
    errorGroupId: string | null;
}

// ── Hata istatistikleri ──────────────────────────────────────────────────

export interface ErrorWindowStats {
    /** Pencerede KAYDEDİLEN olay sayısı (grup başına saatlik örnekleme tavanlı). */
    sampledEvents: number;
    bySeverity: Record<TelemetrySeverity, number>;
    /** Pencerede en az bir kez görülen grup sayısı. */
    activeGroups: number;
}

// ── Performans ───────────────────────────────────────────────────────────

export interface EndpointPerformance {
    endpoint: string;
    method: string;
    count: number;
    avgMs: number;
    maxMs: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
    errorRate: number;
}

export interface PerformanceSummary {
    endpoints: EndpointPerformance[];
    totalRequests: number;
    totalErrors: number;
    overall: { avgMs: number | null; p95Ms: number | null };
    /** Kova sınırları (ms); sonsuz kova -1 ile işaretlenir. */
    buckets: readonly number[];
}

export interface PerformanceResponse extends PerformanceSummary {
    range: TimeRange;
    measurement: "client";
    note: string;
}

// ── Genel bakış ──────────────────────────────────────────────────────────

export interface HealthPayload {
    services: ServiceHealth[];
    overall: OverallHealth;
    windowMinutes: number;
    checkedAt: string;
}

export interface OverviewMetrics {
    sampledErrorEvents: number;
    criticalErrors: number;
    warnings: number;
    activeErrorGroups: number;
    /** RUM ölçümü yoksa null → panelde "Ölçülmüyor". */
    requests: number | null;
    errorRate: number | null;
    avgResponseMs: number | null;
    p95ResponseMs: number | null;
    activeUsers: number | null;
    uptimeSeconds: number;
    openBugs: number;
}

export interface OverviewPayload {
    range: TimeRange;
    since: string;
    environment: string;
    metrics: OverviewMetrics;
    health: HealthPayload;
    recentActivity: FeedEntry[];
    bugCounts: Record<DeveloperBugStatus, number>;
    generatedAt: string;
}

// ── Sayfalı yanıtlar ─────────────────────────────────────────────────────

export interface CursorPage<T> {
    rows: T[];
    nextCursor: string | null;
}

export interface FeedPage {
    entries: FeedEntry[];
    nextCursor: string | null;
    range: TimeRange;
}

// ── Tanılama ─────────────────────────────────────────────────────────────

export interface DiagnosticsPayload {
    telemetry: {
        writes: number;
        failures: number;
        dropped: number;
        lastFailureAt: string | null;
        lastFailureMessage: string | null;
        enabled: boolean;
        environment: string;
    };
    tableSizes: Record<string, number | null>;
    env: Record<string, boolean>;
    thresholds: {
        healthWindowMinutes: number;
        health: Record<string, number>;
        services: Record<string, number>;
        durationBucketsMs: (number | null)[];
    };
    uptimeSeconds: number;
    nodeVersion: string;
    generatedAt: string;
}

// ── Hata detayı ──────────────────────────────────────────────────────────

export interface ErrorDetailPayload {
    group: SystemErrorGroupRow;
    events: SystemErrorEventRow[];
    bugs: DeveloperBugRow[];
    /** En son oluşumun korelasyon kimliği; yoksa null. */
    latestRequestId: string | null;
    related: {
        events: SystemEventRow[];
        errors: SystemErrorEventRow[];
    };
}

export interface BugWithErrorsPayload extends DeveloperBugRow {
    relatedErrors: SystemErrorGroupRow[];
}

// ── Bug sabitleri ────────────────────────────────────────────────────────
// Etiketler ve allowlist'ler BURADA çünkü hem istemci sayfası hem sunucu
// route'u kullanıyor. `supabase/developer-bugs.ts`'te dursaydı bir client
// component onları import ederken service-role Supabase istemcisini de
// tarayıcı bundle'ına çekerdi.

export const BUG_STATUSES: readonly DeveloperBugStatus[] = [
    "open", "investigating", "in_progress", "fixed", "closed", "ignored",
] as const;

export const BUG_PRIORITIES: readonly DeveloperBugPriority[] = [
    "low", "medium", "high", "critical",
] as const;

export const BUG_STATUS_LABELS: Record<DeveloperBugStatus, string> = {
    open: "Açık",
    investigating: "İnceleniyor",
    in_progress: "Üzerinde çalışılıyor",
    fixed: "Düzeltildi",
    closed: "Kapatıldı",
    ignored: "Yok sayıldı",
};

export const BUG_PRIORITY_LABELS: Record<DeveloperBugPriority, string> = {
    low: "Düşük",
    medium: "Orta",
    high: "Yüksek",
    critical: "Kritik",
};

export function isBugStatus(value: unknown): value is DeveloperBugStatus {
    return typeof value === "string" && (BUG_STATUSES as readonly string[]).includes(value);
}

export function isBugPriority(value: unknown): value is DeveloperBugPriority {
    return typeof value === "string" && (BUG_PRIORITIES as readonly string[]).includes(value);
}
