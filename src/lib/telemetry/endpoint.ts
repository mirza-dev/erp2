/**
 * Endpoint normalizasyonu (Developer Console §12, §15).
 *
 * Ham path'i metrik anahtarı olarak saklamak iki şeyi birden bozar:
 *   · `/api/products/<uuid>` her ürün için ayrı satır → tablo şişer, "bu uç
 *     yavaş mı" sorusu cevapsız kalır;
 *   · path istemciden geliyorsa (RUM) veritabanına serbest metin yazma yolu
 *     açılır.
 *
 * Bu yüzden: dinamik segmentler yer tutucuya indirilir VE sonuç katı bir
 * biçim doğrulamasından geçer. Doğrulamayı geçemeyen örnek **atılır** —
 * ham hâliyle saklanmaz.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;
const LONG_TOKEN_RE = /^[A-Za-z0-9_-]{24,}$/;

/** Normalize edilmiş path'in kabul biçimi — küçük harf, yer tutucu, tire. */
const SAFE_PATH_RE = /^\/(?:api|dashboard)(?:\/[a-z0-9_.-]+|\/\[id\]|\/\[token\])*$/;

const MAX_SEGMENTS = 8;
const MAX_LENGTH = 120;

export const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export function isHttpMethod(value: unknown): value is HttpMethod {
    return typeof value === "string" && (HTTP_METHODS as readonly string[]).includes(value);
}

/**
 * `/api/products/3f2a…/attachments/9b1…` → `/api/products/[id]/attachments/[id]`
 * Sorgu dizesi ve hash düşürülür (§ gizlilik: PII query string'de olabilir).
 */
export function normalizeEndpoint(rawPath: string | null | undefined): string | null {
    if (!rawPath || typeof rawPath !== "string") return null;

    let path = rawPath.split("?")[0].split("#")[0].trim();
    if (!path.startsWith("/")) return null;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0 || segments.length > MAX_SEGMENTS) return null;

    const normalized = segments.map(seg => {
        const decoded = safeDecode(seg);
        if (UUID_RE.test(decoded)) return "[id]";
        if (NUMERIC_RE.test(decoded)) return "[id]";
        if (LONG_TOKEN_RE.test(decoded)) return "[token]";
        return decoded.toLowerCase();
    });

    const result = `/${normalized.join("/")}`;
    if (result.length > MAX_LENGTH) return null;
    return SAFE_PATH_RE.test(result) ? result : null;
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** Süre kovaları (ms üst sınırları) — histogramdan p50/p95/p99 türetilir. */
export const DURATION_BUCKETS = [50, 100, 200, 400, 800, 1_600, 3_200, 6_400, 12_800, Infinity] as const;

export const BUCKET_COUNT = DURATION_BUCKETS.length;

/** Süreyi ait olduğu kovanın indeksine çevirir. */
export function bucketIndexFor(durationMs: number): number {
    for (let i = 0; i < DURATION_BUCKETS.length; i++) {
        if (durationMs <= DURATION_BUCKETS[i]) return i;
    }
    return DURATION_BUCKETS.length - 1;
}

/** Yüzdelik sonucu. `overflow` → değer ALT sınır ("> ms"), üst sınır DEĞİL. */
export interface Percentile {
    ms: number;
    overflow: boolean;
}

/**
 * Histogramdan yüzdelik. Kova içi doğrusal enterpolasyon YAPILMAZ — kovanın
 * üst sınırı döner; yani değer "en fazla şu kadar" anlamındadır. Uydurma
 * hassasiyet vermemek için bilinçli (§28).
 *
 * 2026-08 O1 — TAŞMA KOVASI İSTİSNASI: son kova `(12800, ∞)` aralığıdır ve
 * üst sınırı yoktur. Eski kod orada sessizce `DURATION_BUCKETS[i-1]` yani
 * kovanın **ALT** sınırını döndürüyordu; 60 saniyelik bir uç panelde
 * "p99 = 12,8 sn" görünüyor (5× eksik), aynı satırdaki `max_ms` 60000 yazıyor
 * ve ekran kendi kendisiyle çelişiyordu. Üstelik 12,8 sn'yi aşan TÜM uçlar
 * eşit sayıldığı için "en yavaş uç en üstte" sıralaması da çalışmıyordu.
 * Artık değer `overflow: true` ile işaretlenir — UI "> 12,8 sn" yazar,
 * sıralama `maxMs`'e düşer.
 */
export function percentileFromHistogram(
    histogram: readonly number[],
    percentile: number,
): Percentile | null {
    const total = histogram.reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const target = total * percentile;
    let cumulative = 0;
    for (let i = 0; i < histogram.length; i++) {
        cumulative += histogram[i];
        if (cumulative >= target) {
            const upper = DURATION_BUCKETS[i];
            return Number.isFinite(upper)
                ? { ms: upper as number, overflow: false }
                : { ms: DURATION_BUCKETS[i - 1] as number, overflow: true };
        }
    }
    return null;
}
