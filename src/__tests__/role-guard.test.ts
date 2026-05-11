/**
 * Faz 3 advisor fix — role-guard tests (4 tests)
 *
 * P1.1: role getCurrentUserRole `user.app_metadata.role` üzerinden okur.
 * `user_metadata` kullanıcı-yazılabilir; `app_metadata` sadece service_role ile yazılır.
 *
 * Covers:
 *   - app_metadata.role === "admin" → "admin"
 *   - app_metadata.role === "purchaser" → "purchaser"
 *   - app_metadata.role yok (auth'd user) → fallback "purchaser"
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

import { getCurrentUserRole } from "@/lib/auth/role-guard";
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

    it("app_metadata.role === 'purchaser' → 'purchaser'", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { id: "u-1", app_metadata: { role: "purchaser" }, user_metadata: {} } },
        });
        const role = await getCurrentUserRole(fakeReq);
        expect(role).toBe("purchaser");
    });

    it("app_metadata.role yok (auth'd) → fallback 'purchaser'", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { id: "u-1", app_metadata: {}, user_metadata: { role: "admin" } } },
        });
        // user_metadata.role='admin' OKUNMAMALI; sadece app_metadata bakılır → fallback purchaser
        const role = await getCurrentUserRole(fakeReq);
        expect(role).toBe("purchaser");
    });

    it("user null (anon) → 'viewer'", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const role = await getCurrentUserRole(fakeReq);
        expect(role).toBe("viewer");
    });
});
