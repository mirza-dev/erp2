/**
 * Route-level AI rate limit (in-memory, single-container best-effort).
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
 * Kapsam: in-memory rolling window. Process restart'ta sıfırlanır
 * (Coolify rolling deploy = saldırgan 5 yeni istek alır, pratikte cost
 * sınırlı). Multi-instance scale-up'a geçilirse Upstash REST refactor zorunlu
 * (planlanan 1-2 hafta).
 *
 * Memory profili: cleanup amortize — her 5 dk'da bir tüm Map taranır, expired
 * timestamp'ler + boş entry'ler silinir. Yüksek-RPS senaryoda Map büyür ama
 * cleanup periyodu sınırlı tutar.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { extractClientIp } from "@/lib/rate-limit";

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

/**
 * Route handler'ı için tek-satır guard.
 *
 * Dönüş `null` → devam et; `NextResponse` → 429 ile erken çık (Retry-After +
 * X-RateLimit-* header'lar set edilmiş).
 *
 * Kullanım:
 * ```ts
 * if (!(await checkAuth(...))) return 401;
 * const limited = guardAiRoute(request, "purchase-copilot", 5);
 * if (limited) return limited;
 * // ... Anthropic çağrısı
 * ```
 */
export function guardAiRoute(
    request: NextRequest,
    route: string,
    limit: number = DEFAULT_LIMIT,
): NextResponse | null {
    const ip = extractClientIp(request);
    const res = checkAiRateLimit(route, ip, limit);
    if (res.ok) return null;
    return new NextResponse(
        JSON.stringify({
            error: "AI istek limiti aşıldı. Lütfen biraz bekleyin.",
            retryAfter: res.retryAfter,
        }),
        {
            status: 429,
            headers: {
                "Content-Type": "application/json",
                "Retry-After": String(res.retryAfter),
                "X-RateLimit-Limit": String(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Window": "60",
            },
        },
    );
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
