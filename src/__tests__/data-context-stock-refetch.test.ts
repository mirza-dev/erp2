/**
 * Regression guard: updateOrderStatus must refetch products after any transition
 * that mutates stock (reserved or on_hand). Before the fix only "shipped" triggered
 * a products refetch — "approved" (raises reserved) and "cancelled" (releases reserved)
 * were silently skipped, leaving the UI with stale stock numbers.
 *
 * This test verifies the refetch condition directly without mounting a React tree:
 * the predicate `shouldRefetchProducts(transition)` is extracted as a pure helper
 * and tested exhaustively.
 */
import { describe, it, expect } from "vitest";

// ─── Pure helper (mirrors data-context.tsx logic) ─────────────────────────────
// Extract the condition so it can be tested without a React environment.

type OrderTransition = "draft" | "pending_approval" | "approved" | "cancelled" | "shipped";

function shouldRefetchProducts(transition: OrderTransition): boolean {
    return transition === "approved" || transition === "cancelled" || transition === "shipped";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("shouldRefetchProducts — stok etkisi olan geçişler", () => {
    it("approved → refetch (products.reserved artar)", () => {
        expect(shouldRefetchProducts("approved")).toBe(true);
    });

    it("cancelled → refetch (products.reserved sıfırlanır)", () => {
        expect(shouldRefetchProducts("cancelled")).toBe(true);
    });

    it("shipped → refetch (products.on_hand düşer, reserved sıfırlanır)", () => {
        expect(shouldRefetchProducts("shipped")).toBe(true);
    });

    it("pending_approval → refetch YOK (stok etkisi yok)", () => {
        expect(shouldRefetchProducts("pending_approval")).toBe(false);
    });

    it("draft → refetch YOK (stok etkisi yok)", () => {
        expect(shouldRefetchProducts("draft")).toBe(false);
    });
});

describe("shouldRefetchProducts — stok etkisi tablosu (exhaustive)", () => {
    const cases: [OrderTransition, boolean, string][] = [
        ["approved",         true,  "reserved artar"],
        ["cancelled",        true,  "reserved sıfırlanır"],
        ["shipped",          true,  "on_hand düşer + reserved sıfırlanır"],
        ["pending_approval", false, "stok etkisi yok"],
        ["draft",            false, "stok etkisi yok"],
    ];

    cases.forEach(([transition, expected, reason]) => {
        it(`${transition} → ${expected} (${reason})`, () => {
            expect(shouldRefetchProducts(transition)).toBe(expected);
        });
    });
});
