import {
    BUCKET_COUNT,
    bucketIndexFor,
    isHttpMethod,
    normalizeEndpoint,
} from "./endpoint";
import type { RequestMetricUpsertRow } from "@/lib/supabase/telemetry";

/**
 * RUM örneklerini saatlik kovalara indirger (§12, §23, §24).
 *
 * Bu fonksiyon aynı anda bir GÜVENLİK sınırıdır: girdi TARAYICIDAN gelir.
 * Bu yüzden hiçbir alan olduğu gibi geçmez —
 *   · endpoint bilinen bir şablona normalize edilir, edilemezse ÖRNEK ATILIR
 *     (ham string veritabanına yazılmaz);
 *   · method allowlist'ten, status ve süre aralık kontrolünden geçer;
 *   · örnek sayısı tavanlı.
 * Kişisel veri hiç taşınmaz: yalnız method + normalize path + status + süre.
 *
 * Saf ve deterministik (`now` enjekte edilir) → doğrudan test edilir.
 */

export const MAX_SAMPLES_PER_BATCH = 50;
/** 10 dakikayı aşan tekil süre gerçekçi değil; kaza/kötüye kullanım sayılır. */
const MAX_DURATION_MS = 600_000;

export interface RumAggregateResult {
    rows: RequestMetricUpsertRow[];
    accepted: number;
    rejected: number;
}

export function aggregateRumSamples(raw: unknown, now: Date = new Date()): RumAggregateResult {
    if (!Array.isArray(raw)) return { rows: [], accepted: 0, rejected: 0 };

    const bucketAt = truncateToHour(now).toISOString();
    const byKey = new Map<string, RequestMetricUpsertRow>();
    let accepted = 0;
    let rejected = 0;

    for (const item of raw.slice(0, MAX_SAMPLES_PER_BATCH)) {
        const sample = validateSample(item);
        if (!sample) {
            rejected++;
            continue;
        }

        const key = `${sample.method} ${sample.endpoint}`;
        const row = byKey.get(key) ?? {
            bucket_at: bucketAt,
            endpoint: sample.endpoint,
            method: sample.method,
            sample_count: 0,
            sum_ms: 0,
            max_ms: 0,
            histogram: new Array<number>(BUCKET_COUNT).fill(0),
            status_2xx: 0,
            status_3xx: 0,
            status_4xx: 0,
            status_5xx: 0,
        };

        row.sample_count++;
        row.sum_ms += sample.durationMs;
        row.max_ms = Math.max(row.max_ms, sample.durationMs);
        row.histogram[bucketIndexFor(sample.durationMs)]++;
        if (sample.status >= 500) row.status_5xx++;
        else if (sample.status >= 400) row.status_4xx++;
        else if (sample.status >= 300) row.status_3xx++;
        else if (sample.status >= 200) row.status_2xx++;

        byKey.set(key, row);
        accepted++;
    }

    if (raw.length > MAX_SAMPLES_PER_BATCH) rejected += raw.length - MAX_SAMPLES_PER_BATCH;

    return { rows: [...byKey.values()], accepted, rejected };
}

interface ValidSample {
    endpoint: string;
    method: string;
    status: number;
    durationMs: number;
}

function validateSample(item: unknown): ValidSample | null {
    if (!item || typeof item !== "object") return null;
    const s = item as Record<string, unknown>;

    const endpoint = normalizeEndpoint(typeof s.endpoint === "string" ? s.endpoint : null);
    if (!endpoint) return null;

    const method = typeof s.method === "string" ? s.method.toUpperCase() : "";
    if (!isHttpMethod(method)) return null;

    const status = Number(s.status);
    if (!Number.isInteger(status) || status < 100 || status > 599) return null;

    const durationMs = Number(s.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) return null;

    return { endpoint, method, status, durationMs: Math.round(durationMs) };
}

function truncateToHour(date: Date): Date {
    const d = new Date(date.getTime());
    d.setUTCMinutes(0, 0, 0);
    return d;
}
