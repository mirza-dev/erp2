/**
 * Teklif arşivi paylaşım token'ı — müşteri e-postasındaki "Teklifi Görüntüle" linki.
 *
 * Müşterinin login'i yok; arşiv route'u (view_sales_prices) ona kapalı. Bu modül
 * süreli, HMAC-imzalı, kendinden-doğrulanır token üretir: e-postadaki link
 * `/api/quotes/shared/<token>` public route'una gider, route token'ı doğrulayıp
 * donmuş arşiv HTML'ini kendi origin'inden `text/html` ile servis eder
 * (Supabase signed URL HTML'i render etmez — stored-XSS koruması).
 *
 * Format: base64url(JSON{q,r,exp}) + "." + base64url(HMAC-SHA256(payload))
 * Sır: QUOTE_SHARE_SECRET; yoksa CRON_SECRET'tan türetilir (rotasyonu eski
 * linkleri geçersiz kılar — teklif linki zaten süreli, kabul edilebilir).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface QuoteSharePayload {
    /** quote id (uuid) */
    q: string;
    /** revision_no — arşiv lookup'u revizyona bağlı */
    r: number;
    /** unix saniye — son geçerlilik */
    exp: number;
}

/** Varsayılan TTL: 30 gün (PMT teklif geçerliliği 30 gün — şartlarla uyumlu). */
export const QUOTE_SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

export function resolveQuoteShareSecret(env: NodeJS.ProcessEnv = process.env): string | null {
    const direct = env.QUOTE_SHARE_SECRET?.trim();
    if (direct) return direct;
    const cron = env.CRON_SECRET?.trim();
    // Doğrudan CRON_SECRET kullanılmaz (token sızarsa cron yetkisi sızmış olmasın) —
    // alan-ayrımlı türetme.
    if (cron) return createHmac("sha256", cron).update("roven-quote-share-v1").digest("hex");
    return null;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(payloadB64: string, secret: string): string {
    return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

export function createQuoteShareToken(
    input: { quoteId: string; revisionNo: number; ttlSeconds?: number },
    secret: string,
    nowMs: number = Date.now(),
): string {
    const payload: QuoteSharePayload = {
        q: input.quoteId,
        r: input.revisionNo,
        exp: Math.floor(nowMs / 1000) + (input.ttlSeconds ?? QUOTE_SHARE_TTL_SECONDS),
    };
    const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf-8"));
    return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Geçerliyse payload, değilse null (imza/format/süre — hepsi fail-closed). */
export function verifyQuoteShareToken(
    token: string,
    secret: string,
    nowMs: number = Date.now(),
): QuoteSharePayload | null {
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payloadB64, sig] = parts;

    let expected: Buffer;
    let given: Buffer;
    try {
        expected = Buffer.from(sign(payloadB64, secret), "base64url");
        given = Buffer.from(sig, "base64url");
    } catch {
        return null;
    }
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    try {
        const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as QuoteSharePayload;
        if (typeof payload.q !== "string" || !payload.q) return null;
        if (!Number.isFinite(payload.r) || payload.r < 1) return null;
        if (!Number.isFinite(payload.exp)) return null;
        if (payload.exp * 1000 < nowMs) return null;
        return payload;
    } catch {
        return null;
    }
}
