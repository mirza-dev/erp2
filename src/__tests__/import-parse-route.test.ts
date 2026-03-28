/**
 * Tests for POST /api/import/[batchId]/parse route handler.
 * DB (import) and AI service are fully mocked.
 * Follows the ai-purchase-copilot-route.test.ts pattern.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── DB import mock ───────────────────────────────────────────────────────────

const mockDbGetBatch = vi.fn();
const mockDbUpdateBatchStatus = vi.fn();
const mockDbCreateDrafts = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch: (...args: unknown[]) => mockDbGetBatch(...args),
    dbUpdateBatchStatus: (...args: unknown[]) => mockDbUpdateBatchStatus(...args),
    dbCreateDrafts: (...args: unknown[]) => mockDbCreateDrafts(...args),
}));

// ─── AI service mock ──────────────────────────────────────────────────────────

const mockAiBatchParse = vi.fn();
const mockIsAIAvailable = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    aiBatchParse: (...args: unknown[]) => mockAiBatchParse(...args),
    isAIAvailable: () => mockIsAIAvailable(),
}));

import { POST } from "@/app/api/import/[batchId]/parse/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BATCH_ID = "batch-test-1";

function makeRequest(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/import/${BATCH_ID}/parse`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

function makeParams(batchId = BATCH_ID): { params: Promise<{ batchId: string }> } {
    return { params: Promise.resolve({ batchId }) };
}

function makeDraft(overrides: Record<string, unknown> = {}) {
    return {
        id: `draft-${Math.random().toString(36).slice(2)}`,
        batch_id: BATCH_ID,
        entity_type: "customer",
        raw_data: {},
        parsed_data: { name: "Test" },
        confidence: 0.85,
        ai_reason: "Mapped successfully",
        unmatched_fields: [],
        status: "pending",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

function makeBatchParseResult(
    count: number,
    entityType = "customer",
) {
    return {
        items: Array.from({ length: count }, (_, i) => ({
            parsed_data: { name: `Entity ${i + 1}` },
            confidence: 0.85,
            ai_reason: "Mapped successfully",
            unmatched_fields: [],
            entity_type: entityType,
        })),
    };
}

// ─── Reset all mocks before every test ───────────────────────────────────────

beforeEach(() => {
    mockDbGetBatch.mockReset();
    mockDbUpdateBatchStatus.mockReset();
    mockDbCreateDrafts.mockReset();
    mockAiBatchParse.mockReset();
    mockIsAIAvailable.mockReset();

    // Sensible defaults
    mockDbUpdateBatchStatus.mockResolvedValue({ id: BATCH_ID, status: "review" });
    mockIsAIAvailable.mockReturnValue(true);
});

// ─── Batch not found ──────────────────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — batch not found", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue(null);
    });

    it("returns HTTP 404", async () => {
        const res = await POST(makeRequest({ sheets: [{ sheet_name: "Sheet1", entity_type: "customer", rows: [{ a: "1" }] }] }), makeParams());
        expect(res.status).toBe(404);
    });

    it("response has error: 'Batch bulunamadı.'", async () => {
        const res = await POST(makeRequest({ sheets: [{ sheet_name: "Sheet1", entity_type: "customer", rows: [{ a: "1" }] }] }), makeParams());
        const body = await res.json();
        expect(body.error).toBe("Batch bulunamadı.");
    });
});

// ─── Empty sheets validation ──────────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — empty sheets", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue({ id: BATCH_ID, status: "pending" });
    });

    it("returns HTTP 400 when sheets is empty array", async () => {
        const res = await POST(makeRequest({ sheets: [] }), makeParams());
        expect(res.status).toBe(400);
    });

    it("response has error: 'En az bir sheet gerekli.'", async () => {
        const res = await POST(makeRequest({ sheets: [] }), makeParams());
        const body = await res.json();
        expect(body.error).toBe("En az bir sheet gerekli.");
    });

    it("returns HTTP 400 when sheets field is missing", async () => {
        const res = await POST(makeRequest({}), makeParams());
        expect(res.status).toBe(400);
    });
});

// ─── Happy path — AI available ────────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — happy path (AI available)", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue({ id: BATCH_ID, status: "pending" });
        mockIsAIAvailable.mockReturnValue(true);
        mockAiBatchParse.mockResolvedValue(makeBatchParseResult(2));
        mockDbCreateDrafts.mockResolvedValue([makeDraft(), makeDraft()]);
    });

    it("returns HTTP 201", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }, { firma_adi: "B" }] }],
        }), makeParams());
        expect(res.status).toBe(201);
    });

    it("ai_available: true", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const body = await res.json();
        expect(body.ai_available).toBe(true);
    });

    it("drafts array is present", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const body = await res.json();
        expect(Array.isArray(body.drafts)).toBe(true);
    });
});

// ─── Happy path — AI unavailable ─────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — happy path (AI unavailable)", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue({ id: BATCH_ID, status: "pending" });
        mockIsAIAvailable.mockReturnValue(false);
        mockAiBatchParse.mockResolvedValue(makeBatchParseResult(1));
        mockDbCreateDrafts.mockResolvedValue([makeDraft()]);
    });

    it("returns HTTP 201", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        expect(res.status).toBe(201);
    });

    it("ai_available: false", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const body = await res.json();
        expect(body.ai_available).toBe(false);
    });

    it("drafts are still created even when AI unavailable", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const body = await res.json();
        expect(body.drafts).toHaveLength(1);
    });
});

// ─── Response shape contract ──────────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — response shape contract", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue({ id: BATCH_ID, status: "pending" });
        mockIsAIAvailable.mockReturnValue(true);
        mockAiBatchParse.mockResolvedValue(makeBatchParseResult(1));
        mockDbCreateDrafts.mockResolvedValue([makeDraft()]);
    });

    it("top-level keys are exactly ['ai_available', 'drafts']", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const body = await res.json();
        expect(Object.keys(body).sort()).toEqual(["ai_available", "drafts"]);
    });

    it("ai_available is boolean", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const body = await res.json();
        expect(typeof body.ai_available).toBe("boolean");
    });
});

// ─── Batch status transitions ─────────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — batch status transitions", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue({ id: BATCH_ID, status: "pending" });
        mockIsAIAvailable.mockReturnValue(true);
        mockAiBatchParse.mockResolvedValue(makeBatchParseResult(1));
        mockDbCreateDrafts.mockResolvedValue([makeDraft()]);
    });

    it("sets batch status to 'processing' before parsing", async () => {
        await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const calls = mockDbUpdateBatchStatus.mock.calls;
        const processingCall = calls.find((c: unknown[]) => c[1] === "processing");
        expect(processingCall).toBeDefined();
    });

    it("sets batch status to 'review' after parsing", async () => {
        await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const calls = mockDbUpdateBatchStatus.mock.calls;
        const reviewCall = calls.find((c: unknown[]) => c[1] === "review");
        expect(reviewCall).toBeDefined();
    });

    it("'processing' transition happens before 'review'", async () => {
        await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const calls = mockDbUpdateBatchStatus.mock.calls;
        const processingIdx = calls.findIndex((c: unknown[]) => c[1] === "processing");
        const reviewIdx = calls.findIndex((c: unknown[]) => c[1] === "review");
        expect(processingIdx).toBeLessThan(reviewIdx);
    });
});

// ─── Multi-sheet ──────────────────────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — multi-sheet", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue({ id: BATCH_ID, status: "pending" });
        mockIsAIAvailable.mockReturnValue(true);
        // Each sheet call returns 2 items → 4 total
        mockAiBatchParse.mockResolvedValue(makeBatchParseResult(2));
        // Each dbCreateDrafts call returns 2 drafts
        mockDbCreateDrafts.mockResolvedValue([makeDraft(), makeDraft()]);
    });

    it("returns combined drafts from all sheets (2 sheets × 2 rows = 4 drafts)", async () => {
        const res = await POST(makeRequest({
            sheets: [
                { sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }, { firma_adi: "B" }] },
                { sheet_name: "Products", entity_type: "product", rows: [{ urun_kodu: "X" }, { urun_kodu: "Y" }] },
            ],
        }), makeParams());
        const body = await res.json();
        expect(body.drafts).toHaveLength(4);
    });

    it("aiBatchParse is called once per sheet", async () => {
        await POST(makeRequest({
            sheets: [
                { sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] },
                { sheet_name: "Products", entity_type: "product", rows: [{ urun_kodu: "X" }] },
            ],
        }), makeParams());
        expect(mockAiBatchParse).toHaveBeenCalledTimes(2);
    });
});

// ─── DB error ─────────────────────────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — DB error", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue({ id: BATCH_ID, status: "pending" });
        mockIsAIAvailable.mockReturnValue(true);
        mockAiBatchParse.mockResolvedValue(makeBatchParseResult(1));
    });

    it("returns HTTP 500 when dbCreateDrafts rejects", async () => {
        mockDbCreateDrafts.mockRejectedValue(new Error("DB write failed"));
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        expect(res.status).toBe(500);
    });

    it("response has error field when dbCreateDrafts rejects", async () => {
        mockDbCreateDrafts.mockRejectedValue(new Error("DB write failed"));
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Customers", entity_type: "customer", rows: [{ firma_adi: "A" }] }],
        }), makeParams());
        const body = await res.json();
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
    });
});

// ─── Empty rows skip ──────────────────────────────────────────────────────────

describe("POST /api/import/[batchId]/parse — empty rows skip", () => {
    beforeEach(() => {
        mockDbGetBatch.mockResolvedValue({ id: BATCH_ID, status: "pending" });
        mockIsAIAvailable.mockReturnValue(true);
        mockDbCreateDrafts.mockResolvedValue([]);
    });

    it("skips sheets with empty rows array without error", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Empty", entity_type: "customer", rows: [] }],
        }), makeParams());
        expect(res.status).toBe(201);
    });

    it("aiBatchParse is not called for empty-rows sheet", async () => {
        await POST(makeRequest({
            sheets: [{ sheet_name: "Empty", entity_type: "customer", rows: [] }],
        }), makeParams());
        expect(mockAiBatchParse).not.toHaveBeenCalled();
    });

    it("returns empty drafts array for sheets with no rows", async () => {
        const res = await POST(makeRequest({
            sheets: [{ sheet_name: "Empty", entity_type: "customer", rows: [] }],
        }), makeParams());
        const body = await res.json();
        expect(body.drafts).toEqual([]);
    });
});
