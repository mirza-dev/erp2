/**
 * Sprint B G4 — order_line sort_order collision fix: per-order cache.
 *
 * Plan kriteri: "aynı order'a 3 line → sort_order 1,2,3; DB select cache miss sonrası 1 kez"
 * Bu test sort_order cache davranışını ve DB select sayısını doğrular.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImportBatchRow, ImportDraftRow } from "@/lib/database.types";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockDbGetBatch = vi.fn();
const mockDbUpdateBatchStatus = vi.fn();
const mockDbClaimBatchForConfirm = vi.fn();
const mockDbListDrafts = vi.fn();
const mockDbUpdateDraft = vi.fn();
const mockDbFindOrderByOriginalNumber = vi.fn();
const mockDbFindProductBySku = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch: (...a: unknown[]) => mockDbGetBatch(...a),
    dbUpdateBatchStatus: (...a: unknown[]) => mockDbUpdateBatchStatus(...a),
    dbListDrafts: (...a: unknown[]) => mockDbListDrafts(...a),
    dbUpdateDraft: (...a: unknown[]) => mockDbUpdateDraft(...a),
    dbCreateDrafts: vi.fn(),
    dbClaimBatchForConfirm: (...a: unknown[]) => mockDbClaimBatchForConfirm(...a),
}));
vi.mock("@/lib/supabase/customers", () => ({
    dbCreateCustomer: vi.fn(), dbFindCustomerByName: vi.fn(),
    dbFindCustomerByCode: vi.fn(), dbUpdateCustomer: vi.fn(),
}));
vi.mock("@/lib/supabase/entity-aliases", () => ({
    dbLookupEntityAlias: vi.fn().mockResolvedValue(null),
    dbSaveEntityAlias: vi.fn(),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct: vi.fn(),
    dbFindProductBySku: (...a: unknown[]) => mockDbFindProductBySku(...a),
    dbUpdateProduct: vi.fn(),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByOriginalNumber: (...a: unknown[]) => mockDbFindOrderByOriginalNumber(...a),
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
import { createServiceClient } from "@/lib/supabase/service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBatch(overrides: Partial<ImportBatchRow> = {}): ImportBatchRow {
    return {
        id: "batch-1", file_name: "f.xlsx", file_size: null, status: "review",
        parse_result: null, confidence: null, created_by: null,
        created_at: "2024-01-01T00:00:00Z", confirmed_at: null, ...overrides,
    };
}

function makeLineDraft(i: number, orderId = "ORD-001"): ImportDraftRow {
    return {
        id: `draft-line-${i}`, batch_id: "batch-1", entity_type: "order_line",
        raw_data: null,
        parsed_data: { order_number: orderId, product_sku: `SKU-${i}`, quantity: 1, unit_price: 100 },
        matched_entity_id: null, confidence: 0.9, ai_reason: null, unmatched_fields: null,
        user_corrections: null, status: "pending", created_at: "2024-01-01T00:00:00Z",
    };
}

function makeSupabaseMock(existingSortOrders: Array<{ sort_order: number }> = []) {
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const sortSelectCalls: number[] = [];

    const mockFrom = vi.fn((table: string) => {
        if (table === "order_lines") {
            return {
                select: vi.fn((col: string) => {
                    if (col === "sort_order") {
                        sortSelectCalls.push(1);
                        return {
                            eq: vi.fn().mockReturnThis(),
                            order: vi.fn().mockReturnThis(),
                            limit: vi.fn().mockResolvedValue({ data: existingSortOrders }),
                        };
                    }
                    return { eq: vi.fn().mockResolvedValue({ data: [{ line_total: 100 }] }) };
                }),
                insert: mockInsert,
            };
        }
        if (table === "sales_orders") {
            return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) };
        }
        return {};
    });

    return { mockFrom, mockInsert, sortSelectCalls };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetBatch.mockResolvedValue(makeBatch());
    mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
    mockDbClaimBatchForConfirm.mockResolvedValue({ id: "batch-1", status: "confirming" });
    mockDbUpdateDraft.mockResolvedValue({});
    mockDbFindOrderByOriginalNumber.mockResolvedValue({ id: "order-1" });
    mockDbFindProductBySku.mockResolvedValue({ id: "prod-X" });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("order_line sort_order — per-order cache (Sprint B G4)", () => {
    it("aynı order'a 3 satır → sort_order 1, 2, 3 (sıralı)", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeLineDraft(1), makeLineDraft(2), makeLineDraft(3),
        ]);
        const { mockFrom, mockInsert } = makeSupabaseMock([]);
        vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createServiceClient>);

        await serviceConfirmBatch("batch-1");

        const sortOrders = mockInsert.mock.calls.map((c) => (c[0] as { sort_order: number }).sort_order);
        expect(sortOrders).toEqual([1, 2, 3]);
    });

    it("aynı order'a 3 satır → DB sort_order select sadece 1 kez (cache devreye girer)", async () => {
        mockDbListDrafts.mockResolvedValue([
            makeLineDraft(1), makeLineDraft(2), makeLineDraft(3),
        ]);
        const { mockFrom, sortSelectCalls } = makeSupabaseMock([]);
        vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createServiceClient>);

        await serviceConfirmBatch("batch-1");

        expect(sortSelectCalls.length).toBe(1); // cache miss sadece ilk satırda
    });

    it("order'da mevcut satır varsa (max=5) → yeni satırlar 6, 7", async () => {
        mockDbListDrafts.mockResolvedValue([makeLineDraft(1), makeLineDraft(2)]);
        const { mockFrom, mockInsert } = makeSupabaseMock([{ sort_order: 5 }]);
        vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createServiceClient>);

        await serviceConfirmBatch("batch-1");

        const sortOrders = mockInsert.mock.calls.map((c) => (c[0] as { sort_order: number }).sort_order);
        expect(sortOrders).toEqual([6, 7]);
    });

    it("farklı order'lar için ayrı cache → her biri kendi sort_order'ından başlar", async () => {
        const drafts = [
            { ...makeLineDraft(1, "ORD-001"), id: "d1" },
            { ...makeLineDraft(1, "ORD-002"), id: "d2" },
        ];
        mockDbListDrafts.mockResolvedValue(drafts);

        let orderSelectCount = 0;
        const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
        const mockFrom = vi.fn((table: string) => {
            if (table === "order_lines") {
                return {
                    select: vi.fn((col: string) => {
                        if (col === "sort_order") {
                            orderSelectCount++;
                            return {
                                eq: vi.fn().mockReturnThis(),
                                order: vi.fn().mockReturnThis(),
                                limit: vi.fn().mockResolvedValue({ data: [] }),
                            };
                        }
                        return { eq: vi.fn().mockResolvedValue({ data: [{ line_total: 100 }] }) };
                    }),
                    insert: mockInsert,
                };
            }
            if (table === "sales_orders") {
                return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) };
            }
            return {};
        });

        mockDbFindOrderByOriginalNumber
            .mockResolvedValueOnce({ id: "order-1" })
            .mockResolvedValueOnce({ id: "order-2" });

        vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof createServiceClient>);

        await serviceConfirmBatch("batch-1");

        // İki farklı order → iki DB select (her biri için cache miss)
        expect(orderSelectCount).toBe(2);
        const sortOrders = mockInsert.mock.calls.map((c) => (c[0] as { sort_order: number }).sort_order);
        expect(sortOrders).toEqual([1, 1]); // her order kendi 1'inden başlar
    });
});
