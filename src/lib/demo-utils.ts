/**
 * Cookie-based demo mode utilities.
 * Demo mode allows unauthenticated visitors to browse the dashboard (read-only).
 * Middleware reads the same cookie name to gate access.
 */

import { useState } from "react";

export const DEMO_COOKIE = "demo_mode";

/** Canonical tooltip for disabled mutation buttons in demo mode */
export const DEMO_DISABLED_TOOLTIP = "Demo modunda devre dışı — değişiklik yapmak için giriş yapın.";

/** Canonical toast message shown when a mutation is attempted in demo mode */
export const DEMO_BLOCK_TOAST = "Demo modunda değişiklik yapamazsınız. Giriş yapın.";

/**
 * Hook that returns whether the current session is in demo mode.
 * Uses lazy state init (same convention as dashboard/layout.tsx:17) — safe in
 * "use client" components since document is always available at mount time.
 */
export function useIsDemo(): boolean {
    const [isDemo] = useState(() => isDemoMode());
    return isDemo;
}

/** Check if demo cookie is set (client-side only) */
export function isDemoMode(): boolean {
    if (typeof document === "undefined") return false;
    return document.cookie.split(";").some(c => c.trim().startsWith(`${DEMO_COOKIE}=1`));
}

/** Set demo cookie and navigate to dashboard */
export function enterDemoMode(): void {
    document.cookie = `${DEMO_COOKIE}=1; path=/; max-age=86400; SameSite=Lax`;
    window.location.href = "/dashboard";
}

/** Clear demo cookie */
export function clearDemoMode(): void {
    document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0`;
}
