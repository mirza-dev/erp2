/**
 * Minimal Server-Timing ölçümü — kalıcı performans turu Faz 0.
 *
 * Yalnız en yavaş liste/aggregate route'larına eklenir (products?all=1,
 * orders?all=1, dashboard/finance). Tarayıcı DevTools → Network → Timing
 * sekmesinde span'ler görünür; APM kurulumu olmadan route içi maliyet
 * (auth / db / map) ayrıştırılabilir.
 */

export interface TimingSpan {
    name: string;
    ms: number;
}

/** Çağrıldığı andan itibaren geçen süreyi (ms) döndüren stopper. */
export function startSpan(): () => number {
    const t0 = performance.now();
    return () => performance.now() - t0;
}

/**
 * Response'a `Server-Timing` header'ı ekler (mevcut header korunur, virgülle
 * birleşir). Span adları boşluksuz olmalı; ms 1 ondalıkla yazılır.
 */
export function appendServerTiming<T extends Response>(res: T, spans: TimingSpan[]): T {
    if (spans.length === 0) return res;
    const value = spans
        .map(s => `${s.name};dur=${Math.max(0, s.ms).toFixed(1)}`)
        .join(", ");
    const existing = res.headers.get("Server-Timing");
    res.headers.set("Server-Timing", existing ? `${existing}, ${value}` : value);
    return res;
}
