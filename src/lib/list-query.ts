/**
 * Sunucu component'lerinde liste sayfası searchParams ayrıştırma yardımcıları
 * (A1 server-side pagination rollout). Her liste sayfası kendi filtre eksenlerini
 * bunlarla okur — tek kaynak, tutarlı kırpma/parse.
 *
 * Next 15+ `searchParams` Promise'tir; await edildikten sonra bu helper'lar
 * ham `string | string[] | undefined` değerleri normalize eder.
 */

export type RawSearchParam = string | string[] | undefined;

/** İlk string değeri döndürür (dizi ise [0]); yoksa "". */
export function firstStr(v: RawSearchParam): string {
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
}

/** 1-tabanlı sayfa numarası (geçersiz/eksik → 1). */
export function parsePage(v: RawSearchParam): number {
    return Math.max(1, parseInt(firstStr(v) || "1", 10) || 1);
}

/**
 * PostgREST `.or()` için çok-kolonlu güvenli ILIKE filtresi (filtre enjeksiyonu
 * önlenir — çift-tırnaklı sarmalama `,` `.` `()` ayraçlarını nötrler; `"`/`\`
 * escape edilir). RFQ buildRfqSearchOrFilter emsali; orders/quotes/PO tek kaynak.
 */
export function orIlikeFilter(columns: readonly string[], search: string): string {
    const escaped = search.trim().replace(/["\\]/g, "\\$&");
    const s = `"%${escaped}%"`;
    return columns.map((c) => `${c}.ilike.${s}`).join(",");
}
