/**
 * Client IP extraction — Redis-independent helper.
 *
 * SPOOF DİRENCİ (O5, 2026-06-19): Önceki sürüm `X-Forwarded-For`'un SOLDAKİ
 * (ilk) değerini alıyordu. Coolify Traefik gelen XFF'e gerçek peer'ı EKLER
 * (append) → soldaki değer client tarafından gönderilebilir/SPOOF EDİLEBİLİR
 * (saldırgan `X-Forwarded-For: rastgele` ile her istekte taze rate-limit alır).
 * Düzeltme:
 *  1. `X-Real-IP` PRIMARY — Traefik gerçek peer'ı buraya yazar (gelen istemci
 *     header'ının üzerine), client spoof edemez.
 *  2. XFF fallback → EN SAĞDAKİ (son) hop = Traefik'in eklediği gerçek client.
 *     Soldaki (client-kontrollü) değer artık güvenilmez.
 * Yanlış-key worst-case OVER-LIMIT (fazla kısıtlar, güvenli) — asla under-limit
 * değil. (CDN eklenirse X-Real-IP edge IP'sini yansıtır → ayrı tur.)
 *
 * ⚠️ VARSAYIM (deploy-doğrulanmalı): Traefik gelen `X-Real-IP`'i ÜZERİNE yazar →
 * client spoof edemez. Traefik overwrite etmiyorsa spoof X-Real-IP üzerinden
 * geri gelir → ops kontrolü: docs/audit/2026-06-19-c1-login-preflight.md §3.
 *
 * Bu dosya `ioredis` / `rate-limiter-flexible` import etmez — IP çözümü
 * Redis runtime bağımlılığı taşımaz (re-export `src/lib/rate-limit.ts`'te).
 */

/** Kabaca IPv4/IPv6 görünümü (boş/garbage header değerlerini ele). */
function looksLikeIp(value: string): boolean {
    return /^[0-9a-fA-F:.]+$/.test(value) && /[0-9a-fA-F]/.test(value);
}

/** X-Real-IP primary (Traefik-set, spoof edilemez) → XFF son hop fallback → `0.0.0.0`. */
export function extractClientIp(req: { headers: Headers }): string {
    const real = req.headers.get("x-real-ip")?.trim();
    if (real && looksLikeIp(real)) return real;

    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
        const hops = xff.split(",").map((p) => p.trim()).filter(Boolean);
        // En sağdaki = bizim güvenilir proxy'mizin (Traefik) eklediği gerçek peer.
        for (let i = hops.length - 1; i >= 0; i--) {
            if (looksLikeIp(hops[i]!)) return hops[i]!;
        }
    }
    return "0.0.0.0";
}
