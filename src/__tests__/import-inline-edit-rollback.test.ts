/**
 * Sprint B G2 — Inline edit rollback: PATCH /api/import/drafts/[id] hatası.
 *
 * Plan kriteri: "fetch fail → state geri çekilir, toast"
 * Client-side rollback, backend: route PATCH hata döndürmeli ki rollback tetiklensin.
 * Bu test PATCH /api/import/drafts/[id] route'unun davranışını doğrular.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDbGetDraft = vi.fn();
const mockDbUpdateDraft = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetDraft: (...a: unknown[]) => mockDbGetDraft(...a),
    dbUpdateDraft: (...a: unknown[]) => mockDbUpdateDraft(...a),
}));

vi.mock("@/lib/api-error", () => ({
    safeParseJson: async (req: Request) => {
        const data = await req.json();
        return { ok: true, data };
    },
}));

import { PATCH, GET } from "@/app/api/import/drafts/[id]/route";

const PARAMS = { params: Promise.resolve({ id: "draft-abc" }) };

function makeReq(body: unknown, method = "PATCH") {
    return new NextRequest(`http://localhost/api/import/drafts/draft-abc`, {
        method,
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("PATCH /api/import/drafts/[id] — inline edit backend", () => {
    it("başarılı update → 200 + güncellenmiş draft", async () => {
        const updated = { id: "draft-abc", status: "pending", user_corrections: { name: "Yeni" } };
        mockDbUpdateDraft.mockResolvedValue(updated);

        const res = await PATCH(makeReq({ user_corrections: { name: "Yeni" } }), PARAMS);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user_corrections).toEqual({ name: "Yeni" });
    });

    it("dbUpdateDraft throw ederse 500 döner (client-side rollback'i tetikler)", async () => {
        mockDbUpdateDraft.mockRejectedValue(new Error("DB write fail"));

        const res = await PATCH(makeReq({ user_corrections: { name: "X" } }), PARAMS);

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBeDefined();
    });

    it("geçersiz status değeri 400 döner", async () => {
        const res = await PATCH(makeReq({ status: "invalid_status" }), PARAMS);
        expect(res.status).toBe(400);
    });

    it("geçerli status 'confirmed' → 200", async () => {
        mockDbUpdateDraft.mockResolvedValue({ id: "draft-abc", status: "confirmed" });
        const res = await PATCH(makeReq({ status: "confirmed" }), PARAMS);
        expect(res.status).toBe(200);
    });

    it("user_corrections ve status birlikte gönderilebilir", async () => {
        mockDbUpdateDraft.mockResolvedValue({
            id: "draft-abc",
            status: "confirmed",
            user_corrections: { sku: "ABC-001" },
        });
        const res = await PATCH(makeReq({ status: "confirmed", user_corrections: { sku: "ABC-001" } }), PARAMS);
        expect(res.status).toBe(200);
        expect(mockDbUpdateDraft).toHaveBeenCalledWith("draft-abc", {
            status: "confirmed",
            user_corrections: { sku: "ABC-001" },
        });
    });
});

describe("GET /api/import/drafts/[id]", () => {
    it("draft bulunamazsa 404 döner", async () => {
        mockDbGetDraft.mockResolvedValue(null);
        const req = new NextRequest("http://localhost/api/import/drafts/draft-abc");
        const res = await GET(req, PARAMS);
        expect(res.status).toBe(404);
    });

    it("draft varsa 200 + draft döner", async () => {
        mockDbGetDraft.mockResolvedValue({ id: "draft-abc", status: "pending" });
        const req = new NextRequest("http://localhost/api/import/drafts/draft-abc");
        const res = await GET(req, PARAMS);
        expect(res.status).toBe(200);
    });
});
