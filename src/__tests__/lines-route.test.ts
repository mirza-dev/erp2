/**
 * Faz 3b — GET /api/import/documents/[id]/lines tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDoc = vi.fn();
const mockListLines = vi.fn();

vi.mock("@/lib/supabase/import-documents", () => ({
    dbGetImportDocument: (...a: unknown[]) => mockGetDoc(...a),
}));

vi.mock("@/lib/supabase/import-document-lines", () => ({
    dbListLinesByDocument: (...a: unknown[]) => mockListLines(...a),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { NextRequest, NextResponse } from "next/server";

// ── Denetim Y1 (2026-06): route artık view_import şartı arar (demo-dostu requirePermissionFor) ──
const mockResolveAuthContext = vi.fn();
const mockRequirePermissionFor = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: (...a: unknown[]) => mockResolveAuthContext(...a),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermissionFor(...a),
}));

beforeEach(() => {
    mockResolveAuthContext.mockResolvedValue({
        user: { id: "u-1" }, userId: "u-1", roles: ["admin"], perms: new Set(["view_import"]),
    });
    mockRequirePermissionFor.mockReturnValue(null);
    mockGetDoc.mockReset();
    mockListLines.mockReset();
});

async function callGET(id: string) {
    const { GET } = await import("@/app/api/import/documents/[id]/lines/route");
    return GET(new NextRequest(new URL(`http://localhost/api/import/documents/${id}/lines`)), { params: Promise.resolve({ id }) });
}

describe("GET /api/import/documents/[id]/lines", () => {
    it("returns 404 when document not found", async () => {
        mockGetDoc.mockResolvedValueOnce(null);
        const res = await callGET("doc-x");
        expect(res.status).toBe(404);
    });

    it("returns items array when lines exist", async () => {
        mockGetDoc.mockResolvedValueOnce({ id: "doc-1" });
        mockListLines.mockResolvedValueOnce([
            { id: "l-1", line_number: 1 }, { id: "l-2", line_number: 2 },
        ]);
        const res = await callGET("doc-1");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.items.length).toBe(2);
    });

    it("returns empty array when no lines", async () => {
        mockGetDoc.mockResolvedValueOnce({ id: "doc-1" });
        mockListLines.mockResolvedValueOnce([]);
        const res = await callGET("doc-1");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.items).toEqual([]);
    });

    it("DB throw → 500", async () => {
        mockGetDoc.mockResolvedValueOnce({ id: "doc-1" });
        mockListLines.mockRejectedValueOnce(new Error("DB down"));
        const res = await callGET("doc-1");
        expect(res.status).toBe(500);
    });
});

describe("Y1 RBAC guard", () => {
    it("izin yoksa 403 döner ve DB'ye inmez", async () => {
        mockRequirePermissionFor.mockReturnValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await callGET("doc-1");
        expect(res.status).toBe(403);
        expect(mockGetDoc).not.toHaveBeenCalled();
    });
});
