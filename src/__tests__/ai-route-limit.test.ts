/**
 * AI Route-level rate limit — pure helper + guardAiRoute hibrit davranış testleri.
 *
 * `checkAiRateLimit` (in-memory pure) mock'suz test edilir.
 * `guardAiRoute` artık Redis-primary + in-memory fallback (O5, 2026-06-19):
 * `@/lib/rate-limit.rateLimitCheck` mock'lanır — DEFAULT `fromRedis:false`
 * (Redis yok → in-memory fallback yolu test edilir, eski davranış birebir),
 * override ile `fromRedis:true` otoriter yol (429/allow) test edilir.
 *
 * Module-level singleton state — her test arasında `__resetAiRateLimitForTests`.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mockRateLimitCheck } = vi.hoisted(() => ({ mockRateLimitCheck: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
    rateLimitCheck: (...args: unknown[]) => mockRateLimitCheck(...args),
    aiRoutePolicy: (route: string, limit: number) => ({ name: `ai-${route}`, points: limit, duration: 60 }),
}));

import {
    checkAiRateLimit,
    guardAiRoute,
    __resetAiRateLimitForTests,
    __getAiRateLimitMapSize,
} from "@/lib/ai-route-limit";

beforeEach(() => {
    __resetAiRateLimitForTests();
    // DEFAULT: Redis yok/down → fail-open sinyali → guardAiRoute in-memory'e düşer.
    mockRateLimitCheck.mockResolvedValue({
        ok: true, limit: 5, remaining: 5, retryAfter: 0, fromRedis: false,
    });
});

describe("checkAiRateLimit — rolling window", () => {
    it("İlk istek ok=true, remaining=4 (limit=5)", () => {
        const res = checkAiRateLimit("test-route", "1.2.3.4", 5);
        expect(res.ok).toBe(true);
        expect(res.remaining).toBe(4);
        expect(res.retryAfter).toBe(0);
    });

    it("5 ardışık istek geçer, 6.'da ok=false + retryAfter > 0", () => {
        for (let i = 0; i < 5; i++) {
            const res = checkAiRateLimit("rate-test", "9.9.9.9", 5);
            expect(res.ok).toBe(true);
        }
        const sixth = checkAiRateLimit("rate-test", "9.9.9.9", 5);
        expect(sixth.ok).toBe(false);
        expect(sixth.remaining).toBe(0);
        expect(sixth.retryAfter).toBeGreaterThan(0);
        expect(sixth.retryAfter).toBeLessThanOrEqual(60);
    });

    it("Window dolduktan sonra (vi.useFakeTimers) ok=true", () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-05-26T10:00:00Z"));
            for (let i = 0; i < 5; i++) checkAiRateLimit("window-test", "5.5.5.5", 5);
            const blocked = checkAiRateLimit("window-test", "5.5.5.5", 5);
            expect(blocked.ok).toBe(false);

            // 61 saniye ileri — window dolmuş
            vi.setSystemTime(new Date("2026-05-26T10:01:01Z"));
            const passed = checkAiRateLimit("window-test", "5.5.5.5", 5);
            expect(passed.ok).toBe(true);
            expect(passed.remaining).toBe(4);
        } finally {
            vi.useRealTimers();
        }
    });

    it("Farklı IP'ler izole — IP_A 5x dolar, IP_B hâlâ ok", () => {
        for (let i = 0; i < 5; i++) checkAiRateLimit("iso-test", "1.1.1.1", 5);
        const aBlocked = checkAiRateLimit("iso-test", "1.1.1.1", 5);
        expect(aBlocked.ok).toBe(false);

        const bOk = checkAiRateLimit("iso-test", "2.2.2.2", 5);
        expect(bOk.ok).toBe(true);
        expect(bOk.remaining).toBe(4);
    });

    it("Farklı route'lar izole — purchase-copilot 5x dolar, stock-risk hâlâ ok", () => {
        for (let i = 0; i < 5; i++) checkAiRateLimit("purchase-copilot", "3.3.3.3", 5);
        const copilotBlocked = checkAiRateLimit("purchase-copilot", "3.3.3.3", 5);
        expect(copilotBlocked.ok).toBe(false);

        const stockOk = checkAiRateLimit("stock-risk", "3.3.3.3", 5);
        expect(stockOk.ok).toBe(true);
        expect(stockOk.remaining).toBe(4);
    });

    it("Cleanup: 5dk sonra expired entry'ler silinir (Map.size azalır)", () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-05-26T11:00:00Z"));
            // 10 farklı IP, her biri 1 istek → 10 entry
            for (let i = 1; i <= 10; i++) {
                checkAiRateLimit("cleanup-test", `10.0.0.${i}`, 5);
            }
            expect(__getAiRateLimitMapSize()).toBe(10);

            // 6 dakika ileri — tüm window'lar dolmuş + cleanup interval'ı aşıldı
            vi.setSystemTime(new Date("2026-05-26T11:06:00Z"));
            // Yeni bir istek cleanup tetikler
            checkAiRateLimit("cleanup-test", "10.0.0.99", 5);
            // Yeni IP eklendi (1) + eski 10 entry silindi = 1
            expect(__getAiRateLimitMapSize()).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("guardAiRoute — in-memory fallback (Redis yok, fromRedis=false)", () => {
    function makeReq(ip: string = "8.8.8.8"): NextRequest {
        const req = new NextRequest("http://localhost/api/ai/test");
        // X-Real-IP = Traefik-set primary (spoof-resistant); guardAiRoute bunu okur.
        req.headers.set("x-real-ip", ip);
        return req;
    }

    it("ok → null (devam)", async () => {
        const req = makeReq();
        const result = await guardAiRoute(req, "guard-test", 5);
        expect(result).toBeNull();
    });

    it("limit aşıldı → 429 NextResponse + Retry-After + X-RateLimit-* header", async () => {
        const req = makeReq("7.7.7.7");
        for (let i = 0; i < 5; i++) {
            const ok = await guardAiRoute(req, "guard-429", 5);
            expect(ok).toBeNull();
        }
        const blocked = await guardAiRoute(req, "guard-429", 5);
        expect(blocked).not.toBeNull();
        expect(blocked!.status).toBe(429);
        expect(blocked!.headers.get("Retry-After")).toBeTruthy();
        expect(blocked!.headers.get("X-RateLimit-Limit")).toBe("5");
        expect(blocked!.headers.get("X-RateLimit-Remaining")).toBe("0");
        expect(blocked!.headers.get("X-RateLimit-Window")).toBe("60");
        const body = await blocked!.json();
        expect(body.error).toMatch(/AI istek limiti aşıldı/);
        expect(typeof body.retryAfter).toBe("number");
        expect(body.retryAfter).toBeGreaterThan(0);
    });
});

describe("guardAiRoute — Redis-primary (fromRedis=true otoriter)", () => {
    function makeReq(ip: string = "8.8.8.8"): NextRequest {
        const req = new NextRequest("http://localhost/api/ai/test");
        req.headers.set("x-real-ip", ip);
        return req;
    }

    it("Redis ok=true → null (in-memory'e dokunmaz)", async () => {
        mockRateLimitCheck.mockResolvedValueOnce({
            ok: true, limit: 5, remaining: 4, retryAfter: 0, fromRedis: true,
        });
        const result = await guardAiRoute(makeReq(), "redis-allow", 5);
        expect(result).toBeNull();
        // Redis otoriter → in-memory sayaç tüketilmemeli
        expect(__getAiRateLimitMapSize()).toBe(0);
    });

    it("Redis ok=false → 429 (in-memory'e DÜŞMEDEN, retryAfter Redis'ten)", async () => {
        mockRateLimitCheck.mockResolvedValueOnce({
            ok: false, limit: 5, remaining: 0, retryAfter: 42, fromRedis: true,
        });
        const blocked = await guardAiRoute(makeReq("6.6.6.6"), "redis-block", 5);
        expect(blocked).not.toBeNull();
        expect(blocked!.status).toBe(429);
        expect(blocked!.headers.get("Retry-After")).toBe("42");
        expect(__getAiRateLimitMapSize()).toBe(0);
    });

    it("guardAiRoute anahtarı ip:<extractClientIp> + aiRoutePolicy(route, limit)", async () => {
        mockRateLimitCheck.mockResolvedValueOnce({
            ok: true, limit: 10, remaining: 9, retryAfter: 0, fromRedis: true,
        });
        await guardAiRoute(makeReq("9.9.9.9"), "key-check", 10);
        expect(mockRateLimitCheck).toHaveBeenCalledWith(
            "ip:9.9.9.9",
            { name: "ai-key-check", points: 10, duration: 60 },
        );
    });
});

describe("__resetAiRateLimitForTests", () => {
    it("Map'i sıfırlar (size=0)", () => {
        checkAiRateLimit("reset-test", "4.4.4.4", 5);
        checkAiRateLimit("reset-test", "5.5.5.5", 5);
        expect(__getAiRateLimitMapSize()).toBeGreaterThan(0);
        __resetAiRateLimitForTests();
        expect(__getAiRateLimitMapSize()).toBe(0);
    });
});

afterEach(() => {
    __resetAiRateLimitForTests();
});
