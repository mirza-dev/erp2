/**
 * RBAC Faz 1 — Roller & Permission tanımları (pure, framework-agnostic).
 *
 * Bu dosya bilinçli olarak `next/server` veya Supabase import ETMEZ — saf
 * fonksiyonlar + sabitler içerir, böylece hem middleware (proxy.ts) hem API
 * route'ları hem de unit testler aynı kaynağı kullanır. Request-bağlı async
 * helper'lar `role-guard.ts`'tedir.
 *
 * Güvenlik kararı: yetki kaynağı YALNIZ `user.app_metadata` (server-only).
 * `user_metadata` kullanıcı tarafından `auth.updateUser` ile yazılabilir →
 * yetkilendirmede ASLA kullanılmaz.
 */

// ── Roller ───────────────────────────────────────────────────────────────
export const ROLES = ["admin", "sales", "purchasing", "production", "accounting", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Türkçe rol etiketleri (admin UI + ileride dashboard maskeleme). */
export const ROLE_LABELS: Record<Role, string> = {
    admin: "Yönetici",
    sales: "Satış",
    purchasing: "Satın Alma",
    production: "Üretim",
    accounting: "Muhasebe",
    viewer: "Görüntüleyici",
};

/**
 * Legacy → kanonik rol normalizasyonu.
 * Eski sistem `app_metadata.role = "purchaser"` yazıyordu; yeni isim
 * `purchasing`. Geriye uyum için "purchaser" okunduğunda "purchasing"e map'lenir.
 * Geçersiz/bilinmeyen değer → null.
 */
export function normalizeRole(raw: unknown): Role | null {
    if (typeof raw !== "string") return null;
    const v = raw.trim().toLowerCase();
    if (v === "purchaser") return "purchasing"; // legacy alias
    return (ROLES as readonly string[]).includes(v) ? (v as Role) : null;
}

// ── Permission'lar ─────────────────────────────────────────────────────────
export const ALL_PERMISSIONS = [
    "view_dashboard",
    "view_quotes", "manage_quotes", "delete_quotes",
    "view_customers", "manage_customers", "delete_customers",
    "view_sales_orders", "manage_sales_orders", "ship_sales_orders", "delete_sales_orders",
    "view_products", "manage_product_master", "manage_product_attachments",
    "stock_adjust_sales_context", "stock_adjust_general",
    "view_purchase_suggestions", "manage_purchase_suggestions",
    "view_purchase_orders", "manage_purchase_orders", "receive_purchase_orders", "delete_purchase_orders",
    "view_vendors", "manage_vendors", "delete_vendors",
    "view_production", "manage_production", "delete_production",
    "view_alerts", "manage_alerts",
    "view_import", "manage_import",
    "view_parasut", "manage_parasut",
    "view_settings", "manage_settings",
    "view_product_types", "manage_product_types",
    "view_users", "manage_users",
    "view_sales_prices", "view_purchase_costs", "view_financial_summary",
] as const;
export type Permission = (typeof ALL_PERMISSIONS)[number];

// ── Rol → permission haritası ──────────────────────────────────────────────
// admin özel-durumdur (tüm permission'lar) — haritada tek tek listelenmez,
// permissionsForRoles() içinde kısa devre yapılır. Diğer roller burada açık.

const SALES_PERMS: Permission[] = [
    "view_dashboard",
    "view_quotes", "manage_quotes", "delete_quotes",
    "view_customers", "manage_customers", "delete_customers",
    "view_sales_orders", "manage_sales_orders", "delete_sales_orders",
    "view_products",
    "stock_adjust_sales_context",
    "view_sales_prices",
    "view_alerts",
];

const PURCHASING_PERMS: Permission[] = [
    "view_dashboard",
    "view_vendors", "manage_vendors", "delete_vendors",
    "view_products", "manage_product_master", "manage_product_attachments",
    "view_purchase_suggestions", "manage_purchase_suggestions",
    "view_purchase_orders", "manage_purchase_orders", "receive_purchase_orders", "delete_purchase_orders",
    "view_customers",
    "view_purchase_costs",
    "view_alerts",
    "view_import", "manage_import",
    "view_product_types", "manage_product_types",
];

const PRODUCTION_PERMS: Permission[] = [
    "view_dashboard",
    "view_products",
    "stock_adjust_general",
    "view_production", "manage_production", "delete_production",
    "view_sales_orders", "ship_sales_orders",
    "view_alerts", "manage_alerts",
];

const ACCOUNTING_PERMS: Permission[] = [
    "view_dashboard",
    "view_quotes",
    "view_sales_orders",
    "view_purchase_orders",
    "view_customers",
    "view_vendors",
    "view_parasut", "manage_parasut",
    "view_sales_prices", "view_purchase_costs", "view_financial_summary",
];

const VIEWER_PERMS: Permission[] = [
    "view_dashboard",
    "view_quotes",
    "view_sales_orders",
    "view_products",
    "view_customers",
    "view_alerts",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    admin: [...ALL_PERMISSIONS],
    sales: SALES_PERMS,
    purchasing: PURCHASING_PERMS,
    production: PRODUCTION_PERMS,
    accounting: ACCOUNTING_PERMS,
    viewer: VIEWER_PERMS,
};

// ── Pure helper'lar ─────────────────────────────────────────────────────────

/**
 * app_metadata + email'den kanonik rol dizisi çıkar.
 *  1) app_metadata.roles (dizi) → geçerli rollerin dedup'lanmış hâli
 *  2) yoksa app_metadata.role (tekil, legacy) → tek-elemanlı dizi
 *  3) yoksa email ∈ adminEmails → ["admin"] (bootstrap/acil fallback)
 *  4) hiçbiri → ["viewer"]
 * user_metadata ASLA okunmaz (çağıran sadece app_metadata geçmeli).
 */
export function parseRoles(
    appMetadata: Record<string, unknown> | null | undefined,
    email: string | null | undefined,
    adminEmails: string[] = [],
): Role[] {
    const rolesRaw = appMetadata?.roles;
    if (Array.isArray(rolesRaw)) {
        const valid = rolesRaw.map(normalizeRole).filter((r): r is Role => r !== null);
        if (valid.length > 0) return Array.from(new Set(valid));
    }
    const single = normalizeRole(appMetadata?.role);
    if (single) return [single];
    if (email && adminEmails.map(e => e.trim().toLowerCase()).includes(email.trim().toLowerCase())) {
        return ["admin"];
    }
    return ["viewer"];
}

/** Rol dizisinden permission seti. admin → tüm permission'lar; diğer → union. */
export function permissionsForRoles(roles: Role[]): Set<Permission> {
    if (roles.includes("admin")) return new Set(ALL_PERMISSIONS);
    const set = new Set<Permission>();
    for (const r of roles) for (const p of ROLE_PERMISSIONS[r]) set.add(p);
    return set;
}

export function hasPermission(perms: Set<Permission>, perm: Permission): boolean {
    return perms.has(perm);
}

export function hasRole(roles: Role[], role: Role): boolean {
    return roles.includes(role);
}

/** Tekil-rol geriye uyumu: admin > operasyonel rol > viewer. */
export function primaryRole(roles: Role[]): Role {
    if (roles.includes("admin")) return "admin";
    const op = roles.find(r => r !== "viewer");
    return op ?? "viewer";
}

/**
 * Kullanıcıya atanacak ham rol girdisini kanonik diziye çevirir (admin UI →
 * app_metadata.roles yazımı için). Geçersizleri eler, dedup eder, legacy
 * normalize eder. Operasyonel rol varsa `viewer` gereksiz → çıkarılır. Hiç
 * geçerli rol yoksa → ["viewer"] (sessiz yetkilendirme YOK).
 */
export function normalizeAssignedRoles(raw: unknown): Role[] {
    if (!Array.isArray(raw)) return ["viewer"];
    const dedup = Array.from(
        new Set(raw.map(normalizeRole).filter((r): r is Role => r !== null)),
    );
    if (dedup.length === 0) return ["viewer"];
    const ops = dedup.filter(r => r !== "viewer");
    return ops.length > 0 ? ops : ["viewer"];
}
