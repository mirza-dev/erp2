/**
 * Faz 9 — PurchaseOrderDocument format helpers.
 * Extracted from PurchaseOrderDocument.tsx so the component file exports only the component
 * (React Fast Refresh requirement).
 */

/**
 * `amount` null/undefined → "—". RBAC redaksiyonu (`redactPurchaseOrderForPerms`) maliyet
 * alanlarını null'lar; `Intl.NumberFormat.format(null)` sessizce `₺0,00` basardı — yani
 * "görme yetkin yok" yerine "sıfır" gösterilirdi (`Number(null ?? 0)` tuzağı, RBAC F2/A3
 * dersi). Sıfır ise ölçülmüş bir değerdir ve "₺0,00" olarak basılır.
 */
export function formatPoCurrency(amount: number | null | undefined, currency: string): string {
    if (amount === null || amount === undefined) return "—";
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
