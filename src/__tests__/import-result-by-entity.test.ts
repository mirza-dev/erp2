/**
 * Sprint B G6 — ConfirmResult.byEntity: entity-bazlı sayaç kırılımı.
 *
 * Plan kriteri: "farklı entity tiplerini içeren batch → her entity için
 * added/updated/skipped sayaçları doğru artıyor"
 * Kapsam: karışık batch (ürün + müşteri), aynı entity'den çoklu kayıt,
 * toplam tutarlılık invariantı.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImportBatchRow, ImportDraftRow } from "@/lib/database.types";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockDbGetBatch = vi.fn();
const mockDbUpdateBatchStatus = vi.fn();
const mockDbClaimBatchForConfirm = vi.fn();
const mockDbListDrafts = vi.fn();
const mockDbUpdateDraft = vi.fn();
const mockDbCreateProduct = vi.fn();
const mockDbFindProductBySku = vi.fn();
const mockDbUpdateProduct = vi.fn();
const mockDbCreateCustomer = vi.fn();
const mockDbFindCustomerByCode = vi.fn();
const mockDbFindCustomerByName = vi.fn();
const mockDbUpdateCustomer = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch: (...a: unknown[]) => mockDbGetBatch(...a),
    dbUpdateBatchStatus: (...a: unknown[]) => mockDbUpdateBatchStatus(...a),
    dbListDrafts: (...a: unknown[]) => mockDbListDrafts(...a),
    dbUpdateDraft: (...a: unknown[]) => mockDbUpdateDraft(...a),
    dbCreateDrafts: vi.fn(),
    dbClaimBatchForConfirm: (...a: unknown[]) => mockDbClaimBatchForConfirm(...a),
}));
vi.mock("@/lib/supabase/customers", () => ({
    dbCreateCustomer: (...a: unknown[]) => mockDbCreateCustomer(...a),
    dbFindCustomerByName: (...a: unknown[]) => mockDbFindCustomerByName(...a),
    dbFindCustomerByCode: (...a: unknown[]) => mockDbFindCustomerByCode(...a),
    dbUpdateCustomer: (...a: unknown[]) => mockDbUpdateCustomer(...a),
}));
vi.mock("@/lib/supabase/entity-aliases", () => ({
    dbLookupEntityAlias: vi.fn().mockResolvedValue(null),
    dbSaveEntityAlias: vi.fn(),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct: (...a: unknown[]) => mockDbCreateProduct(...a),
    dbFindProductBySku: (...a: unknown[]) => mockDbFindProductBySku(...a),
    dbUpdateProduct: (...a: unknown[]) => mockDbUpdateProduct(...a),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByOriginalNumber: vi.fn(),
    dbCreateOrder: vi.fn(),
    dbGetOpenOrderCountByProduct: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/supabase/quotes", () => ({
    dbCreateQuote: vi.fn(), dbFindQuoteByNumber: vi.fn(), dbUpdateQuote: vi.fn(),
}));
vi.mock("@/lib/supabase/shipments", () => ({ dbCreateShipment: vi.fn() }));
vi.mock("@/lib/supabase/invoices", () => ({
    dbCreateInvoice: vi.fn(), dbFindInvoiceByNumber: vi.fn(), dbUpdateInvoice: vi.fn(),
    dbUpdateInvoiceStatus: vi.fn(), dbSumPaymentsForInvoice: vi.fn(),
}));
vi.mock("@/lib/supabase/payments", () => ({ dbCreatePayment: vi.fn() }));
vi.mock("@/lib/supabase/column-mappings", () => ({
    dbIncrementMappingSuccess: vi.fn(),
    normalizeColumnName: (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { serviceConfirmBatch } from "@/lib/services/import-service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBatch(overrides: Partial<ImportBatchRow> = {}): ImportBatchRow {
    return {
        id: "batch-1", file_name: "f.xlsx", file_size: null, status: "review",
        parse_result: null, confidence: null, created_by: null,
        created_at: "2024-01-01T00:00:00Z", confirmed_at: null, ...overrides,
    };
}

function makeProductDraft(id: string, sku: string, valid = true): ImportDraftRow {
    return {
        id, batch_id: "batch-1", entity_type: "product",
        raw_data: null,
        parsed_data: valid
            ? { sku, name: `Ürün ${sku}`, unit: "adet" }
            : { name: `Eksik SKU` }, // sku yok → skipped
        matched_entity_id: null, confidence: 0.9, ai_reason: null,
        unmatched_fields: null, user_corrections: null, status: "pending",
        created_at: "2024-01-01T00:00:00Z",
    };
}

function makeCustomerDraft(id: string, name: string): ImportDraftRow {
    return {
        id, batch_id: "batch-1", entity_type: "customer",
        raw_data: null,
        parsed_data: { name, email: `${id}@example.com`, currency: "TRY" },
        matched_entity_id: null, confidence: 0.9, ai_reason: null,
        unmatched_fields: null, user_corrections: null, status: "pending",
        created_at: "2024-01-01T00:00:00Z",
    };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetBatch.mockResolvedValue(makeBatch());
    mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
    mockDbClaimBatchForConfirm.mockResolvedValue({ id: "batch-1", status: "confirming" });
    mockDbUpdateDraft.mockResolvedValue({});
    mockDbFindCustomerByCode.mockResolvedValue(null);
    mockDbFindCustomerByName.mockResolvedValue(null);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ConfirmResult.byEntity — entity-bazlı sayaç kırılımı (Sprint B G6)", () => {
    it("boş batch → 9 entity tipi, hepsi { added:0, updated:0, skipped:0 }", async () => {
        mockDbListDrafts.mockResolvedValue([]);

        const result = await serviceConfirmBatch("batch-1");

        const entityTypes = [
            "customer", "product", "quote", "order", "order_line",
            "stock", "shipment", "invoice", "payment",
        ] as const;
        for (const et of entityTypes) {
            expect(result.byEntity[et]).toEqual({ added: 0, updated: 0, skipped: 0 });
        }
    });

    it("karışık batch: 1 ürün + 1 müşteri eklendi → her entity kendi added'ını sayar", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeProductDraft("d-p1", "SKU-A"),
            makeCustomerDraft("d-c1", "Acme Vana"),
        ]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "p-1", sku: "SKU-A" });
        mockDbCreateCustomer.mockResolvedValue({ id: "c-1", name: "Acme Vana" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.byEntity.product.added).toBe(1);
        expect(result.byEntity.product.updated).toBe(0);
        expect(result.byEntity.product.skipped).toBe(0);
        expect(result.byEntity.customer.added).toBe(1);
        expect(result.byEntity.customer.updated).toBe(0);
        expect(result.byEntity.customer.skipped).toBe(0);
        // Diğer tipler etkilenmez
        expect(result.byEntity.order.added).toBe(0);
        expect(result.byEntity.invoice.added).toBe(0);
    });

    it("aynı entity tipinden 2 kayıt eklendi → added=2", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeProductDraft("d-p1", "SKU-1"),
            makeProductDraft("d-p2", "SKU-2"),
        ]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct
            .mockResolvedValueOnce({ id: "p-1", sku: "SKU-1" })
            .mockResolvedValueOnce({ id: "p-2", sku: "SKU-2" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.byEntity.product.added).toBe(2);
        expect(result.added).toBe(2);
    });

    it("1 ürün eklendi + 1 ürün atlandı → product.added=1, product.skipped=1", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeProductDraft("d-p1", "SKU-GOOD"),
            makeProductDraft("d-p2", "", false), // sku eksik → skipped
        ]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "p-1", sku: "SKU-GOOD" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.byEntity.product.added).toBe(1);
        expect(result.byEntity.product.skipped).toBe(1);
        expect(result.byEntity.product.updated).toBe(0);
    });

    it("byEntity toplamı = result.added + result.updated + result.skipped (invariant)", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeProductDraft("d-p1", "SKU-X"),
            makeProductDraft("d-p2", "", false), // skipped
            makeCustomerDraft("d-c1", "Beta Ltd"),
        ]);
        mockDbFindProductBySku.mockResolvedValue(null);
        mockDbCreateProduct.mockResolvedValue({ id: "p-1", sku: "SKU-X" });
        mockDbCreateCustomer.mockResolvedValue({ id: "c-1", name: "Beta Ltd" });

        const result = await serviceConfirmBatch("batch-1");

        const byEntityTotal = Object.values(result.byEntity).reduce(
            (sum, counts) => sum + counts.added + counts.updated + counts.skipped,
            0,
        );
        expect(byEntityTotal).toBe(result.added + result.updated + result.skipped);
    });

    it("mevcut müşteri güncellendiğinde byEntity.customer.updated=1", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeCustomerDraft("d-c1", "Eski Firma"),
        ]);
        // customer_code yok → dbFindCustomerByName üzerinden eşleşir
        mockDbFindCustomerByName.mockResolvedValue({ id: "existing-c", name: "Eski Firma" });
        mockDbUpdateCustomer.mockResolvedValue({ id: "existing-c", name: "Eski Firma" });

        const result = await serviceConfirmBatch("batch-1");

        expect(result.byEntity.customer.updated).toBe(1);
        expect(result.byEntity.customer.added).toBe(0);
        expect(result.updated).toBeGreaterThanOrEqual(1);
    });
});
