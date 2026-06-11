"use client";

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import type { Permission } from "./permissions";

/**
 * RBAC Faz 7 — client permission context.
 *
 * `/api/auth/me`'yi BİR KEZ fetch eder (her component ayrı çağırmasın → Sidebar'ın
 * eski ad-hoc fetch'i bununla dedupe edildi). Sağladığı maskeleme/gating KOZMETİK
 * ikinci katmandır — gerçek güvenlik API redaction (`redact.ts`) + proxy.ts page-gate
 * + route guard'larında. Bu context yalnız UI'ı temiz tutar.
 *
 * Yükleme davranışı: `perms === null` (henüz yüklenmedi) iken `has()` → true döner
 * (Sidebar precedent'i: yüklenirken göster). Leak riski YOK çünkü API zaten redakte
 * etti — gösterilebilecek değer sansürlü-0, gerçek değil.
 */
interface PermissionContextValue {
    /** null = henüz yüklenmedi */
    perms: Set<Permission> | null;
    loading: boolean;
    /** Bakım alanları için fail-closed server-derived kimlik sinyali. */
    internalOperator: boolean;
    /** Yüklenmeden önce (null) true döner — server gate korur. */
    has: (perm: Permission) => boolean;
    canViewSalesPrices: boolean;
    canViewPurchaseCosts: boolean;
    canViewFinancialSummary: boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
    const [perms, setPerms] = useState<Set<Permission> | null>(null);
    const [internalOperator, setInternalOperator] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.permissions)) {
                    setPerms(new Set<Permission>(data.permissions));
                    setInternalOperator(data.internalOperator === true);
                }
            } catch {
                // sessiz — perms null kalır, has() true döner (server gate korur)
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const value = useMemo<PermissionContextValue>(() => {
        const has = (perm: Permission) => perms === null || perms.has(perm);
        return {
            perms,
            loading: perms === null,
            internalOperator,
            has,
            canViewSalesPrices: has("view_sales_prices"),
            canViewPurchaseCosts: has("view_purchase_costs"),
            canViewFinancialSummary: has("view_financial_summary"),
        };
    }, [internalOperator, perms]);

    return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/**
 * Provider dışında çağrılırsa güvenli fallback döner. Genel permission'lar eski
 * davranışla görünür kalır; internalOperator ise bakım alanları için fail-closed
 * false olur. Test/izole render component'leri crash etmez.
 */
export function usePermissions(): PermissionContextValue {
    const ctx = useContext(PermissionContext);
    if (ctx) return ctx;
    return {
        perms: null,
        loading: true,
        internalOperator: false,
        has: () => true,
        canViewSalesPrices: true,
        canViewPurchaseCosts: true,
        canViewFinancialSummary: true,
    };
}
