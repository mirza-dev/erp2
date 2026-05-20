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

import { NextRequest } from "next/server";

beforeEach(() => {
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
