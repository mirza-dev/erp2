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
const mockExtractProductDocTarget = vi.fn();
const mockFindCandidates = vi.fn();
const mockStorageDownload = vi.fn();
const mockLoadActiveMatchables = vi.fn();
const mockListLines = vi.fn();
const mockListProductTypes = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
    requireRoleFor: (...a: unknown[]) => mockRequireRole(...a),
    resolveAuthContext: async () => ({ user: { id: "user-1" }, userId: "user-1", roles: ["admin"], perms: new Set() }),
}));

vi.mock("@/lib/supabase/import-documents", () => ({
    dbGetImportDocument: (...a: unknown[]) => mockGetDoc(...a),
}));

vi.mock("@/lib/supabase/import-document-lines", () => ({
    dbReplaceLinesForDocument: (...a: unknown[]) => mockReplaceLines(...a),
    dbListLinesByDocument: (...a: unknown[]) => mockListLines(...a),
}));

vi.mock("@/lib/services/ai-service", () => ({
    aiExtractProductsFromDocument: (...a: unknown[]) => mockExtractProducts(...a),
    aiExtractCertificateTarget: (...a: unknown[]) => mockExtractCert(...a),
    aiExtractProductDocumentTarget: (...a: unknown[]) => mockExtractProductDocTarget(...a),
}));

vi.mock("@/lib/services/product-matcher", async () => {
    const actual = await vi.importActual<typeof import("@/lib/services/product-matcher")>("@/lib/services/product-matcher");
    return {
        ...actual,
        findProductMatchCandidates: (...a: unknown[]) => mockFindCandidates(...a),
        loadActiveMatchables: (...a: unknown[]) => mockLoadActiveMatchables(...a),
    };
});

vi.mock("@/lib/supabase/product-types", () => ({
    dbGetProductTypeWithFields: (...a: unknown[]) => mockGetProductType(...a),
    dbListProductTypes: (...a: unknown[]) => mockListProductTypes(...a),
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
    mockExtractProductDocTarget.mockReset();
    mockFindCandidates.mockReset();
    mockStorageDownload.mockReset();
    mockLoadActiveMatchables.mockReset();
    mockListLines.mockReset();
    mockListProductTypes.mockReset();
    // Default: multi-type mode için boş tip listesi yeterli (parseExtractionResponse'a uyumlu)
    mockListProductTypes.mockResolvedValue([]);
    mockStorageDownload.mockResolvedValue({
        data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
        error: null,
    });
    mockLoadActiveMatchables.mockResolvedValue([]);
    mockListLines.mockResolvedValue([]);
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
        mockRequireRole.mockReturnValueOnce(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(403);
        expect(mockExtractProducts).not.toHaveBeenCalled();
    });
});

describe("POST /api/import/documents/[id]/extract — validation", () => {
    beforeEach(() => mockRequireRole.mockReturnValue(null));

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

    it("returns 400 for migration_excel → Excel/CSV ile Toplu Aktarım", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, document_type: "migration_excel" },
        });
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/Excel\/CSV ile Toplu Aktarım/i);
    });

    it("returns 400 for unsupported types (msds/unknown)", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, document_type: "msds" },
        });
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(400);
    });

    it("operation=product_documents yine de unknown belge tipini ekstraksiyona sokmaz", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: {
                ...PROD_DOC.classification,
                document_type: "unknown",
                operation_type: "product_documents",
            },
        });
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(400);
        expect(mockExtractProductDocTarget).not.toHaveBeenCalled();
    });
});

describe("POST /api/import/documents/[id]/extract — happy product flow", () => {
    beforeEach(() => mockRequireRole.mockReturnValue(null));

    it("product_catalog → extracts + matches + creates lines (201)", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, operation_type: "product_technical_update" },
        });
        mockExtractProducts.mockResolvedValueOnce({
            items: [
                { line: 1, name: "Vana DN50", sku: "KV-50", attributes: { dn: 50 }, confidence: 0.9, product_type_id: null },
                { line: 2, name: "Vana DN100", sku: "KV-100", attributes: { dn: 100 }, confidence: 0.85, product_type_id: null },
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
        expect(mockExtractProducts.mock.calls[0]?.[0]).toMatchObject({
            operationType: "product_technical_update",
        });
        // Per-item matcher called twice
        expect(mockFindCandidates).toHaveBeenCalledTimes(2);
        expect(mockReplaceLines).toHaveBeenCalledTimes(1);
        const linesArg = mockReplaceLines.mock.calls[0]?.[1] as Array<{ match_action: string; matched_product_id: string | null }>;
        // score 95 → matched + product_id set
        expect(linesArg[0].match_action).toBe("matched");
        expect(linesArg[0].matched_product_id).toBe("p-1");
    });

    it("Faz D — source_page + image_region satıra persist edilir", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({
            items: [
                {
                    line: 1, name: "Vana DN50", sku: "KV-50", attributes: { dn: 50 },
                    confidence: 0.9, product_type_id: null,
                    source_page: 4,
                    image_region: { x0: 0.1, y0: 0.2, x1: 0.6, y1: 0.7, confidence: 0.8 },
                },
            ],
        });
        mockFindCandidates.mockResolvedValue([]);
        mockReplaceLines.mockResolvedValueOnce([{ id: "l-1", line_number: 1 }]);

        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(201);
        const linesArg = mockReplaceLines.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
        expect(linesArg[0].source_page).toBe(4);
        expect(linesArg[0].image_region).toEqual({ x0: 0.1, y0: 0.2, x1: 0.6, y1: 0.7, confidence: 0.8 });
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
    beforeEach(() => mockRequireRole.mockReturnValue(null));

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

    it("product_photo → product document target flow + single attachment-target line", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            file_name: "valve-photo.jpg",
            mime_type: "image/jpeg",
            classification: { ...PROD_DOC.classification, document_type: "product_photo" },
        });
        mockExtractProductDocTarget.mockResolvedValueOnce({
            target_name: "Vana DN50",
            target_sku: "KV-50",
            confidence: 0.72,
        });
        mockFindCandidates.mockResolvedValueOnce([
            { id: "p-1", sku: "KV-50", name: "Vana DN50", score: 90, reasons: ["sku_exact"] },
        ]);
        mockReplaceLines.mockResolvedValueOnce([{ id: "l-1", line_number: 1 }]);

        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(201);
        expect(mockExtractProductDocTarget).toHaveBeenCalledTimes(1);
        expect(mockExtractCert).not.toHaveBeenCalled();
        expect(mockExtractProducts).not.toHaveBeenCalled();
        const linesArg = mockReplaceLines.mock.calls[0]?.[1] as Array<{
            extraction_type: string;
            matched_product_id: string | null;
            product_type_id: string | null;
        }>;
        expect(linesArg[0].extraction_type).toBe("certificate_target");
        expect(linesArg[0].matched_product_id).toBe("p-1");
        expect(linesArg[0].product_type_id).toBeNull();
    });

    it("operation=product_documents + product_datasheet → attaches to product instead of product extraction", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: {
                ...PROD_DOC.classification,
                document_type: "product_datasheet",
                operation_type: "product_documents",
            },
        });
        mockExtractProductDocTarget.mockResolvedValueOnce({
            target_name: "Datasheet Vana DN80",
            target_sku: "KV-80",
            confidence: 0.66,
        });
        mockFindCandidates.mockResolvedValueOnce([]);
        mockReplaceLines.mockResolvedValueOnce([{ id: "l-1", line_number: 1 }]);

        const res = await callPOST(makeReq("doc-1", { productTypeId: "ignored-in-document-flow" }), "doc-1");
        expect(res.status).toBe(201);
        expect(mockGetProductType).not.toHaveBeenCalled();
        expect(mockExtractProducts).not.toHaveBeenCalled();
        expect(mockExtractProductDocTarget).toHaveBeenCalledTimes(1);
        const linesArg = mockReplaceLines.mock.calls[0]?.[1] as Array<{ match_action: string; product_type_id: string | null }>;
        expect(linesArg[0].match_action).toBe("new_product");
        expect(linesArg[0].product_type_id).toBeNull();
    });
});

describe("POST /api/import/documents/[id]/extract — error paths", () => {
    beforeEach(() => mockRequireRole.mockReturnValue(null));

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

// ── Review 3b P2/P3 — empty re-extract guard + cache + product_type_id ──

describe("POST extract — Review 3b P2-C (empty re-extract)", () => {
    beforeEach(() => mockRequireRole.mockReturnValue(null));

    it("AI items=[] + existing lines>0 → 422, replace not called", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({ items: [] });
        mockListLines.mockResolvedValueOnce([{ id: "l-old", line_number: 1 }]);
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(422);
        expect(mockReplaceLines).not.toHaveBeenCalled();
    });

    it("AI items=[] + no existing lines → 201 (boş kayıt yazılır, ilk extraction)", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({ items: [] });
        mockListLines.mockResolvedValueOnce([]);
        mockReplaceLines.mockResolvedValueOnce([]);
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(201);
        expect(mockReplaceLines).toHaveBeenCalled();
    });

    it("cert AI tüm null + existing>0 → 422, replace not called", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, document_type: "material_certificate" },
        });
        mockExtractCert.mockResolvedValueOnce({ target_name: null, target_sku: null, confidence: 0 });
        mockListLines.mockResolvedValueOnce([{ id: "l-old", line_number: 1 }]);
        const res = await callPOST(makeReq("doc-1"), "doc-1");
        expect(res.status).toBe(422);
        expect(mockReplaceLines).not.toHaveBeenCalled();
    });
});

describe("POST extract — Review 3b P2/P3-D (productsCache)", () => {
    beforeEach(() => mockRequireRole.mockReturnValue(null));

    it("loadActiveMatchables tek kez çağrılır + matcher cache ile çağrılır (N=3 satır → 1 fetch)", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({
            items: [
                { line: 1, name: "A", sku: "SKU-A", attributes: {}, confidence: 0.9, product_type_id: null },
                { line: 2, name: "B", sku: "SKU-B", attributes: {}, confidence: 0.9, product_type_id: null },
                { line: 3, name: "C", sku: "SKU-C", attributes: {}, confidence: 0.9, product_type_id: null },
            ],
        });
        mockFindCandidates.mockResolvedValue([]);
        mockReplaceLines.mockResolvedValueOnce([]);

        await callPOST(makeReq("doc-1"), "doc-1");
        expect(mockLoadActiveMatchables).toHaveBeenCalledTimes(1);
        // findProductMatchCandidates her item için çağrılır AMA productsCache ile
        expect(mockFindCandidates).toHaveBeenCalledTimes(3);
        // 3. argüman cache (boş array stub) olmalı
        expect(mockFindCandidates.mock.calls[0]?.[2]).toEqual([]);
    });
});

describe("POST extract — Review 3b P2-A (product_type_id persist)", () => {
    beforeEach(() => mockRequireRole.mockReturnValue(null));

    it("body productTypeId restrict → availableProductTypes tek tip + AI o tipi seçer", async () => {
        // Multi-type mode'da body productTypeId = "sadece bu tip" filter semantiği.
        // availableProductTypes route tarafından [single] olarak AI'ya geçer; AI o tek
        // tip içinde seçim yapar. Mock AI dönüş içinde product_type_id'yi de set eder.
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockGetProductType.mockResolvedValueOnce({ id: "type-x", name: "Conta", fields: [] });
        mockExtractProducts.mockResolvedValueOnce({
            items: [{ line: 1, name: "X", sku: "X", attributes: {}, confidence: 0.5, product_type_id: "type-x" }],
        });
        mockFindCandidates.mockResolvedValueOnce([]);
        mockReplaceLines.mockResolvedValueOnce([]);

        await callPOST(makeReq("doc-1", { productTypeId: "type-x" }), "doc-1");
        // availableProductTypes tek elemana indirildi (restrict)
        const aiInput = mockExtractProducts.mock.calls[0]?.[0] as { availableProductTypes: Array<{ id: string }> };
        expect(aiInput.availableProductTypes).toHaveLength(1);
        expect(aiInput.availableProductTypes[0].id).toBe("type-x");
        // AI'nın seçtiği product_type_id satıra persist
        const lines = mockReplaceLines.mock.calls[0]?.[1] as Array<{ product_type_id: string | null }>;
        expect(lines[0].product_type_id).toBe("type-x");
    });

    it("body productTypeId verilmiş ama tip bulunamadı → 400 (storage + cache yüklenmeden, 4.tur)", async () => {
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockGetProductType.mockResolvedValueOnce(null); // tip silinmiş / stale id
        const res = await callPOST(makeReq("doc-1", { productTypeId: "type-deleted" }), "doc-1");
        expect(res.status).toBe(400);
        // 4.tur: early validation — storage download, loadActiveMatchables ve AI hiç çağrılmaz
        expect(mockStorageDownload).not.toHaveBeenCalled();
        expect(mockLoadActiveMatchables).not.toHaveBeenCalled();
        expect(mockExtractProducts).not.toHaveBeenCalled();
        expect(mockReplaceLines).not.toHaveBeenCalled();
    });

    // Review 3b 5.tur P2: cert-flow productTypeId validation bypass
    it("cert-flow + invalid bodyProductTypeId → 201 (validation atlanır, cert extraction çalışır)", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, document_type: "material_certificate" },
        });
        // Cert-flow'da bu çağrılmamalı; ama mock'lansa bile etkilemez
        mockExtractCert.mockResolvedValueOnce({
            target_name: "Vana DN50", target_sku: "KV-50", confidence: 0.8,
        });
        mockFindCandidates.mockResolvedValueOnce([]);
        mockReplaceLines.mockResolvedValueOnce([{ id: "l-1", line_number: 1 }]);

        const res = await callPOST(
            makeReq("doc-1", { productTypeId: "type-deleted-but-cert-doesnt-care" }),
            "doc-1",
        );
        expect(res.status).toBe(201);
        // dbGetProductTypeWithFields cert-flow'da hiç çağrılmamalı (validation atlandı)
        expect(mockGetProductType).not.toHaveBeenCalled();
        expect(mockExtractCert).toHaveBeenCalledTimes(1);
        expect(mockReplaceLines).toHaveBeenCalledTimes(1);
    });

    it("AI null döndü → satır product_type_id null (free-form fallback)", async () => {
        // Multi-type mode: classification suggestion route'a girmez; AI tüm tipler context'inde seçim yapar.
        // AI hiçbir tipe uydurmayıp null bıraktıysa satır null kalır (kullanıcı UI'dan override eder).
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({
            items: [{ line: 1, name: "X", sku: "X", attributes: {}, confidence: 0.5, product_type_id: null }],
        });
        mockFindCandidates.mockResolvedValueOnce([]);
        mockReplaceLines.mockResolvedValueOnce([]);

        await callPOST(makeReq("doc-1"), "doc-1");
        const lines = mockReplaceLines.mock.calls[0]?.[1] as Array<{ product_type_id: string | null }>;
        expect(lines[0].product_type_id).toBeNull();
    });

    it("matcher input'una item.product_type_id forward edilir (Review 3b 6.tur P2)", async () => {
        const VANA = "00000000-0000-4000-8000-000000000001";
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({
            items: [{ line: 1, name: "Vana DN50", sku: "KV-50", attributes: { dn: 50 }, confidence: 0.9, product_type_id: VANA }],
        });
        mockFindCandidates.mockResolvedValueOnce([]);
        mockReplaceLines.mockResolvedValueOnce([]);

        await callPOST(makeReq("doc-1"), "doc-1");
        const matcherInput = mockFindCandidates.mock.calls[0]?.[0] as { product_type_id?: string | null };
        expect(matcherInput.product_type_id).toBe(VANA);
    });

    it("AI per-item tip seçer → satıra AI'nın seçimi persist", async () => {
        // Multi-type mode: AI item 1 vana, item 2 conta seçti — route AI'nın seçimini direkt persist.
        // Uniform inject KALDIRILDI (3.tur multi-type refactor).
        const VANA = "00000000-0000-4000-8000-000000000001";
        const CONTA = "00000000-0000-4000-8000-000000000002";
        mockGetDoc.mockResolvedValueOnce(PROD_DOC);
        mockExtractProducts.mockResolvedValueOnce({
            items: [
                { line: 1, name: "Vana DN50", sku: "KV-50", attributes: {}, confidence: 0.9, product_type_id: VANA },
                { line: 2, name: "Conta DN50", sku: "CT-50", attributes: {}, confidence: 0.85, product_type_id: CONTA },
            ],
        });
        mockFindCandidates.mockResolvedValue([]);
        mockReplaceLines.mockResolvedValueOnce([]);

        await callPOST(makeReq("doc-1"), "doc-1");
        const lines = mockReplaceLines.mock.calls[0]?.[1] as Array<{ product_type_id: string | null }>;
        expect(lines[0].product_type_id).toBe(VANA);
        expect(lines[1].product_type_id).toBe(CONTA);
    });

    it("cert flow product_type_id null (sertifika 3c'de hedef üzerinden belirlenir)", async () => {
        mockGetDoc.mockResolvedValueOnce({
            ...PROD_DOC,
            classification: { ...PROD_DOC.classification, document_type: "material_certificate" },
        });
        mockExtractCert.mockResolvedValueOnce({ target_name: "Vana", target_sku: null, confidence: 0.7 });
        mockFindCandidates.mockResolvedValueOnce([]);
        mockReplaceLines.mockResolvedValueOnce([]);

        await callPOST(makeReq("doc-1"), "doc-1");
        const lines = mockReplaceLines.mock.calls[0]?.[1] as Array<{ product_type_id: string | null }>;
        expect(lines[0].product_type_id).toBeNull();
    });
});
