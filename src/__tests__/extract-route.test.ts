/**
 * Faz 3b — POST /api/import/documents/[id]/extract behavior tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockGetDoc = vi.fn();
const mockReplaceLines = vi.fn();
const mockGetProductType = vi.fn();
const mockExtractProducts = vi.fn();
const mockExtractCert = vi.fn();
const mockFindCandidates = vi.fn();
const mockStorageDownload = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

vi.mock("@/lib/supabase/import-documents", () => ({
    dbGetImportDocument: (...a: unknown[]) => mockGetDoc(...a),
}));

vi.mock("@/lib/supabase/import-document-lines", () => ({
    dbReplaceLinesForDocument: (...a: unknown[]) => mockReplaceLines(...a),
}));

vi.mock("@/lib/services/ai-service", () => ({
    aiExtractProductsFromDocument: (...a: unknown[]) => mockExtractProducts(...a),
    aiExtractCertificateTarget: (...a: unknown[]) => mockExtractCert(...a),
}));

vi.mock("@/lib/services/product-matcher", async () => {
    const actual = await vi.importActual<typeof import("@/lib/services/product-matcher")>("@/lib/services/product-matcher");
    return {
        ...actual,
        findProductMatchCandidates: (...a: unknown[]) => mockFindCandidates(...a),
    };
});

vi.mock("@/lib/supabase/product-types", () => ({
    dbGetProductTypeWithFields: (...a: unknown[]) => mockGetProductType(...a),
}));

vi.mock("@/lib/supabase/service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/supabase/service")>("@/lib/supabase/service");
    return {
        ...actual,
        createServiceClient: () => ({
            storage: { from: () => ({ download: (...a: unknown[]) => mockStorageDownload(...a) }) },
        }),
    };
});

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    }),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { NextRequest } from "next/server";

beforeEach(() => {
    mockRequireRole.mockReset();
    mockGetDoc.mockReset();
    mockReplaceLines.mockReset();
    mockGetProductType.mockReset();
    mockExtractProducts.mockReset();
    mockExtractCert.mockReset();
    mockFindCandidates.mockReset();
    mockStorageDownload.mockReset();
    mockStorageDownload.mockResolvedValue({
        data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
        error: null,
    });
});

function makeReq(id: string, body?: Record<string, unknown>): NextRequest {
    const opts: RequestInit = { method: "POST" };
    if (body) {
        opts.body = JSON.stringify(body);
        opts.headers = { "Content-Type": "application/json" };
    }
    return new NextRequest(new URL(`http://localhost/api/import/documents/${id}/extract`), opts);
}

async function callPOST(req: NextRequest, id: string) {
    const { POST } = await import("@/app/api/import/documents/[id]/extract/route");
    return POST(req, { params: Promise.resolve({ id }) });
}

const PROD_DOC = {
    id: "doc-1", file_path: "import-staging/doc-1.pdf",
    file_name: "catalog.pdf", file_size: 100, mime_type: "application/pdf",
    classification: { document_type: "product_catalog", confidence: 0.9, language: "tr", summary: "", suggested_product_type_id: null },
    status: "classified", error_message: null, classified_at: "2026-01-01", created_by: null, created_at: "2026-01-01",
    batch_id: null,
};

describe("POST /api/import/documents/[id]/extract — auth", () => {
    it("returns 403 from requireRole for viewer", async () => {
        mockRequireRole.mockResolvedValueOnce(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(403);
        expect(mockExtractProducts).not.toHaveBeenCalled();
    });
});

describe("POST /api/import/documents/[id]/extract — validation", () => {
    beforeEach(() => mockRequireRole.mockResolvedValue(null));

    it("returns 404 when document not found", async () => {
        mockGetDoc.mockResolvedValueOnce(null);
        const res = await callPOST(makeReq("doc-x"), "doc-x");
        expect(res.status).toBe(404);
    });

    it("returns 400 when doc status != classified", async () => {
        mockGetDoc.mockResolvedValueOnce({ ...PROD_DOC, status: "pending" });
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(400);
    });

    it("returns 400 for migration_excel → Klasik Mod", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, document_type: "migration_excel" },
        });
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/Klasik/i);
    });

    it("returns 400 for unsupported types (msds/unknown)", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, document_type: "msds" },
        });
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(400);
    });
});

describe("POST /api/import/documents/[id]/extract — happy product flow", () => {
    beforeEach(() => mockRequireRole.mockResolvedValue(null));

    it("product_catalog → extracts + matches + creates lines (201)", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({
            items: [
                { line: 1, name: "Vana DN50", sku: "KV-50", attributes: { dn: 50 }, confidence: 0.9 },
                { line: 2, name: "Vana DN100", sku: "KV-100", attributes: { dn: 100 }, confidence: 0.85 },
            ],
        });
        mockFindCandidates.mockResolvedValue([
            { id: "p-1", sku: "KV-50", name: "Vana DN50", score: 95, reasons: ["sku_exact"] },
        ]);
        mockReplaceLines.mockResolvedValueOnce([
            { id: "l-1", line_number: 1 }, { id: "l-2", line_number: 2 },
        ]);

        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(201);
        expect(mockExtractProducts).toHaveBeenCalledTimes(1);
        // Per-item matcher called twice
        expect(mockFindCandidates).toHaveBeenCalledTimes(2);
        expect(mockReplaceLines).toHaveBeenCalledTimes(1);
        const linesArg = mockReplaceLines.mock.calls[0]?.[1] as Array<{ match_action: string; matched_product_id: string | null }>;
        // score 95 → matched + product_id set
        expect(linesArg[0].match_action).toBe("matched");
        expect(linesArg[0].matched_product_id).toBe("p-1");
    });

    it("body productTypeId override → passed to dbGetProductTypeWithFields", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({ items: [] });
        mockGetProductType.mockResolvedValueOnce({
            id: "type-x", name: "Conta", fields: [],
        });
        mockReplaceLines.mockResolvedValueOnce([]);

        await callPOST(makeReq("doc-1", { productTypeId: "type-x" }), "doc-1");
        expect(mockGetProductType).toHaveBeenCalledWith("type-x");
    });
});

describe("POST /api/import/documents/[id]/extract — certificate flow", () => {
    beforeEach(() => mockRequireRole.mockResolvedValue(null));

    it("material_certificate → single-row line with extraction_type=certificate_target", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, document_type: "material_certificate" },
        });
        mockExtractCert.mockResolvedValueOnce({
            target_name: "Vana DN50", target_sku: "KV-50", confidence: 0.8,
        });
        mockFindCandidates.mockResolvedValueOnce([
            { id: "p-1", sku: "KV-50", name: "Vana DN50", score: 95, reasons: ["sku_exact"] },
        ]);
        mockReplaceLines.mockResolvedValueOnce([{ id: "l-1", line_number: 1 }]);

        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(201);
        expect(mockExtractCert).toHaveBeenCalledTimes(1);
        expect(mockExtractProducts).not.toHaveBeenCalled();
        const linesArg = mockReplaceLines.mock.calls[0]?.[1] as Array<{ extraction_type: string; line_number: number }>;
        expect(linesArg[0].extraction_type).toBe("certificate_target");
        expect(linesArg[0].line_number).toBe(1);
    });
});

describe("POST /api/import/documents/[id]/extract — error paths", () => {
    beforeEach(() => mockRequireRole.mockResolvedValue(null));

    it("storage download fails → 500", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockStorageDownload.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(500);
    });

    it("AI throws AbortError → 499", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockImplementationOnce(async () => {
            const e = new Error("aborted"); (e as Error & { name: string }).name = "AbortError"; throw e;
        });
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(499);
    });

    it("AI throws generic error → handleApiError 500", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockRejectedValueOnce(new Error("network exploded"));
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(500);
    });
});
