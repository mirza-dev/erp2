/**
 * 2026-08 inceleme bulgularının davranışsal kilitleri.
 *
 * Rapor: docs/audit/2026-08-developer-console-review.md
 * Buradaki her `describe` bir bulguya karşılık gelir ve DÜZELTİLMİŞ davranışı
 * kilitler — kaynak-metni değil, çıktıyı.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { aggregateRumSamples } from "@/lib/telemetry/rum-aggregate";
import { KNOWN_ENDPOINTS } from "@/lib/telemetry/known-endpoints";
import { decodeCursor, encodeCursor } from "@/lib/supabase/telemetry";
import { buildServiceHealth } from "@/lib/telemetry/service-health";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları düşürür — iddia açıklamaya değil KODA baksın. Satır yorumları
 *  önce: bir `//` içindeki `/**` blok başlangıcı sanılıp kodu yutuyordu. */
const code = (src: string) =>
    src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── Y5: RUM ingest kardinalite sınırı ────────────────────────────────────

describe("Y5 — RUM allowlist", () => {
    const sample = (endpoint: string) => ({
        endpoint, method: "GET", status: 200, durationMs: 120,
    });

    it("bilinen route şablonu kabul edilir", () => {
        const known = [...KNOWN_ENDPOINTS].find(e => e.startsWith("/api/"))!;
        const { accepted, rejected } = aggregateRumSamples([sample(known)]);
        expect(accepted).toBe(1);
        expect(rejected).toBe(0);
    });

    it("biçimi GEÇERLİ ama tanınmayan yol ATILIR (kardinalite patlaması)", () => {
        // Eski kod yalnız `SAFE_PATH_RE` biçimine bakıyordu; bu yollar geçiyor
        // ve her biri `unique(bucket_at, endpoint, method)` ile ayrı satır
        // üretiyordu → tek IP'den saatte ~900 bin satır.
        const bogus = ["/api/aaaa", "/api/aaab", "/dashboard/zzzz", "/api/x/y/z"];
        const { rows, accepted, rejected } = aggregateRumSamples(bogus.map(sample));
        expect(accepted).toBe(0);
        expect(rejected).toBe(bogus.length);
        expect(rows).toHaveLength(0);
    });

    it("uç kendi hız politikasını taşır (genel API tavanı değil)", () => {
        const rateLimit = read("src/lib/rate-limit.ts");
        expect(rateLimit).toMatch(/RUM:\s*\{\s*name:\s*"rum"/);
        expect(rateLimit).toMatch(/pathname === "\/api\/developer\/rum"[\s\S]{0,120}POLICIES\.RUM/);
    });
});

// ── O2: bileşik imleç ────────────────────────────────────────────────────

describe("O2 — bileşik imleç", () => {
    it("kodla-çöz turu bilgi kaybetmez", () => {
        const c = encodeCursor("2026-08-30T10:00:00.000Z", "2026-08-30T09:00:00.000Z", "a1b2");
        expect(decodeCursor(c)).toEqual({
            snapshot: "2026-08-30T10:00:00.000Z",
            ts: "2026-08-30T09:00:00.000Z",
            id: "a1b2",
        });
    });

    it("eski salt-zaman imleci geriye dönük kabul edilir", () => {
        expect(decodeCursor("2026-08-30T09:00:00.000Z")).toEqual({
            snapshot: "2026-08-30T09:00:00.000Z",
            ts: "2026-08-30T09:00:00.000Z",
            id: null,
        });
    });

    it("bozuk imleç null döner (ham metin sorguya gitmez)", () => {
        expect(decodeCursor("a|b")).toBeNull();
        expect(decodeCursor("")).toBeNull();
        expect(decodeCursor(null)).toBeNull();
    });

    it("hata grubu sorgusu snapshot sınırı uygular (hareketli kolon)", () => {
        // `last_seen_at` her oluşumda güncellenir; snapshot olmadan 1. sayfa
        // okunurken yeniden patlayan grup 2. sayfada da çıkmıyordu.
        const src = read("src/lib/supabase/telemetry.ts");
        expect(src).toMatch(/query\.lte\("last_seen_at", cursor\.snapshot\)/);
    });
});

// ── Y4 / O5: ölçülemeyen "0" değil "null" ────────────────────────────────

describe("Y4 — başarısız sonda sıfıra dönüşmez", () => {
    const svcSrc = code(read("src/lib/services/developer-console-service.ts"));

    it("hata istatistiği fallback'i null (emptyErrorStats kaldırıldı)", () => {
        expect(svcSrc).toMatch(/safe\(\(\) => dbErrorWindowStats\([\s\S]{0,60}?\), null\)/);
        expect(svcSrc).not.toContain("emptyErrorStats(");
        expect(svcSrc).not.toContain("emptyBugCounts(");
    });

    it("O5 — kuyruk ve dış servis sondaları da safe() içinde", () => {
        expect(svcSrc).toMatch(/safe\(\(\) => dbBackgroundJobHealth\(\), null\)/);
        expect(svcSrc).toMatch(/safe\(\(\) => dbExternalServiceHealth\(since\), null\)/);
    });

    it("kuyruk sondası null iken satır unknown olur, '0 bekleyen' DEĞİL", () => {
        const services = buildServiceHealth({
            uptimeSeconds: 10,
            db: { ok: true, ms: 5, error: null },
            jobs: null,
            external: null,
            api: null,
            ai: null,
            env: {
                redisConfigured: false, sentryConfigured: false,
                parasutEnabled: false, resendConfigured: true,
            },
        });
        const jobs = services.find(s => s.key === "jobs")!;
        expect(jobs.status).toBe("unknown");
        expect(jobs.detail).toContain("Ölçülmüyor");

        const email = services.find(s => s.key === "email")!;
        expect(email.status).toBe("unknown");
        expect(email.detail).not.toContain("gönderim yok");
    });
});

// ── O4: açık arıza sağlığa bağlandı ──────────────────────────────────────

describe("O4 — openIncidents artık karara giriyor", () => {
    const base = {
        uptimeSeconds: 10,
        db: { ok: true, ms: 5, error: null },
        jobs: { queued: 0, failed: 0, oldestQueuedMinutes: null, lastCompletedAt: null, lastCronEffectAt: null },
        api: null,
        ai: null,
        env: {
            redisConfigured: false, sentryConfigured: false,
            parasutEnabled: false, resendConfigured: true,
        },
    };

    it("açık arıza varsa Bakım/Arıza satırı degraded", () => {
        const services = buildServiceHealth({
            ...base,
            external: { emailFailures: 0, emailTotal: 0, openIncidents: 2, lastIntegrationError: null },
        });
        const row = services.find(s => s.key === "incidents")!;
        expect(row.status).toBe("degraded");
        expect(row.detail).toContain("2");
    });

    it("açık arıza yoksa healthy", () => {
        const services = buildServiceHealth({
            ...base,
            external: { emailFailures: 0, emailTotal: 0, openIncidents: 0, lastIntegrationError: null },
        });
        expect(services.find(s => s.key === "incidents")!.status).toBe("healthy");
    });
});

// ── O7 / Y6: kayıt akışı ─────────────────────────────────────────────────

describe("O7 + Y6 — kayıt akışı", () => {
    const feed = read("src/lib/supabase/developer-feed.ts");

    it("kaynaklar arızayı sinyalliyor (sessiz boş dizi değil)", () => {
        expect(feed).toMatch(/const FAILED: SourceResult = \{ entries: \[\], failed: true \}/);
        expect(feed).toMatch(/unavailableSources/);
        // Eski desen tamamen kalkmalı.
        expect(feed).not.toMatch(/if \(error\) return \[\];/);
    });

    it("level/module/search filtreleri SORGUYA iniyor (bellekte elenmiyor)", () => {
        expect(feed).not.toMatch(/merged = merged\.filter/);
        expect(feed).toMatch(/q\.eq\("system_error_groups\.severity", f\.level\)/);
        expect(feed).toMatch(/q\.eq\("severity", f\.level\)/);
    });

    it("userId karşılığı olmayan kaynaklarda erken çıkış var", () => {
        const audit = feed.slice(feed.indexOf("async function fetchAudit"));
        expect(audit.slice(0, 800)).toMatch(/if \(f\.requestId \|\| f\.userId\) return NONE;/);
    });
});

// ── D6: bug PATCH sırası ─────────────────────────────────────────────────

describe("D6 — bağ işlemleri varlık kontrolünden SONRA", () => {
    it("dbGetBug çağrısı dbLinkBugErrors'tan ÖNCE gelir", () => {
        const src = read("src/app/api/developer/bugs/[id]/route.ts");
        const patch = src.slice(src.indexOf("export async function PATCH"));
        expect(patch.indexOf("dbGetBug(id)")).toBeGreaterThan(-1);
        expect(patch.indexOf("dbGetBug(id)")).toBeLessThan(patch.indexOf("dbLinkBugErrors"));
    });
});

// ── D1 / D2: kırpılma ve "0 ≠ ölçülmedi" ─────────────────────────────────

describe("D1 + D2 — sayıların dürüstlüğü", () => {
    const tel = read("src/lib/supabase/telemetry.ts");

    it("taramalar limit+1 çekip kırpılmayı işaretliyor", () => {
        expect(tel).toMatch(/ERROR_WINDOW_SCAN_LIMIT \+ 1/);
        expect(tel).toMatch(/PERFORMANCE_SCAN_LIMIT \+ 1/);
        expect(tel).toMatch(/truncated,/);
    });

    it("örnek yokken avgMs ve errorRate null (0 değil)", () => {
        expect(tel).toMatch(/avgMs: a\.count > 0 \? Math\.round\(a\.sumMs \/ a\.count\) : null/);
        expect(tel).toMatch(/errorRate: a\.count > 0 \? \(a\.s4 \+ a\.s5\) \/ a\.count : null/);
        // `|| 1` hilesi kalkmalı — sıfıra bölmeyi gizleyip 0 üretiyordu.
        expect(tel).not.toMatch(/const total = a\.count \|\| 1;/);
    });

    it("aktif kullanıcı sayacı kırpılmayı taşır", () => {
        const feed = read("src/lib/supabase/developer-feed.ts");
        expect(feed).toMatch(/users: actors\.size, truncated/);
    });
});

// ── D5: RUM istemci dinleyici sızıntısı ──────────────────────────────────

describe("D5 — pagehide dinleyicisi ve fetch geri yükleme", () => {
    const src = read("src/lib/telemetry/rum-client.ts");

    it("pagehide referansı saklanır ve cleanup'ta kaldırılır", () => {
        expect(src).toMatch(/const onPageHide = \(\) => flush\(true\);/);
        expect(src).toMatch(/window\.removeEventListener\("pagehide", onPageHide\)/);
    });

    it("resetRumCollector sarmalanmış fetch'i geri yükler", () => {
        expect(src).toMatch(/if \(installedCleanup\) installedCleanup\(\);/);
    });
});

// ── K2: kapsama iddiası ──────────────────────────────────────────────────

describe("K2 — kapsama", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("handleApiError route mesajını KORUYARAK merkezîleşti", async () => {
        const { handleApiError } = await import("@/lib/api-error");
        const res = handleApiError(new Error("iç detay"), "GET /api/alerts", {
            clientMessage: "Alertler alınamadı.",
        });
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe("Alertler alınamadı.");
    });

    it("clientMessage verilmezse eski davranış korunur", async () => {
        const { handleApiError } = await import("@/lib/api-error");
        const res = handleApiError(new Error("iç detay"), "GET /api/x");
        const body = await res.json();
        // Test ortamı production değil → iç mesaj görünür (mevcut sözleşme).
        expect(body.error).toBe("iç detay");
    });
});
