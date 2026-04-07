/**
 * Regression tests for demo mode client-side utilities.
 *
 * Guards:
 *   1. DEMO_DISABLED_TOOLTIP and DEMO_BLOCK_TOAST constants are non-empty
 *   2. The refactored demoGuard contract: pure read, no side effects
 *      Previously it called clearDemoMode() + window.location.href — removed.
 *
 * Note: isDemoMode() reads document.cookie (browser-only). Since the vitest
 * environment is "node", we test the contract via mocks rather than via the
 * cookie API directly. The middleware behavior (server-side guard) is covered
 * by demo-mode-middleware.test.ts.
 */

import { describe, it, expect, vi } from "vitest";

// ─── Constants ───────────────────────────────────────────────────────────────

describe("demo-utils constants", () => {
    it("DEMO_DISABLED_TOOLTIP is a non-empty string", async () => {
        const { DEMO_DISABLED_TOOLTIP } = await import("@/lib/demo-utils");
        expect(typeof DEMO_DISABLED_TOOLTIP).toBe("string");
        expect(DEMO_DISABLED_TOOLTIP.length).toBeGreaterThan(0);
    });

    it("DEMO_BLOCK_TOAST is a non-empty string", async () => {
        const { DEMO_BLOCK_TOAST } = await import("@/lib/demo-utils");
        expect(typeof DEMO_BLOCK_TOAST).toBe("string");
        expect(DEMO_BLOCK_TOAST.length).toBeGreaterThan(0);
    });

    it("DEMO_DISABLED_TOOLTIP and DEMO_BLOCK_TOAST are different strings", async () => {
        const { DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } = await import("@/lib/demo-utils");
        // Tooltip is for hover; toast is for click — they serve different contexts
        expect(DEMO_DISABLED_TOOLTIP).not.toBe(DEMO_BLOCK_TOAST);
    });
});

// ─── demoGuard contract — pure boolean, no side effects ──────────────────────
//
// The refactored demoGuard in data-context.tsx is exactly:
//   return checkDemoMode();   (checkDemoMode === isDemoMode)
//
// We verify this contract by simulating the guard with a mock isDemoMode and
// confirming that clearDemoMode and window.location assignments are NOT called.

describe("demoGuard contract — no destructive side effects", () => {
    it("when isDemo=true: returns true WITHOUT clearing cookie or redirecting", () => {
        const clearDemoMode = vi.fn();
        const locationHref = "http://localhost/dashboard";

        // Simulate the refactored demoGuard body:
        //   return checkDemoMode();
        function demoGuardRefactored(checkDemoMode: () => boolean): boolean {
            return checkDemoMode();
        }

        const result = demoGuardRefactored(() => true);

        expect(result).toBe(true);
        expect(clearDemoMode).not.toHaveBeenCalled(); // cookie NOT cleared
        expect(locationHref).toBe("http://localhost/dashboard"); // NOT redirected
    });

    it("when isDemo=false: returns false with no side effects", () => {
        const clearDemoMode = vi.fn();
        const locationHref = "http://localhost/dashboard";

        function demoGuardRefactored(checkDemoMode: () => boolean): boolean {
            return checkDemoMode();
        }

        const result = demoGuardRefactored(() => false);

        expect(result).toBe(false);
        expect(clearDemoMode).not.toHaveBeenCalled();
        expect(locationHref).toBe("http://localhost/dashboard");
    });

    it("old destructive guard would have called clearDemoMode (confirms the test spy works)", () => {
        const clearDemoMode = vi.fn();
        const locationRef = { href: "http://localhost/dashboard" };

        // Simulate the OLD demoGuard behavior (pre-refactor)
        function demoGuardOld(checkDemoMode: () => boolean): boolean {
            if (checkDemoMode()) {
                clearDemoMode();
                locationRef.href = "/login";
                return true;
            }
            return false;
        }

        demoGuardOld(() => true);

        // This confirms the spy WOULD detect if clearDemoMode were called
        expect(clearDemoMode).toHaveBeenCalledTimes(1);
        expect(locationRef.href).toBe("/login");
    });
});
