/**
 * RBAC Faz 5 — admin/users rol atama + last-admin lockout testleri.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockListUsers = vi.fn();
const mockCreateUser = vi.fn();
const mockUpdateUserById = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        auth: {
            admin: {
                listUsers: mockListUsers,
                createUser: mockCreateUser,
                updateUserById: mockUpdateUserById,
                deleteUser: mockDeleteUser,
            },
        },
    }),
    // handleApiError `err instanceof ConfigError` kontrolü için gerekli (R4 throw
    // path'i handleApiError'a düşer).
    ConfigError: class ConfigError extends Error {},
}));

import { GET, POST } from "@/app/api/admin/users/route";
import { PATCH, DELETE } from "@/app/api/admin/users/[id]/route";

const ADMIN = { data: { user: { id: "admin-1", email: "a@pmt.com", app_metadata: { roles: ["admin"] } } } };
const SALES = { data: { user: { id: "s-1", email: "s@pmt.com", app_metadata: { roles: ["sales"] } } } };

function jsonReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("requireAdmin — rol bazlı + zero-admin bootstrap", () => {
    it("admin olmayan (sales) + sistemde admin VAR → 403", async () => {
        mockGetUser.mockResolvedValue(SALES);
        mockListUsers.mockResolvedValue({
            data: { users: [{ id: "admin-1", email: "a@pmt.com", app_metadata: { roles: ["admin"] } }] },
        });
        const res = await GET();
        expect(res.status).toBe(403);
    });
    it("user yok → 401 (bootstrap'tan önce)", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await GET();
        expect(res.status).toBe(401);
    });
    it("zero-admin bootstrap: sistemde hiç admin yokken authd kullanıcı geçer → 200", async () => {
        mockGetUser.mockResolvedValue(SALES);
        mockListUsers.mockResolvedValue({
            data: { users: [{ id: "s-1", email: "s@pmt.com", app_metadata: { roles: ["sales"] } }] },
        });
        const res = await GET();
        expect(res.status).toBe(200); // brick-proof: ilk admin atanana kadar açık
    });
    it("admin user → requireAdmin kısa devre (listUsers'a bakmaz)", async () => {
        mockGetUser.mockResolvedValue(ADMIN);
        mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
        const res = await GET();
        expect(res.status).toBe(200);
    });
});

describe("GET — roller döner", () => {
    it("her kullanıcıya roles alanı (legacy role normalize)", async () => {
        mockGetUser.mockResolvedValue(ADMIN);
        mockListUsers.mockResolvedValue({
            data: {
                users: [
                    { id: "u1", email: "a@pmt.com", created_at: "x", app_metadata: { roles: ["admin"] } },
                    { id: "u2", email: "b@pmt.com", created_at: "x", app_metadata: { role: "purchaser" } },
                    { id: "u3", email: "c@pmt.com", created_at: "x", app_metadata: {} },
                ],
            },
            error: null,
        });
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body[0].roles).toEqual(["admin"]);
        expect(body[1].roles).toEqual(["purchasing"]); // legacy → normalize
        expect(body[2].roles).toEqual(["viewer"]);      // no role → viewer
    });
});

describe("POST — roller ile kullanıcı yaratma", () => {
    beforeEach(() => mockGetUser.mockResolvedValue(ADMIN));

    it("roller normalize edilip app_metadata.roles'a yazılır (viewer-dedup)", async () => {
        mockCreateUser.mockResolvedValue({ data: { user: { id: "new-1", email: "n@pmt.com" } }, error: null });
        const res = await POST(jsonReq({ email: "n@pmt.com", password: "12345678", roles: ["sales", "viewer"] }));
        expect(res.status).toBe(201);
        expect(mockCreateUser).toHaveBeenCalledWith(
            expect.objectContaining({ app_metadata: { roles: ["sales"] } }),
        );
        const body = await res.json();
        expect(body.roles).toEqual(["sales"]);
    });

    it("rol verilmezse → viewer (sessiz yetki YOK)", async () => {
        mockCreateUser.mockResolvedValue({ data: { user: { id: "new-2", email: "m@pmt.com" } }, error: null });
        const res = await POST(jsonReq({ email: "m@pmt.com", password: "12345678" }));
        expect(res.status).toBe(201);
        expect(mockCreateUser).toHaveBeenCalledWith(
            expect.objectContaining({ app_metadata: { roles: ["viewer"] } }),
        );
    });
});

describe("PATCH — rol güncelleme + last-admin guard", () => {
    beforeEach(() => mockGetUser.mockResolvedValue(ADMIN));

    function patchReq(roles: unknown): NextRequest {
        return new NextRequest("http://localhost/api/admin/users/x", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles }),
        });
    }

    it("roller dizi değil → 400", async () => {
        const res = await PATCH(patchReq("admin"), params("u2"));
        expect(res.status).toBe(400);
    });

    it("son admin'in admin rolü kaldırılamaz → 409", async () => {
        mockListUsers.mockResolvedValue({
            data: { users: [{ id: "admin-1", email: "a@pmt.com", app_metadata: { roles: ["admin"] } }] },
        });
        const res = await PATCH(patchReq(["sales"]), params("admin-1"));
        expect(res.status).toBe(409);
        expect(mockUpdateUserById).not.toHaveBeenCalled();
    });

    it("2 admin varken birinin admin'i kaldırılabilir → 200", async () => {
        mockListUsers.mockResolvedValue({
            data: { users: [
                { id: "admin-1", email: "a@pmt.com", app_metadata: { roles: ["admin"] } },
                { id: "admin-2", email: "b@pmt.com", app_metadata: { roles: ["admin"] } },
            ] },
        });
        mockUpdateUserById.mockResolvedValue({ data: { user: { id: "admin-2", email: "b@pmt.com" } }, error: null });
        const res = await PATCH(patchReq(["sales"]), params("admin-2"));
        expect(res.status).toBe(200);
        expect(mockUpdateUserById).toHaveBeenCalledWith("admin-2", { app_metadata: { roles: ["sales"] } });
    });

    it("admin olmayan kullanıcıya rol atama → 200 (guard tetiklenmez)", async () => {
        mockListUsers.mockResolvedValue({
            data: { users: [
                { id: "admin-1", email: "a@pmt.com", app_metadata: { roles: ["admin"] } },
                { id: "u9", email: "u@pmt.com", app_metadata: { roles: ["viewer"] } },
            ] },
        });
        mockUpdateUserById.mockResolvedValue({ data: { user: { id: "u9", email: "u@pmt.com" } }, error: null });
        const res = await PATCH(patchReq(["purchasing"]), params("u9"));
        expect(res.status).toBe(200);
    });
});

describe("DELETE — last-admin guard", () => {
    beforeEach(() => mockGetUser.mockResolvedValue(ADMIN));

    it("son admin silinemez → 409", async () => {
        mockListUsers.mockResolvedValue({
            data: { users: [{ id: "admin-1", email: "a@pmt.com", app_metadata: { roles: ["admin"] } }] },
        });
        const res = await DELETE(new NextRequest("http://localhost/api/admin/users/admin-1", { method: "DELETE" }), params("admin-1"));
        expect(res.status).toBe(409);
        expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it("admin olmayan kullanıcı silinebilir → 200", async () => {
        mockListUsers.mockResolvedValue({
            data: { users: [
                { id: "admin-1", email: "a@pmt.com", app_metadata: { roles: ["admin"] } },
                { id: "u9", email: "u@pmt.com", app_metadata: { roles: ["viewer"] } },
            ] },
        });
        mockDeleteUser.mockResolvedValue({ error: null });
        const res = await DELETE(new NextRequest("http://localhost/api/admin/users/u9", { method: "DELETE" }), params("u9"));
        expect(res.status).toBe(200);
        expect(mockDeleteUser).toHaveBeenCalledWith("u9");
    });
});

describe("R4 — bootstrap fail-open fix (listUsers hatası fail-closed)", () => {
    it("main GET requireAdmin: non-admin + listUsers ERROR → 500 (admin yok varsayma)", async () => {
        mockGetUser.mockResolvedValue(SALES);
        mockListUsers.mockResolvedValue({ data: null, error: { message: "boom" } });
        const res = await GET();
        expect(res.status).toBe(500); // fail-closed: hata varsa bootstrap'a düşme
    });

    it("[id] PATCH requireAdmin: non-admin + listUsers ERROR → 500", async () => {
        mockGetUser.mockResolvedValue(SALES);
        mockListUsers.mockResolvedValue({ data: null, error: { message: "boom" } });
        const req = new NextRequest("http://localhost/api/admin/users/u2", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles: ["sales"] }),
        });
        const res = await PATCH(req, params("u2"));
        expect(res.status).toBe(500);
        expect(mockUpdateUserById).not.toHaveBeenCalled();
    });

    it("[id] PATCH countAdmins: admin + listUsers ERROR → 500 (last-admin lockout bypass önlenir)", async () => {
        mockGetUser.mockResolvedValue(ADMIN); // requireAdmin kısa devre → listUsers'ı countAdmins çağırır
        mockListUsers.mockResolvedValue({ data: null, error: { message: "boom" } });
        const req = new NextRequest("http://localhost/api/admin/users/admin-1", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles: ["sales"] }),
        });
        const res = await PATCH(req, params("admin-1"));
        expect(res.status).toBe(500);
        expect(mockUpdateUserById).not.toHaveBeenCalled();
    });
});
