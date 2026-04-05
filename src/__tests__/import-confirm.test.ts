/**
 * Tests for serviceConfirmBatch — §9.2 domain contract + merge behavior.
 *
 * §9.2: Import never creates approved entities.
 * All DB and service dependencies are mocked — no database access in CI.
 *
 * NOTE: Documents a known latent bug — order merge passes lines:[] to serviceCreateOrder,
 * which validates lines.length > 0. This means order drafts always fail validation
 * and land in the errors/skipped counts. The test documents this existing behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImportDraftRow, ImportBatchRow } from "@/lib/database.types";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockDbGetBatch = vi.fn();
const mockDbUpdateBatchStatus = vi.fn();
const mockDbListDrafts = vi.fn();
const mockDbUpdateDraft = vi.fn();
const mockDbCreateCustomer = vi.fn();
const mockDbFindCustomerByName = vi.fn();
const mockDbFindCustomerByCode = vi.fn();
const mockDbLookupEntityAlias = vi.fn();
const mockDbSaveEntityAlias = vi.fn();
const mockDbCreateProduct = vi.fn();
const mockDbFindProductBySku = vi.fn();
const mockDbUpdateProduct = vi.fn();
const mockServiceCreateOrder = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch: (...args: unknown[]) => mockDbGetBatch(...args),
    dbUpdateBatchStatus: (...args: unknown[]) => mockDbUpdateBatchStatus(...args),
    dbListDrafts: (...args: unknown[]) => mockDbListDrafts(...args),
    dbUpdateDraft: (...args: unknown[]) => mockDbUpdateDraft(...args),
    dbCreateDrafts: vi.fn(),
}));
vi.mock("@/lib/supabase/customers", () => ({
    dbCreateCustomer: (...args: unknown[]) => mockDbCreateCustomer(...args),
    dbFindCustomerByName: (...args: unknown[]) => mockDbFindCustomerByName(...args),
    dbFindCustomerByCode: (...args: unknown[]) => mockDbFindCustomerByCode(...args),
}));
vi.mock("@/lib/supabase/entity-aliases", () => ({
    dbLookupEntityAlias: (...args: unknown[]) => mockDbLookupEntityAlias(...args),
    dbSaveEntityAlias: (...args: unknown[]) => mockDbSaveEntityAlias(...args),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct: (...args: unknown[]) => mockDbCreateProduct(...args),
    dbFindProductBySku: (...args: unknown[]) => mockDbFindProductBySku(...args),
    dbUpdateProduct: (...args: unknown[]) => mockDbUpdateProduct(...args),
}));
vi.mock("@/lib/services/order-service", () => ({
    serviceCreateOrder: (...args: unknown[]) => mockServiceCreateOrder(...args),
}));

import { serviceConfirmBatch } from "@/lib/services/import-service";

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

    it("sets batch status to 'confirmed' after all drafts are processed", async () => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbListDrafts.mockResolvedValue([]);
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));

        await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateBatchStatus).toHaveBeenCalledWith("batch-1", "confirmed");
    });

    it("returns { added, updated, skipped, errors } result shape", async () => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbListDrafts.mockResolvedValue([]);
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));

        const result = await serviceConfirmBatch("batch-1");

        expect(result).toHaveProperty("added");
        expect(result).toHaveProperty("updated");
        expect(result).toHaveProperty("skipped");
        expect(result).toHaveProperty("errors");
        expect(typeof result.added).toBe("number");
        expect(typeof result.updated).toBe("number");
        expect(typeof result.skipped).toBe("number");
        expect(Array.isArray(result.errors)).toBe(true);
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

    it("increments updated (not added) when customer already exists by name", async () => {
        mockDbListDrafts.mockResolvedValue([makeDraft()]);
        mockDbFindCustomerByName.mockResolvedValue({ id: "existing-c", name: "Acme Vana" });
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

    it("stock entity_type → additive: existing 50 + imported 30 = 80", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "GV-050", on_hand: 30 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);
        mockDbFindProductBySku.mockResolvedValue({ id: "existing-p", sku: "GV-050", on_hand: 50 });
        mockDbUpdateProduct.mockResolvedValue({ id: "existing-p" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.updated).toBe(1);
        expect(mockDbUpdateProduct).toHaveBeenCalledWith("existing-p", { on_hand: 80 });
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

    it("stock entity_type without on_hand → dbUpdateProduct not called", async () => {
        const draft = makeDraft({
            entity_type: "stock",
            parsed_data: { sku: "GV-050" }, // no on_hand
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateProduct).not.toHaveBeenCalled();
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

    it("calls serviceCreateOrder with commercial_status: 'draft'", async () => {
        // serviceCreateOrder is mocked to succeed here to isolate §9.2 verification
        mockServiceCreateOrder.mockResolvedValue({ id: "order-1" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme Vana", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        expect(mockServiceCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({ commercial_status: "draft" })
        );
    });

    it("calls serviceCreateOrder with fulfillment_status: 'unallocated'", async () => {
        mockServiceCreateOrder.mockResolvedValue({ id: "order-1" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme Vana", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        expect(mockServiceCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({ fulfillment_status: "unallocated" })
        );
    });

    it("looks up customer by name via dbFindCustomerByName", async () => {
        mockServiceCreateOrder.mockResolvedValue({ id: "order-1" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme Vana", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        expect(mockDbFindCustomerByName).toHaveBeenCalledWith("Acme Vana");
    });

    it("calculates subtotal and vatTotal from grand_total (grandTotal / 1.20)", async () => {
        mockServiceCreateOrder.mockResolvedValue({ id: "order-1" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme", currency: "USD", grand_total: 1200 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        const call = mockServiceCreateOrder.mock.calls[0][0] as Record<string, unknown>;
        // subtotal = 1200 / 1.20 = 1000, vatTotal = 1200 - 1000 = 200
        expect(call.grand_total).toBe(1200);
        expect(call.subtotal).toBeCloseTo(1000, 5);
        expect(call.vat_total).toBeCloseTo(200, 5);
    });

    it("passes empty lines array to serviceCreateOrder", async () => {
        mockServiceCreateOrder.mockResolvedValue({ id: "order-1" });
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        await serviceConfirmBatch("batch-1");

        expect(mockServiceCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({ lines: [] })
        );
    });

    // Documents the latent bug: serviceCreateOrder validates lines.length > 0,
    // but import passes lines:[]. Without mocking serviceCreateOrder to succeed,
    // order drafts always fail with validation error and land in errors/skipped.
    it("[KNOWN BUG #import-1] order drafts always fail: import passes lines:[] but serviceCreateOrder requires lines.length > 0", async () => {
        mockServiceCreateOrder.mockRejectedValue(new Error("En az bir satır ürün girilmelidir."));
        const draft = makeDraft({
            entity_type: "order",
            parsed_data: { customer_name: "Acme", currency: "USD", grand_total: 12000 },
        });
        mockDbListDrafts.mockResolvedValue([draft]);

        const result = await serviceConfirmBatch("batch-1");

        expect(result.skipped).toBe(1);
        expect(result.added).toBe(0);
        expect(result.errors[0]).toContain("draft-1");
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
