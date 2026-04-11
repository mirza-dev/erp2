/**
 * Tests for GET / DELETE / PATCH /api/import/[batchId]
 * DB functions are mocked — no real Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbGetBatch          = vi.fn();
const mockDbDeleteBatch       = vi.fn();
const mockDbUpdateBatchStatus = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch:          (...args: unknown[]) => mockDbGetBatch(...args),
    dbDeleteBatch:       (...args: unknown[]) => mockDbDeleteBatch(...args),
    dbUpdateBatchStatus: (...args: unknown[]) => mockDbUpdateBatchStatus(...args),
}));

import { GET, DELETE, PATCH } from "@/app/api/import/[batchId]/route";

// ── Helpers ───────────────────────────────────────────────────

const BATCH_ID  = "batch-main-1";
const mockBatch = { id: BATCH_ID, status: "analyzing", created_at: "2026-04-11T00:00:00Z" };

function makeGetReq(): NextRequest {
    return new NextRequest(`http://localhost/api/import/${BATCH_ID}`, { method: "GET" });
}

function makeDeleteReq(): NextRequest {
    return new NextRequest(`http://localhost/api/import/${BATCH_ID}`, { method: "DELETE" });
}

function makePatchReq(body: object): NextRequest {
    return new NextRequest(`http://localhost/api/import/${BATCH_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function makeCtx(batchId = BATCH_ID) {
    return { params: Promise.resolve({ batchId }) };
}

// ── Tests ─────────────────────────────────────────────────────

describe("GET /api/import/[batchId]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbGetBatch.mockResolvedValue(mockBatch);
    });

    it("returns batch when found", async () => {
        const res = await GET(makeGetReq(), makeCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe(BATCH_ID);
    });

    it("returns 404 when batch not found", async () => {
        mockDbGetBatch.mockResolvedValue(null);
        const res = await GET(makeGetReq(), makeCtx());
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/import/[batchId]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbDeleteBatch.mockResolvedValue(undefined);
    });

    it("returns 204 on success", async () => {
        const res = await DELETE(makeDeleteReq(), makeCtx());
        expect(res.status).toBe(204);
        expect(mockDbDeleteBatch).toHaveBeenCalledWith(BATCH_ID);
    });

    it("returns 500 when dbDeleteBatch throws", async () => {
        mockDbDeleteBatch.mockRejectedValue(new Error("DB error"));
        const res = await DELETE(makeDeleteReq(), makeCtx());
        expect(res.status).toBe(500);
    });
});

describe("PATCH /api/import/[batchId]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbUpdateBatchStatus.mockResolvedValue({ ...mockBatch, status: "review" });
    });

    it("updates status and returns updated batch", async () => {
        const res = await PATCH(makePatchReq({ status: "review" }), makeCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("review");
        expect(mockDbUpdateBatchStatus).toHaveBeenCalledWith(BATCH_ID, "review");
    });

    it("returns 400 when status is missing from body", async () => {
        const res = await PATCH(makePatchReq({}), makeCtx());
        expect(res.status).toBe(400);
    });
});
