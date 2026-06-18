/**
 * alerts GET read-guard WIRING testi (denied + allowed path).
 *
 * alerts derin denetimi (2026-06-19) D1 — GET /api/alerts/[id] `view_alerts`
 * guard'ı: `dbGetAlertById` select("*") tam satır döndürür (ai_reason +
 * serbest user_note + created_by); kardeş calendar/calendar-notes/[id]-PATCH
 * hepsi view_alerts/manage_alerts guard'lı, bu GET atlanmıştı. accounting
 * `view_alerts` taşımaz.
 *
 * Gerçek role-guard zinciri (parseRoles → permissionsForRoles → requirePermission);
 * yalnız `createClient` (getUser) rol seçilebilir mock + `serviceGetAlert` no-op.
 * (rbac-mutation-guards.test.ts viewer'a sabit → viewer'ın TAŞIDIĞI view_alerts'i
 * ifade edemez; ayrı dosya — customers-products-read-guards kalıbı.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { permissionsForRoles, type Role } from "@/lib/auth/permissions";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

const mockServiceGetAlert = vi.fn();
vi.mock("@/lib/services/alert-service", () => ({
    serviceGetAlert: (...a: unknown[]) => mockServiceGetAlert(...a),
    serviceUpdateAlertStatus: vi.fn(),
}));

import { GET as alertGet } from "@/app/api/alerts/[id]/route";

function asRoles(roles: Role[]) {
    mockGetUser.mockResolvedValue({
        data: { user: { id: "u-1", email: "u@example.com", app_metadata: { roles } } },
    });
}
const getReq = () => new NextRequest("http://localhost/api/alerts/a1");
const ap = { params: Promise.resolve({ id: "a1" }) };

beforeEach(() => {
    vi.clearAllMocks();
    mockServiceGetAlert.mockResolvedValue({ id: "a1", type: "stock_critical", user_note: "gizli not" });
});

describe("D1 — GET /api/alerts/[id] view_alerts guard", () => {
    it("accounting (view_alerts YOK) → 403", async () => {
        asRoles(["accounting"]);
        const res = await alertGet(getReq(), ap);
        expect(res.status).toBe(403);
        expect(mockServiceGetAlert).not.toHaveBeenCalled(); // guard DB öncesi
    });

    it("viewer (view_alerts VAR) → 403 değil", async () => {
        asRoles(["viewer"]);
        expect((await alertGet(getReq(), ap)).status).not.toBe(403);
    });

    it("perm-fact: accounting view_alerts taşımaz; viewer/production taşır", () => {
        expect(permissionsForRoles(["accounting"]).has("view_alerts")).toBe(false);
        expect(permissionsForRoles(["viewer"]).has("view_alerts")).toBe(true);
        expect(permissionsForRoles(["production"]).has("view_alerts")).toBe(true);
    });
});
