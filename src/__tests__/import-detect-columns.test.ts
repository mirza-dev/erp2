/**
 * Tests for POST /api/import/[batchId]/detect-columns
 * DB and AI functions are mocked — no real Supabase or Anthropic calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbGetBatch             = vi.fn();
const mockDbLookupColumnMappings = vi.fn();
const mockAiDetectColumns        = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch: (...args: unknown[]) => mockDbGetBatch(...args),
}));

vi.mock("@/lib/supabase/column-mappings", () => ({
    dbLookupColumnMappings: (...args: unknown[]) => mockDbLookupColumnMappings(...args),
    // Simplified normalization for tests (ASCII-only headers)
    normalizeColumnName: (col: string) =>
        col.trim().toLowerCase().replace(/[^a-z0-9]/g, "_"),
}));

vi.mock("@/lib/services/ai-service", () => ({
    aiDetectColumns: (...args: unknown[]) => mockAiDetectColumns(...args),
    FALLBACK_FIELD_MAP: {
        product: { sku: "sku", name: "name", price: "price" },
        customer: { name: "name", email: "email" },
        order: { customer_name: "customer_name" },
    },
}));

import { POST } from "@/app/api/import/[batchId]/detect-columns/route";

// ── Helpers ───────────────────────────────────────────────────

const BATCH_ID  = "batch-detect-1";
const mockBatch = { id: BATCH_ID, status: "analyzing" };

function makeReq(body: object): NextRequest {
    return new NextRequest(
        `http://localhost/api/import/${BATCH_ID}/detect-columns`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    );
}

function makeCtx(batchId = BATCH_ID) {
    return { params: Promise.resolve({ batchId }) };
}

function emptyMemory(): Map<string, never> {
    return new Map();
}

// ── Tests ─────────────────────────────────────────────────────

describe("POST /api/import/[batchId]/detect-columns", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(mockBatch);
        mockDbLookupColumnMappings.mockResolvedValue(emptyMemory());
        mockAiDetectColumns.mockResolvedValue({ usedAI: true, mappings: [] });
    });

    it("returns 404 when batch not found", async () => {
        mockDbGetBatch.mockResolvedValue(null);
        const res = await POST(makeReq({ sheets: [{ sheet_name: "S1", entity_type: "product", headers: ["sku"], sample_rows: [] }] }), makeCtx());
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBeTruthy();
    });

    it("returns 400 when sheets array is empty", async () => {
        const res = await POST(makeReq({ sheets: [] }), makeCtx());
        expect(res.status).toBe(400);
    });

    it("memory hit → source: memory, confidence = success/usage ratio", async () => {
        mockDbLookupColumnMappings.mockResolvedValue(
            new Map([["sku", { source_column: "sku", target_field: "sku", usage_count: 10, success_count: 8 }]])
        );
        const res = await POST(makeReq({ sheets: [{ sheet_name: "S1", entity_type: "product", headers: ["sku"], sample_rows: [] }] }), makeCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        const m = body.sheets[0].mappings[0];
        expect(m.source).toBe("memory");
        expect(m.target_field).toBe("sku");
        expect(m.confidence).toBeCloseTo(0.8);
    });

    it("memory hit with success_count=0 → confidence floor 0.4", async () => {
        mockDbLookupColumnMappings.mockResolvedValue(
            new Map([["sku", { source_column: "sku", target_field: "sku", usage_count: 5, success_count: 0 }]])
        );
        const res = await POST(makeReq({ sheets: [{ sheet_name: "S1", entity_type: "product", headers: ["sku"], sample_rows: [] }] }), makeCtx());
        const body = await res.json();
        expect(body.sheets[0].mappings[0].confidence).toBe(0.4);
        expect(body.sheets[0].mappings[0].source).toBe("memory");
    });

    it("FALLBACK_FIELD_MAP hit → source: fallback, confidence 0.8", async () => {
        // "sku" normalizes to "sku" → hits FALLBACK_FIELD_MAP.product.sku
        const res = await POST(makeReq({ sheets: [{ sheet_name: "S1", entity_type: "product", headers: ["sku"], sample_rows: [] }] }), makeCtx());
        const body = await res.json();
        const m = body.sheets[0].mappings[0];
        expect(m.source).toBe("fallback");
        expect(m.confidence).toBe(0.8);
        expect(m.target_field).toBe("sku");
        // AI should NOT have been called since fallback resolved the header
        expect(mockAiDetectColumns).not.toHaveBeenCalled();
    });

    it("unknown header → calls AI, returns source: ai when usedAI=true", async () => {
        mockAiDetectColumns.mockResolvedValue({
            usedAI: true,
            mappings: [{ source_column: "bizarre_col", target_field: "notes", confidence: 0.72 }],
        });
        const res = await POST(makeReq({ sheets: [{ sheet_name: "S1", entity_type: "product", headers: ["bizarre_col"], sample_rows: [] }] }), makeCtx());
        const body = await res.json();
        const m = body.sheets[0].mappings[0];
        expect(m.source).toBe("ai");
        expect(m.target_field).toBe("notes");
        expect(mockAiDetectColumns).toHaveBeenCalledOnce();
    });

    it("unknown header → source: fallback when usedAI=false (AI threw internally)", async () => {
        mockAiDetectColumns.mockResolvedValue({
            usedAI: false,
            mappings: [{ source_column: "bizarre_col", target_field: null, confidence: 0 }],
        });
        const res = await POST(makeReq({ sheets: [{ sheet_name: "S1", entity_type: "product", headers: ["bizarre_col"], sample_rows: [] }] }), makeCtx());
        const body = await res.json();
        expect(body.sheets[0].mappings[0].source).toBe("fallback");
    });

    it("preserves original header order with mixed resolution (memory + fallback + ai)", async () => {
        // "mem_col" → memory hit
        // "sku"     → fallback hit (FALLBACK_FIELD_MAP.product.sku)
        // "unknown" → AI
        mockDbLookupColumnMappings.mockResolvedValue(
            new Map([["mem_col", { source_column: "mem_col", target_field: "product_notes", usage_count: 3, success_count: 3 }]])
        );
        mockAiDetectColumns.mockResolvedValue({
            usedAI: true,
            mappings: [{ source_column: "unknown", target_field: "category", confidence: 0.65 }],
        });
        const res = await POST(makeReq({
            sheets: [{ sheet_name: "S1", entity_type: "product", headers: ["mem_col", "sku", "unknown"], sample_rows: [] }],
        }), makeCtx());
        const body = await res.json();
        const mappings = body.sheets[0].mappings;
        expect(mappings).toHaveLength(3);
        expect(mappings[0].source_column).toBe("mem_col");
        expect(mappings[0].source).toBe("memory");
        expect(mappings[1].source_column).toBe("sku");
        expect(mappings[1].source).toBe("fallback");
        expect(mappings[2].source_column).toBe("unknown");
        expect(mappings[2].source).toBe("ai");
    });

    it("AI is called only for truly unknown headers (memory+fallback resolved the rest)", async () => {
        mockDbLookupColumnMappings.mockResolvedValue(
            new Map([["name", { source_column: "name", target_field: "name", usage_count: 1, success_count: 1 }]])
        );
        mockAiDetectColumns.mockResolvedValue({
            usedAI: true,
            mappings: [{ source_column: "mystery", target_field: null, confidence: 0 }],
        });
        const res = await POST(makeReq({
            sheets: [{
                sheet_name: "S1", entity_type: "product",
                headers: ["name", "sku", "mystery"],   // name=memory, sku=fallback, mystery=AI
                sample_rows: [],
            }],
        }), makeCtx());
        expect(res.status).toBe(200);
        // AI should only be called with the 1 truly unknown header
        const aiCallHeaders = mockAiDetectColumns.mock.calls[0][0].headers;
        expect(aiCallHeaders).toEqual(["mystery"]);
    });
});
