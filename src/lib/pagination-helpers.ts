/**
 * Pagination window algorithm.
 * Extracted from Pagination.tsx so the component file exports only the component
 * (React Fast Refresh requirement).
 */

/**
 * Görünür sayfa numaraları penceresi.
 * total <= 7 → tüm sayfalar.
 * Aksi halde: 1, totalPages, current ± 2; aralar "…" ile.
 */
export function buildPageWindow(current: number, total: number): (number | "…")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set<number>([1, total, current - 2, current - 1, current, current + 1, current + 2]);
    const sorted = [...set].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
        out.push(sorted[i]);
    }
    return out;
}
