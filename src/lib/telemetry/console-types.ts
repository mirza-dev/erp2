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
    /** Tarama tavanına dayanıldı → sayılar ALT SINIR ("≥ N"), kesin değil (D1). */
    truncated: boolean;
}

// ── Performans ───────────────────────────────────────────────────────────

export interface EndpointPerformance {
    endpoint: string;
    method: string;
    count: number;
    /** Örnek yoksa null — "0 ms" ölçülmüş sıfır gibi okunmasın (D2). */
    avgMs: number | null;
    maxMs: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    /** Yüzdelik taşma kovasına düştü → değer ALT sınır ("> 12,8 sn") (O1). */
    p95Overflow: boolean;
    p99Overflow: boolean;
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
    /** Örnek yoksa null (D2). */
    errorRate: number | null;
}

export interface PerformanceSummary {
    endpoints: EndpointPerformance[];
    totalRequests: number;
    /** 4xx + 5xx — Performans ekranının "hatalı yanıt" sayacı. */
    totalErrors: number;
    /**
     * YALNIZ 5xx. Sağlık verdikti bunu kullanır: 4xx (401 oturum tazeleme,
     * 404 opsiyonel kaynak, 400 form doğrulama) sistem kusuru DEĞİLDİR —
     * `api-error.ts`'in kendi gerekçesi de bunu söylüyor (Y3).
     */
    totalServerErrors: number;
    overall: { avgMs: number | null; p95Ms: number | null; p95Overflow: boolean };
    /** Kova sınırları (ms); sonsuz kova -1 ile işaretlenir. */
    buckets: readonly number[];
    /** Tarama tavanına dayanıldı → toplamlar ALT SINIR (D1). */
    truncated: boolean;
}

/** Modül kullanımı satırı (madde #14) — normalize sayfa yolu + görüntüleme. */
export interface PageUsage {
    path: string;
    views: number;
}

export interface PerformanceResponse extends PerformanceSummary {
    range: TimeRange;
    measurement: "client";
    note: string;
    /**
     * Hangi modül ne sıklıkta açıldı. `endpoints` ile AYNI tablodan gelir ama
     * ayrı alan: biri istek performansı, öteki kullanım. Karıştırılırlarsa
     * p95 ve hata oranı bozulur (bkz. dbPerformanceSummary'deki `/api/%`).
     */
    pageUsage: PageUsage[];
}

// ── Genel bakış ──────────────────────────────────────────────────────────

export interface HealthPayload {
    services: ServiceHealth[];
    overall: OverallHealth;
    windowMinutes: number;
    checkedAt: string;
}

/**
 * Panel metrikleri. **`null` = ÖLÇÜLEMEDİ, `0` = ölçüldü ve sıfır.**
 *
 * 2026-08 Y4: hata sayaçları eskiden `number`'dı ve sonda patladığında
 * `emptyErrorStats()` ile SIFIRA düşüyordu → panel kör olduğu anda yeşil
 * "0 kritik hata" gösteriyordu. Artık `null` geçiyor ve `MetricCard`'ın
 * mevcut "Ölçülmüyor" yolu devreye giriyor.
 */
export interface OverviewMetrics {
    sampledErrorEvents: number | null;
    criticalErrors: number | null;
    warnings: number | null;
    activeErrorGroups: number | null;
    /** RUM ölçümü yoksa null → panelde "Ölçülmüyor". */
    requests: number | null;
    /** 4xx + 5xx / toplam — Performans ekranının tanımı. */
    errorRate: number | null;
    /** YALNIZ 5xx / toplam — sağlık kararının kullandığı oran (Y3). */
    serverErrorRate: number | null;
    avgResponseMs: number | null;
    p95ResponseMs: number | null;
    activeUsers: number | null;
    uptimeSeconds: number;
    openBugs: number | null;
}

export interface OverviewPayload {
    range: TimeRange;
    since: string;
    environment: string;
    metrics: OverviewMetrics;
    health: HealthPayload;
    recentActivity: FeedEntry[];
    bugCounts: Record<DeveloperBugStatus, number> | null;
    /**
     * Tarama tavanına dayandığı için ALT SINIR olan metriklerin etiketleri
     * (D1). Boş değilse panel "≥" uyarısı gösterir.
     */
    truncatedMetrics: string[];
    /** Kayıtlar akışında okunamayan kaynaklar (O7) — "olay yok" ile karışmasın. */
    unavailableSources: FeedSource[];
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
    /**
     * Okunamayan kaynaklar (2026-08 O7). Altı okuyucunun hepsi hatayı sessizce
     * yutup `[]` dönüyordu → "olay yok" ile "kaynak okunamıyor" ayırt
     * edilemiyordu ve ekran arızayı normal sayıyordu.
     */
    unavailableSources: FeedSource[];
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
