/**
 * Client IP extraction — Redis-independent helper.
 *
 * Coolify Traefik reverse proxy `X-Forwarded-For` header'ı virgülle ayrılmış
 * IP zinciri olarak set eder; ilki gerçek client IP'sidir. `X-Real-IP`
 * fallback olarak değerlendirilir, hiçbiri yoksa `0.0.0.0` döner.
 *
 * Bu dosya `ioredis` / `rate-limiter-flexible` import etmez — `ai-route-limit.ts`
 * gibi in-memory rate limit helper'ları Redis runtime bağımlılığı taşımadan
 * IP çözebilir. Upstash REST migration'da `src/lib/rate-limit.ts` silinse
 * bile bu dosya kalır.
 */

/** Coolify Traefik X-Forwarded-For zinciri (ilki client) + x-real-ip fallback + `0.0.0.0` default. */
export function extractClientIp(req: { headers: Headers }): string {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    return real ?? "0.0.0.0";
}
