/**
 * Genel sağlık kararı (Developer Console §3, §4).
 *
 * Şart: "Bu değer hard-coded olmamalı." Karar burada, ADLANDIRILMIŞ eşiklerle
 * ve saf bir fonksiyonda verilir — UI yalnız sonucu boyar. Böylece eşik
 * tartışması testte yapılır, altı ayrı ekranda değil.
 *
 * Sağlık verdikti kısa bir pencereye (varsayılan 15 dk) bakar; kullanıcının
 * seçtiği 24s/7g aralığı METRİK kartlarını besler, "şu an sağlıklı mı"yı değil.
 * Yoksa bir hafta önceki tek kritik hata paneli sonsuza dek kırmızı tutardı.
 */

export type HealthStatus = "healthy" | "degraded" | "critical" | "unknown";

export interface ServiceHealth {
    key: string;
    label: string;
    status: HealthStatus;
    /** İnsan-okur açıklama. Ölçülemiyorsa "Ölçülmüyor" (§28 — uydurma yok). */
    detail: string | null;
    /** Çökerse sistemin tamamı çöker mi (uygulama, veritabanı). */
    essential: boolean;
}

/** Sağlık verdikti bu kadar geriye bakar. */
export const HEALTH_WINDOW_MINUTES = 15;

export const HEALTH_THRESHOLDS = {
    /** Hata oranı bunun üstündeyse Degraded. */
    degradedErrorRate: 0.05,
    /** Hata oranı bunun üstündeyse Critical. */
    criticalErrorRate: 0.2,
    /** Pencerede bu kadar hata Degraded yapar (oran ölçülemediğinde de çalışır). */
    degradedErrorCount: 10,
} as const;

const RANK: Record<HealthStatus, number> = {
    healthy: 0,
    unknown: 1,
    degraded: 2,
    critical: 3,
};

export function statusRank(status: HealthStatus): number {
    return RANK[status];
}

/** İki durumdan kötü olanı. */
export function worstStatus(a: HealthStatus, b: HealthStatus): HealthStatus {
    return RANK[a] >= RANK[b] ? a : b;
}

export interface OverallHealthInput {
    services: ServiceHealth[];
    /** Son HEALTH_WINDOW_MINUTES içindeki kritik hata sayısı. */
    recentCriticalErrors: number;
    /** Son HEALTH_WINDOW_MINUTES içindeki toplam hata sayısı. */
    recentErrors: number;
    /** Hatalı istek / toplam istek. Ölçülemiyorsa null. */
    errorRate: number | null;
}

export interface OverallHealth {
    status: HealthStatus;
    /** Kararın NEDEN o olduğu — panelde gösterilir, tahmin ettirmez. */
    reason: string;
}

/**
 * Karar sırası kasıtlı: en sert sinyal önce. Zorunlu servis çökmüşse hata
 * oranının ne olduğu önemsizdir (istek zaten gitmiyordur).
 */
export function computeOverallHealth(input: OverallHealthInput): OverallHealth {
    const { services, recentCriticalErrors, recentErrors, errorRate } = input;

    const downEssential = services.find(s => s.essential && s.status === "critical");
    if (downEssential) {
        return { status: "critical", reason: `${downEssential.label} yanıt vermiyor` };
    }

    if (recentCriticalErrors > 0) {
        return {
            status: "critical",
            reason: `Son ${HEALTH_WINDOW_MINUTES} dakikada ${recentCriticalErrors} kritik hata`,
        };
    }

    if (errorRate !== null && errorRate >= HEALTH_THRESHOLDS.criticalErrorRate) {
        return { status: "critical", reason: `Hata oranı %${(errorRate * 100).toFixed(1)}` };
    }

    const unknownEssential = services.find(s => s.essential && s.status === "unknown");
    if (unknownEssential) {
        return { status: "degraded", reason: `${unknownEssential.label} durumu okunamadı` };
    }

    const degradedService = services.find(s => s.status === "degraded" || s.status === "critical");
    if (degradedService) {
        return {
            status: "degraded",
            reason: `${degradedService.label}: ${degradedService.detail ?? "sorunlu"}`,
        };
    }

    if (errorRate !== null && errorRate >= HEALTH_THRESHOLDS.degradedErrorRate) {
        return { status: "degraded", reason: `Hata oranı %${(errorRate * 100).toFixed(1)}` };
    }

    if (recentErrors >= HEALTH_THRESHOLDS.degradedErrorCount) {
        return {
            status: "degraded",
            reason: `Son ${HEALTH_WINDOW_MINUTES} dakikada ${recentErrors} hata`,
        };
    }

    return { status: "healthy", reason: `Son ${HEALTH_WINDOW_MINUTES} dakikada kritik olay yok` };
}

/** Zaman aralığı seçenekleri (§3) — varsayılan 24 saat. */
export const TIME_RANGES = ["1h", "6h", "24h", "7d"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];
export const DEFAULT_TIME_RANGE: TimeRange = "24h";

export const RANGE_MINUTES: Record<TimeRange, number> = {
    "1h": 60,
    "6h": 360,
    "24h": 1_440,
    "7d": 10_080,
};

export const RANGE_LABELS: Record<TimeRange, string> = {
    "1h": "Son 1 saat",
    "6h": "Son 6 saat",
    "24h": "Son 24 saat",
    "7d": "Son 7 gün",
};

export function parseTimeRange(value: string | null | undefined): TimeRange {
    return (TIME_RANGES as readonly string[]).includes(value ?? "")
        ? (value as TimeRange)
        : DEFAULT_TIME_RANGE;
}

/** Aralığın başlangıç zamanı (ISO). */
export function rangeStartISO(range: TimeRange, now = new Date()): string {
    return new Date(now.getTime() - RANGE_MINUTES[range] * 60_000).toISOString();
}
