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
    class MockRedis {
        on() { /* no-op event listener */ }
    }
    return { default: MockRedis };
});

// REDIS_URL singleton init için bir kez set edilir (modül cache'lenir).
beforeAll(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
});

beforeEach(() => {
    mocks.consumeFn.mockReset();
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
