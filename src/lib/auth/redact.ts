/**
 * RBAC R3 — Hassas finansal alan redaction (route katmanında).
 *
 * `api-mappers.ts`'e DOKUNMAZ — mapper tam veriyi üretir, route GET'i cache
 * SONRASI per-request redakte eder. Yetki yoksa alan `null`'a çekilir (key
 * silinmez → UI sözleşmesi bozulmaz; "--"/"0,00" gösterir, crash etmez).
 *
 * KRİTİK — Alan adları SNAKE_CASE: products/customers/orders GET route'ları
 * DB row'unu (snake_case) doğrudan döndürür; camelCase'e çeviren `mapX`
 * helper'ları CLIENT tarafında (data-context) çalışır. Redaction route'ta
 * olduğu için DB alan adlarını kullanır (`cost_price`, `total_revenue`,
 * `grand_total`...). camelCase null'lamak alanı SIZDIRIR.
 *
 * KRİTİK — Cache: bu fonksiyonlar cache'in DIŞINDA, per-request çağrılmalı.
 * `perms` cache key'ine GİRMEZ; aksi halde ilk çağıranın yetkisi herkese
 * servis edilir.
 *
 * Pure (next/supabase import yok). Düz obje dizisi üzerinde çalışır → caller
 * tip cast'i ile geçirir; JSON response null'ı taşır. `in` guard'ı sayesinde
 * alanı olmayan satıra null key EKLEMEZ (shape drift yok).
 */
import type { Permission } from "./permissions";

type Row = Record<string, unknown>;

/** Alan varsa null'a çek (yoksa dokunma → spurious key eklenmez). */
function nullField(target: Row, key: string): void {
    if (key in target) target[key] = null;
}

/**
 * products GET (snake_case): `price` ← view_sales_prices;
 * `cost_price` ← view_purchase_costs.
 */
export function redactProductsForPerms<T extends object>(items: T[], perms: Set<Permission>): T[] {
    const sales = perms.has("view_sales_prices");
    const cost = perms.has("view_purchase_costs");
    if (sales && cost) return items;
    return items.map((p) => {
        const r = { ...p } as Row;
        if (!sales) nullField(r, "price");
        if (!cost) nullField(r, "cost_price");
        return r as T;
    });
}

/** customers GET (snake_case): `total_revenue` ← view_financial_summary. */
export function redactCustomersForPerms<T extends object>(items: T[], perms: Set<Permission>): T[] {
    if (perms.has("view_financial_summary")) return items;
    return items.map((c) => {
        const r = { ...c } as Row;
        nullField(r, "total_revenue");
        return r as T;
    });
}

/**
 * orders GET (snake_case): `grand_total`/`subtotal`/`vat_total` +
 * `lines[].unit_price`/`line_total` ← view_sales_prices.
 * List (lines yok) ve detail (lines var) ikisini de güvenle işler.
 */
export function redactOrdersForPerms<T extends object>(items: T[], perms: Set<Permission>): T[] {
    if (perms.has("view_sales_prices")) return items;
    return items.map((o) => redactOrderForPerms(o, perms));
}

/** Tek sipariş (detail route için). view_sales_prices yoksa finansal alanlar null. */
export function redactOrderForPerms<T extends object>(order: T, perms: Set<Permission>): T {
    if (perms.has("view_sales_prices")) return order;
    const r = { ...order } as Row;
    nullField(r, "grand_total");
    nullField(r, "subtotal");
    nullField(r, "vat_total");
    if (Array.isArray(r.lines)) {
        r.lines = (r.lines as Row[]).map((l) => {
            const lr: Row = { ...l };
            nullField(lr, "unit_price");
            nullField(lr, "line_total");
            return lr;
        });
    }
    return r as T;
}
