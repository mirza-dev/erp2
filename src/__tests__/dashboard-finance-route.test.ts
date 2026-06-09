/**
 * GET /api/dashboard/finance — RBAC + raporlama para birimi.
 *  - view_purchase_costs yok → cogs:null, RPC çağrılmaz, canViewCosts:false.
 *  - view_purchase_costs var → RPC çağrılır, cogs döner.
 *  - reportingCurrency = company_settings.currency (default USD).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockPerms = vi.fn();
const mockCompany = vi.fn();
const mockCogs = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({ getCurrentUserPermissions: (...a: unknown[]) => mockPerms(...a) }));
vi.mock("@/lib/supabase/company-settings", () => ({ dbGetCompanySettings: (...a: unknown[]) => mockCompany(...a) }));
vi.mock("@/lib/supabase/dashboard-finance", () => ({ dbGetMonthlyCogs: (...a: unknown[]) => mockCogs(...a) }));

import { GET } from "@/app/api/dashboard/finance/route";

function req() {
    return new NextRequest("http://localhost/api/dashboard/finance");
}

beforeEach(() => {
    mockPerms.mockReset();
    mockCompany.mockReset();
    mockCogs.mockReset();
    mockCompany.mockResolvedValue({ currency: "USD" });
});

describe("GET /api/dashboard/finance", () => {
    it("cost yetkisi yok → cogs null, RPC çağrılmaz", async () => {
        mockPerms.mockResolvedValue(new Set<string>(["view_sales_prices"]));
        const res = await GET(req());
        const body = await res.json();
        expect(body.canViewCosts).toBe(false);
        expect(body.cogs).toBeNull();
        expect(mockCogs).not.toHaveBeenCalled();
        expect(body.reportingCurrency).toBe("USD");
    });

    it("cost yetkisi var → RPC çağrılır, cogs döner", async () => {
        mockPerms.mockResolvedValue(new Set<string>(["view_purchase_costs"]));
        mockCogs.mockResolvedValue([{ month: "2026-06", currency: "USD", cogs: 1000 }]);
        const res = await GET(req());
        const body = await res.json();
        expect(body.canViewCosts).toBe(true);
        expect(mockCogs).toHaveBeenCalledTimes(1);
        expect(body.cogs).toEqual([{ month: "2026-06", currency: "USD", cogs: 1000 }]);
    });

    it("reportingCurrency company_settings'ten (TRY); yoksa USD fallback", async () => {
        mockPerms.mockResolvedValue(new Set<string>());
        mockCompany.mockResolvedValueOnce({ currency: "TRY" });
        let body = await (await GET(req())).json();
        expect(body.reportingCurrency).toBe("TRY");

        mockCompany.mockResolvedValueOnce(null);
        body = await (await GET(req())).json();
        expect(body.reportingCurrency).toBe("USD");
    });

    it("RPC başlangıç tarihi (ayın 1'i, YYYY-MM-01) ile çağrılır", async () => {
        mockPerms.mockResolvedValue(new Set<string>(["view_purchase_costs"]));
        mockCogs.mockResolvedValue([]);
        await GET(req());
        const arg = mockCogs.mock.calls[0][0];
        expect(arg).toMatch(/^\d{4}-\d{2}-01$/);
    });
});
