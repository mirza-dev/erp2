/**
 * Faz 9 — PurchaseOrderDocument format helpers.
 * Extracted from PurchaseOrderDocument.tsx so the component file exports only the component
 * (React Fast Refresh requirement).
 */

export function formatPoCurrency(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat("tr-TR", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        // Defensive: unknown currency code → fallback symbol
        const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
        return `${sym}${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

export function formatPoDate(iso: string | null): string {
    if (!iso) return "—";
    try {
        const [y, m, d] = iso.slice(0, 10).split("-");
        if (!y || !m || !d) return iso;
        return `${d}.${m}.${y}`;
    } catch {
        return iso;
    }
}
