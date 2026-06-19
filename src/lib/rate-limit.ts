/**
 * M-3 Rate Limiting (Coolify self-hosted Redis, 2026-05-25)
 *
 * Vercel'in built-in DDoS/edge koruması Coolify VPS'inde yok. Middleware-level
 * rate limit ile login brute-force, demo abuse, AI cost amplification, scrape
 * koruması.
 *
 * Backend: ioredis + rate-limiter-flexible (atomic Lua scripts, sliding window).
 * Singleton lazy init — REDIS_URL env yoksa veya Redis bağlanamazsa fail-open
 * (tüm istekler geçer + console.error). Site downtime'a sebep olmaz.
 *
 * RESILIENCE (2026-05-26 production outage sonrası eklendi):
 * - HARD_TIMEOUT_MS=200: her `rateLimitCheck` en geç 200ms döner (Promise.race).
 * - CIRCUIT BREAKER: 3 ardışık fail → 30sn Redis'e dokunma (probe pattern).
 *   Sonraki istek devre açıkken Redis'e gitmeden fail-open döner — ETIMEDOUT
 *   gibi kalıcı network hataları kullanıcıyı bloke etmez.
 * - ioredis options: `maxRetriesPerRequest=0` + `retryStrategy=null` —
 *   fail fast; ioredis kendi exponential backoff'u devreden çıkar.
 * - `lazyConnect: true` + fire-and-forget `connect()` — startup race önlenir;
 *   ilk request gelmeden bağlantı denemesi başlar.
 *
 * Circuit state in-memory module-level — tek Next.js process içinde paylaşılır.
 * Coolify horizontal scale-up yapılırsa her instance ayrı circuit yönetir
 * (3 instance × 3 fail = 9 timeout, her biri 200ms ile sınırlı). Multi-instance
 * gelirse Redis-backed shared circuit state eklenebilir.
 *
 * Politika seçimi `selectPolicy` (pathname + method + auth-cookie). Anahtar
 * IP-bazlı (`ip:${ip}`); auth-cookie hibrit sayesinde NAT'lı ofis kullanıcıları
 * API_AUTH limit'inden (300/dk) faydalanır.
 */
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import Redis from "ioredis";

// ── Resilience constants ─────────────────────────────────────────────────────

const HARD_TIMEOUT_MS = 200;             // rateLimitCheck max latency
const CIRCUIT_OPEN_THRESHOLD = 3;        // ardışık fail sayısı → circuit OPEN
const CIRCUIT_OPEN_DURATION_MS = 30_000; // OPEN durumda kalış süresi
const CONNECT_TIMEOUT_MS = 1500;         // ioredis TCP connect timeout (HARD_TIMEOUT'tan kısa)

// ── Singleton Redis client ───────────────────────────────────────────────────

let _client: Redis | null = null;
let _initFailed = false;

function getRedis(): Redis | null {
    if (_initFailed) return null;
    if (_client) return _client;
    const url = process.env.REDIS_URL;
    if (!url) return null;
    try {
        _client = new Redis(url, {
            enableOfflineQueue: false,            // permanent down'da queue şişmesin
            maxRetriesPerRequest: 0,              // tek deneme, fail fast
            connectTimeout: CONNECT_TIMEOUT_MS,
            lazyConnect: true,                    // construct'ta TCP açma — startup race önlenir
            retryStrategy: () => null,            // ioredis kendiliğinden reconnect denemesin
            reconnectOnError: () => false,
        });
        _client.on("error", err => {
            console.error("[rate-limit] redis error:", err.message);
        });
        // Fire-and-forget initial connect — başarısızlık halinde
        // rateLimitCheck hard timeout + circuit breaker mekanizması işler.
        _client.connect().catch(err => {
            console.error("[rate-limit] initial connect failed:", err.message);
        });
        return _client;
    } catch (err) {
        console.error("[rate-limit] init failed, disabling:", err);
        _initFailed = true;
        return null;
    }
}

// ── Circuit breaker state ────────────────────────────────────────────────────

let _consecutiveFailures = 0;
let _circuitOpenedAt = 0; // 0 = closed; epoch ms = openedAt

function isCircuitOpen(): boolean {
    if (_circuitOpenedAt === 0) return false;
    return Date.now() - _circuitOpenedAt < CIRCUIT_OPEN_DURATION_MS;
}

function recordFailure(reason: string): void {
    _consecutiveFailures++;
    if (_consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD) {
        // OPEN log YALNIZ ilk açılışta — probe fail'lerinde spam yapma
        if (_circuitOpenedAt === 0) {
            console.error(
                `[rate-limit] circuit OPEN after ${_consecutiveFailures} failures (last: ${reason})`,
            );
        }
        // Timestamp her fail'de yenilenir → probe fail circuit'i yeni 30sn açar
        _circuitOpenedAt = Date.now();
    }
}

function recordSuccess(): void {
    if (_circuitOpenedAt > 0) {
        console.info("[rate-limit] circuit CLOSED — Redis healthy again");
    }
    _consecutiveFailures = 0;
    _circuitOpenedAt = 0;
}

/** Test-only export — circuit breaker state reset (test izolasyon için). */
export function __resetCircuitForTests(): void {
    _consecutiveFailures = 0;
    _circuitOpenedAt = 0;
}

// ── Policies ─────────────────────────────────────────────────────────────────

export interface RatePolicy {
    name: string;
    points:   number;   // max requests
    duration: number;   // seconds window
    blockDuration?: number;  // optional: ek block ceza süresi (saniye)
}

export const POLICIES = {
    // Auth surface — brute-force koruması.
    // M-3 Review (2026-05-25): LOGIN şu an effective DEĞİL — login akışı
    // `src/app/login/page.tsx:21` Supabase SDK `signInWithPassword` ile
    // doğrudan Supabase GoTrue'ya gider, middleware görmez. Brute-force
    // koruması şu an Supabase GoTrue'nun built-in limit'i ile sağlanır.
    // Bu policy, ileride `/api/auth/login` server route veya server action
    // arkasına alındığında otomatik aktif olsun diye policy katmanında hazır
    // tutulur (selectPolicy zaten `POST /login` için bunu seçer; route yok).
    LOGIN:        { name: "login", points: 5,   duration: 900,  blockDuration: 900 }, // 5 / 15 dk + 15 dk block
    DEMO:         { name: "demo",  points: 5,   duration: 900 },                       // 5 / 15 dk
    // AI cost amplification koruması
    AI:           { name: "ai",    points: 10,  duration: 60 },                        // 10 / dk
    // Paraşüt manuel sync.
    // M-3 Review (2026-05-25): PARASUT_SYNC şu an effective DEĞİL —
    // `/api/parasut/sync-all` middleware CRON_PATHS'te, sadece CRON_SECRET
    // Bearer ile erişilir; UI buton POST atsa (parasut/page.tsx:161) 401 alır
    // (mevcut UX bug, ayrı tur). Policy ileride UI manuel sync akışı CRON'dan
    // çıkarılırsa aktif olur. selectPolicy `POST /api/parasut/*` için bunu seçer.
    PARASUT_SYNC: { name: "psync", points: 30,  duration: 60 },                        // 30 / dk
    // Authenticated user normal API (Supabase auth cookie VEYA demo_mode cookie)
    API_AUTH:     { name: "auth",  points: 300, duration: 60 },                        // 300 / dk
    // Anon (login öncesi public read)
    API_ANON:     { name: "anon",  points: 30,  duration: 60 },                        // 30 / dk
} as const satisfies Record<string, RatePolicy>;

/**
 * Per-route AI politikası — `ai-route-limit.ts` route-seviye guard'ı için.
 * Her route ayrı `name` → ayrı limiter (keyspace `rl:ai-<route>`); anahtar
 * IP'dir → per-route/per-IP izolasyon. 1 dk pencere (in-memory fallback ile
 * birebir). Mevcut `rateLimitCheck` fail-open/circuit/timeout davranışını verir.
 */
export function aiRoutePolicy(route: string, limit: number): RatePolicy {
    return { name: `ai-${route}`, points: limit, duration: 60 };
}

// ── Limiter cache ────────────────────────────────────────────────────────────

const _limiters = new Map<string, RateLimiterRedis>();

function getLimiter(policy: RatePolicy): RateLimiterRedis | null {
    const redis = getRedis();
    if (!redis) return null;
    const existing = _limiters.get(policy.name);
    if (existing) return existing;
    const limiter = new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: `rl:${policy.name}`,
        points: policy.points,
        duration: policy.duration,
        blockDuration: policy.blockDuration ?? 0,
        inMemoryBlockOnConsumed: policy.points,  // mikro optimizasyon
    });
    _limiters.set(policy.name, limiter);
    return limiter;
}

// ── Check ────────────────────────────────────────────────────────────────────

export interface RateCheckResult {
    ok: boolean;
    limit: number;
    remaining: number;
    retryAfter: number;  // saniye
    fromRedis: boolean;  // false → fail-open (redis down/missing/circuit-open)
}

const TIMEOUT_SENTINEL: unique symbol = Symbol("rate-limit-timeout");

/** Fail-open: Redis yoksa, devre açıksa, timeout'a düşerse veya hata olursa ok=true. */
export async function rateLimitCheck(
    key: string,
    policy: RatePolicy,
): Promise<RateCheckResult> {
    const failOpen = (): RateCheckResult => ({
        ok: true,
        limit: policy.points,
        remaining: policy.points,
        retryAfter: 0,
        fromRedis: false,
    });

    // 1. Circuit open + duration dolmadıysa → Redis'e dokunmadan erken return
    if (isCircuitOpen()) {
        return failOpen();
    }

    const limiter = getLimiter(policy);
    if (!limiter) {
        return failOpen();
    }

    // 2. Promise.race + hard timeout (clearTimeout finally'de garantili)
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>(resolve => {
        timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), HARD_TIMEOUT_MS);
    });

    const consumePromise = limiter.consume(key, 1);
    // Hard timeout kazanırsa consume promise hâlâ pending kalır; ioredis
    // connect timeout ~1.5s'de reject ederse "unhandled rejection" warning
    // ortaya çıkar. .catch(()=>{}) no-op handler ile bastırılır — gerçek
    // hata zaten Promise.race üzerinden propagate olmuş (veya timeout).
    consumePromise.catch(() => {});

    try {
        const winner = await Promise.race([consumePromise, timeoutPromise]);
        if (winner === TIMEOUT_SENTINEL) {
            recordFailure("timeout");
            return failOpen();
        }
        recordSuccess();
        const res = winner as RateLimiterRes;
        return {
            ok: true,
            limit: policy.points,
            remaining: res.remainingPoints,
            retryAfter: 0,
            fromRedis: true,
        };
    } catch (err) {
        if (err instanceof RateLimiterRes) {
            recordSuccess();  // 429 da Redis'in başarılı cevabı — counter reset
            return {
                ok: false,
                limit: policy.points,
                remaining: 0,
                retryAfter: Math.ceil(err.msBeforeNext / 1000),
                fromRedis: true,
            };
        }
        recordFailure((err as Error).message);
        console.error("[rate-limit] check failed, allowing:", err);
        return failOpen();
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// ── Pure helpers (test edilebilir) ───────────────────────────────────────────

/** Policy seçimi — pathname + method + auth-cookie. Sıralama: en spesifik → en genel. */
export function selectPolicy(pathname: string, method: string, isAuthenticated: boolean): RatePolicy {
    if (pathname === "/login" && method === "POST")                                return POLICIES.LOGIN;
    if (pathname === "/api/auth/demo" || pathname.startsWith("/api/auth/demo/"))   return POLICIES.DEMO;
    if (pathname.startsWith("/api/ai/"))                                           return POLICIES.AI;
    if (pathname.startsWith("/api/parasut/") && method !== "GET")                  return POLICIES.PARASUT_SYNC;
    if (pathname.startsWith("/api/"))                                              return isAuthenticated ? POLICIES.API_AUTH : POLICIES.API_ANON;
    return POLICIES.API_AUTH;  // /dashboard/** vb — practical olarak hit etmez (middleware /api ve auth path filter)
}

// IP extraction `src/lib/request-ip.ts`'e taşındı — `ai-route-limit.ts` Redis
// runtime bağımlılığı taşımasın diye (Upstash refactor'da bu dosya silinebilir).
// Backward-compat: mevcut import'lar (proxy.ts, testler) bozulmasın diye re-export.
export { extractClientIp } from "@/lib/request-ip";

/**
 * Supabase auth cookie varlığı kontrolü — getUser maliyetine girmeden hızlı proxy.
 * Cookie adı: `sb-<project-ref>-auth-token` (Supabase SSR standardı, opsiyonel chunk
 * suffix `.0`, `.1` token uzun olduğunda).
 * Saldırgan fake cookie atarsa yüksek limit alır ama backend auth check 401 döner
 * → resource consumption hâlâ rate-limited (worst case: anon yerine auth limit).
 */
export function detectSupabaseAuthCookie(req: { cookies: { getAll(): Array<{ name: string }> } }): boolean {
    return req.cookies.getAll().some(c => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
}
