import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileOAuthUserRoles } from "@/lib/auth/oauth-provision";

const { mockListUsers, mockUpdateUserById } = vi.hoisted(() => ({
    mockListUsers: vi.fn(),
    mockUpdateUserById: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        auth: {
            admin: {
                listUsers: (...a: unknown[]) => mockListUsers(...a),
                updateUserById: (...a: unknown[]) => mockUpdateUserById(...a),
            },
        },
    }),
}));

const DONOR = {
    id: "donor-1",
    email: "Ali@Firma.com",
    app_metadata: { roles: ["sales", "production"] },
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    mockListUsers.mockResolvedValue({ data: { users: [DONOR] }, error: null });
    mockUpdateUserById.mockResolvedValue({ error: null });
});

describe("reconcileOAuthUserRoles", () => {
    it("aynı e-postalı (case-insensitive) rol sahibi donör varsa rolleri kopyalar", async () => {
        const roles = await reconcileOAuthUserRoles("oauth-1", "ali@firma.com", true);

        expect(roles).toEqual(["sales", "production"]);
        expect(mockUpdateUserById).toHaveBeenCalledWith("oauth-1", {
            app_metadata: { roles: ["sales", "production"] },
        });
    });

    it("e-posta doğrulanmamışsa kopyalama YAPMAZ (hesap ele geçirme vektörü)", async () => {
        const roles = await reconcileOAuthUserRoles("oauth-1", "ali@firma.com", false);

        expect(roles).toBeNull();
        expect(mockListUsers).not.toHaveBeenCalled();
        expect(mockUpdateUserById).not.toHaveBeenCalled();
    });

    it("e-posta yoksa null", async () => {
        expect(await reconcileOAuthUserRoles("oauth-1", null, true)).toBeNull();
        expect(mockListUsers).not.toHaveBeenCalled();
    });

    it("donörün kendisi (aynı id) sayılmaz", async () => {
        mockListUsers.mockResolvedValue({
            data: { users: [{ ...DONOR, id: "oauth-1" }] },
            error: null,
        });
        expect(await reconcileOAuthUserRoles("oauth-1", "ali@firma.com", true)).toBeNull();
        expect(mockUpdateUserById).not.toHaveBeenCalled();
    });

    it("rolsüz aynı-e-postalı kullanıcı donör DEĞİL (viewer fallback'i donörlük sayılmaz)", async () => {
        mockListUsers.mockResolvedValue({
            data: { users: [{ id: "x", email: "ali@firma.com", app_metadata: {} }] },
            error: null,
        });
        expect(await reconcileOAuthUserRoles("oauth-1", "ali@firma.com", true)).toBeNull();
    });

    it("listUsers hatasında null döner (fail-closed)", async () => {
        mockListUsers.mockResolvedValue({ data: { users: [] }, error: { message: "boom" } });
        expect(await reconcileOAuthUserRoles("oauth-1", "ali@firma.com", true)).toBeNull();
    });

    it("updateUserById hatasında null döner (kopyalama teyit edilemedi)", async () => {
        mockUpdateUserById.mockResolvedValue({ error: { message: "denied" } });
        expect(await reconcileOAuthUserRoles("oauth-1", "ali@firma.com", true)).toBeNull();
    });
});
