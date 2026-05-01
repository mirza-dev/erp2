/**
 * Sprint B G3 — Race condition: eş zamanlı iki confirm → biri başarılı, biri hata.
 *
 * Plan kriteri: "paralel iki confirm → biri başarılı, diğeri hata; entity'ler 2 kez insert olmaz"
 * dbClaimBatchForConfirm CAS mekanizması: ilk çağrı claimed row döner, ikinci çağrı null döner.
 * Rollback: exception'da batch 'review'e geri çekilir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImportBatchRow } from "@/lib/database.types";

const mockDbGetBatch = vi.fn();
const mockDbUpdateBatchStatus = vi.fn();
const mockDbClaimBatchForConfirm = vi.fn();
const mockDbListDrafts = vi.fn();
const mockDbUpdateDraft = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch: (...a: unknown[]) => mockDbGetBatch(...a),
    dbUpdateBatchStatus: (...a: unknown[]) => mockDbUpdateBatchStatus(...a),
    dbListDrafts: (...a: unknown[]) => mockDbListDrafts(...a),
    dbUpdateDraft: (...a: unknown[]) => mockDbUpdateDraft(...a),
    dbCreateDrafts: vi.fn(),
    dbClaimBatchForConfirm: (...a: unknown[]) => mockDbClaimBatchForConfirm(...a),
}));

vi.mock("@/lib/supabase/customers", () => ({
    dbCreateCustomer: vi.fn(), dbFindCustomerByName: vi.fn(), dbFindCustomerByCode: vi.fn(), dbUpdateCustomer: vi.fn(),
}));
vi.mock("@/lib/supabase/entity-aliases", () => ({
    dbLookupEntityAlias: vi.fn().mockResolvedValue(null),
    dbSaveEntityAlias: vi.fn(),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct: vi.fn(), dbFindProductBySku: vi.fn(), dbUpdateProduct: vi.fn(),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByOriginalNumber: vi.fn(), dbCreateOrder: vi.fn(),
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

function makeBatch(overrides: Partial<ImportBatchRow> = {}): ImportBatchRow {
    return {
        id: "batch-1", file_name: "f.xlsx", file_size: null, status: "review",
        parse_result: null, confidence: null, created_by: null,
        created_at: "2024-01-01T00:00:00Z", confirmed_at: null, ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetBatch.mockResolvedValue(makeBatch());
    mockDbListDrafts.mockResolvedValue([]);
    mockDbUpdateBatchStatus.mockResolvedValue(makeBatch({ status: "confirmed" }));
});

describe("serviceConfirmBatch — race condition (CAS)", () => {
    it("claim null döndüğünde 'zaten işleniyor' hatası fırlatır", async () => {
        mockDbClaimBatchForConfirm.mockResolvedValue(null);

        await expect(serviceConfirmBatch("batch-1")).rejects.toThrow(/zaten işleniyor/);
    });

    it("claim null döndüğünde drafts hiç okunmaz", async () => {
        mockDbClaimBatchForConfirm.mockResolvedValue(null);

        await expect(serviceConfirmBatch("batch-1")).rejects.toThrow();
        expect(mockDbListDrafts).not.toHaveBeenCalled();
    });

    it("eş zamanlı iki çağrıda: ilk claim alır, ikincisi reddedilir", async () => {
        let claimCallCount = 0;
        mockDbClaimBatchForConfirm.mockImplementation(() => {
            claimCallCount++;
            if (claimCallCount === 1) return Promise.resolve({ id: "batch-1", status: "confirming" });
            return Promise.resolve(null); // ikinci çağrı — yarışı kaybeder
        });

        const [result1, result2] = await Promise.allSettled([
            serviceConfirmBatch("batch-1"),
            serviceConfirmBatch("batch-1"),
        ]);

        // Birisi başarılı, diğeri hata
        const statuses = [result1.status, result2.status];
        expect(statuses).toContain("fulfilled");
        expect(statuses).toContain("rejected");
    });

    it("flow exception fırlarsa batch 'review'e geri çekilir (stuck confirming önlenir)", async () => {
        mockDbClaimBatchForConfirm.mockResolvedValue({ id: "batch-1", status: "confirming" });
        mockDbListDrafts.mockRejectedValue(new Error("DB crash"));

        await expect(serviceConfirmBatch("batch-1")).rejects.toThrow(/DB crash/);
        expect(mockDbUpdateBatchStatus).toHaveBeenCalledWith("batch-1", "review");
    });

    it("başarılı flow'da 'confirmed' status'a geçilir", async () => {
        mockDbClaimBatchForConfirm.mockResolvedValue({ id: "batch-1", status: "confirming" });

        await serviceConfirmBatch("batch-1");

        expect(mockDbUpdateBatchStatus).toHaveBeenCalledWith("batch-1", "confirmed");
    });
});
