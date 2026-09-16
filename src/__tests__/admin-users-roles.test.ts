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

// Davet servisi (onboarding 2026-09-16) — route testleri gönderimi taklit eder;
// servisin kendisi user-invite.test.ts'te ayrıca test edilir.
const mockInviteAvailable = vi.fn(() => false);
const mockSendUserInvite = vi.fn();
vi.mock("@/lib/services/user-invite-service", () => ({
    inviteAvailable: () => mockInviteAvailable(),
    sendUserInvite: (...a: unknown[]) => mockSendUserInvite(...a),
    randomInvitePassword: () => "Rv1!rastgele-ve-yeterince-uzun-parola-0123456789",
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
        // 2026-09-16: yanıt { users, inviteAvailable } — UI davet seçeneğini bu bayrakla açar.
        expect(body.users[0].roles).toEqual(["admin"]);
        expect(body.users[1].roles).toEqual(["purchasing"]); // legacy → normalize
        expect(body.users[2].roles).toEqual(["viewer"]);      // no role → viewer
        expect(body.inviteAvailable).toBe(false);
    });

    it("e-posta yapılandırılmışsa inviteAvailable=true", async () => {
        mockGetUser.mockResolvedValue(ADMIN);
        mockInviteAvailable.mockReturnValue(true);
        mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
        const body = await (await GET()).json();
        expect(body.inviteAvailable).toBe(true);
        mockInviteAvailable.mockReturnValue(false);
    });
});

describe("POST — davet modu (parolasız; onboarding 2026-09-16)", () => {
    beforeEach(() => {
        mockGetUser.mockResolvedValue(ADMIN);
        mockInviteAvailable.mockReturnValue(true);
        mockSendUserInvite.mockResolvedValue({ ok: true, logId: "log-1" });
    });

    it("e-posta yapılandırılmamışsa 400 email_not_configured — kullanıcı HİÇ yaratılmaz", async () => {
        mockInviteAvailable.mockReturnValue(false);
        const res = await POST(jsonReq({ email: "d@pmt.com", roles: ["sales"], mode: "invite" }));
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("email_not_configured");
        expect(mockCreateUser).not.toHaveBeenCalled();
        expect(mockSendUserInvite).not.toHaveBeenCalled();
    });

    it("davet: rastgele parola + roller + davet gönderimi (actor + origin) → 201 invited", async () => {
        mockCreateUser.mockResolvedValue({ data: { user: { id: "new-9", email: "d@pmt.com" } }, error: null });
        const res = await POST(jsonReq({ email: "d@pmt.com", roles: ["sales"], mode: "invite" }));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body).toMatchObject({ id: "new-9", email: "d@pmt.com", roles: ["sales"], invited: true });
        // Parola istemciden GELMEDİ ama yaratma çağrısı yine parola taşır (rastgele, politikayı aşan).
        const createArg = mockCreateUser.mock.calls[0][0] as { password: string; app_metadata: unknown };
        expect(createArg.password.length).toBeGreaterThan(20);
        expect(createArg.app_metadata).toEqual({ roles: ["sales"] });
        expect(mockSendUserInvite).toHaveBeenCalledWith(expect.objectContaining({
            userId: "new-9",
            email: "d@pmt.com",
            roles: ["sales"],
            inviter: { id: "admin-1", email: "a@pmt.com" },
            origin: "http://localhost",
        }));
        expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it("davet gönderimi düşerse hesap GERİ ALINIR (deleteUser) → 502 invite_send_failed", async () => {
        mockCreateUser.mockResolvedValue({ data: { user: { id: "new-10", email: "d@pmt.com" } }, error: null });
        mockSendUserInvite.mockResolvedValue({ ok: false, error: "resend 500" });
        mockDeleteUser.mockResolvedValue({ error: null });
        const res = await POST(jsonReq({ email: "d@pmt.com", mode: "invite" }));
        expect(res.status).toBe(502);
        expect((await res.json()).code).toBe("invite_send_failed");
        expect(mockDeleteUser).toHaveBeenCalledWith("new-10");
    });

    it("mode verilmezse eski parola yolu aynen (davet servisi çağrılmaz)", async () => {
        mockCreateUser.mockResolvedValue({ data: { user: { id: "new-11", email: "p@pmt.com" } }, error: null });
        const res = await POST(jsonReq({ email: "p@pmt.com", password: "mavi-liman-77-defter" }));
        expect(res.status).toBe(201);
        expect((await res.json()).invited).toBe(false);
        expect(mockSendUserInvite).not.toHaveBeenCalled();
    });
});

describe("POST — roller ile kullanıcı yaratma", () => {
    beforeEach(() => mockGetUser.mockResolvedValue(ADMIN));

    it("roller normalize edilip app_metadata.roles'a yazılır (viewer-dedup)", async () => {
        mockCreateUser.mockResolvedValue({ data: { user: { id: "new-1", email: "n@pmt.com" } }, error: null });
        const res = await POST(jsonReq({ email: "n@pmt.com", password: "mavi-liman-77-defter", roles: ["sales", "viewer"] }));
        expect(res.status).toBe(201);
        expect(mockCreateUser).toHaveBeenCalledWith(
            expect.objectContaining({ app_metadata: { roles: ["sales"] } }),
        );
        const body = await res.json();
        expect(body.roles).toEqual(["sales"]);
    });

    it("rol verilmezse → viewer (sessiz yetki YOK)", async () => {
        mockCreateUser.mockResolvedValue({ data: { user: { id: "new-2", email: "m@pmt.com" } }, error: null });
        const res = await POST(jsonReq({ email: "m@pmt.com", password: "mavi-liman-77-defter" }));
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
