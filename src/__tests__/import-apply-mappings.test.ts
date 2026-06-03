/**
 * Tests for POST /api/import/[batchId]/apply-mappings
 * DB functions are mocked — no real Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: import route'larına requirePermission(manage_import) eklendi → allow.
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(new Set(["manage_import"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
}));
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbGetBatch            = vi.fn();
const mockDbDeletePendingDrafts = vi.fn();
const mockDbUpdateBatchStatus   = vi.fn();
const mockDbCreateDrafts        = vi.fn();
const mockDbSaveColumnMappings  = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch:            (...args: unknown[]) => mockDbGetBatch(...args),
    dbDeletePendingDrafts: (...args: unknown[]) => mockDbDeletePendingDrafts(...args),
    dbUpdateBatchStatus:   (...args: unknown[]) => mockDbUpdateBatchStatus(...args),
    dbCreateDrafts:        (...args: unknown[]) => mockDbCreateDrafts(...args),
}));

vi.mock("@/lib/supabase/column-mappings", () => ({
    dbSaveColumnMappings: (...args: unknown[]) => mockDbSaveColumnMappings(...args),
    normalizeColumnName:  (col: string) =>
        col.trim().toLowerCase().replace(/[^a-z0-9]/g, "_"),
}));

import { POST } from "@/app/api/import/[batchId]/apply-mappings/route";

// ── Helpers ───────────────────────────────────────────────────

const BATCH_ID  = "batch-apply-1";
const mockBatch = { id: BATCH_ID, status: "analyzing" };

function makeReq(body: object): NextRequest {
    return new NextRequest(
        `http://localhost/api/import/${BATCH_ID}/apply-mappings`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    );
}

function makeCtx(batchId = BATCH_ID) {
    return { params: Promise.resolve({ batchId }) };
}

function makeDraft(overrides = {}) {
    return { id: "draft-1", batch_id: BATCH_ID, entity_type: "product", status: "pending", confidence: 1.0, ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────

describe("POST /api/import/[batchId]/apply-mappings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(mockBatch);
        mockDbDeletePendingDrafts.mockResolvedValue(undefined);
        mockDbUpdateBatchStatus.mockResolvedValue({ id: BATCH_ID, status: "processing" });
        mockDbCreateDrafts.mockResolvedValue([makeDraft()]);
        mockDbSaveColumnMappings.mockResolvedValue(undefined);
    });

    it("returns 404 when batch not found", async () => {
        mockDbGetBatch.mockResolvedValue(null);
        const res = await POST(makeReq({ sheets: [] }), makeCtx());
        expect(res.status).toBe(404);
    });

    it("returns 400 when sheets array is empty", async () => {
        const res = await POST(makeReq({ sheets: [] }), makeCtx());
        expect(res.status).toBe(400);
    });

    it("happy path: creates drafts and returns 201", async () => {
        const draft1 = makeDraft({ id: "d1" });
        const draft2 = makeDraft({ id: "d2" });
        mockDbCreateDrafts.mockResolvedValue([draft1, draft2]);

        const res = await POST(makeReq({
            sheets: [{
                sheet_name: "Sheet1",
                entity_type: "product",
                mappings: [
                    { source_column: "sku",  target_field: "sku" },
                    { source_column: "name", target_field: "name" },
                ],
                rows: [
                    { sku: "P001", name: "Vana A" },
                    { sku: "P002", name: "Vana B" },
                ],
                remember: false,
            }],
        }), makeCtx());

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.drafts).toHaveLength(2);
    });

    it("deletes pending drafts before creating new ones (deduplication)", async () => {
        await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                mappings: [{ source_column: "sku", target_field: "sku" }],
                rows: [{ sku: "P001" }],
                remember: false,
            }],
        }), makeCtx());

        expect(mockDbDeletePendingDrafts).toHaveBeenCalledWith(BATCH_ID);
        // deletePendingDrafts must be called before createDrafts
        const deleteOrder = mockDbDeletePendingDrafts.mock.invocationCallOrder[0];
        const createOrder = mockDbCreateDrafts.mock.invocationCallOrder[0];
        expect(deleteOrder).toBeLessThan(createOrder);
    });

    it("whitelist filter: unknown target_field is NOT written to parsed_data", async () => {
        await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                mappings: [
                    { source_column: "sku",   target_field: "sku" },
                    { source_column: "evil",  target_field: "evil_injected_field" },  // not in IMPORT_FIELD_SET
                ],
                rows: [{ sku: "P001", evil: "payload" }],
                remember: false,
            }],
        }), makeCtx());

        expect(mockDbCreateDrafts).toHaveBeenCalledOnce();
        const draftInputs: Array<{ parsed_data: Record<string, unknown> }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0].parsed_data).toHaveProperty("sku", "P001");
        expect(draftInputs[0].parsed_data).not.toHaveProperty("evil_injected_field");
    });

    it("skip target_field is excluded from parsed_data", async () => {
        await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                mappings: [
                    { source_column: "sku",  target_field: "sku" },
                    { source_column: "junk", target_field: "skip" },
                ],
                rows: [{ sku: "P001", junk: "xxx" }],
                remember: false,
            }],
        }), makeCtx());

        const draftInputs: Array<{ parsed_data: Record<string, unknown> }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0].parsed_data).toHaveProperty("sku", "P001");
        expect(draftInputs[0].parsed_data).toHaveProperty("__ai_import_operation", "product_update");
        expect(draftInputs[0].parsed_data).not.toHaveProperty("junk");
    });

    it("TR number format: '1.234,56' is parsed as 1234.56 for numeric fields", async () => {
        await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                mappings: [
                    { source_column: "price", target_field: "price" },
                ],
                rows: [{ price: "1.234,56" }],
                remember: false,
            }],
        }), makeCtx());

        const draftInputs: Array<{ parsed_data: Record<string, unknown> }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0].parsed_data.price).toBe(1234.56);
    });

    it("EN number format: '1234.56' is also parsed correctly", async () => {
        await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                mappings: [{ source_column: "price", target_field: "price" }],
                rows: [{ price: "1234.56" }],
                remember: false,
            }],
        }), makeCtx());

        const draftInputs: Array<{ parsed_data: Record<string, unknown> }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0].parsed_data.price).toBe(1234.56);
    });

    it("remember: true → dbSaveColumnMappings is called", async () => {
        await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                mappings: [{ source_column: "sku", target_field: "sku" }],
                rows: [{ sku: "P001" }],
                remember: true,
            }],
        }), makeCtx());

        expect(mockDbSaveColumnMappings).toHaveBeenCalledOnce();
    });

    it("remember: false → dbSaveColumnMappings is NOT called", async () => {
        await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                mappings: [{ source_column: "sku", target_field: "sku" }],
                rows: [{ sku: "P001" }],
                remember: false,
            }],
        }), makeCtx());

        expect(mockDbSaveColumnMappings).not.toHaveBeenCalled();
    });

    it("empty string values are excluded from parsed_data", async () => {
        await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                mappings: [
                    { source_column: "sku",      target_field: "sku" },
                    { source_column: "category", target_field: "category" },
                ],
                rows: [{ sku: "P001", category: "" }],
                remember: false,
            }],
        }), makeCtx());

        const draftInputs: Array<{ parsed_data: Record<string, unknown> }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0].parsed_data).toHaveProperty("sku");
        expect(draftInputs[0].parsed_data).not.toHaveProperty("category");
    });

    it("persists selected operation_type as internal draft metadata", async () => {
        await POST(makeReq({
            operation_type: "stock_count",
            sheets: [{
                sheet_name: "Stok_Sayimi",
                entity_type: "stock",
                mappings: [
                    { source_column: "sku", target_field: "sku" },
                    { source_column: "stok", target_field: "on_hand" },
                ],
                rows: [{ sku: "P001", stok: "12" }],
                remember: false,
            }],
        }), makeCtx());

        const draftInputs: Array<{ entity_type: string; parsed_data: Record<string, unknown> }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0].entity_type).toBe("stock");
        expect(draftInputs[0].parsed_data).toMatchObject({
            sku: "P001",
            on_hand: 12,
            __ai_import_operation: "stock_count",
        });
    });

    it("sheet adı barizse global operation_type yerine stok hareketi infer eder", async () => {
        await POST(makeReq({
            operation_type: "product_update",
            sheets: [{
                sheet_name: "Stok_Hareketleri",
                entity_type: "stock",
                mappings: [
                    { source_column: "sku", target_field: "sku" },
                    { source_column: "miktar", target_field: "on_hand" },
                    { source_column: "yon", target_field: "direction" },
                ],
                rows: [{ sku: "P001", miktar: "5", yon: "out" }],
                remember: false,
            }],
        }), makeCtx());

        const draftInputs: Array<{ parsed_data: Record<string, unknown> }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0].parsed_data.__ai_import_operation).toBe("stock_movement");
    });

    it("draft metadata: sheet, row number, field approvals, risk flags ve row_errors oluşturur", async () => {
        await POST(makeReq({
            operation_type: "product_update",
            sheets: [{
                sheet_name: "Urunler",
                entity_type: "product",
                mappings: [
                    { source_column: "ad", target_field: "name" },
                    { source_column: "fiyat", target_field: "price" },
                ],
                rows: [{ ad: "SKU olmayan ürün", fiyat: "10" }],
                remember: false,
            }],
        }), makeCtx());

        const draftInputs: Array<{
            sheet_name: string;
            row_number: number;
            parsed_data: Record<string, unknown>;
            field_approvals: Record<string, string>;
            risk_flags: string[];
            row_errors: string[];
            match_status: string;
        }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0]).toMatchObject({
            sheet_name: "Urunler",
            row_number: 2,
            match_status: "blocked",
        });
        expect(draftInputs[0].parsed_data.sku).toMatch(/^SKU-OLMA-URUN-/);
        expect(draftInputs[0].field_approvals.price).toBe("skip");
        expect(draftInputs[0].risk_flags).toContain("financial:price");
        expect(draftInputs[0].row_errors.join(" ")).toContain("SKU dosyada yoktu");
    });

    it("vendor entity mappings are whitelisted and keep price/cost out", async () => {
        await POST(makeReq({
            operation_type: "vendor_upsert",
            sheets: [{
                sheet_name: "Tedarikciler",
                entity_type: "vendor",
                mappings: [
                    { source_column: "name", target_field: "name" },
                    { source_column: "email", target_field: "contact_email" },
                    { source_column: "price", target_field: "price" },
                ],
                rows: [{ name: "Acme Makine", email: "satis@acme.com", price: "999" }],
                remember: false,
            }],
        }), makeCtx());

        const draftInputs: Array<{ entity_type: string; parsed_data: Record<string, unknown> }> = mockDbCreateDrafts.mock.calls[0][0];
        expect(draftInputs[0].entity_type).toBe("vendor");
        expect(draftInputs[0].parsed_data).toMatchObject({
            name: "Acme Makine",
            contact_email: "satis@acme.com",
            __ai_import_operation: "vendor_upsert",
        });
        expect(draftInputs[0].parsed_data).not.toHaveProperty("price");
        expect(draftInputs[0].parsed_data).not.toHaveProperty("cost_price");
    });

    it("planned operation_type is rejected", async () => {
        const res = await POST(makeReq({
            operation_type: "product_type_template",
            sheets: [{
                sheet_name: "S1",
                entity_type: "product",
                mappings: [{ source_column: "sku", target_field: "sku" }],
                rows: [{ sku: "P001" }],
                remember: false,
            }],
        }), makeCtx());

        expect(res.status).toBe(400);
        expect(mockDbDeletePendingDrafts).not.toHaveBeenCalled();
        expect(mockDbCreateDrafts).not.toHaveBeenCalled();
    });

    it("invalid entity_type is rejected before creating drafts", async () => {
        const res = await POST(makeReq({
            sheets: [{
                sheet_name: "Bad",
                entity_type: "unknown",
                mappings: [{ source_column: "name", target_field: "name" }],
                rows: [{ name: "X" }],
                remember: false,
            }],
        }), makeCtx());

        expect(res.status).toBe(400);
        expect(mockDbCreateDrafts).not.toHaveBeenCalled();
    });
});
