/**
 * Faz 3b — import-document-lines helper behavior tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => {
            const chain: Record<string, unknown> = {};
            chain.insert = (rows: unknown[]) => {
                mockInsert(rows);
                return { select: () => ({ order: () => mockSelect() }) };
            };
            chain.select = () => ({
                eq: (col: string, v: unknown) => {
                    mockEq(col, v);
                    return {
                        order: () => mockOrder(),
                        maybeSingle: () => mockMaybeSingle(),
                    };
                },
            });
            chain.update = (patch: unknown) => {
                mockUpdate(patch);
                return { eq: () => ({ select: () => ({ single: () => mockSingle() }) }) };
            };
            chain.delete = () => {
                mockDelete();
                return { eq: () => Promise.resolve({ error: null }) };
            };
            return chain;
        },
    }),
}));

import {
    dbCreateExtractedLines,
    dbListLinesByDocument,
    dbGetLine,
    dbUpdateLineMatch,
    dbReplaceLinesForDocument,
    isValidMatchAction,
} from "@/lib/supabase/import-document-lines";

beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockOrder.mockReset();
    mockEq.mockReset();
    mockMaybeSingle.mockReset();
    mockSingle.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
});

describe("isValidMatchAction", () => {
    it("accepts all 5 valid actions", () => {
        for (const a of ["pending", "matched", "new_product", "skipped", "reviewed"]) {
            expect(isValidMatchAction(a)).toBe(true);
        }
    });
    it("rejects invalid string", () => {
        expect(isValidMatchAction("foo")).toBe(false);
    });
    it("rejects non-string", () => {
        expect(isValidMatchAction(undefined)).toBe(false);
        expect(isValidMatchAction(42)).toBe(false);
    });
});

describe("dbCreateExtractedLines", () => {
    it("empty array → returns [] without DB call", async () => {
        const r = await dbCreateExtractedLines("doc-1", []);
        expect(r).toEqual([]);
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it("inserts rows with defaults applied", async () => {
        mockSelect.mockResolvedValueOnce({ data: [{ id: "l-1" }], error: null });
        await dbCreateExtractedLines("doc-1", [
            { line_number: 1, extraction_type: "product" },
        ]);
        const rows = mockInsert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
        expect(rows[0].document_id).toBe("doc-1");
        expect(rows[0].extracted_attributes).toEqual({});
        expect(rows[0].extraction_evidence).toEqual({});
        expect(rows[0].candidate_matches).toEqual([]);
        expect(rows[0].match_action).toBe("pending");
    });

    it("DB error → throws with message", async () => {
        mockSelect.mockResolvedValueOnce({ data: null, error: { message: "duplicate key" } });
        await expect(dbCreateExtractedLines("doc-1", [{ line_number: 1, extraction_type: "product" }]))
            .rejects.toThrow(/duplicate key/);
    });
});

describe("dbListLinesByDocument", () => {
    it("returns rows when present", async () => {
        mockOrder.mockResolvedValueOnce({ data: [{ id: "l-1", line_number: 1 }], error: null });
        const r = await dbListLinesByDocument("doc-1");
        expect(r.length).toBe(1);
        expect(mockEq).toHaveBeenCalledWith("document_id", "doc-1");
    });

    it("empty data → []", async () => {
        mockOrder.mockResolvedValueOnce({ data: null, error: null });
        expect(await dbListLinesByDocument("doc-1")).toEqual([]);
    });

    it("DB error → throws", async () => {
        mockOrder.mockResolvedValueOnce({ data: null, error: { message: "fail" } });
        await expect(dbListLinesByDocument("doc-1")).rejects.toThrow(/fail/);
    });
});

describe("dbGetLine", () => {
    it("returns row when found", async () => {
        mockMaybeSingle.mockResolvedValueOnce({ data: { id: "l-1" }, error: null });
        const r = await dbGetLine("l-1");
        expect(r?.id).toBe("l-1");
    });

    it("null data → null", async () => {
        mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
        expect(await dbGetLine("l-1")).toBeNull();
    });
});

describe("dbUpdateLineMatch", () => {
    it("invalid action → throws before DB call", async () => {
        await expect(dbUpdateLineMatch("l-1", { match_action: "garbage" as never }))
            .rejects.toThrow(/Geçersiz/);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("pending action → reviewed_at NULL", async () => {
        mockSingle.mockResolvedValueOnce({ data: { id: "l-1", match_action: "pending" }, error: null });
        await dbUpdateLineMatch("l-1", { match_action: "pending" });
        const patch = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(patch.reviewed_at).toBeNull();
    });

    it("non-pending action → reviewed_at set (ISO string)", async () => {
        mockSingle.mockResolvedValueOnce({ data: { id: "l-1", match_action: "matched" }, error: null });
        await dbUpdateLineMatch("l-1", { match_action: "matched", matched_product_id: "p-1" });
        const patch = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(typeof patch.reviewed_at).toBe("string");
        expect(patch.matched_product_id).toBe("p-1");
    });

    // Review 3b 3.tur: product_type_id pass-through (multi-type override)
    it("product_type_id undefined → patch'e yazılmaz (mevcut korunur)", async () => {
        mockSingle.mockResolvedValueOnce({ data: { id: "l-1" }, error: null });
        await dbUpdateLineMatch("l-1", { match_action: "pending" });
        const patch = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(Object.prototype.hasOwnProperty.call(patch, "product_type_id")).toBe(false);
    });

    it("product_type_id string → patch'e yazılır", async () => {
        mockSingle.mockResolvedValueOnce({ data: { id: "l-1" }, error: null });
        await dbUpdateLineMatch("l-1", { match_action: "pending", product_type_id: "type-x" });
        const patch = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(patch.product_type_id).toBe("type-x");
    });

    it("product_type_id null → patch'e null yazılır (explicit clear)", async () => {
        mockSingle.mockResolvedValueOnce({ data: { id: "l-1" }, error: null });
        await dbUpdateLineMatch("l-1", { match_action: "pending", product_type_id: null });
        const patch = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(patch.product_type_id).toBeNull();
    });

    it("extracted_attributes + extraction_evidence patch'e yazılır", async () => {
        mockSingle.mockResolvedValueOnce({ data: { id: "l-1" }, error: null });
        await dbUpdateLineMatch("l-1", {
            match_action: "pending",
            extracted_attributes: { dn: 50 },
            extraction_evidence: { dn: { confidence: "high", evidence_text: "DN50" } },
        });
        const patch = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(patch.extracted_attributes).toEqual({ dn: 50 });
        expect(patch.extraction_evidence).toEqual({ dn: { confidence: "high", evidence_text: "DN50" } });
    });
});

describe("dbReplaceLinesForDocument", () => {
    it("DELETE then INSERT", async () => {
        mockSelect.mockResolvedValueOnce({ data: [{ id: "l-new" }], error: null });
        await dbReplaceLinesForDocument("doc-1", [
            { line_number: 1, extraction_type: "product" },
        ]);
        expect(mockDelete).toHaveBeenCalledTimes(1);
        expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it("empty replace → DELETE only", async () => {
        await dbReplaceLinesForDocument("doc-1", []);
        expect(mockDelete).toHaveBeenCalledTimes(1);
        expect(mockInsert).not.toHaveBeenCalled();
    });
});
