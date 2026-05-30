/**
 * Faz 3 advisor fix — role-guard tests (4 tests)
 *
 * P1.1: role getCurrentUserRole `user.app_metadata.role` üzerinden okur.
 * `user_metadata` kullanıcı-yazılabilir; `app_metadata` sadece service_role ile yazılır.
 *
 * Covers (RBAC Faz 1 sonrası güncel):
 *   - app_metadata.role === "admin" → "admin"
 *   - app_metadata.role === "purchaser" → "purchasing" (legacy alias normalize)
 *   - app_metadata.role yok (auth'd user) → fallback "viewer" (eski "purchaser" DEĞİL)
 *   - user null → "viewer"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: mockGetUser },
    }),
}));

import { getCurrentUserRole, requireRole } from "@/lib/auth/role-guard";
import type { NextRequest } from "next/server";

const fakeReq = {} as NextRequest;

beforeEach(() => {
    mockGetUser.mockReset();
});

describe("getCurrentUserRole — app_metadata read (P1.1)", () => {
    it("app_metadata.role === 'admin' → 'admin'", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { id: "u-1", app_metadata: { role: "admin" }, user_metadata: {} } },
        });
        const role = await getCurrentUserRole(fakeReq);
        expect(role).toBe("admin");
    });

    it("app_metadata.role === 'purchaser' → 'purchasing' (legacy alias normalize)", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { id: "u-1", app_metadata: { role: "purchaser" }, user_metadata: {} } },
        });
        const role = await getCurrentUserRole(fakeReq);
        expect(role).toBe("purchasing");
    });

    it("app_metadata.role yok (auth'd) → fallback 'viewer' (RBAC Faz 1: eski 'purchaser' default kaldırıldı)", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { id: "u-1", app_metadata: {}, user_metadata: { role: "admin" } } },
        });
        // user_metadata.role='admin' OKUNMAMALI; app_metadata boş + ADMIN_EMAILS yok → viewer
        const role = await getCurrentUserRole(fakeReq);
        expect(role).toBe("viewer");
    });

    it("user null (anon) → 'viewer'", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const role = await getCurrentUserRole(fakeReq);
        expect(role).toBe("viewer");
    });
});

describe("requireRole — çoklu-rol kesişim (sıra-bağımsız, legacy normalize)", () => {
    const setRoles = (roles: string[]) =>
        mockGetUser.mockResolvedValue({ data: { user: { id: "u", email: "x@pmt.com", app_metadata: { roles } } } });

    it("['sales','purchasing'] kullanıcı → requireRole(['admin','purchaser']) GEÇER (null)", async () => {
        setRoles(["sales", "purchasing"]);
        expect(await requireRole(fakeReq, ["admin", "purchaser"])).toBeNull();
    });

    it("sıra-bağımsız: ['purchasing','sales'] da GEÇER", async () => {
        setRoles(["purchasing", "sales"]);
        expect(await requireRole(fakeReq, ["admin", "purchaser"])).toBeNull();
    });

    it("['sales'] kullanıcı → requireRole(['admin','purchaser']) 403", async () => {
        setRoles(["sales"]);
        const res = await requireRole(fakeReq, ["admin", "purchaser"]);
        expect(res?.status).toBe(403);
    });

    it("tek-rol ['purchasing'] → requireRole(['admin','purchaser']) GEÇER", async () => {
        setRoles(["purchasing"]);
        expect(await requireRole(fakeReq, ["admin", "purchaser"])).toBeNull();
    });

    it("admin → her guard'dan geçer", async () => {
        setRoles(["admin"]);
        expect(await requireRole(fakeReq, ["admin", "purchaser"])).toBeNull();
    });
});
