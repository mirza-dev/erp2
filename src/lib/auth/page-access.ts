/**
 * RBAC Faz 2 — Sayfa erişim matrisi (route → gerekli permission).
 *
 * TEK source-of-truth: hem proxy.ts (server-side enforcement) hem Sidebar
 * (UX filtre) buradan okur. Sidebar'da matris DUPLICATE EDİLMEZ.
 *
 * Pure dosya (next/supabase import yok) → middleware + client + test paylaşır.
 */
import type { Permission } from "@/lib/auth/permissions";

export interface PageAccessRule {
    /** URL prefix; pathname === prefix veya pathname.startsWith(prefix + "/") eşleşir. */
    prefix: string;
    /** Bu sayfaya erişim için gereken permission. */
    permission: Permission;
}

/**
 * Sıra ÖNEMLİ — en spesifik prefix önce gelir (ilk eşleşen kazanır).
 * Örn. /dashboard/settings/users, /dashboard/settings'ten önce.
 * /dashboard exact ayrı ele alınır (aşağıda), çünkü her şey startsWith eder.
 */
export const PAGE_ACCESS: PageAccessRule[] = [
    { prefix: "/dashboard/settings/users", permission: "view_users" },
    { prefix: "/dashboard/settings/product-types", permission: "view_product_types" },
    { prefix: "/dashboard/settings", permission: "view_settings" },
    { prefix: "/dashboard/purchase/suggested", permission: "view_purchase_suggestions" },
    { prefix: "/dashboard/purchase/orders", permission: "view_purchase_orders" },
    { prefix: "/dashboard/quotes", permission: "view_quotes" },
    { prefix: "/dashboard/orders", permission: "view_sales_orders" },
    { prefix: "/dashboard/products", permission: "view_products" },
    { prefix: "/dashboard/vendors", permission: "view_vendors" },
    { prefix: "/dashboard/production", permission: "view_production" },
    { prefix: "/dashboard/import", permission: "view_import" },
    { prefix: "/dashboard/alerts", permission: "view_alerts" },
    { prefix: "/dashboard/parasut", permission: "view_parasut" },
    { prefix: "/dashboard/customers", permission: "view_customers" },
];

/**
 * pathname için gereken permission. Eşleşme yoksa:
 *  - /dashboard (exact) → view_dashboard
 *  - bilinmeyen /dashboard/* alt-yol → null (auth yeterli; yeni sayfayı
 *    yanlışlıkla kilitlememek için fail-open. Hassas yeni sayfa eklenince
 *    PAGE_ACCESS'e satır eklenmeli.)
 *  - /dashboard dışı → null
 */
export function requiredPermissionForPath(pathname: string): Permission | null {
    for (const rule of PAGE_ACCESS) {
        if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/")) {
            return rule.permission;
        }
    }
    if (pathname === "/dashboard") return "view_dashboard";
    return null;
}

/** Verilen permission setiyle pathname'e erişilebilir mi (null kural → serbest). */
export function canAccessPath(pathname: string, perms: Set<Permission>): boolean {
    const required = requiredPermissionForPath(pathname);
    if (required === null) return true;
    return perms.has(required);
}
