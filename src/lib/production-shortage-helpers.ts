/**
 * Üretim BOM eksik-bileşen mesaj yardımcısı — SAF (client-safe).
 *
 * `complete_production` RPC (008 hotfix) imalat ürününde bileşen stoğu yetersizse
 * 409 ile `{ error, shortages: [{ component_product_id, component_name,
 * required_qty, available_qty }] }` döner. `addUretimKaydi` (data-context) bu
 * payload'ı kullanıcıya taşır. Bu dosya yalnız saf string dönüşümü içerir —
 * server-only `production-service.ts` (createServiceClient) İMPORT EDİLMEZ;
 * client/server boundary `voice-note-helpers.ts` precedent'i ile korunur.
 */

/** RPC 409 payload'ındaki tek shortage satırı (defansif — alanlar opsiyonel). */
export interface ShortageLine {
    component_product_id?: string;
    component_name?: string;
    required_qty?: number;
    available_qty?: number;
}

/**
 * Eksik bileşenleri "{ad} (gerekli X, mevcut Y)" olarak listeleyip `fallback`
 * mesajına ekler. `shortages` boş/dizi değilse `fallback` aynen döner.
 * `component_name` yoksa `component_product_id`'ye düşülür (RPC her zaman name
 * gönderir ama runtime defansifliği için).
 */
export function buildShortageMessage(
    shortages: unknown,
    fallback: string,
): string {
    if (!Array.isArray(shortages) || shortages.length === 0) return fallback;

    const parts = (shortages as ShortageLine[])
        .map((s) => {
            const label = (s?.component_name || s?.component_product_id || "").toString().trim();
            if (!label) return "";
            const req = Number(s?.required_qty);
            const avail = Number(s?.available_qty);
            const reqStr = Number.isFinite(req) ? req : "?";
            const availStr = Number.isFinite(avail) ? avail : "?";
            return `${label} (gerekli ${reqStr}, mevcut ${availStr})`;
        })
        .filter(Boolean);

    if (parts.length === 0) return fallback;
    return `${fallback} Eksik: ${parts.join("; ")}`;
}
