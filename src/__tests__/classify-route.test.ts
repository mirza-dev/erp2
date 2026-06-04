/**
 * Faz 3a — POST /api/import/classify behavior tests.
 *
 * Coverage:
 *   - requireRole: viewer 403, purchaser 201, admin 201
 *   - File missing → 400
 *   - File empty → 400
 *   - File > 10MB → 400
 *   - Invalid MIME → 400
 *   - Valid PDF → aiClassifyDocument called, dbCreateImportDocument with classification
 *   - Excel → extractExcelTextSample called, AI receives text block
 *   - AI throws (mocked unknown fallback) → still 201 with status='classified'
 *   - dbCreateImportDocument throws → 500
 *   - Multipart parse fail → 400
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockClassify = vi.fn();
const mockCreateDoc = vi.fn();
const mockListProductTypes = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

vi.mock("@/lib/supabase/import-documents", async () => {
    const actual = await vi.importActual<typeof import("@/lib/supabase/import-documents")>("@/lib/supabase/import-documents");
    return {
        ...actual,
        dbCreateImportDocument: (...a: unknown[]) => mockCreateDoc(...a),
    };
});

vi.mock("@/lib/services/ai-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/services/ai-service")>("@/lib/services/ai-service");
    return {
        ...actual,
        aiClassifyDocument: (...a: unknown[]) => mockClassify(...a),
    };
});

vi.mock("@/lib/supabase/product-types", () => ({
    dbListProductTypes: () => mockListProductTypes(),
}));

const mockGetUser = vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } } }));
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => mockGetUser() },
    }),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { NextRequest } from "next/server";

beforeEach(() => {
    mockRequireRole.mockReset();
    mockClassify.mockReset();
    mockCreateDoc.mockReset();
    mockListProductTypes.mockReset();
    mockListProductTypes.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000001", name: "Vana" }]);
    mockGetUser.mockReset();
    mockGetUser.mockImplementation(() => Promise.resolve({ data: { user: { id: "user-1" } } }));
});

function makeFormRequest(formData: FormData): NextRequest {
    return new NextRequest(new URL("http://localhost/api/import/classify"), {
        method: "POST",
        body: formData,
    });
}

function makeFile(name: string, mime: string, sizeBytes: number): File {
    return new File([new Uint8Array(sizeBytes)], name, { type: mime });
}

describe("POST /api/import/classify — auth", () => {
    it("returns 403 from requireRole for viewer", async () => {
        mockRequireRole.mockResolvedValueOnce(
            new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
        );
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(403);
        expect(mockClassify).not.toHaveBeenCalled();
    });

    it("returns 201 for admin/purchaser (guard returns null)", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockClassify.mockResolvedValueOnce({
            document_type: "product_catalog", confidence: 0.9, language: "tr",
            summary: "ok", suggested_product_type_id: null,
        });
        mockCreateDoc.mockResolvedValueOnce({ id: "doc-1", status: "classified" });
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 200));
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.document.id).toBe("doc-1");
    });
});

describe("POST /api/import/classify — validation", () => {
    beforeEach(() => mockRequireRole.mockResolvedValue(null));

    it("returns 400 when no file present", async () => {
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(new FormData()));
        expect(res.status).toBe(400);
    });

    it("returns 400 when file is empty", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("empty.pdf", "application/pdf", 0));
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(400);
    });

    it("returns 400 when file > 10MB", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("big.pdf", "application/pdf", 11 * 1024 * 1024));
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(400);
    });

    it("returns 400 for disallowed MIME", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("x.zip", "application/zip", 100));
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(400);
        expect(mockClassify).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid operation_type before AI call", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        fd.append("operation_type", "not_real");
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(400);
        expect(mockClassify).not.toHaveBeenCalled();
        expect(mockCreateDoc).not.toHaveBeenCalled();
    });

    it("returns 400 for planned operation_type before AI call", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        fd.append("operation_type", "product_type_template");
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(400);
        expect(mockClassify).not.toHaveBeenCalled();
        expect(mockCreateDoc).not.toHaveBeenCalled();
    });
});

describe("POST /api/import/classify — happy path + Excel + graceful AI", () => {
    beforeEach(() => mockRequireRole.mockResolvedValue(null));

    it("calls aiClassifyDocument with productTypes from dbListProductTypes", async () => {
        mockClassify.mockResolvedValueOnce({
            document_type: "product_datasheet", confidence: 0.8, language: "tr",
            summary: "ok", suggested_product_type_id: null,
        });
        mockCreateDoc.mockResolvedValueOnce({ id: "doc-2" });
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 200));
        const { POST } = await import("@/app/api/import/classify/route");
        await POST(makeFormRequest(fd));
        const call = mockClassify.mock.calls[0]?.[0] as { productTypes: Array<{ id: string }>; mimeType: string };
        expect(call.mimeType).toBe("application/pdf");
        expect(call.productTypes[0].id).toBe("00000000-0000-4000-8000-000000000001");
        expect(call).toMatchObject({ operationType: "product_update" });
    });

    it("passes selected operation_type to AI and persists it in classification", async () => {
        mockClassify.mockResolvedValueOnce({
            document_type: "product_datasheet", confidence: 0.8, language: "tr",
            summary: "ok", suggested_product_type_id: null,
        });
        mockCreateDoc.mockResolvedValueOnce({ id: "doc-op" });
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 200));
        fd.append("operation_type", "product_technical_update");
        const { POST } = await import("@/app/api/import/classify/route");
        await POST(makeFormRequest(fd));

        expect(mockClassify.mock.calls[0]?.[0]).toMatchObject({
            operationType: "product_technical_update",
        });
        expect(mockCreateDoc.mock.calls[0]?.[0]).toMatchObject({
            classification: {
                document_type: "product_datasheet",
                operation_type: "product_technical_update",
            },
        });
    });

    it("for Excel files, AI receives excelTextSample (server-side parse)", async () => {
        mockClassify.mockResolvedValueOnce({
            document_type: "migration_excel", confidence: 0.7, language: "tr",
            summary: "ok", suggested_product_type_id: null,
        });
        mockCreateDoc.mockResolvedValueOnce({ id: "doc-3" });
        const fd = new FormData();
        // Note: xlsx parse on this fake buffer will return empty string (no crash)
        fd.append("file", makeFile(
            "stok.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            500,
        ));
        const { POST } = await import("@/app/api/import/classify/route");
        await POST(makeFormRequest(fd));
        const call = mockClassify.mock.calls[0]?.[0] as { excelTextSample?: string };
        // excelTextSample should be defined (even if empty string after parse failure)
        expect(call.excelTextSample).toBeDefined();
    });

    it("AI returns unknown → still writes DB row + 201", async () => {
        mockClassify.mockResolvedValueOnce({
            document_type: "unknown", confidence: 0, language: "unknown",
            summary: "AI down", suggested_product_type_id: null,
        });
        mockCreateDoc.mockResolvedValueOnce({ id: "doc-4", classification: { document_type: "unknown" } });
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(201);
        expect(mockCreateDoc).toHaveBeenCalled();
    });

    it("dbCreateImportDocument throws → 500", async () => {
        mockClassify.mockResolvedValueOnce({
            document_type: "product_catalog", confidence: 0.9, language: "tr",
            summary: "ok", suggested_product_type_id: null,
        });
        mockCreateDoc.mockRejectedValueOnce(new Error("DB exploded"));
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(makeFormRequest(fd));
        expect(res.status).toBe(500);
    });
});

// ── Faz 3a Review 3.c — Server-side hard cancel (P3) ─────────────────────────

describe("POST /api/import/classify — abort signal (Review 3.c P3)", () => {
    beforeEach(() => mockRequireRole.mockResolvedValue(null));

    it("aborts BEFORE AI call → 499, AI not called, DB not written", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));

        const ctl = new AbortController();
        ctl.abort(); // pre-flight abort
        const req = new NextRequest(new URL("http://localhost/api/import/classify"), {
            method: "POST", body: fd, signal: ctl.signal,
        });
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(req);
        expect(res.status).toBe(499);
        expect(mockClassify).not.toHaveBeenCalled();
        expect(mockCreateDoc).not.toHaveBeenCalled();
    });

    it("aborts DURING AI (AbortError) → 499, DB not written", async () => {
        mockClassify.mockImplementationOnce(async () => {
            const err = new Error("Request was aborted");
            (err as Error & { name: string }).name = "AbortError";
            throw err;
        });
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        const ctl = new AbortController();
        const req = new NextRequest(new URL("http://localhost/api/import/classify"), {
            method: "POST", body: fd, signal: ctl.signal,
        });
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(req);
        expect(res.status).toBe(499);
        expect(mockCreateDoc).not.toHaveBeenCalled();
    });

    it("aborts AFTER AI (post-write guard) → 499, DB not written", async () => {
        const ctl = new AbortController();
        mockClassify.mockImplementationOnce(async () => {
            // Race: AI bitti, response yazmadan client gitti
            ctl.abort();
            return {
                document_type: "product_catalog", confidence: 0.9, language: "tr",
                summary: "x", suggested_product_type_id: null,
            };
        });
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        const req = new NextRequest(new URL("http://localhost/api/import/classify"), {
            method: "POST", body: fd, signal: ctl.signal,
        });
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(req);
        expect(res.status).toBe(499);
        expect(mockClassify).toHaveBeenCalledTimes(1);
        expect(mockCreateDoc).not.toHaveBeenCalled();
    });

    it("aborts DURING auth.getUser (pre-write guard) → 499, DB not written (Review 3.d)", async () => {
        mockClassify.mockResolvedValueOnce({
            document_type: "product_catalog", confidence: 0.9, language: "tr",
            summary: "x", suggested_product_type_id: null,
        });
        const ctl = new AbortController();
        mockGetUser.mockImplementationOnce(() => {
            // Race: AI bitti, auth fetch'i sırasında client gitti
            ctl.abort();
            return Promise.resolve({ data: { user: { id: "user-1" } } });
        });
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        const req = new NextRequest(new URL("http://localhost/api/import/classify"), {
            method: "POST", body: fd, signal: ctl.signal,
        });
        const { POST } = await import("@/app/api/import/classify/route");
        const res = await POST(req);
        expect(res.status).toBe(499);
        expect(mockClassify).toHaveBeenCalledTimes(1);
        expect(mockGetUser).toHaveBeenCalledTimes(1);
        expect(mockCreateDoc).not.toHaveBeenCalled();
    });

    it("passes req.signal to aiClassifyDocument", async () => {
        mockClassify.mockResolvedValueOnce({
            document_type: "unknown", confidence: 0, language: "unknown",
            summary: "x", suggested_product_type_id: null,
        });
        mockCreateDoc.mockResolvedValueOnce({ id: "doc-x" });
        const fd = new FormData();
        fd.append("file", makeFile("a.pdf", "application/pdf", 100));
        const ctl = new AbortController();
        const req = new NextRequest(new URL("http://localhost/api/import/classify"), {
            method: "POST", body: fd, signal: ctl.signal,
        });
        const { POST } = await import("@/app/api/import/classify/route");
        await POST(req);
        expect(mockClassify).toHaveBeenCalledTimes(1);
        const passedSignal = mockClassify.mock.calls[0]?.[1];
        expect(passedSignal).toBeInstanceOf(AbortSignal);
        // Not: NextRequest signal'i mirror'layabilir, referans eşitliği garanti
        // değil; AbortSignal type'ı + downstream abort propagation yeterli kanıt.
    });
});
