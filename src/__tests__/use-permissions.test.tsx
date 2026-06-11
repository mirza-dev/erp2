// @vitest-environment jsdom
/**
 * RBAC Faz 7a — PermissionProvider + usePermissions context (RTL).
 *
 * Doğruladıkları:
 *   - /api/auth/me'yi BİR KEZ fetch eder (StrictMode'da bile duplicate yok değil —
 *     RTL non-strict tek mount; fetch çağrı sayısı 1)
 *   - Yüklenmeden önce (perms null) has() → true (server gate korur)
 *   - Yüklendikten sonra perms'e göre boolean'lar
 *   - Provider dışında çağrı → güvenli fallback (her şey true)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { PermissionProvider, usePermissions } from "@/lib/auth/use-permissions";

function Probe() {
    const {
        loading,
        internalOperator,
        has,
        canViewSalesPrices,
        canViewPurchaseCosts,
        canViewFinancialSummary,
    } = usePermissions();
    return (
        <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="internal">{String(internalOperator)}</span>
            <span data-testid="sales">{String(canViewSalesPrices)}</span>
            <span data-testid="cost">{String(canViewPurchaseCosts)}</span>
            <span data-testid="fin">{String(canViewFinancialSummary)}</span>
            <span data-testid="manage-orders">{String(has("manage_sales_orders"))}</span>
        </div>
    );
}

const originalFetch = global.fetch;

afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe("usePermissions / PermissionProvider", () => {
    it("sales rolü perm seti → sales true, cost/fin false", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                permissions: ["view_sales_prices", "manage_sales_orders"],
                internalOperator: true,
            }),
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<PermissionProvider><Probe /></PermissionProvider>);

        await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
        expect(screen.getByTestId("sales").textContent).toBe("true");
        expect(screen.getByTestId("internal").textContent).toBe("true");
        expect(screen.getByTestId("cost").textContent).toBe("false");
        expect(screen.getByTestId("fin").textContent).toBe("false");
        expect(screen.getByTestId("manage-orders").textContent).toBe("true");
        // tek fetch
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/me");
    });

    it("purchasing → cost true, sales false", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ permissions: ["view_purchase_costs"] }),
        }) as unknown as typeof fetch;

        render(<PermissionProvider><Probe /></PermissionProvider>);

        await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
        expect(screen.getByTestId("cost").textContent).toBe("true");
        expect(screen.getByTestId("sales").textContent).toBe("false");
    });

    it("fetch başarısız (!ok) → perms null kalır, has() true (server gate korur)", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;

        render(<PermissionProvider><Probe /></PermissionProvider>);

        // perms hiç set edilmez → loading true kalır, booleans true (fallback)
        await waitFor(() => {});
        expect(screen.getByTestId("loading").textContent).toBe("true");
        expect(screen.getByTestId("internal").textContent).toBe("false");
        expect(screen.getByTestId("sales").textContent).toBe("true");
        expect(screen.getByTestId("manage-orders").textContent).toBe("true");
    });

    it("Provider dışında usePermissions → güvenli fallback (her şey true)", () => {
        render(<Probe />);
        expect(screen.getByTestId("loading").textContent).toBe("true");
        expect(screen.getByTestId("internal").textContent).toBe("false");
        expect(screen.getByTestId("sales").textContent).toBe("true");
        expect(screen.getByTestId("cost").textContent).toBe("true");
        expect(screen.getByTestId("fin").textContent).toBe("true");
    });

    it("response internalOperator içermiyorsa bakım erişimini fail-closed tutar", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ permissions: ["view_settings"] }),
        }) as unknown as typeof fetch;

        render(<PermissionProvider><Probe /></PermissionProvider>);

        await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
        expect(screen.getByTestId("internal").textContent).toBe("false");
    });
});
