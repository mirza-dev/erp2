/**
 * Route-level AI rate limit — Redis-backed primary + in-memory fallback.
 *
 * Amaç: Anthropic fatura amplifikasyonunu engellemek — kullanıcı/saldırgan
 * `/api/ai/*` endpoint'lerini hızla çağırırsa her istek token yakar. Bu
 * guard `checkAuth`'tan sonra ve Anthropic çağrısından önce route handler
 * içinde çalışır.
 *
 * Tasarım kararı (2026-05-26): middleware-level değil ROUTE-level.
 * Sebep: önceki Next 16 Turbopack `proxy.ts` convention bug'ında middleware
 * tamamen INVOKE EDİLMEMİŞTİ. Route-içi guard middleware bypass olsa bile
 * çalışmaya devam eder (defense-in-depth).
 *
 * HİBRİT (O5, 2026-06-19): in-memory per-instance limit çoklu-instance'da
 * etkisizdi + deploy'da sıfırlanıyordu. Artık önce paylaşımlı ioredis Redis
 * (`rate-limit.ts`) sayacı denenir; Redis yok/down/circuit-open ise (fail-open
 * sinyali `fromRedis=false`) AŞAĞIDAKİ in-memory rolling window'a düşülür.
 * Böylece Redis varken instance'lar arası paylaşılır + deploy'da sıfırlanmaz;
 * Redis yokken eski best-effort davranış birebir korunur (defense-in-depth).
 * Tradeoff: bu dosya artık ioredis taşıyan `rate-limit.ts`'i import eder
 * (node-runtime route bundle'ı; middleware zaten yüklüyor — kabul edildi).
 *
 * In-memory fallback memory profili: cleanup amortize — her 5 dk'da bir tüm
 * Map taranır, expired timestamp'ler + boş entry'ler silinir.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
// `extractClientIp` yine Redis-bağımsız helper'dan (re-export zinciri korunur).
import { extractClientIp } from "@/lib/request-ip";
import { rateLimitCheck, aiRoutePolicy } from "@/lib/rate-limit";

const WINDOW_MS = 60_000;                    // 1 dk rolling window
const DEFAULT_LIMIT = 5;                     // 5 req/dk/IP/route
const CLEANUP_INTERVAL_MS = 5 * 60_000;      // her 5 dk Map cleanup

// key = `${route}:${ip}` → timestamp array (rolling window, en eski → en yeni)
const _hits = new Map<string, number[]>();
let _lastCleanup = 0;

function cleanup(now: number): void {
    if (now - _lastCleanup < CLEANUP_INTERVAL_MS) return;
    _lastCleanup = now;
    for (const [key, arr] of _hits.entries()) {
        const fresh = arr.filter(t => now - t < WINDOW_MS);
        if (fresh.length === 0) _hits.delete(key);
        else if (fresh.length !== arr.length) _hits.set(key, fresh);
    }
}

export interface AiRateLimitResult {
    ok: boolean;
    remaining: number;
    retryAfter: number;  // saniye
}

/**
 * Pure rate check. `route` ve `ip` ile per-route/per-IP izolasyon.
 *
 * Akış:
 * 1. Periyodik cleanup tetiklenir (her 5 dk'da bir, amortize).
 * 2. Mevcut hit array'i window dışı timestamp'lerden temizlenir.
 * 3. Limit dolduysa → en eski timestamp'ten retryAfter hesaplanır.
 * 4. Limit dolmadıysa → şimdiki zaman push edilir, Map güncellenir.
 */
export function checkAiRateLimit(
    route: string,
    ip: string,
    limit: number = DEFAULT_LIMIT,
): AiRateLimitResult {
    const now = Date.now();
    cleanup(now);
    const key = `${route}:${ip}`;
    const arr = (_hits.get(key) ?? []).filter(t => now - t < WINDOW_MS);
    if (arr.length >= limit) {
        const oldest = arr[0]!;
        const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
        return { ok: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
    }
    arr.push(now);
    _hits.set(key, arr);
    return { ok: true, remaining: limit - arr.length, retryAfter: 0 };
}

/** 429 yanıtı (Retry-After + X-RateLimit-* header'lar). */
function tooManyRequests(limit: number, retryAfter: number): NextResponse {
    return new NextResponse(
        JSON.stringify({
            error: "AI istek limiti aşıldı. Lütfen biraz bekleyin.",
            retryAfter,
        }),
        {
            status: 429,
            headers: {
                "Content-Type": "application/json",
                "Retry-After": String(retryAfter),
                "X-RateLimit-Limit": String(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Window": "60",
            },
        },
    );
}

/**
 * Route handler'ı için tek-satır guard (Redis-primary + in-memory fallback).
 *
 * Dönüş `null` → devam et; `NextResponse` → 429 ile erken çık (Retry-After +
 * X-RateLimit-* header'lar set edilmiş).
 *
 * Akış:
 *  1. Paylaşımlı Redis sayacı (`rateLimitCheck` + `aiRoutePolicy`).
 *  2. `fromRedis === true` → otoriter: !ok → 429, ok → null.
 *  3. `fromRedis === false` (Redis yok/down/circuit-open) → in-memory
 *     `checkAiRateLimit` fallback (eski best-effort davranış).
 *
 * Kullanım:
 * ```ts
 * if (!(await checkAuth(...))) return 401;
 * const limited = await guardAiRoute(request, "purchase-copilot", 5);
 * if (limited) return limited;
 * // ... Anthropic çağrısı
 * ```
 */
export async function guardAiRoute(
    request: NextRequest,
    route: string,
    limit: number = DEFAULT_LIMIT,
): Promise<NextResponse | null> {
    const ip = extractClientIp(request);

    // 1. Paylaşımlı Redis sayacı (instance'lar arası + deploy-kalıcı).
    const redis = await rateLimitCheck(`ip:${ip}`, aiRoutePolicy(route, limit));
    if (redis.fromRedis) {
        return redis.ok ? null : tooManyRequests(limit, redis.retryAfter);
    }

    // 2. Redis yok/down/circuit-open → in-memory fallback (defense-in-depth).
    const res = checkAiRateLimit(route, ip, limit);
    return res.ok ? null : tooManyRequests(limit, res.retryAfter);
}

/** Test-only — Map'i + cleanup timer'ı sıfırla (test izolasyon). */
export function __resetAiRateLimitForTests(): void {
    _hits.clear();
    _lastCleanup = 0;
}

/** Test-only — Map boyutunu döndür (cleanup assertion için). */
export function __getAiRateLimitMapSize(): number {
    return _hits.size;
}
