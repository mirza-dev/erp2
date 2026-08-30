/**
 * Developer Console §3, §4 — sağlık kararı ve servis satırları.
 *
 * Şart açıktı: "Bu değer hard-coded olmamalı." Testler kararın GERÇEKTEN
 * girdiye bağlı olduğunu ve eşiklerin iki yanını da doğrular. Ayrıca §28'in
 * karşılığı: ölçüm yoksa `unknown` + "Ölçülmüyor", sessizce "healthy" değil.
 */
import { describe, it, expect } from "vitest";
import {
    DEFAULT_TIME_RANGE,
    HEALTH_THRESHOLDS,
    HEALTH_WINDOW_MINUTES,
    RANGE_MINUTES,
    TIME_RANGES,
    computeOverallHealth,
    parseTimeRange,
    rangeStartISO,
    statusRank,
    worstStatus,
    type ServiceHealth,
} from "@/lib/telemetry/health";
import {
    SERVICE_THRESHOLDS,
    buildServiceHealth,
    formatUptime,
    type ServiceHealthInput,
} from "@/lib/telemetry/service-health";

const svc = (over: Partial<ServiceHealth> = {}): ServiceHealth => ({
    key: "x", label: "X", status: "healthy", detail: null, essential: false, ...over,
});

const healthy = {
    services: [svc({ key: "database", label: "Veritabanı", essential: true })],
    recentCriticalErrors: 0,
    recentErrors: 0,
    // 2026-08 Y3: bu oran artık YALNIZ 5xx'i temsil eder (4xx sağlık kararına
    // girmiyor); eşik anlamı değişmedi.
    errorRate: 0,
    // 2026-08 Y4: telemetri okunabildi mi. `false` → panel ASLA healthy demez.
    telemetryReadable: true,
    // 2026-08 Y5: RUM oranı sunucu kaydıyla doğrulandı mı.
    errorRateCorroborated: true,
};

describe("computeOverallHealth — karar sırası", () => {
    it("her şey yolundaysa healthy", () => {
        const out = computeOverallHealth(healthy);
        expect(out.status).toBe("healthy");
        expect(out.reason).toContain(String(HEALTH_WINDOW_MINUTES));
    });

    it("zorunlu servis çökmüşse critical — gerekçe servisi adlandırır", () => {
        const out = computeOverallHealth({
            ...healthy,
            services: [svc({ label: "Veritabanı", status: "critical", essential: true })],
        });
        expect(out.status).toBe("critical");
        expect(out.reason).toContain("Veritabanı");
    });

    it("tek kritik hata bile critical yapar", () => {
        expect(computeOverallHealth({ ...healthy, recentCriticalErrors: 1 }).status).toBe("critical");
    });

    it("hata oranı kritik eşiği geçerse critical", () => {
        expect(computeOverallHealth({
            ...healthy, errorRate: HEALTH_THRESHOLDS.criticalErrorRate,
        }).status).toBe("critical");
    });

    it("hata oranı degraded eşiğinde degraded, altında healthy", () => {
        expect(computeOverallHealth({
            ...healthy, errorRate: HEALTH_THRESHOLDS.degradedErrorRate,
        }).status).toBe("degraded");
        expect(computeOverallHealth({
            ...healthy, errorRate: HEALTH_THRESHOLDS.degradedErrorRate - 0.001,
        }).status).toBe("healthy");
    });

    it("zorunlu servis okunamadıysa degraded (sessizce healthy DEĞİL)", () => {
        const out = computeOverallHealth({
            ...healthy,
            services: [svc({ label: "Veritabanı", status: "unknown", essential: true })],
        });
        expect(out.status).toBe("degraded");
    });

    it("zorunlu olmayan servis bozuksa degraded", () => {
        const out = computeOverallHealth({
            ...healthy,
            services: [
                svc({ key: "database", essential: true }),
                svc({ label: "E-posta", status: "degraded", detail: "3 başarısız" }),
            ],
        });
        expect(out.status).toBe("degraded");
        expect(out.reason).toContain("E-posta");
    });

    it("hata SAYISI eşiği oran ölçülemediğinde de çalışır", () => {
        const out = computeOverallHealth({
            ...healthy,
            errorRate: null,
            recentErrors: HEALTH_THRESHOLDS.degradedErrorCount,
        });
        expect(out.status).toBe("degraded");
    });

    it("ölçüm yokken (errorRate null, hata yok) healthy kalır", () => {
        expect(computeOverallHealth({ ...healthy, errorRate: null }).status).toBe("healthy");
    });

    it("eşikler adlandırılmış sabit — UI'da hard-code değil", () => {
        expect(HEALTH_THRESHOLDS.degradedErrorRate).toBeGreaterThan(0);
        expect(HEALTH_THRESHOLDS.criticalErrorRate)
            .toBeGreaterThan(HEALTH_THRESHOLDS.degradedErrorRate);
    });
});

describe("durum sıralaması", () => {
    it("kötüden iyiye sıralanır", () => {
        expect(statusRank("healthy")).toBeLessThan(statusRank("unknown"));
        expect(statusRank("unknown")).toBeLessThan(statusRank("degraded"));
        expect(statusRank("degraded")).toBeLessThan(statusRank("critical"));
    });

    it("worstStatus kötü olanı seçer", () => {
        expect(worstStatus("healthy", "degraded")).toBe("degraded");
        expect(worstStatus("critical", "degraded")).toBe("critical");
    });
});

describe("zaman aralığı", () => {
    it("varsayılan 24 saat (§3)", () => {
        expect(DEFAULT_TIME_RANGE).toBe("24h");
        expect(parseTimeRange(null)).toBe("24h");
        expect(parseTimeRange("uydurma")).toBe("24h");
    });

    it("dört aralık desteklenir", () => {
        expect(TIME_RANGES).toEqual(["1h", "6h", "24h", "7d"]);
        for (const r of TIME_RANGES) expect(parseTimeRange(r)).toBe(r);
    });

    it("başlangıç zamanı aralığa göre geriye gider", () => {
        const now = new Date("2026-08-30T12:00:00.000Z");
        expect(rangeStartISO("1h", now)).toBe("2026-08-30T11:00:00.000Z");
        expect(rangeStartISO("7d", now)).toBe("2026-08-23T12:00:00.000Z");
        expect(RANGE_MINUTES["7d"]).toBe(10_080);
    });
});

// ── Servis satırları ─────────────────────────────────────────────────────

const baseInput = (): ServiceHealthInput => ({
    uptimeSeconds: 3_600,
    db: { ok: true, ms: 40, error: null },
    jobs: { queued: 0, failed: 0, oldestQueuedMinutes: null, lastCompletedAt: null, lastCronEffectAt: null },
    external: { emailFailures: 0, emailTotal: 0, openIncidents: 0, lastIntegrationError: null },
    api: null,
    ai: null,
    env: {
        redisConfigured: false,
        sentryConfigured: true,
        parasutEnabled: false,
        resendConfigured: true,
    },
});

const find = (rows: ServiceHealth[], key: string) => rows.find(r => r.key === key);

describe("buildServiceHealth — yalnız gerçekten var olan servisler (§4)", () => {
    it("REDIS_URL yoksa Redis satırı HİÇ üretilmez", () => {
        expect(find(buildServiceHealth(baseInput()), "redis")).toBeUndefined();
    });

    it("REDIS_URL varsa satır belirir", () => {
        const input = baseInput();
        input.env.redisConfigured = true;
        expect(find(buildServiceHealth(input), "redis")).toBeDefined();
    });

    it("uygulama ve veritabanı zorunlu (essential) işaretlidir", () => {
        const rows = buildServiceHealth(baseInput());
        expect(find(rows, "application")?.essential).toBe(true);
        expect(find(rows, "database")?.essential).toBe(true);
        expect(find(rows, "email")?.essential).toBe(false);
    });
});

describe("buildServiceHealth — veritabanı", () => {
    it("hızlı yanıt healthy, yavaş yanıt degraded, yanıtsız critical", () => {
        const fast = baseInput();
        expect(find(buildServiceHealth(fast), "database")?.status).toBe("healthy");

        const slow = baseInput();
        slow.db.ms = SERVICE_THRESHOLDS.dbSlowMs;
        expect(find(buildServiceHealth(slow), "database")?.status).toBe("degraded");

        const down = baseInput();
        down.db = { ok: false, ms: 5, error: "connection refused" };
        const row = find(buildServiceHealth(down), "database");
        expect(row?.status).toBe("critical");
        expect(row?.detail).toContain("connection refused");
    });
});

describe("buildServiceHealth — API (§28 Not available)", () => {
    it("ölçüm yoksa unknown + 'Ölçülmüyor'", () => {
        const row = find(buildServiceHealth(baseInput()), "api");
        expect(row?.status).toBe("unknown");
        expect(row?.detail).toContain("Ölçülmüyor");
    });

    it("5xx oranına göre derecelenir", () => {
        const ok = baseInput();
        ok.api = { total: 100, serverErrors: 0 };
        expect(find(buildServiceHealth(ok), "api")?.status).toBe("healthy");

        const deg = baseInput();
        deg.api = { total: 100, serverErrors: 5 };
        expect(find(buildServiceHealth(deg), "api")?.status).toBe("degraded");

        const crit = baseInput();
        crit.api = { total: 100, serverErrors: 20 };
        expect(find(buildServiceHealth(crit), "api")?.status).toBe("critical");
    });
});

describe("buildServiceHealth — arka plan işleri", () => {
    it("boş kuyruk healthy", () => {
        expect(find(buildServiceHealth(baseInput()), "jobs")?.status).toBe("healthy");
    });

    it("başarısız iş degraded yapar", () => {
        const input = baseInput();
        input.jobs.failed = 2;
        const row = find(buildServiceHealth(input), "jobs");
        expect(row?.status).toBe("degraded");
        expect(row?.detail).toContain("2 başarısız");
    });

    it("uzun bekleyen iş tıkanma sayılır", () => {
        const stale = baseInput();
        stale.jobs.oldestQueuedMinutes = SERVICE_THRESHOLDS.queueStaleMinutes;
        expect(find(buildServiceHealth(stale), "jobs")?.status).toBe("degraded");

        const stuck = baseInput();
        stuck.jobs.oldestQueuedMinutes = SERVICE_THRESHOLDS.queueStuckMinutes;
        expect(find(buildServiceHealth(stuck), "jobs")?.status).toBe("critical");
    });
});

describe("buildServiceHealth — dış servisler", () => {
    it("Paraşüt kapalıysa 'kapalı' der, hata demez", () => {
        const row = find(buildServiceHealth(baseInput()), "parasut");
        expect(row?.status).toBe("unknown");
        expect(row?.detail).toContain("Kapalı");
    });

    it("Paraşüt açık ve hata varsa degraded", () => {
        const input = baseInput();
        input.env.parasutEnabled = true;
        input.external.lastIntegrationError = "429 rate limited";
        const row = find(buildServiceHealth(input), "parasut");
        expect(row?.status).toBe("degraded");
        expect(row?.detail).toContain("429");
    });

    it("AI sondası yoksa unknown, geçersiz anahtarda degraded", () => {
        expect(find(buildServiceHealth(baseInput()), "ai")?.status).toBe("unknown");

        const bad = baseInput();
        bad.ai = { available: false, reason: "auth_failed", status: 401 };
        const row = find(buildServiceHealth(bad), "ai");
        expect(row?.status).toBe("degraded");
        expect(row?.detail).toContain("401");
    });

    it("e-posta başarısızlık oranı eşiği aşarsa degraded", () => {
        const input = baseInput();
        input.external = { emailFailures: 3, emailTotal: 10, openIncidents: 0, lastIntegrationError: null };
        expect(find(buildServiceHealth(input), "email")?.status).toBe("degraded");
    });

    it("Resend anahtarı yoksa unknown — gönderim yapılandırılmamış", () => {
        const input = baseInput();
        input.env.resendConfigured = false;
        const row = find(buildServiceHealth(input), "email");
        expect(row?.status).toBe("unknown");
        expect(row?.detail).toContain("RESEND_API_KEY");
    });

    it("Sentry DSN durumu bildirilir — mevcut sistem korunuyor", () => {
        expect(find(buildServiceHealth(baseInput()), "sentry")?.status).toBe("healthy");
        const off = baseInput();
        off.env.sentryConfigured = false;
        expect(find(buildServiceHealth(off), "sentry")?.status).toBe("unknown");
    });
});

describe("formatUptime", () => {
    it("gün/saat/dakika biçimler", () => {
        expect(formatUptime(90)).toBe("1dk");
        expect(formatUptime(3_600 * 5 + 60)).toBe("5sa 1dk");
        expect(formatUptime(86_400 * 3 + 3_600 * 4)).toBe("3g 4sa 0dk");
    });

    it("geçersiz değer 'Ölçülmüyor'", () => {
        expect(formatUptime(Number.NaN)).toBe("Ölçülmüyor");
        expect(formatUptime(-1)).toBe("Ölçülmüyor");
    });
});

/**
 * 2026-08 Y4 — panelin en tehlikeli davranışı: kör olduğunda yeşil göstermek.
 * Sonda patlayınca sayaçlar sıfıra düşüyordu ve `computeOverallHealth` bunu
 * "kritik olay yok" diye okuyup "healthy" diyordu.
 */
describe("telemetri okunamadığında (Y4)", () => {
    it("sayaçlar null iken ASLA healthy demez", () => {
        const out = computeOverallHealth({
            ...healthy,
            recentCriticalErrors: null,
            recentErrors: null,
            errorRate: null,
            telemetryReadable: false,
        });
        expect(out.status).toBe("degraded");
        expect(out.reason).toContain("okunamadı");
    });

    it("okunamayan telemetri, ÇÖKMÜŞ zorunlu servisin önüne geçmez", () => {
        const out = computeOverallHealth({
            ...healthy,
            services: [svc({ label: "Veritabanı", status: "critical", essential: true })],
            telemetryReadable: false,
        });
        expect(out.status).toBe("critical");
        expect(out.reason).toContain("Veritabanı");
    });

    it("okunabilir telemetride sıfır sayaç healthy kalır (regresyon değil)", () => {
        expect(computeOverallHealth(healthy).status).toBe("healthy");
    });
});

/**
 * 2026-08 Y5 — `errorRate` istemci bildirimi olan RUM'dan gelir ve ingest ucu
 * `view_dashboard` taşıyan HER role açıktır. Sunucu kaydı doğrulamıyorsa tek
 * bir kullanıcının sahte 5xx yüklemesi paneli "Kritik"e çevirmemeli.
 */
describe("RUM oranının doğrulanması (Y5)", () => {
    it("doğrulanmamış yüksek oran critical DEĞİL degraded üretir", () => {
        const out = computeOverallHealth({
            ...healthy, errorRate: 0.9, errorRateCorroborated: false,
        });
        expect(out.status).toBe("degraded");
        expect(out.reason).toContain("doğrulanmadı");
    });

    it("sunucu kaydıyla doğrulanmış yüksek oran critical üretir", () => {
        const out = computeOverallHealth({
            ...healthy, errorRate: 0.9, errorRateCorroborated: true,
        });
        expect(out.status).toBe("critical");
    });
});
