"use client";

/**
 * Paylaşılan SWR hook'ları — duplicate fetch tekilleştirme (perf Faz 4).
 *
 * Aynı endpoint'i bağımsız çeken komponentler (kur: Ticker + dashboard;
 * profil: Avatar + dashboard + settings; health: Topbar) tek SWR key'i
 * paylaşır → sayfa açılışında endpoint başına TEK istek, navigasyonlar arası
 * cache. refreshInterval'lar eski komponent davranışlarıyla birebir
 * (Ticker 20dk, Health 5dk); profil interval'siz (dedup yeter).
 */

import useSWR, { mutate as globalMutate } from "swr";
import { jsonFetcher, SWR_DEFAULTS } from "./swr-config";

export const EXCHANGE_RATES_KEY = "/api/exchange-rates";
export const USER_PROFILE_KEY = "/api/settings/user/profile";
export const HEALTH_KEY = "/api/health";

const EXCHANGE_REFRESH_MS = 20 * 60 * 1000;
const HEALTH_REFRESH_MS = 5 * 60 * 1000;

/** Ham kur yanıtı — payload validation tüketicide (isRatePayload) kalır. */
export function useExchangeRates(): { ratesData: unknown; ratesResolved: boolean } {
    const { data, isLoading } = useSWR<unknown>(EXCHANGE_RATES_KEY, jsonFetcher, {
        ...SWR_DEFAULTS,
        refreshInterval: EXCHANGE_REFRESH_MS,
    });
    // settle = ilk fetch sonuçlandı (başarı veya hata) — dashboard kur uyarısı
    // fetch bitmeden "kur yok" flash'ı göstermesin diye bekler.
    return { ratesData: data, ratesResolved: !isLoading };
}

export interface UserProfileSummary {
    fullName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
}

export function useUserProfile(): { profile: UserProfileSummary | undefined } {
    const { data } = useSWR<UserProfileSummary>(USER_PROFILE_KEY, jsonFetcher, SWR_DEFAULTS);
    return { profile: data };
}

/**
 * Profil PATCH sonrası paylaşılan cache'i günceller — Topbar avatarı/adı
 * yeniden fetch olmadan anında tazelenir (settings sayfası çağırır).
 */
export async function updateUserProfileCache(updated: UserProfileSummary): Promise<void> {
    await globalMutate(USER_PROFILE_KEY, updated, { revalidate: false });
}

/** Ham health yanıtı — status yorumu tüketicide (isHealthPayload) kalır. */
export function useSystemHealth(): { healthData: unknown; healthError: unknown } {
    const { data, error } = useSWR<unknown>(HEALTH_KEY, jsonFetcher, {
        ...SWR_DEFAULTS,
        refreshInterval: HEALTH_REFRESH_MS,
    });
    return { healthData: data, healthError: error };
}
