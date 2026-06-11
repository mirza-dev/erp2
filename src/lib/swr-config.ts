"use client";

/**
 * SWR global yapılandırması — kalıcı performans turu (çekirdek paket).
 *
 * Amaç: aynı endpoint'e eşzamanlı/yakın-zamanlı istekleri tekillemek
 * (dedupingInterval) ve veriyi navigasyonlar arası paylaşmak. ERP bağlamında
 * pencere odağı değişiminde agresif refetch İSTENMİYOR (revalidateOnFocus
 * kapalı) — kullanıcı sekmeler arası gezinirken veri fırtınası geri gelmesin.
 */

export class FetchError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = "FetchError";
        this.status = status;
    }
}

/** Ortak JSON fetcher: !ok → status taşıyan FetchError (SWR error state'i). */
export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new FetchError(`İstek başarısız (HTTP ${res.status}): ${url}`, res.status);
    }
    return res.json() as Promise<T>;
}

export const SWR_DEFAULTS = {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 15_000,
    keepPreviousData: true,
} as const;
