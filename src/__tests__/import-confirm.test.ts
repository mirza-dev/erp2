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
const mockDbCreateProduct = vi.fn();
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
}));
vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct: (...args: unknown[]) => mockDbCreateProduct(...args),
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

    it("returns { merged, skipped, errors } result shape", async () => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbListDrafts.mockResolvedValue([]);
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));

        const result = await serviceConfirmBatch("batch-1");

        expect(result).toHaveProperty("merged");
        expect(result).toHaveProperty("skipped");
        expect(result).toHaveProperty("errors");
        expect(typeof result.merged).toBe("number");
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

    it("increments merged counter on success", async () => {
        mockDbListDrafts.mockResolvedValue([makeDraft()]);
        mockDbCreateCustomer.mockResolvedValue({ id: "c-1", name: "Acme" });

        const result = await serviceConfirmBatch("batch-1");
        expect(result.merged).toBe(1);
        expect(result.skipped).toBe(0);
    });
});

// ─── Product merge ────────────────────────────────────────────────────────────

describe("serviceConfirmBatch — product merge", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
        mockDbUpdateDraft.mockResolvedValue({ ...makeDraft(), status: "merged" });
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
        expect(result.merged).toBe(0);
        expect(result.errors[0]).toContain("draft-1");
    });
});

// ─── Error isolation ──────────────────────────────────────────────────────────

describe("serviceConfirmBatch — error isolation", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue(makeBatch());
        mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
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

        expect(result.merged).toBe(1);
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
