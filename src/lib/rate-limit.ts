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
 * Politika seçimi `selectPolicy` (pathname + method + auth-cookie). Anahtar
 * IP-bazlı (`ip:${ip}`); auth-cookie hibrit sayesinde NAT'lı ofis kullanıcıları
 * API_AUTH limit'inden (300/dk) faydalanır.
 */
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import Redis from "ioredis";

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
            enableOfflineQueue: true,     // startup'ta bağlantı hazır olmadan gelen komutları queue'ya alır (race önleme)
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,         // 3s içinde bağlanamazsa error emit → fail-open
            lazyConnect: false,
        });
        _client.on("error", err => {
            console.error("[rate-limit] redis error:", err.message);
        });
        return _client;
    } catch (err) {
        console.error("[rate-limit] init failed, disabling:", err);
        _initFailed = true;
        return null;
    }
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
    fromRedis: boolean;  // false → fail-open (redis down/missing)
}

/** Fail-open: Redis yoksa veya hata olursa ok=true. */
export async function rateLimitCheck(
    key: string,
    policy: RatePolicy,
): Promise<RateCheckResult> {
    const limiter = getLimiter(policy);
    if (!limiter) {
        return { ok: true, limit: policy.points, remaining: policy.points, retryAfter: 0, fromRedis: false };
    }
    try {
        const res = await limiter.consume(key, 1);
        return {
            ok: true,
            limit: policy.points,
            remaining: res.remainingPoints,
            retryAfter: 0,
            fromRedis: true,
        };
    } catch (err) {
        if (err instanceof RateLimiterRes) {
            return {
                ok: false,
                limit: policy.points,
                remaining: 0,
                retryAfter: Math.ceil(err.msBeforeNext / 1000),
                fromRedis: true,
            };
        }
        // Redis disconnect / Lua error → fail-open + log
        console.error("[rate-limit] check failed, allowing:", err);
        return { ok: true, limit: policy.points, remaining: policy.points, retryAfter: 0, fromRedis: false };
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

/** IP extraction — Coolify Traefik X-Forwarded-For (virgülle ayrılmış zincir, ilki client). */
export function extractClientIp(req: { headers: Headers }): string {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    return real ?? "0.0.0.0";
}

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
