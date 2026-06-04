/**
 * Tests for serviceConfirmBatch — §9.2 domain contract + merge behavior.
 *
 * §9.2: Import never creates approved entities.
 * All DB and service dependencies are mocked — no database access in CI.
 *
 * Order import architecture: order header drafts are processed first (priority 4) and
 * created via dbCreateOrder with lines:[] — the header-only approach. order_line drafts
 * (priority 5) are processed afterward and appended to the order. This avoids the
 * lines.length > 0 validation in serviceCreateOrder, which is intentionally bypassed
 * for the import path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImportDraftRow, ImportBatchRow } from "@/lib/database.types";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockDbGetBatch = vi.fn();
const mockDbUpdateBatchStatus = vi.fn();
// Sprint B G3: claim mock — default success (claimed batch row döner)
const mockDbClaimBatchForConfirm = vi.fn().mockResolvedValue({ id: "batch-1", status: "confirming" });
const mockDbListDrafts = vi.fn();
const mockDbUpdateDraft = vi.fn();
const mockDbCreateCustomer = vi.fn();
const mockDbFindCustomerByName = vi.fn();
const mockDbFindCustomerByCode = vi.fn();
const mockDbFindCustomerByEmail = vi.fn();
const mockDbLookupEntityAlias = vi.fn();
const mockDbSaveEntityAlias = vi.fn();
const mockDbCreateProduct = vi.fn();
const mockDbFindProductBySku = vi.fn();
const mockDbUpdateProduct = vi.fn();
const mockDbRecordMovementAtomic = vi.fn();
const mockDbRecordStockTransfer = vi.fn();
const mockDbListVendors = vi.fn();
const mockDbCreateVendor = vi.fn();
const mockDbUpdateVendor = vi.fn();
const mockDbUpsertProductVendorLink = vi.fn();
const mockDbCreateOrder = vi.fn();
const mockDbUpdateCustomer = vi.fn();
const mockDbCreateQuote = vi.fn();
const mockDbFindQuoteByNumber = vi.fn();
const mockDbUpdateQuote = vi.fn();
const mockDbCreateShipment = vi.fn();
const mockDbCreateInvoice = vi.fn();
const mockDbFindInvoiceByNumber = vi.fn();
const mockDbUpdateInvoice = vi.fn();
const mockDbUpdateInvoiceStatus = vi.fn();
const mockDbSumPaymentsForInvoice = vi.fn();
const mockDbCreatePayment = vi.fn();
const mockDbFindOrderByOriginalNumber = vi.fn();
const mockDbIncrementMappingSuccess = vi.fn();

vi.mock("@/lib/supabase/column-mappings", () => ({
    dbIncrementMappingSuccess: (...args: unknown[]) => mockDbIncrementMappingSuccess(...args),
    normalizeColumnName: (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
}));

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch: (...args: unknown[]) => mockDbGetBatch(...args),
    dbUpdateBatchStatus: (...args: unknown[]) => mockDbUpdateBatchStatus(...args),
    dbListDrafts: (...args: unknown[]) => mockDbListDrafts(...args),
    dbUpdateDraft: (...args: unknown[]) => mockDbUpdateDraft(...args),
    dbCreateDrafts: vi.fn(),
    // Sprint B G3: default → claim başarılı (mevcut tüm testler bozulmasın)
    dbClaimBatchForConfirm: (...args: unknown[]) => mockDbClaimBatchForConfirm(...args),
}));
vi.mock("@/lib/supabase/customers", () => ({
    dbCreateCustomer: (...args: unknown[]) => mockDbCreateCustomer(...args),
    dbFindCustomerByName: (...args: unknown[]) => mockDbFindCustomerByName(...args),
    dbFindCustomerByCode: (...args: unknown[]) => mockDbFindCustomerByCode(...args),
    dbFindCustomerByEmail: (...args: unknown[]) => mockDbFindCustomerByEmail(...args),
    dbUpdateCustomer: (...args: unknown[]) => mockDbUpdateCustomer(...args),
}));
vi.mock("@/lib/supabase/entity-aliases", () => ({
    dbLookupEntityAlias: (...args: unknown[]) => mockDbLookupEntityAlias(...args),
    dbSaveEntityAlias: (...args: unknown[]) => mockDbSaveEntityAlias(...args),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct: (...args: unknown[]) => mockDbCreateProduct(...args),
    dbFindProductBySku: (...args: unknown[]) => mockDbFindProductBySku(...args),
    dbRecordMovementAtomic: (...args: unknown[]) => mockDbRecordMovementAtomic(...args),
    dbRecordStockTransfer: (...args: unknown[]) => mockDbRecordStockTransfer(...args),
    dbUpdateProduct: (...args: unknown[]) => mockDbUpdateProduct(...args),
}));
vi.mock("@/lib/supabase/product-vendor-links", () => ({
    dbUpsertProductVendorLink: (...args: unknown[]) => mockDbUpsertProductVendorLink(...args),
}));
vi.mock("@/lib/supabase/vendors", () => ({
    dbListVendors: (...args: unknown[]) => mockDbListVendors(...args),
    dbCreateVendor: (...args: unknown[]) => mockDbCreateVendor(...args),
    dbUpdateVendor: (...args: unknown[]) => mockDbUpdateVendor(...args),
}));
vi.mock("@/lib/supabase/quotes", () => ({
    dbCreateQuote: (...args: unknown[]) => mockDbCreateQuote(...args),
    dbFindQuoteByNumber: (...args: unknown[]) => mockDbFindQuoteByNumber(...args),
    dbUpdateQuote: (...args: unknown[]) => mockDbUpdateQuote(...args),
}));
vi.mock("@/lib/supabase/shipments", () => ({
    dbCreateShipment: (...args: unknown[]) => mockDbCreateShipment(...args),
}));
vi.mock("@/lib/supabase/invoices", () => ({
    dbCreateInvoice: (...args: unknown[]) => mockDbCreateInvoice(...args),
    dbFindInvoiceByNumber: (...args: unknown[]) => mockDbFindInvoiceByNumber(...args),
    dbUpdateInvoice: (...args: unknown[]) => mockDbUpdateInvoice(...args),
    dbUpdateInvoiceStatus: (...args: unknown[]) => mockDbUpdateInvoiceStatus(...args),
    dbSumPaymentsForInvoice: (...args: unknown[]) => mockDbSumPaymentsForInvoice(...args),
}));
vi.mock("@/lib/supabase/payments", () => ({
    dbCreatePayment: (...args: unknown[]) => mockDbCreatePayment(...args),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByOriginalNumber: (...args: unknown[]) => mockDbFindOrderByOriginalNumber(...args),
    dbCreateOrder: (...args: unknown[]) => mockDbCreateOrder(...args),
}));
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: vi.fn(),
}));

import { serviceConfirmBatch } from "@/lib/services/import-service";
import { createServiceClient } from "@/lib/supabase/service";

// ─── Fixture factory ─────────────────────────────────────────────────────────

function makeBatch(overrides: Partial<ImportBatchRow> = {}): ImportBatchRow {
    return {
        id: "batch-1",
        file_name: "import.xlsx",
        file_size: null,
        status: "review",
        parse_result: null,
        confidence: null,
        created_by: null,
        created_at: "2024-01-01T00:00:00Z",
        confirmed_at: null,
        ...overrides,
    };
}

function makeDraft(overrides: Partial<ImportDraftRow> = {}): ImportDraftRow {
    return {
        id: "draft-1",
        batch_id: "batch-1",
        entity_type: "customer",
        raw_data: null,
        parsed_data: { name: "Acme Vana", email: "acme@example.com", currency: "USD" },
        matched_entity_id: null,
        confidence: 0.85,
        ai_reason: "Fields extracted",
        unmatched_fields: null,
        user_corrections: null,
        status: "pending",
        created_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

beforeEach(() => {
    mockDbFindCustomerByEmail.mockResolvedValue(null);
    mockDbRecordMovementAtomic.mockResolvedValue({ success: true });
    mockDbRecordStockTransfer.mockResolvedValue({ success: true });
    mockDbUpsertProductVendorLink.mockResolvedValue({ id: "link-1" });
    mockDbListVendors.mockResolvedValue([]);
});

// ─── Batch lifecycle ─────────────────────────────────────────────────────────

describe("serviceConfirmBatch — batch lifecycle", () => {
    it("throws when batch is not found", async () => {
        mockDbGetBatch.mockResolvedValue(null);
        await expect(serviceConfirmBatch("batch-1")).rejects.toThrow();
    });

    it("throws when batch is already confirmed", async () => {
        mockDbGetBatch.mockResolvedValue(makeBatch({ status: "confirmed" }));
        await expect(serviceConfirmBatch("batch-1")).rejects.toThrow();
    });

    // Sprint B G3: race condition — claim alınamadığında throw
    it("dbClaimBatchForConfirm null dönerse → 'zaten işleniyor' throw, drafts okunmaz", async () => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbClaimBatchForConfirm.mockResolvedValueOnce(null); // yarışı kaybetti

        await expect(serviceConfirmBatch("batch-1")).rejects.toThrow(/zaten işleniyor/);
        expect(mockDbListDrafts).not.toHaveBeenCalled();
    });

    it("flow exception fırlarsa batch 'review'e geri çekilir (stuck 'confirming' önler)", async () => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbClaimBatchForConfirm.mockResolvedValueOnce({ id: "batch-1", status: "confirming" });
        mockDbListDrafts.mockRejectedValueOnce(new Error("DB read fail"));

        await expect(serviceConfirmBatch("batch-1")).rejects.toThrow(/DB read fail/);
        expect(mockDbUpdateBatchStatus).toHaveBeenCalledWith("batch-1", "review");
    });

    it("sets batch status to 'confirmed' after all drafts are processed", async () => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbListDrafts.mockResolvedValue([]);
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));

        await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateBatchStatus).toHaveBeenCalledWith("batch-1", "confirmed");
    });

    it("returns { added, updated, skipped, errors, byEntity } result shape", async () => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbListDrafts.mockResolvedValue([]);
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));

        const result = await serviceConfirmBatch("batch-1");

        expect(result).toHaveProperty("added");
        expect(result).toHaveProperty("updated");
        expect(result).toHaveProperty("skipped");
        expect(result).toHaveProperty("errors");
        expect(result).toHaveProperty("byEntity");
        expect(typeof result.added).toBe("number");
        expect(typeof result.updated).toBe("number");
        expect(typeof result.skipped).toBe("number");
        expect(Array.isArray(result.errors)).toBe(true);
        // byEntity: 9 entity tipi, her biri { added, updated, skipped }
        expect(result.byEntity.customer).toEqual({ added: 0, updated: 0, skipped: 0 });
        expect(result.byEntity.product).toEqual({ added: 0, updated: 0, skipped: 0 });
        expect(result.byEntity.order_line).toEqual({ added: 0, updated: 0, skipped: 0 });
    });

});

// Sprint B G6: byEntity entity-bazlı sayım
describe("serviceConfirmBatch — byEntity (Sprint B G6)", () => {
    beforeEach(() => {
        // Test izolasyonu: önceki test'ten kalan mock state'i temizle.
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("ürün eklendiğinde sadece byEntity.product.added artar (toplam ile uyumlu)", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeDraft({ entity_type: "product", parsed_data: { sku: "P-1", name: "Vana A", unit: "adet" } }),
        ]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "p-1", sku: "P-1" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.byEntity.product.added).toBe(1);
        expect(result.byEntity.customer.added).toBe(0);
        expect(result.byEntity.order.added).toBe(0);
        // toplamlar tutar
        const totalByEntity = Object.values(result.byEntity).reduce((s, c) => s + c.added + c.updated + c.skipped, 0);
        expect(totalByEntity).toBe(result.added + result.updated + result.skipped);
    });

    it("missing field skipped → byEntity.product.skipped artar", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeDraft({ entity_type: "product", parsed_data: { name: "Eksik SKU" } }),
        ]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.byEntity.product.skipped).toBe(1);
        expect(result.byEntity.product.added).toBe(0);
    });
});

// ─── Customer merge ───────────────────────────────────────────────────────────

describe("serviceConfirmBatch — customer merge", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbFindCustomerByCode.mockResolvedValue(null);
        mockDbLookupEntityAlias.mockResolvedValue(null);
        mockDbSaveEntityAlias.mockResolvedValue(undefined);
        mockDbUpdateCustomer.mockResolvedValue({ id: "c-1", name: "Acme" });
    });

    it("calls dbCreateCustomer with fields from parsed_data", async () => {
        const draft = makeDraft({
            parsed_data: { name: "Acme Vana", email: "acme@example.com", country: "TR", currency: "USD" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreateCustomer.mockResolvedValue({ id: "customer-1", name: "Acme Vana" });

        await serviceConfirmBatch("batch-1");

        expect(mockDbCreateCustomer).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Acme Vana", email: "acme@example.com", country: "TR" })
        );
    });

    it("user_corrections override parsed_data fields", async () => {
        const draft = makeDraft({
            parsed_data: { name: "Wrong Name", currency: "USD" },
            user_corrections: { name: "Corrected Name" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreateCustomer.mockResolvedValue({ id: "customer-1", name: "Corrected Name" });

        await serviceConfirmBatch("batch-1");

        expect(mockDbCreateCustomer).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Corrected Name" })
        );
    });

    it("marks draft as 'merged' with matched_entity_id after success", async () => {
        const draft = makeDraft({ id: "draft-42" });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreateCustomer.mockResolvedValue({ id: "customer-99", name: "Acme" });

        await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            "draft-42",
            expect.objectContaining({ status: "merged", matched_entity_id: "customer-99" })
        );
    });

    it("increments added counter when new customer is created", async () => {
        mockDbListDrafts.mockResolvedValue([makeDraft()]);
        mockDbFindCustomerByName.mockResolvedValue(null);
        mockDbCreateCustomer.mockResolvedValue({ id: "c-1", name: "Acme" });

        const result = await serviceConfirmBatch("batch-1");
        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
        expect(result.skipped).toBe(0);
    });

    it("increments updated (not added) when customer already exists by email", async () => {
        mockDbListDrafts.mockResolvedValue([makeDraft()]);
        mockDbFindCustomerByEmail.mockResolvedValue({ id: "existing-c", name: "Acme Vana" });
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });

        const result = await serviceConfirmBatch("batch-1");
        expect(result.updated).toBe(1);
        expect(result.added).toBe(0);
    });
});

// ─── Product merge ────────────────────────────────────────────────────────────

describe("serviceConfirmBatch — product merge", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbFindProductBySku.mockResolvedValue(null);
    });

    it("skips draft and adds error when sku is missing", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve", unit: "adet" }, // sku missing
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(mockDbCreateProduct).not.toHaveBeenCalled();
    });

    it("skips draft and adds error when name is missing", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { sku: "GV-050", unit: "adet" }, // name missing
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");
        expect(result.skipped).toBe(1);
        expect(mockDbCreateProduct).not.toHaveBeenCalled();
    });

    it("skips draft and adds error when unit is missing", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050" }, // unit missing
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(mockDbCreateProduct).not.toHaveBeenCalled();
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("calls dbCreateProduct with correct fields when all required fields present", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet", price: 250, currency: "USD" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreateProduct.mockResolvedValue({ id: "product-1", name: "Gate Valve DN50" });

        await serviceConfirmBatch("batch-1");

        expect(mockDbCreateProduct).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Gate Valve DN50", sku: "GV-050", unit: "adet" })
        );
    });

    it("increments added when product SKU is new", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Ball Valve DN25", sku: "BV-025", unit: "adet" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p" });

        const result = await serviceConfirmBatch("batch-1");
        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
    });

    it("increments updated when product SKU already exists", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", name: "Gate Valve" });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        const result = await serviceConfirmBatch("batch-1");
        expect(result.updated).toBe(1);
        expect(result.added).toBe(0);
    });

    it("error message for missing fields includes correct Turkish field names", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {}, // sku, name, unit hepsi eksik
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain("ürün adı");
        expect(result.errors[0]).toContain("ürün kodu (SKU)");
        expect(result.errors[0]).toContain("ölçü birimi");
    });
});

// ─── Product SKU dedup — behavioural contract ────────────────────────────────
//
// Each test starts with vi.clearAllMocks() so call-count assertions are
// unaffected by sibling tests.  The contract:
//   existing SKU  → dbUpdateProduct called, dbCreateProduct never called
//   new SKU       → dbCreateProduct called, dbUpdateProduct never called
//   missing field → both skipped, neither called

describe("serviceConfirmBatch — product SKU dedup contract", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("existing SKU → update existing record, dbCreateProduct never called", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve" });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.errors).toEqual([]);
        expect(result.updated).toBe(1);
        expect(result.added).toBe(0);
        expect(mockDbUpdateProduct).toHaveBeenCalledWith(
            "existing-p",
            expect.objectContaining({ name: "Gate Valve DN50" })
        );
        expect(mockDbCreateProduct).not.toHaveBeenCalled();
    });

    it("new SKU → insert new product row, dbUpdateProduct never called", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Ball Valve DN25", sku: "BV-025", unit: "adet" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "BV-025" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
        expect(mockDbCreateProduct).toHaveBeenCalledWith(
            expect.objectContaining({ sku: "BV-025", name: "Ball Valve DN25" })
        );
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("missing required field (sku) → skipped, neither create nor update called", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve", unit: "adet" }, // sku missing
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.added).toBe(0);
        expect(result.updated).toBe(0);
        expect(mockDbCreateProduct).not.toHaveBeenCalled();
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("repeated import of same SKU never creates additional rows", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve" });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        await serviceConfirmBatch("batch-1");
        await serviceConfirmBatch("batch-1");

        expect(mockDbCreateProduct).not.toHaveBeenCalled();
        expect(mockDbUpdateProduct).toHaveBeenCalledTimes(2); // update on each run, never insert
    });

    it("currency defaults to USD on create, absent (undefined) on update", async () => {
        // Create path: no currency in parsed_data → defaults to "USD"
        const createDraft = makeDraft({
            id: "d-create",
            entity_type: "product",
            parsed_data: { name: "New Valve", sku: "NV-100", unit: "adet" }, // no currency
        });
        mockDbListDrafts.mockResolvedValue([createDraft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "NV-100" });

        await serviceConfirmBatch("batch-1");

        const [createPayload] = mockDbCreateProduct.mock.calls[0];
        expect(createPayload).toHaveProperty("currency", "USD");

        // Update path: no currency → undefined (not "USD", not overwritten)
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });

        const updateDraft = makeDraft({
            id: "d-update",
            entity_type: "product",
            parsed_data: { name: "Existing Valve", sku: "EV-050", unit: "adet" }, // no currency
        });
        mockDbListDrafts.mockResolvedValue([updateDraft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "EV-050", name: "Existing Valve", on_hand: 0 });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        await serviceConfirmBatch("batch-1");

        const [, updatePayload] = mockDbUpdateProduct.mock.calls[0];
        expect(updatePayload.currency).toBeUndefined();
    });

    it("string identity fields (preferred_vendor, product_family) passed through on update", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                name: "Gate Valve DN50", sku: "GV-050", unit: "adet",
                preferred_vendor: "Acme Makine", product_family: "Gate Valves",
                sub_category: "High-pressure", sector_compatibility: "Oil & Gas",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve", on_hand: 0 });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        await serviceConfirmBatch("batch-1");

        const [, updatePayload] = mockDbUpdateProduct.mock.calls[0];
        expect(updatePayload).toMatchObject({
            preferred_vendor: "Acme Makine",
            product_family: "Gate Valves",
            sub_category: "High-pressure",
            sector_compatibility: "Oil & Gas",
        });
        expect(mockDbCreateProduct).not.toHaveBeenCalled();
    });

    it("string identity fields (preferred_vendor, product_family) passed through on create", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                name: "Ball Valve DN25", sku: "BV-025", unit: "adet",
                preferred_vendor: "Acme Makine", product_family: "Ball Valves",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "BV-025" });

        await serviceConfirmBatch("batch-1");

        const [createPayload] = mockDbCreateProduct.mock.calls[0];
        expect(createPayload).toMatchObject({
            preferred_vendor: "Acme Makine",
            product_family: "Ball Valves",
        });
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("two product drafts with same SKU in one batch: first creates, second updates — no duplicate insert", async () => {
        const draft1 = makeDraft({
            id: "d-first",
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet" },
        });
        const draft2 = makeDraft({
            id: "d-second",
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50 Updated", sku: "GV-050", unit: "adet" },
        });
        mockDbListDrafts.mockResolvedValue([draft1, draft2]);

        // First draft: SKU not in DB yet → create
        // Second draft: SKU now exists (from first create) → update
        mockDbFindProductBySku
            .mockResolvedValueOnce(null)                                              // draft1: new
            .mockResolvedValueOnce({ id: "new-p", sku: "GV-050", on_hand: 0 });     // draft2: found after create
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "GV-050" });
        mockDbUpdateProduct.mockResolvedValue({ id: "new-p" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(1);
        expect(result.skipped).toBe(0);
        expect(mockDbCreateProduct).toHaveBeenCalledTimes(1);
        expect(mockDbUpdateProduct).toHaveBeenCalledTimes(1);
    });
});

// ─── AI Import Faz 2: vendor-product relation ───────────────────────────────

describe("serviceConfirmBatch — vendor_product_relation operation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("updates only operational vendor relation fields; name/unit/price/cost are ignored", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                sku: "GV-050",
                preferred_vendor: "Acme Makine",
                lead_time_days: "14",
                reorder_qty: "25",
                price: 999,
                cost_price: 500,
                __ai_import_operation: "vendor_product_relation",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve", on_hand: 0 });
        mockDbListVendors.mockResolvedValue([{ id: "vendor-1", name: "Acme Makine", contact_email: null }]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.errors).toEqual([]);
        expect(result.updated).toBe(1);
        expect(mockDbUpsertProductVendorLink).toHaveBeenCalledWith({
            product_id: "existing-p",
            vendor_id: "vendor-1",
            vendor_sku: undefined,
            lead_time_days: 14,
            moq: 25,
            is_preferred: undefined,
            notes: undefined,
            actor: null,
        });
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
        expect(mockDbCreateProduct).not.toHaveBeenCalled();
    });

    it("does not require product name or unit because it never creates a product", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                sku: "GV-050",
                preferred_vendor: "Acme Makine",
                is_preferred: true,
                __ai_import_operation: "vendor_product_relation",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve", on_hand: 0 });
        mockDbListVendors.mockResolvedValue([{ id: "vendor-1", name: "Acme Makine", contact_email: null }]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        expect(result.skipped).toBe(0);
        expect(mockDbUpsertProductVendorLink).toHaveBeenCalledWith(expect.objectContaining({
            product_id: "existing-p",
            vendor_id: "vendor-1",
            is_preferred: true,
        }));
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("rejects when SKU exists but no safe relation field is present", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                sku: "GV-050",
                preferred_vendor: "Acme Makine",
                price: 999,
                cost_price: 500,
                __ai_import_operation: "vendor_product_relation",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve", on_hand: 0 });
        mockDbListVendors.mockResolvedValue([{ id: "vendor-1", name: "Acme Makine", contact_email: null }]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("uygulanacak alan");
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("rejects unknown SKU and never creates a product", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                sku: "MISSING",
                preferred_vendor: "Acme Makine",
                __ai_import_operation: "vendor_product_relation",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("MISSING");
        expect(mockDbCreateProduct).not.toHaveBeenCalled();
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });
});

// ─── Stock field rules — product=master-data-only, stock=additive ────────────

describe("serviceConfirmBatch — on_hand rules", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("product update with on_hand in parsed_data → on_hand NOT sent to dbUpdateProduct", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet", on_hand: 999 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve", on_hand: 50 });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        const [, updatePayload] = mockDbUpdateProduct.mock.calls[0];
        expect(updatePayload).not.toHaveProperty("on_hand");
    });

    it("product update without on_hand → on_hand not in payload (baseline)", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve", on_hand: 50 });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        await serviceConfirmBatch("batch-1");

        const [, updatePayload] = mockDbUpdateProduct.mock.calls[0];
        expect(updatePayload).not.toHaveProperty("on_hand");
    });

    it("stock entity_type defaults to count mode and records delta movement", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "GV-050", on_hand: 30 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", on_hand: 50 });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        expect(mockDbRecordMovementAtomic).toHaveBeenCalledWith(expect.objectContaining({
            product_id: "existing-p",
            quantity: -20,
            reference_type: "import",
        }));
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("AI stock_count operation records counted-current delta", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "GV-050", on_hand: 30, __ai_import_operation: "stock_count" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", on_hand: 50 });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        expect(mockDbRecordMovementAtomic).toHaveBeenCalledWith(expect.objectContaining({
            product_id: "existing-p",
            quantity: -20,
        }));
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("AI stock_movement operation requires direction and records signed movement", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "GV-050", on_hand: 5, direction: "out", __ai_import_operation: "stock_movement" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", on_hand: 50 });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        expect(mockDbRecordMovementAtomic).toHaveBeenCalledWith(expect.objectContaining({
            product_id: "existing-p",
            quantity: -5,
        }));
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("AI stock_count rejects negative counted quantity", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "GV-050", on_hand: -1, __ai_import_operation: "stock_count" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", on_hand: 50 });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("negatif olamaz");
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("stock entity_type with invalid numeric amount → skipped without NaN write", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "GV-050", on_hand: "abc" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", on_hand: 50 });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("geçersiz");
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
    });

    it("new product with on_hand in parsed_data → on_hand IS included in dbCreateProduct call", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "New Valve", sku: "NV-999", unit: "adet", on_hand: 42 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "NV-999" });

        await serviceConfirmBatch("batch-1");

        const [createPayload] = mockDbCreateProduct.mock.calls[0];
        expect(createPayload).toHaveProperty("on_hand", 42);
    });

    it("product update with on_hand AND price → on_hand dropped, price preserved", async () => {
        // Guard: dropping on_hand must not silently discard other numeric fields
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet", on_hand: 999, price: 50 },
            field_approvals: { price: "apply" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve", on_hand: 10 });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        const [, updatePayload] = mockDbUpdateProduct.mock.calls[0];
        expect(updatePayload).not.toHaveProperty("on_hand");
        expect(updatePayload).toHaveProperty("price", 50);
    });

    it("new product without on_hand → dbCreateProduct still called, on_hand absent (DB defaults to 0)", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "New Valve", sku: "NV-888", unit: "adet" }, // no on_hand
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "NV-888" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(mockDbCreateProduct).toHaveBeenCalledTimes(1);
        const [createPayload] = mockDbCreateProduct.mock.calls[0];
        // on_hand absent from parsed_data → parseNumeric(undefined) = undefined → not in payload
        expect(createPayload.on_hand).toBeUndefined();
    });

    it("stock entity_type without on_hand → skipped with error, draft rejected", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "GV-050" }, // no on_hand
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.updated).toBe(0);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain("on_hand");
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(draft.id, { status: "rejected" });
    });

    it("stock entity_type without sku → skipped with error, not updated", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { on_hand: 30 }, // no sku
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.updated).toBe(0);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain("SKU");
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(draft.id, { status: "rejected" });
    });

    it("stock entity_type with unknown sku → skipped with error, not updated", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "NONEXISTENT", on_hand: 30 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.updated).toBe(0);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain("NONEXISTENT");
        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(draft.id, { status: "rejected" });
    });
});

// ─── user_corrections override — product fields ───────────────────────────────
//
// parsed_data and user_corrections are merged (corrections win) before entity
// processing.  Product import must respect corrections for all field types.

describe("serviceConfirmBatch — product user_corrections override", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("user_corrections override product name on update", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Old Name", sku: "GV-050", unit: "adet" },
            user_corrections: { name: "Corrected Name" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Old Name", on_hand: 0 });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        const [, updatePayload] = mockDbUpdateProduct.mock.calls[0];
        expect(updatePayload).toMatchObject({ name: "Corrected Name" });
    });

    it("user_corrections override product name on create (new SKU)", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Old Name", sku: "NV-NEW", unit: "adet" },
            user_corrections: { name: "Corrected Name" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "NV-NEW" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        const [createPayload] = mockDbCreateProduct.mock.calls[0];
        expect(createPayload).toMatchObject({ name: "Corrected Name", sku: "NV-NEW" });
    });
});

// ─── Numeric field parsing — 0 must be preserved (not dropped by truthy check) ─

describe("serviceConfirmBatch — product numeric fields preserve 0", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("product update → price:0, min_stock_level:0, reorder_qty:0 preserved (not dropped)", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                name: "Gate Valve DN50",
                sku: "GV-050",
                unit: "adet",
                price: 0,
                min_stock_level: 0,
                reorder_qty: 0,
                cost_price: 0,
                weight_kg: 0,
            },
            field_approvals: { price: "apply", cost_price: "apply" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", name: "Gate Valve", on_hand: 50 });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        await serviceConfirmBatch("batch-1");

        const [, updatePayload] = mockDbUpdateProduct.mock.calls[0];
        expect(updatePayload).toHaveProperty("price", 0);
        expect(updatePayload).toHaveProperty("min_stock_level", 0);
        expect(updatePayload).toHaveProperty("reorder_qty", 0);
        expect(updatePayload).toHaveProperty("cost_price", 0);
        expect(updatePayload).toHaveProperty("weight_kg", 0);
    });

    it("new product → price:0, min_stock_level:0, reorder_qty:0, on_hand:0 preserved", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                name: "New Valve",
                sku: "NV-999",
                unit: "adet",
                price: 0,
                min_stock_level: 0,
                reorder_qty: 0,
                on_hand: 0,
                cost_price: 0,
                weight_kg: 0,
            },
            field_approvals: { price: "apply", cost_price: "apply" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "NV-999" });

        await serviceConfirmBatch("batch-1");

        const [createPayload] = mockDbCreateProduct.mock.calls[0];
        expect(createPayload).toHaveProperty("price", 0);
        expect(createPayload).toHaveProperty("min_stock_level", 0);
        expect(createPayload).toHaveProperty("reorder_qty", 0);
        expect(createPayload).toHaveProperty("on_hand", 0);
        expect(createPayload).toHaveProperty("cost_price", 0);
        expect(createPayload).toHaveProperty("weight_kg", 0);
    });

    it("new product with string '0' → coerced to numeric 0 (not dropped)", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                name: "New Valve",
                sku: "NV-998",
                unit: "adet",
                price: "0",
                min_stock_level: "0",
            },
            field_approvals: { price: "apply" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "NV-998" });

        await serviceConfirmBatch("batch-1");

        const [createPayload] = mockDbCreateProduct.mock.calls[0];
        expect(createPayload).toHaveProperty("price", 0);
        expect(createPayload).toHaveProperty("min_stock_level", 0);
    });

    it("product with empty string / null numeric fields → undefined (treated as absent)", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: {
                name: "New Valve",
                sku: "NV-997",
                unit: "adet",
                price: "",
                min_stock_level: null,
                reorder_qty: undefined,
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "NV-997" });

        await serviceConfirmBatch("batch-1");

        const [createPayload] = mockDbCreateProduct.mock.calls[0];
        expect(createPayload.price).toBeUndefined();
        expect(createPayload.min_stock_level).toBeUndefined();
        expect(createPayload.reorder_qty).toBeUndefined();
    });
});

// ─── Mixed scenario: 4 updates + 1 insert ────────────────────────────────────

describe("serviceConfirmBatch — mixed scenario: 4 updates + 1 new SKU", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("4 existing SKUs + 1 new SKU → added:1, updated:4, skipped:0", async () => {
        const existingSkus = ["GV-050", "GV-080", "BV-025", "BV-040"];
        const newSku = "NV-100";

        const drafts = [
            ...existingSkus.map((sku, i) => makeDraft({
                id: `draft-existing-${i}`,
                entity_type: "product",
                parsed_data: { name: `Product ${sku}`, sku, unit: "adet" },
            })),
            makeDraft({
                id: "draft-new",
                entity_type: "product",
                parsed_data: { name: "New Product NV-100", sku: newSku, unit: "adet" },
            }),
        ];

        mockDbListDrafts.mockResolvedValue(drafts);

        mockDbFindProductBySku
            .mockResolvedValueOnce({ id: "p1", sku: "GV-050", on_hand: 10 })
            .mockResolvedValueOnce({ id: "p2", sku: "GV-080", on_hand: 20 })
            .mockResolvedValueOnce({ id: "p3", sku: "BV-025", on_hand: 5 })
            .mockResolvedValueOnce({ id: "p4", sku: "BV-040", on_hand: 15 })
            .mockResolvedValueOnce(null); // 5th call: new SKU, not found

        mockDbUpdateProduct.mockResolvedValue({ id: "existing" });
        mockDbCreateProduct.mockResolvedValue({ id: "new-product", sku: newSku });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(4);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
    });

    it("total dbCreateProduct calls matches added count", async () => {
        const drafts = [
            makeDraft({ id: "d1", entity_type: "product", parsed_data: { name: "A", sku: "SKU-1", unit: "adet" } }),
            makeDraft({ id: "d2", entity_type: "product", parsed_data: { name: "B", sku: "SKU-2", unit: "adet" } }),
        ];
        mockDbListDrafts.mockResolvedValue(drafts);

        // SKU-1 exists, SKU-2 is new
        mockDbFindProductBySku
            .mockResolvedValueOnce({ id: "existing", sku: "SKU-1", on_hand: 0 })
            .mockResolvedValueOnce(null);
        mockDbUpdateProduct.mockResolvedValue({ id: "existing" });
        mockDbCreateProduct.mockResolvedValue({ id: "new" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(mockDbCreateProduct.mock.calls.length);
        expect(result.updated).toBe(mockDbUpdateProduct.mock.calls.length);
    });
});

// ─── §9.2 Order merge — never creates approved entities ──────────────────────

describe("serviceConfirmBatch — §9.2: order merge never creates approved entities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbFindCustomerByName.mockResolvedValue(null);
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("calls dbCreateOrder with commercial_status: 'draft' (§9.2 — never approved)", async () => {
        mockDbCreateOrder.mockResolvedValue({ id: "order-1", order_number: "ORD-001" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme Vana", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        expect(mockDbCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({ commercial_status: "draft" })
        );
    });

    it("calls dbCreateOrder with fulfillment_status: 'unallocated'", async () => {
        mockDbCreateOrder.mockResolvedValue({ id: "order-1", order_number: "ORD-001" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme Vana", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        expect(mockDbCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({ fulfillment_status: "unallocated" })
        );
    });

    it("looks up customer by name via dbFindCustomerByName", async () => {
        mockDbCreateOrder.mockResolvedValue({ id: "order-1", order_number: "ORD-001" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme Vana", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        expect(mockDbFindCustomerByName).toHaveBeenCalledWith("Acme Vana");
    });

    it("calculates subtotal and vatTotal from grand_total (grandTotal / 1.20)", async () => {
        mockDbCreateOrder.mockResolvedValue({ id: "order-1", order_number: "ORD-001" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme", currency: "USD", grand_total: 1200 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        const call = mockDbCreateOrder.mock.calls[0][0] as Record<string, unknown>;
        // subtotal = 1200 / 1.20 = 1000, vatTotal = 1200 - 1000 = 200
        expect(call.grand_total).toBe(1200);
        expect(call.subtotal).toBeCloseTo(1000, 5);
        expect(call.vat_total).toBeCloseTo(200, 5);
    });

    it("passes lines:[] to dbCreateOrder — header-only creation, order_line drafts append lines", async () => {
        mockDbCreateOrder.mockResolvedValue({ id: "order-1", order_number: "ORD-001" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        // succeeds — no validation error from empty lines (fixed: uses dbCreateOrder directly)
        expect(result.added).toBe(1);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(mockDbCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({ lines: [] })
        );
    });

    it("order draft → added counter, draft marked merged", async () => {
        mockDbCreateOrder.mockResolvedValue({ id: "order-99", order_number: "ORD-099" });
        const draft = makeDraft({ id: "order-draft-1", entity_type: "order",
            parsed_data: { customer_name: "Test", currency: "USD", grand_total: 5000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            "order-draft-1",
            expect.objectContaining({ status: "merged", matched_entity_id: "order-99" })
        );
    });
});

// ─── Contract: added/updated/skipped are tracked independently ───────────────
//
// Regression guard: ensures no one can accidentally revert to a single "merged"
// counter that collapses all successful operations into one number.
// If this describe fails, the three counters have been incorrectly merged.

describe("serviceConfirmBatch — contract: added/updated/skipped are tracked independently", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("three-way batch: new SKU → added, existing SKU → updated, missing field → skipped", async () => {
        // Önceki "hepsi merged" mantığı added=2, updated=0, skipped=0 döndürürdü.
        const drafts = [
            makeDraft({
                id: "d-new",
                entity_type: "product",
                parsed_data: { name: "Brand New Valve", sku: "NV-NEW", unit: "adet" },
            }),
            makeDraft({
                id: "d-existing",
                entity_type: "product",
                parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet" },
            }),
            makeDraft({
                id: "d-skip",
                entity_type: "product",
                parsed_data: { name: "Incomplete Valve" }, // sku + unit missing
            }),
        ];
        mockDbListDrafts.mockResolvedValue(drafts);

        mockDbFindProductBySku
            .mockResolvedValueOnce(null)                                          // d-new: SKU not found → create
            .mockResolvedValueOnce({ id: "existing-p", sku: "GV-050", on_hand: 10 }); // d-existing: found → update

        mockDbCreateProduct.mockResolvedValue({ id: "new-p", sku: "NV-NEW" });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.errors).toHaveLength(1);
    });

    it("added + updated + skipped = total processed drafts", async () => {
        const drafts = [
            makeDraft({ id: "d1", entity_type: "product", parsed_data: { name: "A", sku: "SKU-A", unit: "adet" } }),
            makeDraft({ id: "d2", entity_type: "product", parsed_data: { name: "B", sku: "SKU-B", unit: "adet" } }),
            makeDraft({ id: "d3", entity_type: "product", parsed_data: { sku: "SKU-C" } }), // name + unit missing → skip
        ];
        mockDbListDrafts.mockResolvedValue(drafts);

        mockDbFindProductBySku
            .mockResolvedValueOnce(null)                              // SKU-A: new
            .mockResolvedValueOnce({ id: "p2", sku: "SKU-B", on_hand: 0 }); // SKU-B: existing

        mockDbCreateProduct.mockResolvedValue({ id: "new" });
        mockDbUpdateProduct.mockResolvedValue({ id: "p2" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added + result.updated + result.skipped).toBe(drafts.length);
        expect(result.added).toBe(1);
        expect(result.updated).toBe(1);
        expect(result.skipped).toBe(1);
    });
});

// ─── Error isolation ──────────────────────────────────────────────────────────

describe("serviceConfirmBatch — error isolation", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbLookupEntityAlias.mockResolvedValue(null);
        mockDbSaveEntityAlias.mockResolvedValue(undefined);
    });

    it("continues processing remaining drafts when one fails", async () => {
        const failDraft = makeDraft({ id: "draft-fail" });
        const successDraft = makeDraft({ id: "draft-ok", parsed_data: { name: "Good", currency: "USD" } });

        mockDbListDrafts.mockResolvedValue([failDraft, successDraft]);
        mockDbCreateCustomer
            .mockRejectedValueOnce(new Error("DB error"))
            .mockResolvedValueOnce({ id: "c-1", name: "Good" });
        mockDbUpdateDraft.mockResolvedValue({ ...successDraft, status: "merged" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.skipped).toBe(1);
    });

    it("accumulates error messages in errors array", async () => {
        const draft1 = makeDraft({ id: "draft-1" });
        const draft2 = makeDraft({ id: "draft-2" });

        mockDbListDrafts.mockResolvedValue([draft1, draft2]);
        mockDbCreateCustomer.mockRejectedValue(new Error("Connection timeout"));
        mockDbUpdateDraft.mockResolvedValue({ ...draft1, status: "merged" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.errors.length).toBe(2);
        expect(result.errors[0]).toContain("draft-1");
        expect(result.errors[1]).toContain("draft-2");
    });
});

// ─── Customer update on existing match ───────────────────────────────────────

describe("serviceConfirmBatch — customer update on existing match", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbSaveEntityAlias.mockResolvedValue(undefined);
        mockDbUpdateCustomer.mockResolvedValue({ id: "c-existing", name: "Acme" });
    });

    it("customer matched by code → dbUpdateCustomer called with import fields", async () => {
        const draft = makeDraft({
            parsed_data: {
                name: "Acme Vana",
                customer_code: "ACME-001",
                email: "acme@example.com",
                phone: "+90 212 555 0100",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindCustomerByCode.mockResolvedValue({ id: "c-existing", name: "Acme Vana" });
        mockDbLookupEntityAlias.mockResolvedValue(null);

        await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateCustomer).toHaveBeenCalledWith(
            "c-existing",
            expect.objectContaining({ name: "Acme Vana", email: "acme@example.com", phone: "+90 212 555 0100" })
        );
        expect(mockDbCreateCustomer).not.toHaveBeenCalled();
    });

    it("customer matched by alias → dbUpdateCustomer called", async () => {
        const draft = makeDraft({
            parsed_data: { name: "Acme Vana Ltd", email: "alias@example.com" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindCustomerByCode.mockResolvedValue(null);
        mockDbLookupEntityAlias.mockResolvedValue("c-alias-target");

        const result = await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateCustomer).toHaveBeenCalledWith(
            "c-alias-target",
            expect.objectContaining({ email: "alias@example.com" })
        );
        expect(result.updated).toBe(1);
        expect(result.added).toBe(0);
    });
});

// ─── AI Import Faz 2: vendor upsert ─────────────────────────────────────────

describe("serviceConfirmBatch — vendor upsert", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbListVendors.mockResolvedValue([]);
        mockDbUpdateVendor.mockResolvedValue({ id: "v-existing", name: "Acme Makine" });
        mockDbCreateVendor.mockResolvedValue({ id: "v-new", name: "Yeni Tedarikçi" });
    });

    it("matches existing vendor by email and updates safe fields", async () => {
        const draft = makeDraft({
            entity_type: "vendor",
            parsed_data: {
                name: "Acme Makine Ltd",
                contact_email: "SATIS@ACME.COM",
                contact_phone: "+90 212 555 0100",
                lead_time_days: "21",
                payment_terms_days: "30",
                price: 999,
                cost_price: 500,
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbListVendors.mockResolvedValue([
            { id: "v-existing", name: "Acme Makine", contact_email: "satis@acme.com", contact_phone: null, tax_number: null },
        ]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.errors).toEqual([]);
        expect(result.updated).toBe(1);
        expect(mockDbUpdateVendor).toHaveBeenCalledWith(
            "v-existing",
            expect.objectContaining({
                name: "Acme Makine Ltd",
                contact_email: "SATIS@ACME.COM",
                contact_phone: "+90 212 555 0100",
                lead_time_days: 21,
                payment_terms_days: 30,
            }),
        );
        const [, patch] = mockDbUpdateVendor.mock.calls[0];
        expect(patch).not.toHaveProperty("price");
        expect(patch).not.toHaveProperty("cost_price");
        expect(mockDbCreateVendor).not.toHaveBeenCalled();
    });

    it("creates a new vendor when there is no match", async () => {
        const draft = makeDraft({
            entity_type: "vendor",
            parsed_data: {
                name: "Yeni Tedarikçi",
                contact_email: "yeni@example.com",
                currency: "EUR",
                notes: "Ana tedarikçi",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(mockDbCreateVendor).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Yeni Tedarikçi",
                contact_email: "yeni@example.com",
                currency: "EUR",
                notes: "Ana tedarikçi",
            }),
        );
    });

    it("rejects an unmatched vendor row without name", async () => {
        const draft = makeDraft({
            entity_type: "vendor",
            parsed_data: { contact_email: "unknown@example.com" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("Tedarikçi adı");
        expect(mockDbCreateVendor).not.toHaveBeenCalled();
        expect(mockDbUpdateVendor).not.toHaveBeenCalled();
    });

    it("supports email fallback field for vendor imports", async () => {
        const draft = makeDraft({
            entity_type: "vendor",
            parsed_data: { name: "Acme Makine", email: "satis@acme.com" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbListVendors.mockResolvedValue([
            { id: "v-existing", name: "Acme Makine", contact_email: "satis@acme.com", contact_phone: null, tax_number: null },
        ]);

        await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateVendor).toHaveBeenCalledWith(
            "v-existing",
            expect.objectContaining({ contact_email: "satis@acme.com" }),
        );
    });

    it("reuses newly created vendor within the same batch instead of creating duplicate", async () => {
        const first = makeDraft({
            id: "vendor-first",
            entity_type: "vendor",
            parsed_data: { name: "Yeni Tedarikçi", contact_email: "yeni@example.com" },
        });
        const second = makeDraft({
            id: "vendor-second",
            entity_type: "vendor",
            parsed_data: { name: "Yeni Tedarikçi Güncel", contact_email: "yeni@example.com", contact_phone: "555" },
        });
        mockDbListDrafts.mockResolvedValue([first, second]);
        mockDbCreateVendor.mockResolvedValue({ id: "v-new", name: "Yeni Tedarikçi", contact_email: "yeni@example.com" });
        mockDbUpdateVendor.mockResolvedValue({ id: "v-new", name: "Yeni Tedarikçi Güncel", contact_email: "yeni@example.com" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(1);
        expect(mockDbListVendors).toHaveBeenCalledTimes(1);
        expect(mockDbCreateVendor).toHaveBeenCalledTimes(1);
        expect(mockDbUpdateVendor).toHaveBeenCalledWith(
            "v-new",
            expect.objectContaining({ name: "Yeni Tedarikçi Güncel", contact_phone: "555" }),
        );
    });
});

// ─── Quote merge ─────────────────────────────────────────────────────────────

describe("serviceConfirmBatch — quote merge", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbFindCustomerByCode.mockResolvedValue(null);
        mockDbFindQuoteByNumber.mockResolvedValue(null);
        mockDbUpdateQuote.mockResolvedValue({ id: "q-existing" });
    });

    it("new quote → added, dbCreateQuote called with correct fields", async () => {
        const draft = makeDraft({
            entity_type: "quote",
            parsed_data: {
                quote_number: "TKL-2024-001",
                currency: "EUR",
                total_amount: 5000,
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreateQuote.mockResolvedValue({ id: "q-new" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
        expect(mockDbCreateQuote).toHaveBeenCalledWith(
            expect.objectContaining({ quote_number: "TKL-2024-001", currency: "EUR" })
        );
    });

    it("existing quote → updated, dbUpdateQuote called with import fields", async () => {
        mockDbFindQuoteByNumber.mockResolvedValue({ id: "q-existing", quote_number: "TKL-2024-001" });
        const draft = makeDraft({
            entity_type: "quote",
            parsed_data: {
                quote_number: "TKL-2024-001",
                total_amount: 7500,
                currency: "EUR",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        expect(result.added).toBe(0);
        expect(mockDbUpdateQuote).toHaveBeenCalledWith(
            "q-existing",
            expect.objectContaining({ grand_total: 7500, currency: "EUR" })
        );
        expect(mockDbCreateQuote).not.toHaveBeenCalled();
    });

    it("missing quote_number → skipped, draft marked rejected", async () => {
        const draft = makeDraft({
            entity_type: "quote",
            parsed_data: { currency: "USD" }, // no quote_number
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.added).toBe(0);
        expect(result.errors[0]).toContain("Teklif numarası");
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            draft.id,
            expect.objectContaining({ status: "rejected" })
        );
    });
});

// ─── Invoice merge ────────────────────────────────────────────────────────────

describe("serviceConfirmBatch — invoice merge", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbFindInvoiceByNumber.mockResolvedValue(null);
        mockDbFindCustomerByCode.mockResolvedValue(null);
        mockDbFindOrderByOriginalNumber.mockResolvedValue(null);
        mockDbUpdateInvoice.mockResolvedValue({ id: "inv-existing" });
    });

    it("new invoice → added, dbCreateInvoice called", async () => {
        const draft = makeDraft({
            entity_type: "invoice",
            parsed_data: {
                invoice_number: "FAT-2024-001",
                amount: 12000,
                currency: "USD",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreateInvoice.mockResolvedValue({ id: "inv-new" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
        expect(mockDbCreateInvoice).toHaveBeenCalledWith(
            expect.objectContaining({ invoice_number: "FAT-2024-001", amount: 12000 })
        );
    });

    it("existing invoice → updated, dbUpdateInvoice called with import fields", async () => {
        mockDbFindInvoiceByNumber.mockResolvedValue({ id: "inv-existing", invoice_number: "FAT-2024-001" });
        const draft = makeDraft({
            entity_type: "invoice",
            parsed_data: {
                invoice_number: "FAT-2024-001",
                amount: 14400,
                currency: "EUR",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        expect(result.added).toBe(0);
        expect(mockDbUpdateInvoice).toHaveBeenCalledWith(
            "inv-existing",
            expect.objectContaining({ amount: 14400, currency: "EUR" })
        );
        expect(mockDbCreateInvoice).not.toHaveBeenCalled();
    });

    it("missing invoice_number → skipped, draft marked rejected", async () => {
        const draft = makeDraft({
            entity_type: "invoice",
            parsed_data: { amount: 5000 }, // no invoice_number
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("Fatura numarası");
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            draft.id,
            expect.objectContaining({ status: "rejected" })
        );
    });
});

// ─── Shipment merge ───────────────────────────────────────────────────────────

describe("serviceConfirmBatch — shipment merge", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbFindOrderByOriginalNumber.mockResolvedValue(null);
    });

    it("new shipment → added, dbCreateShipment called", async () => {
        const draft = makeDraft({
            entity_type: "shipment",
            parsed_data: {
                shipment_number: "SEV-2024-001",
                shipment_date: "2024-03-15",
                transport_type: "DHL",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreateShipment.mockResolvedValue({ id: "ship-new" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
        expect(mockDbCreateShipment).toHaveBeenCalledWith(
            expect.objectContaining({ shipment_number: "SEV-2024-001" })
        );
    });

    it("missing shipment_number → skipped, draft marked rejected", async () => {
        const draft = makeDraft({
            entity_type: "shipment",
            parsed_data: { transport_type: "FedEx" }, // no shipment_number
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("Sevkiyat numarası");
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            draft.id,
            expect.objectContaining({ status: "rejected" })
        );
    });
});

// ─── Payment merge ────────────────────────────────────────────────────────────

describe("serviceConfirmBatch — payment merge", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbFindInvoiceByNumber.mockResolvedValue(null);
    });

    it("new payment → added, dbCreatePayment called", async () => {
        const draft = makeDraft({
            entity_type: "payment",
            parsed_data: {
                payment_number: "ODE-2024-001",
                amount: 5000,
                currency: "USD",
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreatePayment.mockResolvedValue({ id: "pay-new" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(result.updated).toBe(0);
        expect(mockDbCreatePayment).toHaveBeenCalledWith(
            expect.objectContaining({ payment_number: "ODE-2024-001", amount: 5000 })
        );
    });

    it("missing payment_number → skipped, draft marked rejected", async () => {
        const draft = makeDraft({
            entity_type: "payment",
            parsed_data: { amount: 3000 }, // no payment_number
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("Ödeme numarası");
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            draft.id,
            expect.objectContaining({ status: "rejected" })
        );
    });
});

// ─── Draft rejection on skip paths ───────────────────────────────────────────

describe("serviceConfirmBatch — draft rejected on validation skip", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "rejected" });
    });

    it("product missing required fields → draft marked rejected", async () => {
        const draft = makeDraft({
            id: "prod-skip",
            entity_type: "product",
            parsed_data: { name: "Incomplete" }, // sku + unit missing
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            "prod-skip",
            expect.objectContaining({ status: "rejected" })
        );
    });

    it("catch block error → draft marked rejected (best-effort)", async () => {
        const draft = makeDraft({ id: "catch-draft" });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindCustomerByCode.mockResolvedValue(null);
        mockDbLookupEntityAlias.mockResolvedValue(null);
        mockDbFindCustomerByName.mockResolvedValue(null);
        mockDbCreateCustomer.mockRejectedValue(new Error("DB down"));
        // dbUpdateDraft called first time for rejected status (best-effort in catch)
        mockDbUpdateDraft.mockResolvedValue({ ...draft, status: "rejected" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain("catch-draft");
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            "catch-draft",
            expect.objectContaining({ status: "rejected" })
        );
    });
});

// ─── Unknown entity_type ──────────────────────────────────────────────────────

describe("serviceConfirmBatch — unknown entity_type", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "rejected" });
    });

    it("unknown entity_type → skipped + error message + draft rejected", async () => {
        const draft = makeDraft({
            id: "unknown-draft",
            entity_type: "widget" as unknown as "customer",
            parsed_data: { foo: "bar" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.added).toBe(0);
        expect(result.updated).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain("widget");
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(
            "unknown-draft",
            expect.objectContaining({ status: "rejected" })
        );
    });
});

// ─── Mixed-entity batch ───────────────────────────────────────────────────────

describe("serviceConfirmBatch — mixed-entity batch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
        mockDbFindCustomerByCode.mockResolvedValue(null);
        mockDbLookupEntityAlias.mockResolvedValue(null);
        mockDbSaveEntityAlias.mockResolvedValue(undefined);
        mockDbUpdateCustomer.mockResolvedValue({ id: "c-1" });
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbFindQuoteByNumber.mockResolvedValue(null);
        mockDbUpdateQuote.mockResolvedValue({ id: "q-existing" });
    });

    it("product + customer + new quote → correct counters per entity", async () => {
        const productDraft = makeDraft({
            id: "d-product",
            entity_type: "product",
            parsed_data: { name: "Gate Valve DN50", sku: "GV-050", unit: "adet" },
        });
        const customerDraft = makeDraft({
            id: "d-customer",
            entity_type: "customer",
            parsed_data: { name: "Yeni Müşteri", currency: "USD" },
        });
        const quoteDraft = makeDraft({
            id: "d-quote",
            entity_type: "quote",
            parsed_data: { quote_number: "TKL-001", currency: "USD" },
        });

        mockDbListDrafts.mockResolvedValue([productDraft, customerDraft, quoteDraft]);
        mockDbCreateProduct.mockResolvedValue({ id: "p-new" });
        mockDbFindCustomerByName.mockResolvedValue(null);
        mockDbCreateCustomer.mockResolvedValue({ id: "c-new" });
        mockDbCreateQuote.mockResolvedValue({ id: "q-new" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(3); // product (new) + customer (new) + quote (new)
        expect(result.updated).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
    });

    it("added + updated + skipped = total across entity types", async () => {
        const productDraft = makeDraft({
            id: "d-product",
            entity_type: "product",
            parsed_data: { name: "Valve", sku: "V-001", unit: "adet" },
        });
        const quoteExistingDraft = makeDraft({
            id: "d-quote-existing",
            entity_type: "quote",
            parsed_data: { quote_number: "TKL-001" },
        });
        const quoteSkipDraft = makeDraft({
            id: "d-quote-skip",
            entity_type: "quote",
            parsed_data: {}, // no quote_number → skip
        });

        mockDbListDrafts.mockResolvedValue([productDraft, quoteExistingDraft, quoteSkipDraft]);
        mockDbCreateProduct.mockResolvedValue({ id: "p-new" });
        mockDbFindQuoteByNumber.mockResolvedValue({ id: "q-existing", quote_number: "TKL-001" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added + result.updated + result.skipped).toBe(3);
        expect(result.added).toBe(1);   // product new
        expect(result.updated).toBe(1); // quote existing
        expect(result.skipped).toBe(1); // quote missing number
    });
});

// ─── order_line entity ────────────────────────────────────────────────────────

describe("serviceConfirmBatch — order_line entity", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    function makeSupabaseMock(opts: {
        existingSortOrders?: Array<{ sort_order: number }>;
        allLines?: Array<{ line_total: number }>;
    } = {}) {
        const { existingSortOrders = [], allLines = [{ line_total: 500 }] } = opts;
        const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
        const mockUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });
        const mockSalesOrdersUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

        const mockFrom = vi.fn((table: string) => {
            if (table === "order_lines") {
                return {
                    select: vi.fn((col: string) => {
                        if (col === "sort_order") {
                            return {
                                eq: vi.fn().mockReturnThis(),
                                order: vi.fn().mockReturnThis(),
                                limit: vi.fn().mockResolvedValue({ data: existingSortOrders }),
                            };
                        }
                        // "line_total" select
                        return {
                            eq: vi.fn().mockResolvedValue({ data: allLines }),
                        };
                    }),
                    insert: mockInsert,
                };
            }
            if (table === "sales_orders") {
                return { update: mockSalesOrdersUpdate };
            }
            return {};
        });

        return { mockFrom, mockInsert, mockSalesOrdersUpdate, mockUpdateEq };
    }

    it("order_number eksikse → skipped, draft rejected", async () => {
        const draft = makeDraft({
            entity_type: "order_line",
            parsed_data: { product_sku: "GV-050", quantity: 2, unit_price: 100 }, // no order_number
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.added).toBe(0);
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(draft.id, { status: "rejected" });
    });

    it("product_sku eksikse → skipped, draft rejected", async () => {
        const draft = makeDraft({
            entity_type: "order_line",
            parsed_data: { order_number: "ORD-001", quantity: 2, unit_price: 100 }, // no product_sku
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(draft.id, { status: "rejected" });
    });

    it("sipariş bulunamazsa → skipped, draft rejected", async () => {
        const draft = makeDraft({
            entity_type: "order_line",
            parsed_data: { order_number: "ORD-NONEXISTENT", product_sku: "GV-050" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindOrderByOriginalNumber.mockResolvedValue(null);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(draft.id, { status: "rejected" });
    });

    it("başarılı → order_lines insert + sales_orders totals update çağrılır", async () => {
        const draft = makeDraft({
            entity_type: "order_line",
            parsed_data: { order_number: "ORD-2026-0001", product_sku: "GV-050", quantity: 2, unit_price: 250, discount_pct: 0 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindOrderByOriginalNumber.mockResolvedValue({ id: "order-1" });
        mockDbFindProductBySku.mockResolvedValue({ id: "prod-1" });

        const { mockFrom, mockInsert, mockSalesOrdersUpdate } = makeSupabaseMock({
            existingSortOrders: [],
            allLines: [{ line_total: 500 }],
        });
        vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createServiceClient>);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(mockInsert).toHaveBeenCalledWith(
            expect.objectContaining({ order_id: "order-1", product_sku: "GV-050", quantity: 2 })
        );
        expect(mockSalesOrdersUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ subtotal: 500, vat_total: 100, grand_total: 600 })
        );
        expect(mockDbUpdateDraft).toHaveBeenCalledWith(draft.id, { status: "merged", matched_entity_id: "order-1" });
    });

    it("mevcut satır varsa sort_order bir artırılır", async () => {
        const draft = makeDraft({
            entity_type: "order_line",
            parsed_data: { order_number: "ORD-2026-0001", product_sku: "GV-050", quantity: 1, unit_price: 100 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindOrderByOriginalNumber.mockResolvedValue({ id: "order-1" });
        mockDbFindProductBySku.mockResolvedValue({ id: "prod-1" });

        const { mockFrom, mockInsert } = makeSupabaseMock({
            existingSortOrders: [{ sort_order: 5 }],
            allLines: [{ line_total: 100 }],
        });
        vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createServiceClient>);

        await serviceConfirmBatch("batch-1");

        expect(mockInsert).toHaveBeenCalledWith(
            expect.objectContaining({ sort_order: 6 })
        );
    });

    // Sprint B G4: aynı order'a multiple line draft → DB henüz commit olmadan cache devreye girer
    it("aynı order'a 3 line draft → sort_order 1, 2, 3 (cache; DB her seferinde okumaz)", async () => {
        const drafts = [1, 2, 3].map((i) =>
            makeDraft({
                id: `draft-line-${i}`,
                entity_type: "order_line",
                parsed_data: { order_number: "ORD-2026-0042", product_sku: `SKU-${i}`, quantity: 1, unit_price: 100 },
            })
        );
        mockDbListDrafts.mockResolvedValue(drafts);
        mockDbFindOrderByOriginalNumber.mockResolvedValue({ id: "order-42" });
        mockDbFindProductBySku.mockResolvedValue({ id: "prod-X" });

        const { mockFrom, mockInsert } = makeSupabaseMock({
            existingSortOrders: [], // boş → ilk sort_order=1
            allLines: [{ line_total: 100 }],
        });
        vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createServiceClient>);

        await serviceConfirmBatch("batch-1");

        // 3 insert: sort_order 1, 2, 3
        const insertCalls = mockInsert.mock.calls.map((c) => (c[0] as { sort_order: number }).sort_order);
        expect(insertCalls).toEqual([1, 2, 3]);
    });

    it("mevcut order'a 2 line eklendiğinde DB max=5 → cache 6, 7", async () => {
        const drafts = [1, 2].map((i) =>
            makeDraft({
                id: `draft-line-${i}`,
                entity_type: "order_line",
                parsed_data: { order_number: "ORD-2026-0099", product_sku: `SKU-${i}`, quantity: 1, unit_price: 100 },
            })
        );
        mockDbListDrafts.mockResolvedValue(drafts);
        mockDbFindOrderByOriginalNumber.mockResolvedValue({ id: "order-99" });
        mockDbFindProductBySku.mockResolvedValue({ id: "prod-X" });

        const { mockFrom, mockInsert } = makeSupabaseMock({
            existingSortOrders: [{ sort_order: 5 }],
            allLines: [{ line_total: 100 }],
        });
        vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createServiceClient>);

        await serviceConfirmBatch("batch-1");

        const insertCalls = mockInsert.mock.calls.map((c) => (c[0] as { sort_order: number }).sort_order);
        expect(insertCalls).toEqual([6, 7]);
    });
});

// ─── parseNumeric — TR format ─────────────────────────────────────────────────

describe("parseNumeric — TR format (dolaylı, product price üzerinden)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("'1.234,56' (TR thousands dot + decimal comma) → 1234.56", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Flanş DN100", sku: "FL-100", unit: "adet", price: "1.234,56" },
            field_approvals: { price: "apply" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "p-new" });

        await serviceConfirmBatch("batch-1");

        const [payload] = mockDbCreateProduct.mock.calls[0];
        expect(payload.price).toBe(1234.56);
    });

    it("'1.000' (TR integer with thousands dot) → 1000", async () => {
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Vana", sku: "VN-001", unit: "adet", price: "1.000" },
            field_approvals: { price: "apply" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "p-new" });

        await serviceConfirmBatch("batch-1");

        const [payload] = mockDbCreateProduct.mock.calls[0];
        expect(payload.price).toBe(1000);
    });
});

// ─── Shipment / Invoice / Payment — orderId + customerId + invoiceId branches ─

describe("serviceConfirmBatch — shipment with order_number → orderId resolved", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("shipment order_number provided → dbFindOrderByOriginalNumber called, orderId set", async () => {
        const draft = makeDraft({
            entity_type: "shipment",
            parsed_data: { shipment_number: "SEV-001", order_number: "ORD-2026-0001" },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindOrderByOriginalNumber.mockResolvedValue({ id: "order-1" });
        mockDbCreateShipment.mockResolvedValue({ id: "ship-new" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(mockDbFindOrderByOriginalNumber).toHaveBeenCalledWith("ORD-2026-0001");
        expect(mockDbCreateShipment).toHaveBeenCalledWith(
            expect.objectContaining({ order_id: "order-1", order_number: "ORD-2026-0001" })
        );
    });
});

describe("serviceConfirmBatch — invoice with order_number + customer_code", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("invoice order_number + customer_code → orderId + customerId resolved", async () => {
        const draft = makeDraft({
            entity_type: "invoice",
            parsed_data: {
                invoice_number: "FAT-001",
                order_number: "ORD-2026-0001",
                customer_code: "ACME",
                amount: 1200,
            },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindInvoiceByNumber.mockResolvedValue(null); // new invoice
        mockDbFindOrderByOriginalNumber.mockResolvedValue({ id: "order-1" });
        mockDbFindCustomerByCode.mockResolvedValue({ id: "cust-1" });
        mockDbCreateInvoice.mockResolvedValue({ id: "inv-new" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.added).toBe(1);
        expect(mockDbFindOrderByOriginalNumber).toHaveBeenCalledWith("ORD-2026-0001");
        expect(mockDbFindCustomerByCode).toHaveBeenCalledWith("ACME");
        expect(mockDbCreateInvoice).toHaveBeenCalledWith(
            expect.objectContaining({ order_id: "order-1", customer_id: "cust-1" })
        );
    });
});

describe("serviceConfirmBatch — payment with invoice_number → invoice status update", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("payment fully covers invoice → dbUpdateInvoiceStatus 'paid' çağrılır", async () => {
        const draft = makeDraft({
            entity_type: "payment",
            parsed_data: { payment_number: "ODE-001", invoice_number: "FAT-001", amount: 1000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreatePayment.mockResolvedValue({ id: "pay-new" });
        // dbFindInvoiceByNumber called TWICE: once to get invoiceId, once inside if(invoiceId) block
        mockDbFindInvoiceByNumber
            .mockResolvedValueOnce({ id: "inv-1" })         // first call → invoiceId lookup
            .mockResolvedValueOnce({ id: "inv-1", amount: 1000 }); // second call → invoice detail
        mockDbSumPaymentsForInvoice.mockResolvedValue(1000); // fully paid

        await serviceConfirmBatch("batch-1");

        expect(mockDbSumPaymentsForInvoice).toHaveBeenCalledWith("inv-1");
        expect(mockDbUpdateInvoiceStatus).toHaveBeenCalledWith("inv-1", "paid");
    });

    it("payment partially covers invoice → dbUpdateInvoiceStatus 'partially_paid' çağrılır", async () => {
        const draft = makeDraft({
            entity_type: "payment",
            parsed_data: { payment_number: "ODE-002", invoice_number: "FAT-001", amount: 400 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbCreatePayment.mockResolvedValue({ id: "pay-new" });
        mockDbFindInvoiceByNumber
            .mockResolvedValueOnce({ id: "inv-1" })
            .mockResolvedValueOnce({ id: "inv-1", amount: 1000 });
        mockDbSumPaymentsForInvoice.mockResolvedValue(400); // partial

        await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateInvoiceStatus).toHaveBeenCalledWith("inv-1", "partially_paid");
    });
});

// ─── Meta processing — column_mapping_meta branch ────────────────────────────

describe("serviceConfirmBatch — meta processing (column_mapping_meta)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbIncrementMappingSuccess.mockResolvedValue(undefined);
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
    });

    it("batch with parse_result.column_mapping_meta + merge → dbIncrementMappingSuccess çağrılır", async () => {
        const metaBatch = makeBatch({
            status: "confirmed",
            parse_result: {
                column_mapping_meta: [
                    { entity_type: "product", normalized_columns: ["urun_adi", "sku"] },
                ],
            } as unknown as null,
        });
        // dbGetBatch returns review batch (status: "review"), dbUpdateBatchStatus returns confirmed batch WITH meta
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(metaBatch);

        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { name: "Vana", sku: "VN-001", unit: "adet" },
        });
        mockDbListDrafts
            .mockResolvedValueOnce([draft])             // first call: drafts to process
            .mockResolvedValueOnce([{ entity_type: "product", status: "merged" }]); // second call: finalDrafts
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "p-new" });

        await serviceConfirmBatch("batch-1");

        expect(mockDbIncrementMappingSuccess).toHaveBeenCalledWith(
            ["urun_adi", "sku"],
            "product"
        );
    });

    it("batch with meta but no merged drafts → dbIncrementMappingSuccess çağrılmaz", async () => {
        const batchWithMeta = makeBatch({
            parse_result: {
                column_mapping_meta: [
                    { entity_type: "product", normalized_columns: ["sku"] },
                ],
            } as unknown as null,
        });
        mockDbGetBatch.mockResolvedValue(batchWithMeta);

        // All drafts skipped (missing required field)
        const draft = makeDraft({
            entity_type: "product",
            parsed_data: { sku: "VN-001" }, // missing name + unit → skip
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        // added + updated = 0 → no call
        expect(mockDbIncrementMappingSuccess).not.toHaveBeenCalled();
    });
});
