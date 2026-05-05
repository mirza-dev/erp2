/**
 * Settings — Password Change API tests
 *
 * POST /api/settings/user/password — mevcut şifre doğrulaması + yeni şifre güncelle
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: {
            getUser: mockGetUser,
            updateUser: mockUpdateUser,
        },
    }),
}));

const mockServiceInsert = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({ insert: mockServiceInsert }),
    }),
}));

const mockSignInWithPassword = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        auth: { signInWithPassword: mockSignInWithPassword },
    }),
}));

import { POST } from "@/app/api/settings/user/password/route";

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1", email: "user@example.com" } } });
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    mockServiceInsert.mockResolvedValue({ error: null });
});

function makeReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/settings/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/settings/user/password", () => {
    it("user yok → 401", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await POST(makeReq({ currentPassword: "old", newPassword: "newpassword" }));
        expect(res.status).toBe(401);
    });

    it("currentPassword boş → 400", async () => {
        const res = await POST(makeReq({ currentPassword: "", newPassword: "newpassword" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Mevcut şifre");
    });

    it("newPassword < 8 karakter → 400", async () => {
        const res = await POST(makeReq({ currentPassword: "old", newPassword: "short" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("8 karakter");
    });

    it("currentPassword === newPassword → 400", async () => {
        const res = await POST(makeReq({ currentPassword: "samepass", newPassword: "samepass" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("farklı");
    });

    it("yanlış current password → 400 ile 'Mevcut şifre hatalı'", async () => {
        mockSignInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
        const res = await POST(makeReq({ currentPassword: "wrongpass", newPassword: "newpassword123" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("Mevcut şifre hatalı.");
        expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("happy path → updateUser çağrılır + audit_log kaydı", async () => {
        const res = await POST(makeReq({ currentPassword: "currentpass", newPassword: "newpassword123" }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(mockSignInWithPassword).toHaveBeenCalledWith({
            email: "user@example.com",
            password: "currentpass",
        });
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newpassword123" });
        expect(mockServiceInsert).toHaveBeenCalledWith(expect.objectContaining({
            action: "password_changed",
            entity_type: "user",
            actor: "user@example.com",
        }));
    });

    it("updateUser hatası → 500 + error message", async () => {
        mockUpdateUser.mockResolvedValue({ data: {}, error: { message: "Password too weak" } });
        const res = await POST(makeReq({ currentPassword: "currentpass", newPassword: "newpassword123" }));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe("Password too weak");
    });
});
