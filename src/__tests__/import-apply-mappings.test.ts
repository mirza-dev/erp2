/**
 * Tests for POST /api/import/[batchId]/apply-mappings
 * DB functions are mocked — no real Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
        expect(Object.keys(draftInputs[0].parsed_data)).toEqual(["sku"]);
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
});
