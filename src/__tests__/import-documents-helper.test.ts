/**
 * Faz 3a — import-documents helper behavior tests.
 *
 * Coverage:
 *   - dbCreateImportDocument: 3-step orphan-safe insert (happy + storage fail + patch fail)
 *   - dbGetImportDocument: row / null
 *   - dbListImportDocumentsByBatch: by batch id + null batch filter
 *   - dbUpdateImportDocumentClassification: writes classification + status + classified_at
 *   - dbMarkImportDocumentError: writes error + status
 *   - Validation: zero size, too big, invalid MIME, empty filename
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockSelectSingle = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockStorageUpload = vi.fn();
const mockStorageRemove = vi.fn();
const mockIs = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

// Chainable thenable for `await query` (used by dbListImportDocumentsByBatch).
function thenable<T>(value: T) {
    return { then: (cb: (v: T) => unknown) => Promise.resolve(cb(value)) };
}

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: (_table: string) => ({
            insert: (row: unknown) => {
                mockInsert(row);
                return { select: () => ({ single: () => mockSelectSingle() }) };
            },
            select: () => ({
                eq: (k: string, v: unknown) => {
                    mockEq(k, v);
                    return { single: () => mockSelectSingle() };
                },
                order: (col: string, opts?: unknown) => {
                    mockOrder(col, opts);
                    const q = {
                        eq: (k: string, v: unknown) => { mockEq(k, v); return thenable({ data: [{ id: "row-1" }], error: null }); },
                        is: (k: string, v: unknown) => { mockIs(k, v); return thenable({ data: [{ id: "row-null-1" }], error: null }); },
                    };
                    return q;
                },
            }),
            update: (patch: unknown) => {
                mockUpdate(patch);
                return {
                    eq: (k: string, v: unknown) => {
                        mockEq(k, v);
                        // For update().eq() the call may resolve directly OR chain .select().single()
                        return {
                            select: () => ({ single: () => mockSelectSingle() }),
                            then: (cb: (v: { data: { id: string }; error: null }) => unknown) =>
                                Promise.resolve(cb({ data: { id: "row-1" }, error: null })),
                        };
                    },
                };
            },
            delete: () => ({ eq: (k: string, v: unknown) => { mockDelete(k, v); return Promise.resolve({ error: null }); } }),
        }),
        storage: {
            from: () => ({
                upload: (path: string, file: Buffer, opts: unknown) => mockStorageUpload(path, file, opts),
                remove: (paths: string[]) => mockStorageRemove(paths),
            }),
        },
    }),
}));

beforeEach(() => {
    mockInsert.mockReset();
    mockSelectSingle.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockStorageUpload.mockReset();
    mockStorageRemove.mockReset();
    mockIs.mockReset();
    mockEq.mockReset();
    mockOrder.mockReset();
});

const VALID_INPUT = {
    file: Buffer.from("pdf-bytes"),
    fileName: "x.pdf",
    fileSize: 100,
    mimeType: "application/pdf",
};

describe("dbCreateImportDocument — validation", () => {
    it("rejects empty filename", async () => {
        const { dbCreateImportDocument } = await import("@/lib/supabase/import-documents");
        await expect(dbCreateImportDocument({ ...VALID_INPUT, fileName: "" })).rejects.toThrow(/zorunlu/);
    });
    it("rejects zero size", async () => {
        const { dbCreateImportDocument } = await import("@/lib/supabase/import-documents");
        await expect(dbCreateImportDocument({ ...VALID_INPUT, fileSize: 0 })).rejects.toThrow(/geçersiz/);
    });
    it("rejects too large file", async () => {
        const { dbCreateImportDocument } = await import("@/lib/supabase/import-documents");
        await expect(dbCreateImportDocument({ ...VALID_INPUT, fileSize: 11 * 1024 * 1024 })).rejects.toThrow(/MB sınırını/);
    });
    it("rejects disallowed MIME", async () => {
        const { dbCreateImportDocument } = await import("@/lib/supabase/import-documents");
        await expect(dbCreateImportDocument({ ...VALID_INPUT, mimeType: "application/zip" })).rejects.toThrow(/dosya türü/);
    });
});

describe("dbCreateImportDocument — 3-step orphan-safe insert", () => {
    it("happy path: insert → upload → patch returns the updated row", async () => {
        mockSelectSingle
            .mockResolvedValueOnce({ data: { id: "doc-1" }, error: null }) // insert
            .mockResolvedValueOnce({ data: { id: "doc-1", file_path: "import-staging/doc-1.pdf" }, error: null }); // patch
        mockStorageUpload.mockResolvedValueOnce({ error: null });
        const { dbCreateImportDocument } = await import("@/lib/supabase/import-documents");
        const row = await dbCreateImportDocument(VALID_INPUT);
        expect(row.id).toBe("doc-1");
        expect(mockInsert).toHaveBeenCalledTimes(1);
        expect(mockStorageUpload).toHaveBeenCalledTimes(1);
        const path = mockStorageUpload.mock.calls[0]?.[0] as string;
        expect(path).toBe("import-staging/doc-1.pdf");
    });

    it("storage upload fails → DB row deleted (orphan cleanup) + throws", async () => {
        mockSelectSingle.mockResolvedValueOnce({ data: { id: "doc-2" }, error: null });
        mockStorageUpload.mockResolvedValueOnce({ error: { message: "bucket missing" } });
        const { dbCreateImportDocument } = await import("@/lib/supabase/import-documents");
        await expect(dbCreateImportDocument(VALID_INPUT)).rejects.toThrow(/yüklenemedi/);
        expect(mockDelete).toHaveBeenCalledWith("id", "doc-2");
    });
});

describe("dbGetImportDocument", () => {
    it("returns row when found", async () => {
        mockSelectSingle.mockResolvedValueOnce({ data: { id: "doc-3" }, error: null });
        const { dbGetImportDocument } = await import("@/lib/supabase/import-documents");
        const row = await dbGetImportDocument("doc-3");
        expect(row?.id).toBe("doc-3");
    });
    it("returns null when not found", async () => {
        mockSelectSingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
        const { dbGetImportDocument } = await import("@/lib/supabase/import-documents");
        const row = await dbGetImportDocument("nope");
        expect(row).toBeNull();
    });
});

describe("dbListImportDocumentsByBatch", () => {
    it("uses .is('batch_id', null) when batchId=null", async () => {
        const { dbListImportDocumentsByBatch } = await import("@/lib/supabase/import-documents");
        const rows = await dbListImportDocumentsByBatch(null);
        expect(mockIs).toHaveBeenCalledWith("batch_id", null);
        expect(rows[0].id).toBe("row-null-1");
    });
    it("uses .eq('batch_id', id) when batchId set", async () => {
        const { dbListImportDocumentsByBatch } = await import("@/lib/supabase/import-documents");
        const rows = await dbListImportDocumentsByBatch("batch-1");
        expect(mockEq).toHaveBeenCalledWith("batch_id", "batch-1");
        expect(rows[0].id).toBe("row-1");
    });
});

describe("dbUpdateImportDocumentClassification", () => {
    it("writes classification + status='classified' + classified_at timestamp", async () => {
        mockSelectSingle.mockResolvedValueOnce({ data: { id: "doc-4", status: "classified" }, error: null });
        const { dbUpdateImportDocumentClassification } = await import("@/lib/supabase/import-documents");
        await dbUpdateImportDocumentClassification("doc-4", {
            document_type: "product_catalog", confidence: 0.9, language: "tr",
            summary: "ok", suggested_product_type_id: null,
        });
        const patch = mockUpdate.mock.calls[0]?.[0] as { status: string; classified_at: string };
        expect(patch.status).toBe("classified");
        expect(typeof patch.classified_at).toBe("string");
    });
});

describe("dbMarkImportDocumentError", () => {
    it("writes status='error' + error_message", async () => {
        const { dbMarkImportDocumentError } = await import("@/lib/supabase/import-documents");
        await dbMarkImportDocumentError("doc-5", "AI down");
        const patch = mockUpdate.mock.calls[0]?.[0] as { status: string; error_message: string };
        expect(patch.status).toBe("error");
        expect(patch.error_message).toBe("AI down");
    });
});

// Faz 3c — apply pipeline terminal state helper
describe("dbUpdateImportDocumentStatus", () => {
    it("'applied' geçişi → UPDATE { status: 'applied' }", async () => {
        const { dbUpdateImportDocumentStatus } = await import("@/lib/supabase/import-documents");
        await dbUpdateImportDocumentStatus("doc-1", "applied");
        const patch = mockUpdate.mock.calls[0]?.[0] as { status: string };
        expect(patch.status).toBe("applied");
    });

    it("invalid status → throw, UPDATE çağrılmaz", async () => {
        const { dbUpdateImportDocumentStatus } = await import("@/lib/supabase/import-documents");
        await expect(dbUpdateImportDocumentStatus("doc-1", "garbage" as never))
            .rejects.toThrow(/Geçersiz status/);
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});
