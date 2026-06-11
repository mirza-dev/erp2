/**
 * resolveAuthContext — kalıcı performans turu Faz 1 (auth tekilleştirme).
 *  - TEK createClient + TEK getUser ile {user, roles, perms} çözer.
 *  - requirePermissionFor / requireRoleFor ek auth çağrısı YAPMAZ ve
 *    requirePermission/requireRole ile aynı kararı verir.
 *  - Source-lock: "guard + ikinci getUser" deseni 11 route'a geri gelmez.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));

import { createClient } from "@/lib/supabase/server";
import {
    resolveAuthContext,
    requirePermissionFor,
    requireRoleFor,
} from "@/lib/auth/role-guard";

beforeEach(() => {
    vi.mocked(createClient).mockClear();
    getUserMock.mockReset();
});

describe("resolveAuthContext", () => {
    it("TEK createClient + TEK getUser çağrısıyla user+roles+perms çözer", async () => {
        getUserMock.mockResolvedValue({
            data: { user: { id: "u1", email: "a@b.c", app_metadata: { roles: ["sales"] } } },
        });
        const ctx = await resolveAuthContext();
        expect(vi.mocked(createClient)).toHaveBeenCalledTimes(1);
        expect(getUserMock).toHaveBeenCalledTimes(1);
        expect(ctx.userId).toBe("u1");
        expect(ctx.roles).toEqual(["sales"]);
        expect(ctx.perms.has("manage_sales_orders")).toBe(true);
    });

    it("user yokken viewer rolü + null userId", async () => {
        getUserMock.mockResolvedValue({ data: { user: null } });
        const ctx = await resolveAuthContext();
        expect(ctx.user).toBeNull();
        expect(ctx.userId).toBeNull();
        expect(ctx.roles).toEqual(["viewer"]);
        expect(ctx.perms.has("manage_sales_orders")).toBe(false);
    });
});

describe("requirePermissionFor / requireRoleFor", () => {
    it("permission varsa null, yoksa 403 — ek auth çağrısı yapmaz", async () => {
        getUserMock.mockResolvedValue({
            data: { user: { id: "u1", email: "a@b.c", app_metadata: { roles: ["sales"] } } },
        });
        const ctx = await resolveAuthContext();
        getUserMock.mockClear();

        expect(requirePermissionFor(ctx, "manage_sales_orders")).toBeNull();
        const denied = requirePermissionFor(ctx, "manage_settings");
        expect(denied?.status).toBe(403);
        expect(getUserMock).not.toHaveBeenCalled();
    });

    it("requireRoleFor: çoklu-rol kesişimi + legacy 'purchaser' normalize", async () => {
        getUserMock.mockResolvedValue({
            data: { user: { id: "u2", email: "p@b.c", app_metadata: { roles: ["purchasing"] } } },
        });
        const ctx = await resolveAuthContext();
        expect(requireRoleFor(ctx, ["admin", "purchaser"])).toBeNull();
        expect(requireRoleFor(ctx, ["admin"])?.status).toBe(403);
    });
});

describe("source-lock — guard + ikinci getUser deseni geri gelmez", () => {
    const root = process.cwd();
    const converted = [
        "src/app/api/orders/route.ts",
        "src/app/api/production/route.ts",
        "src/app/api/production/transcribe/route.ts",
        "src/app/api/quotes/[id]/accept/route.ts",
        "src/app/api/settings/files/route.ts",
        "src/app/api/products/[id]/attachments/route.ts",
        "src/app/api/import/classify/route.ts",
        "src/app/api/import/documents/[id]/apply/route.ts",
        "src/app/api/import/documents/[id]/extract/route.ts",
        "src/app/api/import/document-lines/[id]/route.ts",
        "src/app/api/email/test/route.ts",
    ];
    it("11 route resolveAuthContext kullanır ve route içinde auth.getUser() kalmaz", () => {
        for (const f of converted) {
            const src = readFileSync(join(root, f), "utf8");
            expect(src, f).toMatch(/resolveAuthContext\(\)/);
            expect(src, f).not.toMatch(/\.auth\.getUser\(\)/);
        }
    });
});
