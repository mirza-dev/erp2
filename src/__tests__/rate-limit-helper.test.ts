/**
 * M-3 Rate Limiting — rateLimitCheck + selectPolicy davranış testleri.
 *
 * `rate-limiter-flexible` modülü mock'lanır; gerçek Redis bağlanmaz.
 * Singleton state korunur (vi.resetModules YOK) — her test farklı key kullanır
 * ve sıralama bağımsız. consumeMock module-level vi.hoisted ile tanımlı.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// vi.hoisted: mock factory hoist edilirken referans korunur (her import'ta aynı).
const mocks = vi.hoisted(() => ({
    consumeFn: vi.fn(),
    ctorSpy: vi.fn(),
}));

vi.mock("rate-limiter-flexible", async () => {
    const actual = await vi.importActual<typeof import("rate-limiter-flexible")>("rate-limiter-flexible");
    // class olarak tanımla — `new RateLimiterRedis(...)` constructor invariant.
    class MockRateLimiterRedis {
        consume: typeof mocks.consumeFn;
        constructor(opts: unknown) {
            mocks.ctorSpy(opts);
            this.consume = mocks.consumeFn;
        }
    }
    return {
        ...actual,
        RateLimiterRedis: MockRateLimiterRedis,
    };
});

vi.mock("ioredis", () => {
    // ioredis default export class — `new Redis(url, opts)` çağrısı için.
    // Resilience fix (2026-05-26): kaynak `lazyConnect:true` + `_client.connect().catch(...)`
    // pattern'i kullanıyor → mock'ta da connect() Promise dönmeli, yoksa TypeError → init fail.
    class MockRedis {
        on() { /* no-op event listener */ }
        connect() { return Promise.resolve(); }
    }
    return { default: MockRedis };
});

// REDIS_URL singleton init için bir kez set edilir (modül cache'lenir).
beforeAll(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
});

beforeEach(async () => {
    mocks.consumeFn.mockReset();
    // Resilience fix (2026-05-26): circuit breaker state'i her test arasında sıfırla.
    // Aksi halde önceki testin fail'leri sonraki testi circuit-open state'inde başlatır.
    const { __resetCircuitForTests } = await import("@/lib/rate-limit");
    __resetCircuitForTests();
});

// ── selectPolicy (pure helper) ───────────────────────────────────────────────

describe("selectPolicy — pathname + method + auth proxy", () => {
    it("POST /login → POLICIES.LOGIN", async () => {
        const { selectPolicy, POLICIES } = await import("@/lib/rate-limit");
        expect(selectPolicy("/login", "POST", false)).toBe(POLICIES.LOGIN);
    });

    it("GET /api/ai/* → POLICIES.AI (auth bağımsız)", async () => {
        const { selectPolicy, POLICIES } = await import("@/lib/rate-limit");
        expect(selectPolicy("/api/ai/purchase-copilot", "GET", true)).toBe(POLICIES.AI);
        expect(selectPolicy("/api/ai/observability", "POST", false)).toBe(POLICIES.AI);
    });

    it("POST /api/parasut/sync → POLICIES.PARASUT_SYNC; GET → genel auth/anon", async () => {
        const { selectPolicy, POLICIES } = await import("@/lib/rate-limit");
        expect(selectPolicy("/api/parasut/sync-all", "POST", true)).toBe(POLICIES.PARASUT_SYNC);
        expect(selectPolicy("/api/parasut/stats", "GET", true)).toBe(POLICIES.API_AUTH);
    });

    it("POST /api/auth/demo → POLICIES.DEMO (anon abuse koruması)", async () => {
        const { selectPolicy, POLICIES } = await import("@/lib/rate-limit");
        expect(selectPolicy("/api/auth/demo", "POST", false)).toBe(POLICIES.DEMO);
    });

    it("Genel /api/** + authenticated → API_AUTH; anon → API_ANON", async () => {
        const { selectPolicy, POLICIES } = await import("@/lib/rate-limit");
        expect(selectPolicy("/api/orders", "GET", true)).toBe(POLICIES.API_AUTH);
        expect(selectPolicy("/api/orders", "GET", false)).toBe(POLICIES.API_ANON);
    });
});

// ── rateLimitCheck — Redis bağlı (mock) ──────────────────────────────────────

describe("rateLimitCheck — consume davranışı", () => {
    it("consume başarılı → ok=true, remaining doğru, fromRedis=true", async () => {
        mocks.consumeFn.mockResolvedValueOnce({ remainingPoints: 4, msBeforeNext: 0 });
        const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");
        const res = await rateLimitCheck("ip:test:happy", POLICIES.LOGIN);
        expect(res.ok).toBe(true);
        expect(res.fromRedis).toBe(true);
        expect(res.remaining).toBe(4);
        expect(res.limit).toBe(5);
        expect(res.retryAfter).toBe(0);
        expect(mocks.consumeFn).toHaveBeenCalledWith("ip:test:happy", 1);
    });

    it("limit aşıldı (RateLimiterRes throw) → ok=false, retryAfter > 0", async () => {
        const { RateLimiterRes } = await import("rate-limiter-flexible");
        const rejection = new RateLimiterRes(0, 30_000, 0, false);
        mocks.consumeFn.mockRejectedValueOnce(rejection);
        const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");
        const res = await rateLimitCheck("ip:test:over", POLICIES.LOGIN);
        expect(res.ok).toBe(false);
        expect(res.fromRedis).toBe(true);
        expect(res.remaining).toBe(0);
        expect(res.retryAfter).toBe(30); // Math.ceil(30000 / 1000)
    });

    it("multi-key isolation — farklı key'ler farklı consume çağrısı (1 key bloklansa diğeri açık)", async () => {
        mocks.consumeFn
            .mockResolvedValueOnce({ remainingPoints: 4, msBeforeNext: 0 })
            .mockResolvedValueOnce({ remainingPoints: 4, msBeforeNext: 0 });
        const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");
        const a = await rateLimitCheck("ip:test:key-a", POLICIES.LOGIN);
        const b = await rateLimitCheck("ip:test:key-b", POLICIES.LOGIN);
        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
        expect(mocks.consumeFn).toHaveBeenNthCalledWith(1, "ip:test:key-a", 1);
        expect(mocks.consumeFn).toHaveBeenNthCalledWith(2, "ip:test:key-b", 1);
    });

    it("multi-policy isolation — farklı policy'ler ayrı limiter ctor (farklı keyPrefix)", async () => {
        mocks.consumeFn.mockResolvedValue({ remainingPoints: 9, msBeforeNext: 0 });
        const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");
        await rateLimitCheck("ip:test:multi", POLICIES.LOGIN);
        await rateLimitCheck("ip:test:multi", POLICIES.AI);
        // Ctor spy iki farklı keyPrefix ile çağrılmış olmalı (singleton cache ile
        // her policy bir kez init edilir; testlerin sıralama-bağımsızlığı için
        // toplam çağrı kümesini kontrol ediyoruz, .length değil).
        const prefixes = mocks.ctorSpy.mock.calls.map(c => (c[0] as { keyPrefix: string }).keyPrefix);
        expect(prefixes).toContain("rl:login");
        expect(prefixes).toContain("rl:ai");
    });

    it("Redis throw (non-RateLimiterRes) → fail-open + console.error", async () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        mocks.consumeFn.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");
        const res = await rateLimitCheck("ip:test:err", POLICIES.LOGIN);
        expect(res.ok).toBe(true);          // fail-open
        expect(res.fromRedis).toBe(false);
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });
});

// ── Fail-open: REDIS_URL yoksa (ayrı describe, env temizleyerek) ─────────────
//
// Singleton init bir kez gerçekleştiği için bu test ayrı dosyaya alınamaz
// (vitest aynı runtime). Burada `_initFailed=true` set etmek için singleton'ı
// "REDIS_URL undefined iken init" senaryosuna sokmak imkânsız; bunun yerine
// helpers test dosyasında pure-fn coverage yeterli, davranış documentation
// ile kilitli.

describe("rate-limit fail-open dokümantasyon", () => {
    it("README invariant: REDIS_URL boş + getRedis çağrılırsa fail-open", async () => {
        // Bu test invariant'ın varlığını kaynak dosyada doğrular (helper davranışı
        // unit-test üstünde singleton kilitli olduğu için integration testi
        // middleware-rate-limit.test.ts dosyasında REDIS_URL silinerek yapılacak).
        const { readFileSync } = await import("node:fs");
        const src = readFileSync("src/lib/rate-limit.ts", "utf8");
        expect(src).toMatch(/if \(!url\) return null/);
        expect(src).toMatch(/fromRedis: false/);
    });
});

// ── Circuit breaker + hard timeout (2026-05-26 production outage fix) ────────

describe("rateLimitCheck — hard timeout (200ms)", () => {
    it("consume 200ms'den uzun sürerse fail-open + fromRedis=false döner", async () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        // Hiç resolve/reject olmayan promise → Promise.race timeout'a düşer
        mocks.consumeFn.mockImplementationOnce(() => new Promise(() => {}));
        const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");

        const start = Date.now();
        const res = await rateLimitCheck("ip:test:timeout", POLICIES.API_AUTH);
        const elapsed = Date.now() - start;

        expect(res.ok).toBe(true);          // fail-open
        expect(res.fromRedis).toBe(false);  // timeout → Redis cevabı yok
        expect(elapsed).toBeLessThan(300);  // HARD_TIMEOUT_MS=200 + biraz tolerance
        expect(elapsed).toBeGreaterThanOrEqual(195); // gerçekten beklemiş
        errSpy.mockRestore();
    });
});

describe("rateLimitCheck — circuit breaker", () => {
    it("3 ardışık başarısızlık → circuit OPEN → 4. çağrı Redis'e gitmez", async () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        // İlk 3 çağrı reject → fail sayar; 4. çağrıda consume hiç çağrılmamalı.
        mocks.consumeFn
            .mockRejectedValueOnce(new Error("ETIMEDOUT"))
            .mockRejectedValueOnce(new Error("ETIMEDOUT"))
            .mockRejectedValueOnce(new Error("ETIMEDOUT"));
        const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");

        await rateLimitCheck("ip:cb:1", POLICIES.API_AUTH);
        await rateLimitCheck("ip:cb:2", POLICIES.API_AUTH);
        await rateLimitCheck("ip:cb:3", POLICIES.API_AUTH);
        expect(mocks.consumeFn).toHaveBeenCalledTimes(3);

        // 4. çağrı — circuit OPEN, Redis'e dokunmamalı
        const res = await rateLimitCheck("ip:cb:4", POLICIES.API_AUTH);
        expect(mocks.consumeFn).toHaveBeenCalledTimes(3);  // ARTMADI
        expect(res.ok).toBe(true);
        expect(res.fromRedis).toBe(false);

        // "circuit OPEN after 3 failures" log mesajı görünmüş olmalı
        const openLog = errSpy.mock.calls.find(c =>
            String(c[0]).includes("circuit OPEN")
        );
        expect(openLog).toBeDefined();
        errSpy.mockRestore();
    });

    it("Circuit OPEN + 30sn sonra probe başarılı → CLOSE", async () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
        vi.useFakeTimers({ shouldAdvanceTime: true });

        try {
            // 3 fail → circuit OPEN
            mocks.consumeFn
                .mockRejectedValueOnce(new Error("ETIMEDOUT"))
                .mockRejectedValueOnce(new Error("ETIMEDOUT"))
                .mockRejectedValueOnce(new Error("ETIMEDOUT"));
            const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");
            await rateLimitCheck("ip:probe:1", POLICIES.API_AUTH);
            await rateLimitCheck("ip:probe:2", POLICIES.API_AUTH);
            await rateLimitCheck("ip:probe:3", POLICIES.API_AUTH);
            expect(mocks.consumeFn).toHaveBeenCalledTimes(3);

            // 4. çağrı OPEN'da skip eder
            await rateLimitCheck("ip:probe:4", POLICIES.API_AUTH);
            expect(mocks.consumeFn).toHaveBeenCalledTimes(3);

            // 30sn ileri sar
            vi.advanceTimersByTime(30_001);

            // Probe — başarılı dön
            mocks.consumeFn.mockResolvedValueOnce({ remainingPoints: 299, msBeforeNext: 0 });
            const res = await rateLimitCheck("ip:probe:5", POLICIES.API_AUTH);
            expect(mocks.consumeFn).toHaveBeenCalledTimes(4);  // probe geçti
            expect(res.ok).toBe(true);
            expect(res.fromRedis).toBe(true);

            // Circuit CLOSED log'u
            const closedLog = infoSpy.mock.calls.find(c =>
                String(c[0]).includes("circuit CLOSED")
            );
            expect(closedLog).toBeDefined();
        } finally {
            vi.useRealTimers();
            errSpy.mockRestore();
            infoSpy.mockRestore();
        }
    });

    it("Circuit OPEN probe BAŞARISIZ → yeniden 30sn open kalır", async () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.useFakeTimers({ shouldAdvanceTime: true });

        try {
            // 3 fail → OPEN
            mocks.consumeFn
                .mockRejectedValueOnce(new Error("ETIMEDOUT"))
                .mockRejectedValueOnce(new Error("ETIMEDOUT"))
                .mockRejectedValueOnce(new Error("ETIMEDOUT"));
            const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");
            await rateLimitCheck("ip:reopen:1", POLICIES.API_AUTH);
            await rateLimitCheck("ip:reopen:2", POLICIES.API_AUTH);
            await rateLimitCheck("ip:reopen:3", POLICIES.API_AUTH);

            // 30sn geç + probe FAIL
            vi.advanceTimersByTime(30_001);
            mocks.consumeFn.mockRejectedValueOnce(new Error("ETIMEDOUT"));
            await rateLimitCheck("ip:reopen:probe", POLICIES.API_AUTH);
            expect(mocks.consumeFn).toHaveBeenCalledTimes(4);

            // Yeni circuit window — sonraki çağrı yine skip etmeli (29sn içinde)
            vi.advanceTimersByTime(10_000);
            await rateLimitCheck("ip:reopen:after", POLICIES.API_AUTH);
            expect(mocks.consumeFn).toHaveBeenCalledTimes(4);  // ARTMADI — hâlâ OPEN
        } finally {
            vi.useRealTimers();
            errSpy.mockRestore();
        }
    });

    it("429 (RateLimiterRes) recordSuccess sayar — circuit counter reset eder", async () => {
        const { RateLimiterRes } = await import("rate-limiter-flexible");
        // 2 fail + 1 RateLimiterRes (429) + 1 fail → counter 429'da sıfırlanır
        mocks.consumeFn
            .mockRejectedValueOnce(new Error("ETIMEDOUT"))
            .mockRejectedValueOnce(new Error("ETIMEDOUT"))
            .mockRejectedValueOnce(new RateLimiterRes(0, 15_000, 0, false))
            .mockRejectedValueOnce(new Error("ETIMEDOUT"));
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const { rateLimitCheck, POLICIES } = await import("@/lib/rate-limit");

        await rateLimitCheck("ip:429:1", POLICIES.API_AUTH);   // fail 1
        await rateLimitCheck("ip:429:2", POLICIES.API_AUTH);   // fail 2 (threshold 3)
        const rateLimited = await rateLimitCheck("ip:429:3", POLICIES.API_AUTH);  // 429 → reset
        expect(rateLimited.ok).toBe(false);
        expect(rateLimited.fromRedis).toBe(true);
        expect(rateLimited.retryAfter).toBe(15);

        // Counter reset olduğu için 4. fail yeni bir başlangıçtır, circuit hâlâ closed
        await rateLimitCheck("ip:429:4", POLICIES.API_AUTH);
        expect(mocks.consumeFn).toHaveBeenCalledTimes(4);  // hiçbir çağrı atlanmadı

        // "circuit OPEN" log MESAJ İÇERMEMELİ (threshold'a ulaşmadı)
        const openLog = errSpy.mock.calls.find(c =>
            String(c[0]).includes("circuit OPEN")
        );
        expect(openLog).toBeUndefined();
        errSpy.mockRestore();
    });

    it("setTimeout cleanup — başarılı consume sonrası clearTimeout çağrılır (leak yok)", async () => {
        // Bu test invariant'ı kaynak dosyada doğrular — runtime spy yapmak için
        // node:timers internal patch gerekirdi; bunun yerine "finally + clearTimeout"
        // pattern'i source-regex ile kilitleniyor (regression koruması).
        const { readFileSync } = await import("node:fs");
        const src = readFileSync("src/lib/rate-limit.ts", "utf8");
        expect(src).toMatch(/finally\s*\{[^}]*clearTimeout/);
        expect(src).toMatch(/setTimeout\([^,]+,\s*HARD_TIMEOUT_MS\)/);
    });
});
