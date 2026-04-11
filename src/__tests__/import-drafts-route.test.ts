/**
 * Tests for GET / POST /api/import/[batchId]/drafts
 * DB and service functions are mocked — no real Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListDrafts          = vi.fn();
const mockServiceAddDraftsToBatch = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbListDrafts: (...args: unknown[]) => mockDbListDrafts(...args),
}));

vi.mock("@/lib/services/import-service", () => ({
    serviceAddDraftsToBatch: (...args: unknown[]) => mockServiceAddDraftsToBatch(...args),
}));

import { GET, POST } from "@/app/api/import/[batchId]/drafts/route";

// ── Helpers ───────────────────────────────────────────────────

const BATCH_ID = "batch-drafts-1";

function makeGetReq(): NextRequest {
    return new NextRequest(`http://localhost/api/import/${BATCH_ID}/drafts`, { method: "GET" });
}

function makePostReq(body: object | object[]): NextRequest {
    return new NextRequest(`http://localhost/api/import/${BATCH_ID}/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function makeCtx(batchId = BATCH_ID) {
    return { params: Promise.resolve({ batchId }) };
}

function makeDraft(id: string) {
    return {
        id,
        batch_id: BATCH_ID,
        entity_type: "product",
        status: "pending",
        confidence: 0.9,
        parsed_data: { sku: "P001", name: "Vana" },
        raw_data: { SKU: "P001", "Ürün Adı": "Vana" },
    };
}

// ── Tests ─────────────────────────────────────────────────────

describe("GET /api/import/[batchId]/drafts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbListDrafts.mockResolvedValue([makeDraft("d1"), makeDraft("d2")]);
    });

    it("returns list of drafts with 200", async () => {
        const res = await GET(makeGetReq(), makeCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(2);
        expect(body[0].id).toBe("d1");
    });

    it("calls dbListDrafts with the correct batchId", async () => {
        await GET(makeGetReq(), makeCtx());
        expect(mockDbListDrafts).toHaveBeenCalledWith(BATCH_ID);
    });

    it("returns empty array when no drafts exist", async () => {
        mockDbListDrafts.mockResolvedValue([]);
        const res = await GET(makeGetReq(), makeCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual([]);
    });
});

describe("POST /api/import/[batchId]/drafts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceAddDraftsToBatch.mockResolvedValue([makeDraft("d-new")]);
    });

    it("creates a single draft from object body and returns 201", async () => {
        const draft = { entity_type: "product", parsed_data: { sku: "P001" } };
        const res = await POST(makePostReq(draft), makeCtx());
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body).toHaveLength(1);
    });

    it("creates multiple drafts from array body and returns 201", async () => {
        const drafts = [
            { entity_type: "product", parsed_data: { sku: "P001" } },
            { entity_type: "product", parsed_data: { sku: "P002" } },
        ];
        mockServiceAddDraftsToBatch.mockResolvedValue([makeDraft("d1"), makeDraft("d2")]);
        const res = await POST(makePostReq(drafts), makeCtx());
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body).toHaveLength(2);
    });

    it("calls serviceAddDraftsToBatch with correct batchId and normalized array", async () => {
        const draft = { entity_type: "customer", parsed_data: { name: "ACME" } };
        await POST(makePostReq(draft), makeCtx());
        expect(mockServiceAddDraftsToBatch).toHaveBeenCalledWith(
            BATCH_ID,
            [draft]
        );
    });

    it("returns 400 when empty array is posted", async () => {
        const res = await POST(makePostReq([]), makeCtx());
        expect(res.status).toBe(400);
    });
});
