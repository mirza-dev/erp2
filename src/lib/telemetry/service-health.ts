import type { ServiceHealth } from "./health";
import type { AiHealth } from "@/lib/ai-health";
import type { BackgroundJobHealth } from "@/lib/supabase/developer-feed";

/**
 * Servis sağlığı satırları (§4).
 *
 * İki kural bu dosyanın şeklini belirledi:
 *   · "Mevcut mimariye göre GERÇEKTEN anlamlı servisleri göster" — bu yüzden
 *     Redis satırı `REDIS_URL` tanımsızken HİÇ üretilmez (bu kurulumda Redis
 *     opsiyonel ve fail-open); olmayan servisi yeşil/kırmızı göstermek yalan olurdu.
 *   · "Ölçülemiyorsa Not available" (§28) — ölçüm yoksa `unknown` + açıklama,
 *     asla varsayılan "healthy".
 *
 * Saf fonksiyon: tüm sondalar dışarıda çalışır, karar burada. Eşikler
 * adlandırılmış sabit.
 */

export const SERVICE_THRESHOLDS = {
    /** DB ping bu süreyi aşarsa degraded. */
    dbSlowMs: 1_000,
    /** Kuyrukta bekleyen en eski iş bu dakikayı aşarsa degraded / critical. */
    queueStaleMinutes: 30,
    queueStuckMinutes: 120,
    /** 5xx oranı eşikleri. */
    apiDegradedRate: 0.05,
    apiCriticalRate: 0.2,
    /** E-posta başarısızlık oranı eşiği. */
    emailFailureRate: 0.2,
} as const;

export interface ServiceHealthInput {
    /** `process.uptime()` — saniye. */
    uptimeSeconds: number;
    db: { ok: boolean; ms: number; error: string | null };
    /** Sonda patladıysa null → satır `unknown` olur, ASLA "0 bekleyen" (Y4). */
    jobs: BackgroundJobHealth | null;
    /** Sonda patladıysa null → e-posta/Paraşüt/arıza satırları `unknown` (Y4). */
    external: {
        emailFailures: number;
        emailTotal: number;
        openIncidents: number;
        lastIntegrationError: string | null;
    } | null;
    /** RUM'dan gelen istek sayıları; ölçüm yoksa null. */
    api: { total: number; serverErrors: number } | null;
    ai: AiHealth | null;
    env: {
        redisConfigured: boolean;
        sentryConfigured: boolean;
        parasutEnabled: boolean;
        resendConfigured: boolean;
    };
}

const NOT_MEASURED = "Ölçülmüyor";

export function buildServiceHealth(input: ServiceHealthInput): ServiceHealth[] {
    const services: ServiceHealth[] = [];

    // ── Uygulama ─────────────────────────────────────────────────────────
    services.push({
        key: "application",
        label: "Uygulama",
        status: "healthy",
        detail: `Çalışma süresi: ${formatUptime(input.uptimeSeconds)}`,
        essential: true,
    });

    // ── Veritabanı ───────────────────────────────────────────────────────
    services.push({
        key: "database",
        label: "Veritabanı",
        status: !input.db.ok
            ? "critical"
            : input.db.ms >= SERVICE_THRESHOLDS.dbSlowMs ? "degraded" : "healthy",
        detail: input.db.ok ? `${input.db.ms} ms` : (input.db.error ?? "Yanıt yok"),
        essential: true,
    });

    // ── API ──────────────────────────────────────────────────────────────
    if (!input.api || input.api.total === 0) {
        services.push({
            key: "api",
            label: "API",
            status: "unknown",
            detail: `${NOT_MEASURED} — bu pencerede istek ölçümü yok`,
            essential: false,
        });
    } else {
        const rate = input.api.serverErrors / input.api.total;
        services.push({
            key: "api",
            label: "API",
            status: rate >= SERVICE_THRESHOLDS.apiCriticalRate
                ? "critical"
                : rate >= SERVICE_THRESHOLDS.apiDegradedRate ? "degraded" : "healthy",
            detail: `${input.api.total} istek · %${(rate * 100).toFixed(1)} sunucu hatası`,
            essential: false,
        });
    }

    // ── Arka plan işleri ─────────────────────────────────────────────────
    services.push(buildJobsHealth(input.jobs));

    // ── Dış servisler (yalnız gerçekten kullanılanlar) ───────────────────
    services.push(buildEmailHealth(input.external, input.env.resendConfigured));

    services.push({
        key: "parasut",
        label: "Paraşüt",
        status: !input.env.parasutEnabled
            ? "unknown"
            : !input.external
                ? "unknown"
                : input.external.lastIntegrationError ? "degraded" : "healthy",
        detail: !input.env.parasutEnabled
            ? "Kapalı (PARASUT_ENABLED=false)"
            : !input.external
                ? `${NOT_MEASURED} — sonda çalışmadı`
                : input.external.lastIntegrationError ?? "Son pencerede hata yok",
        essential: false,
    });

    // ── Bakım / arıza ────────────────────────────────────────────────────
    // 2026-08 O4: `openIncidents` hesaplanıyordu ama hiçbir yerde OKUNMUYORDU
    // → açık bir bakım arızası varken panel bunu ne satırda ne genel durumda
    // gösteriyordu. Sorgunun maliyeti zaten ödeniyordu; karara bağlandı.
    services.push({
        key: "incidents",
        label: "Bakım / Arıza",
        status: !input.external
            ? "unknown"
            : input.external.openIncidents > 0 ? "degraded" : "healthy",
        detail: !input.external
            ? `${NOT_MEASURED} — sonda çalışmadı`
            : input.external.openIncidents > 0
                ? `${input.external.openIncidents} açık arıza kaydı`
                : "Açık arıza yok",
        essential: false,
    });

    services.push({
        key: "ai",
        label: "Anthropic AI",
        status: !input.ai ? "unknown" : input.ai.available ? "healthy" : "degraded",
        detail: !input.ai
            ? `${NOT_MEASURED} — sonda çalışmadı`
            : input.ai.available
                ? "Anahtar geçerli"
                : input.ai.reason === "no_key"
                    ? "Anahtar tanımlı değil"
                    : `Anahtar geçersiz (HTTP ${input.ai.status ?? "?"})`,
        essential: false,
    });

    services.push({
        key: "sentry",
        label: "Sentry",
        status: input.env.sentryConfigured ? "healthy" : "unknown",
        detail: input.env.sentryConfigured
            ? "DSN tanımlı — dış alarm katmanı etkin"
            : "DSN tanımsız — yalnız yerel telemetri",
        essential: false,
    });

    // Redis: yapılandırılmamışsa satır ÜRETİLMEZ (§4).
    if (input.env.redisConfigured) {
        services.push({
            key: "redis",
            label: "Redis (rate limit)",
            status: "unknown",
            detail: `${NOT_MEASURED} — durum yalnız istek anında biliniyor`,
            essential: false,
        });
    }

    return services;
}

function buildJobsHealth(jobs: BackgroundJobHealth | null): ServiceHealth {
    // Sonda okunamadıysa "0 bekleyen · sağlıklı" DEMEZ (Y4) — kuyruk taşıyor
    // olabilir ve panel bunu bilmiyordur.
    if (!jobs) {
        return {
            key: "jobs",
            label: "Arka Plan İşleri",
            status: "unknown",
            detail: `${NOT_MEASURED} — kuyruk sondası okunamadı`,
            essential: false,
        };
    }
    const parts: string[] = [`${jobs.queued} bekleyen`];
    if (jobs.failed > 0) parts.push(`${jobs.failed} başarısız`);
    if (jobs.oldestQueuedMinutes !== null) parts.push(`en eski ${jobs.oldestQueuedMinutes} dk`);

    let status: ServiceHealth["status"] = "healthy";
    if (jobs.failed > 0) status = "degraded";
    if (jobs.oldestQueuedMinutes !== null) {
        if (jobs.oldestQueuedMinutes >= SERVICE_THRESHOLDS.queueStuckMinutes) status = "critical";
        else if (jobs.oldestQueuedMinutes >= SERVICE_THRESHOLDS.queueStaleMinutes) status = "degraded";
    }

    return {
        key: "jobs",
        label: "Arka Plan İşleri",
        status,
        // Cron GitHub Actions'ta koşuyor; "job ayakta mı" DOLAYLI ölçülür —
        // son etkinin zamanı. Panelde bu ayrım yazılı.
        detail: parts.join(" · "),
        essential: false,
    };
}

function buildEmailHealth(
    external: ServiceHealthInput["external"],
    resendConfigured: boolean,
): ServiceHealth {
    if (external === null) {
        return {
            key: "email",
            label: "E-posta (Resend)",
            status: "unknown",
            detail: `${NOT_MEASURED} — teslimat sondası okunamadı`,
            essential: false,
        };
    }
    if (!resendConfigured) {
        return {
            key: "email",
            label: "E-posta (Resend)",
            status: "unknown",
            detail: "RESEND_API_KEY tanımsız — gönderim kapalı",
            essential: false,
        };
    }
    if (external.emailTotal === 0) {
        return {
            key: "email",
            label: "E-posta (Resend)",
            status: "healthy",
            detail: "Bu pencerede gönderim yok",
            essential: false,
        };
    }
    const rate = external.emailFailures / external.emailTotal;
    return {
        key: "email",
        label: "E-posta (Resend)",
        status: rate >= SERVICE_THRESHOLDS.emailFailureRate ? "degraded" : "healthy",
        detail: `${external.emailTotal} gönderim · ${external.emailFailures} başarısız`,
        essential: false,
    };
}

/** "3g 4sa 12dk" — panelde okunur çalışma süresi. */
export function formatUptime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return NOT_MEASURED;
    const d = Math.floor(seconds / 86_400);
    const h = Math.floor((seconds % 86_400) / 3_600);
    const m = Math.floor((seconds % 3_600) / 60);
    if (d > 0) return `${d}g ${h}sa ${m}dk`;
    if (h > 0) return `${h}sa ${m}dk`;
    return `${m}dk`;
}

/** Env sondaları — sır DEĞERİ hiç okunmaz, yalnız varlığı. */
export function readServiceEnv(): ServiceHealthInput["env"] {
    return {
        redisConfigured: !!process.env.REDIS_URL,
        sentryConfigured: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
        parasutEnabled: process.env.PARASUT_ENABLED === "true",
        resendConfigured: !!process.env.RESEND_API_KEY,
    };
}
