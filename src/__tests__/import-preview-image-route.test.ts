/**
 * Faz D — GET preview-image route davranış testleri.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetLine = vi.fn();
const mockGetDoc = vi.fn();
const mockDownload = vi.fn();
const mockRenderPdf = vi.fn();

vi.mock("@/lib/supabase/import-document-lines", () => ({
    dbGetLine: (...a: unknown[]) => mockGetLine(...a),
}));
vi.mock("@/lib/supabase/import-documents", () => ({
    dbGetImportDocument: (...a: unknown[]) => mockGetDoc(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        storage: { from: () => ({ download: (...a: unknown[]) => mockDownload(...a) }) },
    }),
}));
vi.mock("@/lib/services/pdf-render", async () => {
    const actual = await vi.importActual<typeof import("@/lib/services/pdf-render")>("@/lib/services/pdf-render");
    return { ...actual, renderPdfPageToPng: (...a: unknown[]) => mockRenderPdf(...a) };
});

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/import/documents/[id]/lines/[lineId]/preview-image/route";

const PDF_DOC = { id: "doc-1", mime_type: "application/pdf", file_path: "staging/doc-1.pdf" };
const LINE = { id: "l-1", document_id: "doc-1", source_page: 2, image_region: null };

function call(id: string, lineId: string) {
    const req = new NextRequest("http://localhost/x");
    return GET(req, { params: Promise.resolve({ id, lineId }) });
}

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
    mockGetLine.mockReset();
    mockGetDoc.mockReset();
    mockDownload.mockReset();
    mockRenderPdf.mockReset();
    mockDownload.mockResolvedValue({ data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, error: null });
    mockRenderPdf.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});

describe("preview-image route", () => {
    it("satır yok → 404", async () => {
        mockGetLine.mockResolvedValueOnce(null);
        const res = await call("doc-1", "l-1");
        expect(res.status).toBe(404);
    });

    it("satır başka belgeye ait → 404", async () => {
        mockGetLine.mockResolvedValueOnce({ ...LINE, document_id: "other" });
        const res = await call("doc-1", "l-1");
        expect(res.status).toBe(404);
    });

    it("source_page null → 400", async () => {
        mockGetLine.mockResolvedValueOnce({ ...LINE, source_page: null });
        const res = await call("doc-1", "l-1");
        expect(res.status).toBe(400);
    });

    it("belge yok → 404", async () => {
        mockGetLine.mockResolvedValueOnce(LINE);
        mockGetDoc.mockResolvedValueOnce(null);
        const res = await call("doc-1", "l-1");
        expect(res.status).toBe(404);
    });

    it("belge PDF değil → 400", async () => {
        mockGetLine.mockResolvedValueOnce(LINE);
        mockGetDoc.mockResolvedValueOnce({ ...PDF_DOC, mime_type: "image/png" });
        const res = await call("doc-1", "l-1");
        expect(res.status).toBe(400);
    });

    it("storage download fail → 502", async () => {
        mockGetLine.mockResolvedValueOnce(LINE);
        mockGetDoc.mockResolvedValueOnce(PDF_DOC);
        mockDownload.mockResolvedValueOnce({ data: null, error: { message: "yok" } });
        const res = await call("doc-1", "l-1");
        expect(res.status).toBe(502);
    });

    it("happy → 200 PNG, tam sayfa (region yok) X-Render-Mode=full-page", async () => {
        mockGetLine.mockResolvedValueOnce(LINE);
        mockGetDoc.mockResolvedValueOnce(PDF_DOC);
        const res = await call("doc-1", "l-1");
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("image/png");
        expect(res.headers.get("X-Render-Mode")).toBe("full-page");
        // render: 0-tabanlı sayfa (2-1=1), clip null
        expect(mockRenderPdf).toHaveBeenCalledWith(expect.anything(), 1, { clip: null });
    });

    it("güvenli region → X-Render-Mode=cropped + clip tuple", async () => {
        mockGetLine.mockResolvedValueOnce({
            ...LINE, source_page: 1,
            image_region: { x0: 0.1, y0: 0.1, x1: 0.7, y1: 0.6, confidence: 0.9 },
        });
        mockGetDoc.mockResolvedValueOnce(PDF_DOC);
        const res = await call("doc-1", "l-1");
        expect(res.status).toBe(200);
        expect(res.headers.get("X-Render-Mode")).toBe("cropped");
        expect(mockRenderPdf).toHaveBeenCalledWith(expect.anything(), 0, { clip: [0.1, 0.1, 0.7, 0.6] });
    });
});

describe("Y1 RBAC guard", () => {
    it("izin yoksa 403 döner ve DB'ye inmez", async () => {
        mockRequirePermissionFor.mockReturnValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await GET({} as never, { params: Promise.resolve({ id: "doc-1", lineId: "line-1" }) });
        expect(res.status).toBe(403);
        expect(mockGetLine).not.toHaveBeenCalled();
    });
});
