/**
 * Faz 3c — serviceApplyImportDocument behavior tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDoc = vi.fn();
const mockClaim = vi.fn();
const mockListLines = vi.fn();
const mockUpdateDocStatus = vi.fn();
const mockCreateProduct = vi.fn();
const mockUpdateProduct = vi.fn();
const mockGetProductById = vi.fn();
const mockCreateAttachment = vi.fn();
const mockListAttachmentsByProduct = vi.fn();
const mockSetPrimaryImage = vi.fn();
const mockStorageDownload = vi.fn();
const mockGetProductTypeWithFields = vi.fn();

vi.mock("@/lib/supabase/import-documents", () => ({
    dbGetImportDocument: (...a: unknown[]) => mockGetDoc(...a),
    dbUpdateImportDocumentStatus: (...a: unknown[]) => mockUpdateDocStatus(...a),
    dbClaimImportDocumentForApply: (...a: unknown[]) => mockClaim(...a),
}));

vi.mock("@/lib/supabase/import-document-lines", () => ({
    dbListLinesByDocument: (...a: unknown[]) => mockListLines(...a),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct: (...a: unknown[]) => mockCreateProduct(...a),
    dbUpdateProduct: (...a: unknown[]) => mockUpdateProduct(...a),
    dbGetProductById: (...a: unknown[]) => mockGetProductById(...a),
}));

const mockSupersedeCerts = vi.fn();
vi.mock("@/lib/supabase/product-attachments", () => ({
    dbCreateAttachment: (...a: unknown[]) => mockCreateAttachment(...a),
    dbListAttachmentsByProduct: (...a: unknown[]) => mockListAttachmentsByProduct(...a),
    dbSetPrimaryImage: (...a: unknown[]) => mockSetPrimaryImage(...a),
    dbSupersedeCertificatesByName: (...a: unknown[]) => mockSupersedeCerts(...a),
}));

vi.mock("@/lib/supabase/product-types", () => ({
    dbGetProductTypeWithFields: (...a: unknown[]) => mockGetProductTypeWithFields(...a),
}));

const mockAuditInsert = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/supabase/service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/supabase/service")>("@/lib/supabase/service");
    return {
        ...actual,
        createServiceClient: () => ({
            from: (_table: string) => ({
                insert: (row: unknown) => mockAuditInsert(row),
            }),
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
        product_type_id: "type-vana",
        extracted_name: `Vana ${id}`,
        extracted_sku: `SKU-${id}`,
        extracted_attributes: { dn: 50 },
        extraction_evidence: { dn: { confidence: "high", evidence_text: "DN50" } },
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
    mockClaim.mockReset();
    mockListLines.mockReset();
    mockUpdateDocStatus.mockReset();
    mockCreateProduct.mockReset();
    mockUpdateProduct.mockReset();
    mockGetProductById.mockReset();
    mockCreateAttachment.mockReset();
    mockListAttachmentsByProduct.mockReset();
    mockSetPrimaryImage.mockReset();
    mockStorageDownload.mockReset();
    mockGetProductTypeWithFields.mockReset();
    mockSupersedeCerts.mockReset();
    mockSupersedeCerts.mockResolvedValue(0);
    mockListAttachmentsByProduct.mockResolvedValue([]);
    mockSetPrimaryImage.mockResolvedValue(undefined);
    mockAuditInsert.mockReset();
    mockAuditInsert.mockImplementation(() => Promise.resolve({ error: null }));
    mockStorageDownload.mockResolvedValue({
        data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
        error: null,
    });
    mockGetProductTypeWithFields.mockResolvedValue({
        id: "type-vana",
        name: "Vana",
        is_active: true,
        fields: [
            { id: "f-dn", field_key: "dn", label_tr: "DN", field_type: "number", is_active: true },
            { id: "f-pn", field_key: "pn_class", label_tr: "PN", field_type: "text", is_active: true },
        ],
    });
});

describe("serviceApplyImportDocument — pre-checks (Faz 3c Review 3.tur atomic claim)", () => {
    it("claim null + doc null → throw 'Belge bulunamadı'", async () => {
        mockClaim.mockResolvedValueOnce(null);
        mockGetDoc.mockResolvedValueOnce(null);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-x", null)).rejects.toThrow(/bulunamadı/);
        expect(mockUpdateDocStatus).not.toHaveBeenCalled();
    });

    it("claim null + doc.status='applied' → throw 'hazır değil' (idempotency)", async () => {
        mockClaim.mockResolvedValueOnce(null);
        mockGetDoc.mockResolvedValueOnce({ ...DOC, status: "applied" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-1", null)).rejects.toThrow(/hazır değil/);
        expect(mockUpdateDocStatus).not.toHaveBeenCalled();
    });

    it("claim null + doc.status='applying' → throw 'hazır değil' (paralel apply race koruması)", async () => {
        // Aynı belgeye iki paralel apply: ikincinin claim'i null döner çünkü
        // birincisi zaten classified→applying CAS'i kazanmıştır.
        mockClaim.mockResolvedValueOnce(null);
        mockGetDoc.mockResolvedValueOnce({ ...DOC, status: "applying" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-1", null)).rejects.toThrow(/hazır değil/);
        // İkinci çağrı hiçbir DB iş yapmamalı
        expect(mockListLines).not.toHaveBeenCalled();
        expect(mockCreateProduct).not.toHaveBeenCalled();
        expect(mockUpdateDocStatus).not.toHaveBeenCalled();
    });
});

describe("serviceApplyImportDocument — product flow", () => {
    it("all new_product → products_created sayılır + dbCreateProduct N kez", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
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
        mockClaim.mockResolvedValueOnce(DOC);
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

    it("null/boş AI değeri mevcut ürün attribute'unu SİLMEZ (clobber koruması)", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", {
                match_action: "matched",
                matched_product_id: "p-existing",
                // dn null + pn_class "" → mevcut değeri ezmemeli; material dolu → eklenmeli
                extracted_attributes: { dn: null, pn_class: "", material: "A105" },
                extraction_evidence: {},
            }),
        ]);
        mockGetProductById.mockResolvedValueOnce({
            id: "p-existing", attributes: { dn: 25, pn_class: "PN16" }, product_type_id: "type-vana",
            on_hand: 0, reserved: 0, is_active: true,
        });
        mockGetProductTypeWithFields.mockResolvedValueOnce({
            id: "type-vana", name: "Vana", is_active: true,
            fields: [
                { id: "f-dn", field_key: "dn", label_tr: "DN", field_type: "number", is_active: true },
                { id: "f-pn", field_key: "pn_class", label_tr: "PN", field_type: "text", is_active: true },
                { id: "f-mat", field_key: "material", label_tr: "Malzeme", field_type: "text", is_active: true },
            ],
        });
        mockUpdateProduct.mockResolvedValueOnce({ id: "p-existing" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");
        expect(r.products_updated).toBe(1);
        const args = mockUpdateProduct.mock.calls[0]?.[1] as { attributes: Record<string, unknown> };
        // dn=25 ve pn_class="PN16" KORUNUR (null/"" ezmedi); material eklenir
        expect(args.attributes).toEqual({ dn: 25, pn_class: "PN16", material: "A105" });
        // yalnız gerçekten uygulanan 1 alan sayılır (null/boş 2 alan hariç)
        expect(r.technical_fields_applied).toBe(1);
    });

    it("tüm AI değerleri null/boş ise attributes hiç yazılmaz (no-op)", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", {
                match_action: "matched",
                matched_product_id: "p-existing",
                extracted_attributes: { dn: null, pn_class: "" },
                extraction_evidence: {},
            }),
        ]);
        mockGetProductById.mockResolvedValueOnce({
            id: "p-existing", attributes: { dn: 25 }, product_type_id: "type-vana",
            on_hand: 0, reserved: 0, is_active: true,
        });
        mockUpdateProduct.mockResolvedValueOnce({ id: "p-existing" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");
        // attributes + productPatch ikisi de boş → satır skip edilir, update çağrılmaz
        expect(mockUpdateProduct).not.toHaveBeenCalled();
        expect(r.products_updated).toBe(0);
    });

    it("fieldApprovals varsa matched satır yalnız seçili teknik alanları merge eder", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", {
                match_action: "matched",
                matched_product_id: "p-existing",
                extracted_attributes: { dn: 50, pn_class: "PN16" },
                extraction_evidence: {
                    dn: { confidence: "high", evidence_text: "DN50" },
                    pn_class: { confidence: "high", evidence_text: "PN16" },
                },
            }),
        ]);
        mockGetProductById.mockResolvedValueOnce({
            id: "p-existing", attributes: { material: "A105", dn: 25 }, product_type_id: "type-vana",
            on_hand: 0, reserved: 0, is_active: true,
        });
        mockUpdateProduct.mockResolvedValueOnce({ id: "p-existing" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1", {
            fieldApprovals: { "1": { technicalAttributeKeys: ["pn_class"] } },
        });
        expect(r.products_updated).toBe(1);
        expect(r.technical_fields_applied).toBe(1);
        const args = mockUpdateProduct.mock.calls[0]?.[1] as { attributes: Record<string, unknown> };
        expect(args.attributes).toEqual({ material: "A105", dn: 25, pn_class: "PN16" });

        const techAudit = mockAuditInsert.mock.calls
            .map(call => call[0] as { action?: string; after_state?: { attribute_keys?: string[]; evidence?: Record<string, unknown> } })
            .find(row => row.action === "technical_template_ai_applied");
        expect(techAudit?.after_state?.attribute_keys).toEqual(["pn_class"]);
        expect(Object.keys(techAudit?.after_state?.evidence ?? {})).toEqual(["pn_class"]);
    });

    it("matched satırda name/sku yalnız productFields onayıyla güncellenir", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", {
                match_action: "matched",
                matched_product_id: "p-existing",
                extracted_name: "Yeni Ad",
                extracted_sku: "NEW-SKU",
                extracted_attributes: {},
                extraction_evidence: {},
            }),
        ]);
        mockGetProductById.mockResolvedValueOnce({
            id: "p-existing",
            name: "Eski Ad",
            sku: "OLD-SKU",
            attributes: {},
            product_type_id: "type-vana",
            on_hand: 0,
            reserved: 0,
            is_active: true,
        });
        mockUpdateProduct.mockResolvedValueOnce({ id: "p-existing" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null, {
            fieldApprovals: { "1": { productFields: ["name"], technicalAttributeKeys: [] } },
        });
        expect(r.products_updated).toBe(1);
        expect(mockUpdateProduct.mock.calls[0]?.[1]).toEqual({ name: "Yeni Ad" });
    });

    it("matched satırda name/sku onayı yoksa product core alanları güncellenmez", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", {
                match_action: "matched",
                matched_product_id: "p-existing",
                extracted_name: "Yeni Ad",
                extracted_sku: "NEW-SKU",
                extracted_attributes: {},
            }),
        ]);
        mockGetProductById.mockResolvedValueOnce({
            id: "p-existing",
            name: "Eski Ad",
            sku: "OLD-SKU",
            attributes: {},
            product_type_id: "type-vana",
            on_hand: 0,
            reserved: 0,
            is_active: true,
        });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null, {
            fieldApprovals: { "1": { productFields: [], technicalAttributeKeys: [] } },
        });
        expect(r.products_updated).toBe(0);
        expect(r.skipped).toBe(1);
        expect(mockUpdateProduct).not.toHaveBeenCalled();
    });

    it("fieldApprovals boşsa matched satır no-op olur ve ürün güncellemez", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", {
                match_action: "matched",
                matched_product_id: "p-existing",
                extracted_attributes: { dn: 50 },
            }),
        ]);
        mockGetProductById.mockResolvedValueOnce({
            id: "p-existing", attributes: { dn: 25 }, product_type_id: "type-vana",
            on_hand: 0, reserved: 0, is_active: true,
        });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null, {
            fieldApprovals: { "1": { technicalAttributeKeys: [] } },
        });
        expect(r.products_updated).toBe(0);
        expect(r.skipped).toBe(1);
        expect(mockUpdateProduct).not.toHaveBeenCalled();
    });

    it("fieldApprovals yeni üründe yalnız seçili teknik attribute'ları yazar", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extracted_attributes: { dn: 50, pn_class: "PN16" } }),
        ]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null, {
            fieldApprovals: {
                "1": { productFields: ["product_type_id"], technicalAttributeKeys: ["dn"] },
            },
        });
        expect(r.products_created).toBe(1);
        expect(r.technical_fields_applied).toBe(1);
        const input = mockCreateProduct.mock.calls[0]?.[0] as { attributes: Record<string, unknown> };
        expect(input.attributes).toEqual({ dn: 50 });
    });

    it("new_product + product_type_id onayı yoksa teknik attribute yazmaz, ürünü tipsiz oluşturur", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { product_type_id: "type-vana", extracted_attributes: { dn: 50 } }),
        ]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null, {
            fieldApprovals: {
                "1": { productFields: ["name", "sku"], technicalAttributeKeys: ["dn"] },
            },
        });
        expect(r.products_created).toBe(1);
        expect(r.technical_fields_applied).toBe(0);
        expect(r.untyped_products).toBe(1);
        const input = mockCreateProduct.mock.calls[0]?.[0] as {
            product_type_id: string | null;
            attributes: Record<string, unknown>;
        };
        expect(input.product_type_id).toBeNull();
        expect(input.attributes).toEqual({});
    });

    it("matched + mevcut ürün tipsiz + product_type_id onayı yoksa teknik attribute no-op kalır", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", {
                match_action: "matched",
                matched_product_id: "p-existing",
                product_type_id: "type-vana",
                extracted_attributes: { dn: 50 },
            }),
        ]);
        mockGetProductById.mockResolvedValueOnce({
            id: "p-existing",
            name: "Eski Ad",
            sku: "SKU-1",
            attributes: {},
            product_type_id: null,
            on_hand: 0,
            reserved: 0,
            is_active: true,
        });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null, {
            fieldApprovals: {
                "1": { productFields: [], technicalAttributeKeys: ["dn"] },
            },
        });
        expect(r.products_updated).toBe(0);
        expect(r.technical_fields_applied).toBe(0);
        expect(r.skipped).toBe(1);
        expect(mockUpdateProduct).not.toHaveBeenCalled();
    });

    it("untyped_products: product_type_id null ile yeni ürün → counter artar", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { product_type_id: null, extracted_attributes: {}, extraction_evidence: {} }),
            makeLine("2", { product_type_id: "type-vana" }),
        ]);
        mockCreateProduct.mockResolvedValue({ id: "p-x" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_created).toBe(2);
        expect(r.untyped_products).toBe(1);
    });

    it("teknik attribute var ama şablon yoksa satır apply edilmez", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { product_type_id: null, extracted_attributes: { dn: 50 } }),
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_created).toBe(0);
        expect(r.skipped).toBe(1);
        expect(r.errors[0]).toMatch(/teknik şablon/i);
    });

    it("matched + matched_product_id eksik → error + skipped++", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
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
        mockClaim.mockResolvedValueOnce(DOC);
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
    const PHOTO_DOC = {
        ...DOC,
        file_name: "valve-photo.jpg",
        mime_type: "image/jpeg",
        classification: { ...DOC.classification, document_type: "product_photo" },
    };
    const DATASHEET_DOC = {
        ...DOC,
        file_name: "datasheet.pdf",
        mime_type: "application/pdf",
        classification: {
            ...DOC.classification,
            document_type: "product_datasheet",
            operation_type: "product_documents",
        },
    };

    it("cert + matched → dbCreateAttachment(kind=certificate) + storage download bir kez", async () => {
        mockClaim.mockResolvedValueOnce(CERT_DOC);
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

    it("product_photo + matched → dbCreateAttachment(kind=image) + ilk görsel primary yapılır", async () => {
        mockClaim.mockResolvedValueOnce(PHOTO_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "matched", matched_product_id: "p-target" }),
        ]);
        mockCreateAttachment.mockResolvedValueOnce({ id: "att-image" });
        mockListAttachmentsByProduct.mockResolvedValueOnce([]);

        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");

        expect(r.attachments_created).toBe(1);
        const attArgs = mockCreateAttachment.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(attArgs.kind).toBe("image");
        expect(attArgs.mimeType).toBe("image/jpeg");
        expect(mockListAttachmentsByProduct).toHaveBeenCalledWith("p-target", "image");
        expect(mockSetPrimaryImage).toHaveBeenCalledWith("p-target", "att-image");
        expect(mockSupersedeCerts).not.toHaveBeenCalled();
    });

    it("product_photo + mevcut primary image varsa yeni görsel primary yapılmaz", async () => {
        mockClaim.mockResolvedValueOnce(PHOTO_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "matched", matched_product_id: "p-target" }),
        ]);
        mockCreateAttachment.mockResolvedValueOnce({ id: "att-image-2" });
        mockListAttachmentsByProduct.mockResolvedValueOnce([
            { id: "existing-primary", is_primary_image: true },
        ]);

        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");

        expect(r.attachments_created).toBe(1);
        expect(mockSetPrimaryImage).not.toHaveBeenCalled();
    });

    it("product_documents datasheet → dbCreateAttachment(kind=datasheet), cert supersede çalışmaz", async () => {
        mockClaim.mockResolvedValueOnce(DATASHEET_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "matched", matched_product_id: "p-target" }),
        ]);
        mockCreateAttachment.mockResolvedValueOnce({ id: "att-datasheet" });

        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");

        expect(r.attachments_created).toBe(1);
        const attArgs = mockCreateAttachment.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(attArgs.kind).toBe("datasheet");
        expect(mockSetPrimaryImage).not.toHaveBeenCalled();
        expect(mockSupersedeCerts).not.toHaveBeenCalled();
    });

    it("cert + new_product → error + skipped++ (anlamsız)", async () => {
        mockClaim.mockResolvedValueOnce(CERT_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "new_product" }),
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.attachments_created).toBe(0);
        expect(r.skipped).toBe(1);
        expect(r.errors[0]).toMatch(/yeni ürün.*edilemez/i);
    });

    it("cert + storage download fail → throw + status 'classified'e rollback", async () => {
        mockClaim.mockResolvedValueOnce(CERT_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "matched", matched_product_id: "p-target" }),
        ]);
        mockStorageDownload.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-1", null)).rejects.toThrow(/okunamadı/);
        // Faz 3c Review 3.tur: exception path → applying lock 'classified'e geri çekilir
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "classified");
        expect(mockUpdateDocStatus).not.toHaveBeenCalledWith("doc-1", "applied");
    });
});

describe("serviceApplyImportDocument — partial failure + status", () => {
    it("bir satır fail diğeri başarılı → diğeri çalışır, errors[] dolar", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
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

    it("hiç eligible satır yok → skipped, doc applied'a geçmez, lock serbest", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "pending" }),
            makeLine("2", { match_action: "skipped" }),
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.skipped).toBe(2);
        expect(r.products_created).toBe(0);
        // Faz 3c Review 3.tur: applying lock 'classified'e geri çekilir;
        // 'applied' geçişi olmaz (eligible satır yok).
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "classified");
        expect(mockUpdateDocStatus).not.toHaveBeenCalledWith("doc-1", "applied");
    });

    it("storage download yalnız cert flow varsa çağrılır", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([makeLine("1")]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await serviceApplyImportDocument("doc-1", null);
        expect(mockStorageDownload).not.toHaveBeenCalled();
    });
});

// ── Faz 3c Review — cert versiyonlama, all-fail policy, aggregate audit ──

describe("serviceApplyImportDocument — Review (P2-1 cert versioning)", () => {
    const CERT_DOC = { ...DOC, classification: { ...DOC.classification, document_type: "material_certificate" } };

    it("cert apply → dbSupersedeCertificatesByName çağrılır + attachments_superseded counter", async () => {
        mockClaim.mockResolvedValueOnce(CERT_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "matched", matched_product_id: "p-target" }),
        ]);
        mockCreateAttachment.mockResolvedValueOnce({ id: "att-new" });
        mockSupersedeCerts.mockResolvedValueOnce(2); // 2 eski cert superseded
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");
        expect(r.attachments_created).toBe(1);
        expect(r.attachments_superseded).toBe(2);
        expect(mockSupersedeCerts).toHaveBeenCalledWith("p-target", "catalog.pdf", "att-new");
    });

    it("versiyonlama fail → cert yine create, errors[] uyarı eklenir", async () => {
        mockClaim.mockResolvedValueOnce(CERT_DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { extraction_type: "certificate_target", match_action: "matched", matched_product_id: "p-target" }),
        ]);
        mockCreateAttachment.mockResolvedValueOnce({ id: "att-new" });
        mockSupersedeCerts.mockRejectedValueOnce(new Error("DB lock"));
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", "user-1");
        expect(r.attachments_created).toBe(1); // cert yine oluştu
        expect(r.attachments_superseded).toBe(0);
        expect(r.errors[0]).toMatch(/versiyonlama uyarısı/i);
    });
});

describe("serviceApplyImportDocument — Review (P2-2 all-fail policy)", () => {
    it("all-fail → status 'classified'e geri alınır (lock serbest, retry mümkün)", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "matched", matched_product_id: null }), // fail
            makeLine("2", { extracted_name: "", extracted_sku: "x" }), // fail (ad eksik)
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_created).toBe(0);
        expect(r.products_updated).toBe(0);
        expect(r.attachments_created).toBe(0);
        expect(r.errors.length).toBe(2);
        // Faz 3c Review 3.tur: applying lock serbest bırakılır → classified
        // (Önceden hiç çağrılmıyordu çünkü status hiç değişmemişti; artık
        // 'applying' kilidi geri çekilir.)
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "classified");
        expect(mockUpdateDocStatus).not.toHaveBeenCalledWith("doc-1", "applied");
    });

    it("partial success → status applied (en az 1 başarı varsa)", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1"), // OK new_product
            makeLine("2", { match_action: "matched", matched_product_id: null }), // fail
        ]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_created).toBe(1);
        expect(r.errors.length).toBe(1);
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "applied");
    });
});

describe("serviceApplyImportDocument — Faz 3c Review 3.tur rollback", () => {
    it("eligible.length=0 → status 'classified'e geri alınır (lock serbest)", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "pending" }),   // not eligible
            makeLine("2", { match_action: "skipped" }),    // not eligible
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        expect(r.products_created).toBe(0);
        expect(r.skipped).toBe(2);
        // CRITICAL: applying lock 'classified'e geri çekilir (sızıntı koruması)
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "classified");
    });

    it("storage download fail (cert flow) → throw + status 'classified'e rollback", async () => {
        const CERT_DOC2 = { ...DOC, file_name: "cert.pdf" };
        mockClaim.mockResolvedValueOnce(CERT_DOC2);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", {
                extraction_type: "certificate_target",
                match_action: "matched",
                matched_product_id: "p-1",
            }),
        ]);
        mockStorageDownload.mockResolvedValueOnce({ data: null, error: { message: "404 Not Found" } });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-1", null)).rejects.toThrow(/okunamadı/i);
        // Rollback: applying → classified
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "classified");
        // Audit insert exception path'inde yapılmaz (throw yukarıda)
        expect(mockAuditInsert).not.toHaveBeenCalled();
    });
});

describe("serviceApplyImportDocument — Review (P3 aggregate audit)", () => {
    it("apply tamamlandıktan sonra audit_log 'import_applied' insert (success path)", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([makeLine("1")]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await serviceApplyImportDocument("doc-1", "user-1");
        const row = mockAuditInsert.mock.calls
            .map(call => call[0] as { action?: string })
            .find(call => call.action === "import_applied") as {
            action: string; entity_type: string; entity_id: string;
            after_state: { success: boolean; products_created: number };
            actor: string | null;
        };
        expect(row).toBeTruthy();
        expect(row.action).toBe("import_applied");
        expect(row.entity_type).toBe("import_document");
        expect(row.entity_id).toBe("doc-1");
        expect(row.after_state.success).toBe(true);
        expect(row.after_state.products_created).toBe(1);
        expect(row.actor).toBe("user-1");
    });

    it("all-fail durumda da audit yazılır (forensic)", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "matched", matched_product_id: null }),
        ]);
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await serviceApplyImportDocument("doc-1", null);
        expect(mockAuditInsert).toHaveBeenCalledTimes(1);
        const row = mockAuditInsert.mock.calls[0]?.[0] as {
            after_state: { success: boolean; errors_count: number };
        };
        expect(row.after_state.success).toBe(false);
        expect(row.after_state.errors_count).toBe(1);
    });

    it("audit insert fail (silent) → apply başarısı geri alınmaz", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([makeLine("1")]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        mockAuditInsert.mockResolvedValueOnce({ error: { message: "DB down" } });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        // Apply başarılı: audit fail throw etmez
        expect(r.products_created).toBe(1);
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "applied");
    });
});

// ── Faz 3c Review 4.tur — Post-commit rollback fix (P2) ──────────────────────

describe("serviceApplyImportDocument — Faz 3c Review 4.tur (P2 post-commit)", () => {
    it("CRITICAL: post-commit status update fail → 'applying'de KAL (rollback YOK, duplicate engel)", async () => {
        // Setup: 1 ürün başarıyla yaratılır
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([makeLine("1")]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        // İlk dbUpdateImportDocumentStatus("applied") çağrısı fail
        mockUpdateDocStatus.mockRejectedValueOnce(new Error("DB write conflict"));

        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        // Service throw ETMEZ — audit yazılır, result döner
        const r = await serviceApplyImportDocument("doc-1", null);

        // Ürün yazıldı
        expect(r.products_created).toBe(1);
        // Faz 3c Review 5.tur: result.status_update_failed flag UI'a taşınır
        expect(r.status_update_failed).toBe(true);
        // Status update "applied" denendi (rejected)
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "applied");
        // CRITICAL: rollback ('classified') ÇAĞRILMAMALI — outer catch tetiklenmedi
        const classifiedCalls = mockUpdateDocStatus.mock.calls.filter(c => c[1] === "classified");
        expect(classifiedCalls).toHaveLength(0);

        // Audit log: status_update_failed=true, success=false
        const row = mockAuditInsert.mock.calls
            .map(call => call[0] as { action?: string })
            .find(call => call.action === "import_applied") as {
            after_state: { success: boolean; status_update_failed: boolean; products_created: number };
        };
        expect(row).toBeTruthy();
        expect(row.after_state.status_update_failed).toBe(true);
        expect(row.after_state.success).toBe(false);  // successPath, applied set başarısız
        expect(row.after_state.products_created).toBe(1);  // gerçek yazım sayısı korunur
    });

    it("Faz 3c Review 5.tur: başarılı path → result.status_update_failed=false (varsayılan)", async () => {
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([makeLine("1")]);
        mockCreateProduct.mockResolvedValueOnce({ id: "p-new" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        const r = await serviceApplyImportDocument("doc-1", null);
        // Başarılı path: applied UPDATE OK, flag false kalır
        expect(r.status_update_failed).toBe(false);
        expect(mockUpdateDocStatus).toHaveBeenCalledWith("doc-1", "applied");
    });

    it("duplicate apply engeli: doc applying'de iken 2. çağrı → claim null + 'hazır değil' throw", async () => {
        // 1. çağrı post-commit fail sonrası doc applying'de takılı kaldı (yukarıdaki test).
        // 2. çağrı: claim CAS classified→applying başarısız (status='applying'), helper null döner.
        mockClaim.mockResolvedValueOnce(null);
        mockGetDoc.mockResolvedValueOnce({ ...DOC, status: "applying" });
        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-1", null))
            .rejects.toThrow(/hazır değil.*applying/);
        // Hiçbir DB iş yapılmamalı (duplicate engel)
        expect(mockCreateProduct).not.toHaveBeenCalled();
        expect(mockCreateAttachment).not.toHaveBeenCalled();
        expect(mockUpdateDocStatus).not.toHaveBeenCalled();
    });

    it("successCount=0 + status update fail → outer catch tetiklenir (eski davranış korunur)", async () => {
        // all-fail path: ürün/cert yok, status 'classified' rollback denenir.
        // Bu UPDATE fail ederse outer catch tetiklenir → 2. rollback denenir (yutulur),
        // throw propagate. Burada post-commit guard DEVREDE DEĞİL (successCount=0).
        mockClaim.mockResolvedValueOnce(DOC);
        mockListLines.mockResolvedValueOnce([
            makeLine("1", { match_action: "matched", matched_product_id: null }), // fail
        ]);
        // İlk status update 'classified' (all-fail için) → throw
        mockUpdateDocStatus.mockRejectedValueOnce(new Error("DB blip"));
        // Outer catch rollback 'classified' tekrar denenir → bu da fail (warn log)
        mockUpdateDocStatus.mockRejectedValueOnce(new Error("DB still down"));

        const { serviceApplyImportDocument } = await import("@/lib/services/import-apply-service");
        await expect(serviceApplyImportDocument("doc-1", null))
            .rejects.toThrow(/DB blip/);
        // İki 'classified' denemesi (ilki normal flow, ikincisi outer catch rollback)
        const classifiedCalls = mockUpdateDocStatus.mock.calls.filter(c => c[1] === "classified");
        expect(classifiedCalls.length).toBeGreaterThanOrEqual(1);
    });
});
