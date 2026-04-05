/**
 * Cookie-based demo mode utilities.
 * Demo mode allows unauthenticated visitors to browse the dashboard (read-only).
 * Middleware reads the same cookie name to gate access.
 */

export const DEMO_COOKIE = "demo_mode";

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
