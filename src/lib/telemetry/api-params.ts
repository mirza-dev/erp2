import {
    FEED_SOURCES,
    SEVERITIES,
    type FeedSource,
    type Severity,
} from "./console-types";
import type { ErrorGroupStatus } from "@/lib/database.types";

/**
 * Developer Console sorgu parametresi ayrıştırıcıları (saf).
 *
 * Hepsi allowlist mantığıyla çalışır: tanınmayan değer null'a düşer, ham
 * kullanıcı girdisi hiçbir zaman doğrudan sorguya geçmez. Ayrı dosya çünkü
 * altı route aynı eksenleri okuyor ve kurallar testte tek yerden kilitleniyor.
 */

const ERROR_GROUP_STATUSES: readonly ErrorGroupStatus[] = [
    "open", "investigating", "ignored", "resolved",
] as const;

export function parseSeverity(value: string | null): Severity | null {
    return value && (SEVERITIES as readonly string[]).includes(value) ? (value as Severity) : null;
}

export function parseErrorGroupStatus(value: string | null): ErrorGroupStatus | null {
    return value && (ERROR_GROUP_STATUSES as readonly string[]).includes(value)
        ? (value as ErrorGroupStatus)
        : null;
}

export function parseFeedSources(value: string | null): FeedSource[] | undefined {
    if (!value) return undefined;
    const wanted = value.split(",").map(v => v.trim()).filter(Boolean);
    const valid = wanted.filter((v): v is FeedSource =>
        (FEED_SOURCES as readonly string[]).includes(v));
    return valid.length > 0 ? valid : undefined;
}

/** ISO-8601 zaman damgası; geçersizse null (cursor enjeksiyonu kapısı). */
export function parseISODate(value: string | null): string | null {
    if (!value) return null;
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Serbest metin — kırpılır ve uzunluk sınırlanır. */
export function parseText(value: string | null, maxLength = 120): string | null {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return null;
    return trimmed.slice(0, maxLength);
}

/** Sayfa boyutu — tavanlı. */
export function parseLimit(value: string | null, fallback = 50, max = 200): number {
    const n = parseInt(value ?? "", 10);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(max, n);
}

/** UUID doğrulaması — route parametresi sorguya gitmeden önce. */
export function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
