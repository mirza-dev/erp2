/**
 * Settings — User Avatar Upload tests
 *
 * POST /api/settings/user/avatar — multipart, MIME + size validation,
 * path sanitization, orphan cleanup on metadata failure.
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

const mockStorageUpload = vi.fn();
const mockStorageRemove = vi.fn();
const mockStorageGetPublicUrl = vi.fn();

vi.mock("@/lib/supabase/service", () => {
    class ConfigError extends Error {
        readonly code = "CONFIG_ERROR";
        constructor(m: string) { super(m); this.name = "ConfigError"; }
    }
    return {
        ConfigError,
        createServiceClient: () => ({
            storage: {
                from: () => ({
                    upload: mockStorageUpload,
                    remove: mockStorageRemove,
                    getPublicUrl: mockStorageGetPublicUrl,
                }),
            },
        }),
    };
});

const mockDbUpdateUserAvatarUrl = vi.fn();
vi.mock("@/lib/supabase/user-profile", () => ({
    dbUpdateUserAvatarUrl: (...a: unknown[]) => mockDbUpdateUserAvatarUrl(...a),
    dbGetUserProfile: vi.fn(),
    dbUpdateUserFullName: vi.fn(),
}));

import { POST } from "@/app/api/settings/user/avatar/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(file: File | null): NextRequest {
    const fd = new FormData();
    if (file) fd.append("file", file);
    // NextRequest does not natively accept FormData via constructor body, but
    // since we feed FormData → the route uses req.formData() (which works
    // with the Web API standard).
    return new NextRequest("http://localhost/api/settings/user/avatar", {
        method: "POST",
        body: fd,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-uuid-1" } } });
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageRemove.mockResolvedValue({ error: null });
    mockStorageGetPublicUrl.mockReturnValue({
        data: { publicUrl: "https://test.supabase.co/storage/v1/object/public/user-avatars/user-uuid-1.png" },
    });
    mockDbUpdateUserAvatarUrl.mockResolvedValue(undefined);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/settings/user/avatar", () => {
    it("user yok → 401", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const file = new File(["x"], "a.png", { type: "image/png" });
        const res = await POST(makeReq(file));
        expect(res.status).toBe(401);
    });

    it("dosya yok → 400", async () => {
        const res = await POST(makeReq(null));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Dosya");
    });

    it("yasaklı MIME → 400", async () => {
        const file = new File(["x"], "evil.exe", { type: "application/octet-stream" });
        const res = await POST(makeReq(file));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("dosya türü");
    });

    it("boyut > 1MB → 400", async () => {
        const big = new Uint8Array(1024 * 1024 + 1);
        const file = new File([big], "big.png", { type: "image/png" });
        const res = await POST(makeReq(file));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("1MB");
    });

    it("happy path: upload + metadata + avatarUrl döner", async () => {
        const file = new File(["x"], "ok.png", { type: "image/png" });
        const res = await POST(makeReq(file));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.avatarUrl).toContain("user-uuid-1.png");
        expect(body.avatarUrl).toContain("?t=");
        expect(mockStorageUpload).toHaveBeenCalledWith(
            "user-uuid-1.png",
            expect.any(Buffer),
            expect.objectContaining({ upsert: true, contentType: "image/png" })
        );
        expect(mockDbUpdateUserAvatarUrl).toHaveBeenCalledWith("user-uuid-1", expect.stringContaining("user-uuid-1.png"));
    });

    it("path sanitization: malicious extension stripped (path traversal koruma)", async () => {
        const file = new File(["x"], "evil.../../../etc/passwd", { type: "image/png" });
        const res = await POST(makeReq(file));
        // MIME geçtiği için 200, path sanitize edilmiş
        expect(res.status).toBe(200);
        // upload path'inde "../" bulunmamalı
        const calledPath = mockStorageUpload.mock.calls[0][0] as string;
        expect(calledPath).not.toContain("..");
        expect(calledPath).not.toContain("/");
        expect(calledPath).toMatch(/^user-uuid-1\.[a-z0-9]+$/);
    });

    it("metadata güncellemesi başarısız → orphan dosya storage'dan silinir", async () => {
        mockDbUpdateUserAvatarUrl.mockRejectedValue(new Error("metadata write failed"));
        const file = new File(["x"], "ok.png", { type: "image/png" });
        const res = await POST(makeReq(file));
        expect(res.status).toBe(500);
        // Cleanup çağrılmış olmalı
        expect(mockStorageRemove).toHaveBeenCalledWith(["user-uuid-1.png"]);
    });

    it("upload error → 500, metadata güncellenmez", async () => {
        mockStorageUpload.mockResolvedValue({ error: { message: "Upload failed" } });
        const file = new File(["x"], "ok.png", { type: "image/png" });
        const res = await POST(makeReq(file));
        expect(res.status).toBe(500);
        expect(mockDbUpdateUserAvatarUrl).not.toHaveBeenCalled();
    });
});
