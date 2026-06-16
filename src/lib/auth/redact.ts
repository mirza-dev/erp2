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
    // Denetim O7 (2026-06): quotes ile simetri — iskonto da fiyat sınıfında
    // (quotes discountAmount'ı zaten maskeliyordu, orders açık bırakıyordu).
    nullField(r, "discount_amount");
    if (Array.isArray(r.lines)) {
        r.lines = (r.lines as Row[]).map((l) => {
            const lr: Row = { ...l };
            nullField(lr, "unit_price");
            nullField(lr, "line_total");
            nullField(lr, "discount_pct");
            return lr;
        });
    }
    return r as T;
}

/**
 * DİKKAT — quotes route'ları SNAKE_CASE DEĞİL CAMELCASE döndürür: GET'ler
 * `mapQuoteSummary`/`mapQuoteDetail`'i SERVER'da çağırır, response camelCase
 * çıkar (products/orders'ın aksine). Bu yüzden quote redaction CAMELCASE
 * anahtarları null'lar (`grandTotal`/`subtotal`/`vatTotal`/`discountAmount` +
 * `lines[].unitPrice`/`lineTotal`). snake_case null'lamak burada SIZDIRIR.
 * Sınıf: sales-financial → view_sales_prices.
 */
export function redactQuotesForPerms<T extends object>(items: T[], perms: Set<Permission>): T[] {
    if (perms.has("view_sales_prices")) return items;
    return items.map((q) => {
        const r = { ...q } as Row;
        nullField(r, "grandTotal");
        return r as T;
    });
}

/** Tek teklif (detail route için, camelCase). view_sales_prices yoksa finansal alanlar null. */
export function redactQuoteForPerms<T extends object>(quote: T, perms: Set<Permission>): T {
    if (perms.has("view_sales_prices")) return quote;
    const r = { ...quote } as Row;
    nullField(r, "subtotal");
    nullField(r, "vatTotal");
    nullField(r, "grandTotal");
    nullField(r, "discountAmount");
    if (Array.isArray(r.lines)) {
        r.lines = (r.lines as Row[]).map((l) => {
            const lr: Row = { ...l };
            nullField(lr, "unitPrice");
            nullField(lr, "lineTotal");
            return lr;
        });
    }
    return r as T;
}

/**
 * purchase-orders GET (SNAKE_CASE — raw row, mapper YOK): `subtotal`/`vat_total`/
 * `grand_total` + `lines[].unit_price`/`line_total`. Sınıf: purchase-financial →
 * view_purchase_costs (sales/production/viewer null; purchasing/accounting/admin görür).
 * `vat_rate` (yüzde) ve `discount_pct` (yüzde) finansal değer değil → dokunulmaz.
 */
export function redactPurchaseOrdersForPerms<T extends object>(items: T[], perms: Set<Permission>): T[] {
    if (perms.has("view_purchase_costs")) return items;
    return items.map((p) => redactPurchaseOrderForPerms(p, perms));
}

/**
 * product_vendor_links listesi (SNAKE_CASE). `last_unit_price` satın alma maliyeti →
 * `view_purchase_costs` yoksa null (PO öneri ipucu + RFQ tedarikçi önerisi yüzeyleri).
 * vendor_sku/lead_time/moq fiyat değil → dokunulmaz.
 */
export function redactVendorLinksForPerms<T extends object>(items: T[], perms: Set<Permission>): T[] {
    if (perms.has("view_purchase_costs")) return items;
    return items.map((l) => {
        const r = { ...l } as Row;
        nullField(r, "last_unit_price");
        return r as T;
    });
}

/**
 * supplier_price_history listesi (SNAKE_CASE). `unit_price` → `view_purchase_costs` yoksa null.
 */
export function redactPriceHistoryForPerms<T extends object>(items: T[], perms: Set<Permission>): T[] {
    if (perms.has("view_purchase_costs")) return items;
    return items.map((h) => {
        const r = { ...h } as Row;
        nullField(r, "unit_price");
        return r as T;
    });
}

/**
 * RFQ detayı (SNAKE_CASE — raw row, mapper YOK). Tedarikçi fiyatları satın alma
 * maliyeti sınıfında → `view_purchase_costs` yoksa null. Yapı:
 *   { ...rfq, lines, vendors: [{ ...vendorRow, prices: [{unit_price,...}] }],
 *     price_history: [{unit_price,...}] }
 * Davet/durum/lead-time/MOQ takip alanları fiyat değil → dokunulmaz.
 */
export function redactRfqDetailForPerms<T extends object>(rfq: T, perms: Set<Permission>): T {
    if (perms.has("view_purchase_costs")) return rfq;
    const r = { ...rfq } as Row;
    if (Array.isArray(r.vendors)) {
        r.vendors = (r.vendors as Row[]).map((v) => {
            const vr: Row = { ...v };
            if (Array.isArray(vr.prices)) {
                vr.prices = (vr.prices as Row[]).map((p) => {
                    const pr: Row = { ...p };
                    nullField(pr, "unit_price");
                    return pr;
                });
            }
            return vr;
        });
    }
    if (Array.isArray(r.price_history)) {
        r.price_history = (r.price_history as Row[]).map((h) => {
            const hr: Row = { ...h };
            nullField(hr, "unit_price");
            return hr;
        });
    }
    return r as T;
}

/** Tek PO (detail route için, snake_case). view_purchase_costs yoksa maliyet alanları null. */
export function redactPurchaseOrderForPerms<T extends object>(po: T, perms: Set<Permission>): T {
    if (perms.has("view_purchase_costs")) return po;
    const r = { ...po } as Row;
    nullField(r, "subtotal");
    nullField(r, "vat_total");
    nullField(r, "grand_total");
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
