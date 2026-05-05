/**
 * Settings — User Profile API tests
 *
 * GET /api/settings/user/profile — döndürür email + fullName + avatarUrl
 * PATCH /api/settings/user/profile — fullName günceller (validation: 2-100 char)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: mockGetUser },
    }),
}));

const mockDbGetUserProfile = vi.fn();
const mockDbUpdateUserFullName = vi.fn();
vi.mock("@/lib/supabase/user-profile", () => ({
    dbGetUserProfile: (...a: unknown[]) => mockDbGetUserProfile(...a),
    dbUpdateUserFullName: (...a: unknown[]) => mockDbUpdateUserFullName(...a),
    dbUpdateUserAvatarUrl: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/settings/user/profile/route";

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePatchReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/settings/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

// ─── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/settings/user/profile", () => {
    it("user yok → 401", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it("auth'lu user → profile döner", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
        mockDbGetUserProfile.mockResolvedValue({
            id: "u-1",
            email: "user@example.com",
            fullName: "Ahmet Yılmaz",
            avatarUrl: null,
            createdAt: "2026-01-01T00:00:00Z",
        });
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.email).toBe("user@example.com");
        expect(body.fullName).toBe("Ahmet Yılmaz");
        expect(body.avatarUrl).toBeNull();
    });
});

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe("PATCH /api/settings/user/profile", () => {
    beforeEach(() => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "u-1", email: "u@x.com" } } });
        mockDbGetUserProfile.mockResolvedValue({
            id: "u-1", email: "u@x.com", fullName: "Yeni Ad", avatarUrl: null, createdAt: "2026-01-01T00:00:00Z",
        });
    });

    it("user yok → 401", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await PATCH(makePatchReq({ fullName: "Test" }));
        expect(res.status).toBe(401);
    });

    it("boş fullName → 400", async () => {
        const res = await PATCH(makePatchReq({ fullName: "" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("en az 2");
    });

    it("1 karakter → 400", async () => {
        const res = await PATCH(makePatchReq({ fullName: "A" }));
        expect(res.status).toBe(400);
    });

    it("100+ karakter → 400", async () => {
        const longName = "a".repeat(101);
        const res = await PATCH(makePatchReq({ fullName: longName }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("100");
    });

    it("happy path → updated profile döner + dbUpdate çağrılır", async () => {
        mockDbUpdateUserFullName.mockResolvedValue(undefined);
        const res = await PATCH(makePatchReq({ fullName: "Yeni Ad" }));
        expect(res.status).toBe(200);
        expect(mockDbUpdateUserFullName).toHaveBeenCalledWith("u-1", "Yeni Ad");
        const body = await res.json();
        expect(body.fullName).toBe("Yeni Ad");
    });

    it("trim'li input → trim'li güncellenir", async () => {
        mockDbUpdateUserFullName.mockResolvedValue(undefined);
        await PATCH(makePatchReq({ fullName: "  Boşluklu Ad  " }));
        expect(mockDbUpdateUserFullName).toHaveBeenCalledWith("u-1", "Boşluklu Ad");
    });
});
