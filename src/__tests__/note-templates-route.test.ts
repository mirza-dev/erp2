/**
 * Teklif V7 Faz 7 — note_templates API route'ları.
 * GET (auth, requireRole YOK → satış da okur) / POST (admin, validation, 201)
 * PATCH (admin, 404/400/200) / DELETE (admin soft-delete, 404/409/200)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbList = vi.fn();
const mockDbCreate = vi.fn();
const mockDbGet = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDeactivate = vi.fn();

vi.mock("@/lib/supabase/note-templates", () => ({
    dbListNoteTemplates: (...a: unknown[]) => mockDbList(...a),
    dbCreateNoteTemplate: (...a: unknown[]) => mockDbCreate(...a),
    dbGetNoteTemplate: (...a: unknown[]) => mockDbGet(...a),
    dbUpdateNoteTemplate: (...a: unknown[]) => mockDbUpdate(...a),
    dbDeactivateNoteTemplate: (...a: unknown[]) => mockDbDeactivate(...a),
    isValidNoteTemplateKind: (k: unknown) =>
        typeof k === "string" && ["notes", "delivery", "payment", "general"].includes(k),
}));

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

import { GET as listGET, POST as listPOST } from "@/app/api/note-templates/route";
import { GET as idGET, PATCH as idPATCH, DELETE as idDELETE } from "@/app/api/note-templates/[id]/route";
import { NextResponse } from "next/server";

const ROW = {
    id: "00000000-0000-4000-8000-000000a00011",
    kind: "payment", title: "%50 Avans", body: "%50 AVANS",
    sort_order: 10, is_active: true,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

function makeReq(body?: unknown, method = "POST", url = "http://localhost/api/note-templates") {
    if (body === undefined) return new Request(url, { method }) as unknown as import("next/server").NextRequest;
    return new Request(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }) as unknown as import("next/server").NextRequest;
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    mockDbList.mockReset();
    mockDbCreate.mockReset();
    mockDbGet.mockReset();
    mockDbUpdate.mockReset();
    mockDbDeactivate.mockReset();
    mockRequireRole.mockReset();
    mockRequireRole.mockResolvedValue(null); // varsayılan: yetkili
});

// ── GET liste ────────────────────────────────────────────────────

describe("GET /api/note-templates", () => {
    it("200 + mapped liste (requireRole çağrılmaz → satış da okur)", async () => {
        mockDbList.mockResolvedValue([ROW]);
        const res = await listGET(makeReq(undefined, "GET"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body[0].title).toBe("%50 Avans");
        expect(body[0].sortOrder).toBe(10); // camelCase mapped
        expect(mockRequireRole).not.toHaveBeenCalled();
    });

    it("?kind=payment → helper'a kind geçer", async () => {
        mockDbList.mockResolvedValue([]);
        await listGET(makeReq(undefined, "GET", "http://localhost/api/note-templates?kind=payment"));
        expect(mockDbList).toHaveBeenCalledWith({ kind: "payment" });
    });

    it("geçersiz ?kind → 400 (fail-closed; tüm şablonları döndürmez)", async () => {
        const res = await listGET(makeReq(undefined, "GET", "http://localhost/api/note-templates?kind=bad"));
        expect(res.status).toBe(400);
        expect(mockDbList).not.toHaveBeenCalled();
    });
});

// ── POST ─────────────────────────────────────────────────────────

describe("POST /api/note-templates", () => {
    it("viewer (403) → dbCreate çağrılmaz", async () => {
        mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await listPOST(makeReq({ kind: "notes", title: "T", body: "B" }));
        expect(res.status).toBe(403);
        expect(mockDbCreate).not.toHaveBeenCalled();
    });

    it("geçersiz kind → 400", async () => {
        const res = await listPOST(makeReq({ kind: "bad", title: "T", body: "B" }));
        expect(res.status).toBe(400);
        expect(mockDbCreate).not.toHaveBeenCalled();
    });

    it("admin + geçerli → 201 + mapped", async () => {
        mockDbCreate.mockResolvedValue(ROW);
        const res = await listPOST(makeReq({ kind: "payment", title: "%50 Avans", body: "%50 AVANS" }));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.kind).toBe("payment");
    });

    it("helper validation error → 400", async () => {
        mockDbCreate.mockRejectedValue(new Error("Başlık zorunludur."));
        const res = await listPOST(makeReq({ kind: "notes", title: "x", body: "B" }));
        expect(res.status).toBe(400);
    });
});

// ── GET [id] ─────────────────────────────────────────────────────

describe("GET /api/note-templates/[id]", () => {
    it("yok → 404", async () => {
        mockDbGet.mockResolvedValue(null);
        const res = await idGET(makeReq(undefined, "GET"), params("nope"));
        expect(res.status).toBe(404);
    });
    it("var → 200 mapped", async () => {
        mockDbGet.mockResolvedValue(ROW);
        const res = await idGET(makeReq(undefined, "GET"), params(ROW.id));
        expect(res.status).toBe(200);
        expect((await res.json()).title).toBe("%50 Avans");
    });
});

// ── PATCH [id] ───────────────────────────────────────────────────

describe("PATCH /api/note-templates/[id]", () => {
    it("viewer → 403", async () => {
        mockRequireRole.mockResolvedValue(NextResponse.json({ error: "x" }, { status: 403 }));
        const res = await idPATCH(makeReq({ title: "Y" }, "PATCH"), params(ROW.id));
        expect(res.status).toBe(403);
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });
    it("yok → 404", async () => {
        mockDbGet.mockResolvedValue(null);
        const res = await idPATCH(makeReq({ title: "Y" }, "PATCH"), params("nope"));
        expect(res.status).toBe(404);
    });
    it("geçersiz kind → 400", async () => {
        mockDbGet.mockResolvedValue(ROW);
        const res = await idPATCH(makeReq({ kind: "bad" }, "PATCH"), params(ROW.id));
        expect(res.status).toBe(400);
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });
    it("admin + geçerli → 200", async () => {
        mockDbGet.mockResolvedValue(ROW);
        mockDbUpdate.mockResolvedValue({ ...ROW, title: "Yeni" });
        const res = await idPATCH(makeReq({ title: "Yeni" }, "PATCH"), params(ROW.id));
        expect(res.status).toBe(200);
        expect((await res.json()).title).toBe("Yeni");
    });
});

// ── DELETE [id] (soft) ───────────────────────────────────────────

describe("DELETE /api/note-templates/[id]", () => {
    it("viewer → 403", async () => {
        mockRequireRole.mockResolvedValue(NextResponse.json({ error: "x" }, { status: 403 }));
        const res = await idDELETE(makeReq(undefined, "DELETE"), params(ROW.id));
        expect(res.status).toBe(403);
        expect(mockDbDeactivate).not.toHaveBeenCalled();
    });
    it("yok → 404", async () => {
        mockDbGet.mockResolvedValue(null);
        const res = await idDELETE(makeReq(undefined, "DELETE"), params("nope"));
        expect(res.status).toBe(404);
    });
    it("zaten pasif → 409", async () => {
        mockDbGet.mockResolvedValue({ ...ROW, is_active: false });
        mockDbDeactivate.mockRejectedValue(new Error("Şablon zaten pasif."));
        const res = await idDELETE(makeReq(undefined, "DELETE"), params(ROW.id));
        expect(res.status).toBe(409);
    });
    it("admin + aktif → 200 soft-delete", async () => {
        mockDbGet.mockResolvedValue(ROW);
        mockDbDeactivate.mockResolvedValue(undefined);
        const res = await idDELETE(makeReq(undefined, "DELETE"), params(ROW.id));
        expect(res.status).toBe(200);
        expect(mockDbDeactivate).toHaveBeenCalledWith(ROW.id);
    });
});
