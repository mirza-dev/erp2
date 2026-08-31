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

/* `enterDemoMode()` KALDIRILDI (2026-08-31). Sıfır çağrı yeri vardı: demo girişi
   `GET /api/auth/demo` sunucu yönlendirmesiyle yapılıyor — o rota cookie'yi
   sunucuda yazıyor ve kendi yorumunda neden tercih edildiğini anlatıyor (React
   olay sistemi / Google Translate sorunları). Ayrıca eslint-config-next 16.3.3
   ile gelen `no-location-assign-relative-destination` kuralının repodaki TEK
   kaynağıydı. Demo girişine ihtiyaç olursa doğru yol o rotadır. */

/** Clear demo cookie */
export function clearDemoMode(): void {
    document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0`;
}
