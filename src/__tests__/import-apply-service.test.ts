/**
 * Faz 3c — serviceApplyImportDocument behavior tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDoc = vi.fn();
const mockListLines = vi.fn();
const mockUpdateDocStatus = vi.fn();
const mockCreateProduct = vi.fn();
const mockUpdateProduct = vi.fn();
const mockGetProductById = vi.fn();
const mockCreateAttachment = vi.fn();
const mockStorageDownload = vi.fn();

vi.mock("@/lib/supabase/import-documents", () => ({
    dbGetImportDocument: (...a: unknown[]) => mockGetDoc(...a),
    dbUpdateImportDocumentStatus: (...a: unknown[]) => mockUpdateDocStatus(...a),
}));

vi.mock("@/lib/supabase/import-document-lines", () => ({
    dbListLinesByDocument: (...a: unknown[]) => mockListLines(...a),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct: (...a: unknown[]) => mockCreateProduct(...a),
    dbUpdateProduct: (...a: unknown[]) => mockUpdateProduct(...a),
    dbGetProductById: (...a: unknown[]) => mockGetProductById(...a),
}));

vi.mock("@/lib/supabase/product-attachments", () => ({
    dbCreateAttachment: (...a: unknown[]) => mockCreateAttachment(...a),
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

const DOC = {
    id: "doc-1",
    batch_id: null,
    file_path: "import-staging/doc-1.pdf",
    file_name: "catalog.pdf",
    file_size: 100,
    mime_type: "application/pdf",
    classification: { document_type: "product_catalog", confidence: 0.9, language: "tr", summary: "", suggested_product_type_id: null },
    status: "classified",
    error_message: null,
    classified_at: "2026-01-01",
    created_by: null,
    created_at: "2026-01-01",
};

function makeLine(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        document_id: "doc-1",
        line_number: Number(id.replace(/\D/g, "")) || 1,
        extraction_type: "product",
        product_type_id: null,
        extracted_name: `Vana ${id}`,
        extracted_sku: `SKU-${id}`,
        extracted_attributes: { dn: 50 },
        candidate_matches: [],
        matched_product_id: null,
        match_confidence: null,
        match_action: "new_product",
        extracted_at: "2026-01-01",
        reviewed_at: null,
        reviewed_by: null,
        ...overrides,
    };
}

beforeEach(() => {
    mockGetDoc.mockReset();
    mockListLines.mockReset();
    mockUpdateDocStatus.mockReset();
    mockCreateProduct.mockReset();
    mockUpdateProduct.mockReset();
    mockGetProductById.mockReset();
    mockCreateAttachment.mockReset();
    mockStorageDownload.mockReset();
    mockStorageDownload.mockResolvedValue({
        data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
        error: null,
    });
});

describe("serviceApplyImportDocument — pre-checks", () => {
    it("doc bulunamadı → throw 'Belge bulunamadı'", async () => {
        mockGetDoc.mockResolvedValueOnce(null);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-x", null)).rejects.toThrow(/bulunamadı/);
    });

    it("doc.status !== 'classified' → throw (idempotency)", async () => {
        mockGetDoc.mockResolvedValueOnce({ ...DOC, status: "applied" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-1", null)).rejects.toThrow(/hazır değil/);
        expect(mockUpdateDocStatus).not.toHaveBeenCalled();
    });
});

describe("serviceApplyImportDocument — product flow", () => {
    it("all new_product → products_created sayılır + dbCreateProduct N kez", async () => {
        mockGetDoc.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1"),
            makeLine("2"),
        ]);
        mockCreateProduct.mockResolvedValue({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");
        expect(r.products_created).toBe(2);
        expect(r.products_updated).toBe(0);
        expect(mockCreateProduct).toHaveBeenCalledTimes(2);
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "applied");
    });

    it("matched satır → dbUpdateProduct attributes merge ({...current, ...new})", async () => {
        mockGetDoc.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "matched", matched_product_id: "p-existing", extracted_attributes: { dn: 50, pn_class: "PN16" } }),
        ]);
        mockGetProductById.mockResolvedValueOnce({
            id: "p-existing", attributes: { material: "A105", dn: 25 }, on_hand: 0, reserved: 0, is_active: true,
        });
        mockUpdateProduct.mockResolvedValueOnce({ id: "p-existing" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");
        expect(r.products_updated).toBe(1);
        const args = mockUpdateProduct.mock.calls[0]?.[1] as { attributes: Record<string, unknown> };
        // merge: material korunur, dn yeni değer (50) eski (25)'i ezer, pn_class eklenir
        expect(args.attributes).toEqual({ material: "A105", dn: 50, pn_class: "PN16" });
    });

    it("untyped_products: product_type_id null ile yeni ürün → counter artar", async () => {
        mockGetDoc.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { product_type_id: null }),
            makeLine("2", { product_type_id: "type-vana" }),
        ]);
        mockCreateProduct.mockResolvedValue({ id: "p-x" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_created).toBe(2);
        expect(r.untyped_products).toBe(1);
    });

    it("matched + matched_product_id eksik → error + skipped++", async () => {
        mockGetDoc.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "matched", matched_product_id: null }),
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_updated).toBe(0);
        expect(r.skipped).toBe(1);
        expect(r.errors[0]).toMatch(/Satır 1.*ID/i);
    });

    it("new_product ad/sku eksik → error + skipped++", async () => {
        mockGetDoc.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extracted_name: "", extracted_sku: "SKU-1" }),
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_created).toBe(0);
        expect(r.skipped).toBe(1);
        expect(r.errors[0]).toMatch(/ad eksik/i);
    });
});

describe("serviceApplyImportDocument — certificate flow", () => {
    const CERT_DOC = { ...DOC, classification: { ...DOC.classification, document_type: "material_certificate" } };

    it("cert + matched → dbCreateAttachment(kind=certificate) + storage download bir kez", async () => {
        mockGetDoc.mockResolvedValueOnce(CERT_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "matched", matched_product_id: "p-target" }),
        ]);
        mockCreateAttachment.mockResolvedValueOnce({ id: "att-1" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");
        expect(r.attachments_created).toBe(1);
        expect(mockStorageDownload).toHaveBeenCalledTimes(1);
        const attArgs = mockCreateAttachment.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(attArgs.kind).toBe("certificate");
        expect(attArgs.productId).toBe("p-target");
        expect(attArgs.uploadedBy).toBe("user-1");
    });

    it("cert + new_product → error + skipped++ (anlamsız)", async () => {
        mockGetDoc.mockResolvedValueOnce(CERT_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "new_product" }),
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.attachments_created).toBe(0);
        expect(r.skipped).toBe(1);
        expect(r.errors[0]).toMatch(/yeni ürün.*edilemez/i);
    });

    it("cert + storage download fail → throw (pre-loop)", async () => {
        mockGetDoc.mockResolvedValueOnce(CERT_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "matched", matched_product_id: "p-target" }),
        ]);
        mockStorageDownload.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-1", null)).rejects.toThrow(/okunamadı/);
        expect(mockUpdateDocStatus).not.toHaveBeenCalled();
    });
});

describe("serviceApplyImportDocument — partial failure + status", () => {
    it("bir satır fail diğeri başarılı → diğeri çalışır, errors[] dolar", async () => {
        mockGetDoc.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "matched", matched_product_id: null }), // fail
            makeLine("2"), // OK new_product
        ]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_created).toBe(1);
        expect(r.skipped).toBe(1);
        expect(r.errors.length).toBe(1);
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "applied");
    });

    it("hiç eligible satır yok → skipped, doc applied'a geçmez", async () => {
        mockGetDoc.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "pending" }),
            makeLine("2", { match_action: "skipped" }),
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.skipped).toBe(2);
        expect(r.products_created).toBe(0);
        expect(mockUpdateDocStatus).not.toHaveBeenCalled();
    });

    it("storage download yalnız cert flow varsa çağrılır", async () => {
        mockGetDoc.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([makeLine("1")]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await serviceApplyImportDocument("doc-1", null);
        expect(mockStorageDownload).not.toHaveBeenCalled();
    });
});
