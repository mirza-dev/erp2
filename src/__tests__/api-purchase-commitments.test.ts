/**
 * Tests for /api/purchase-commitments and /api/purchase-commitments/[id] route handlers.
 * DB functions are mocked — no real Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListCommitments    = vi.fn();
const mockDbCreateCommitment   = vi.fn();
const mockDbGetCommitment      = vi.fn();
const mockDbReceiveCommitment  = vi.fn();
const mockDbCancelCommitment   = vi.fn();

// CommitmentConflictError must be the same class reference the route imports
const { CommitmentConflictError } = vi.hoisted(() => {
    class CommitmentConflictError extends Error {
        constructor(id: string) {
            super(`Commitment bulunamadı veya pending değil: ${id}`);
            this.name = "CommitmentConflictError";
        }
    }
    return { CommitmentConflictError };
});

vi.mock("@/lib/supabase/purchase-commitments", () => ({
    CommitmentConflictError,
    dbListCommitments:   (...args: unknown[]) => mockDbListCommitments(...args),
    dbCreateCommitment:  (...args: unknown[]) => mockDbCreateCommitment(...args),
    dbGetCommitment:     (...args: unknown[]) => mockDbGetCommitment(...args),
    dbReceiveCommitment: (...args: unknown[]) => mockDbReceiveCommitment(...args),
    dbCancelCommitment:  (...args: unknown[]) => mockDbCancelCommitment(...args),
}));

import { GET as listGET, POST } from "@/app/api/purchase-commitments/route";
import { GET as detailGET, PATCH } from "@/app/api/purchase-commitments/[id]/route";

// ── Helpers ───────────────────────────────────────────────────

function makeListRequest(query = ""): NextRequest {
    return new NextRequest(`http://localhost/api/purchase-commitments${query ? `?${query}` : ""}`, { method: "GET" });
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://localhost/api/purchase-commitments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

async function makeDetailGetRequest(id: string): Promise<[NextRequest, { params: Promise<{ id: string }> }]> {
    return [
        new NextRequest(`http://localhost/api/purchase-commitments/${id}`, { method: "GET" }),
        { params: Promise.resolve({ id }) },
    ];
}

async function makePatchRequest(id: string, body: Record<string, unknown>): Promise<[NextRequest, { params: Promise<{ id: string }> }]> {
    return [
        new NextRequest(`http://localhost/api/purchase-commitments/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) },
    ];
}

function makeRow(overrides: Record<string, unknown> = {}) {
    return {
        id:            "commit-1",
        product_id:    "prod-1",
        quantity:      40,
        expected_date: "2025-04-25",
        supplier_name: "ABC Tedarikçi",
        notes:         null,
        status:        "pending",
        created_at:    "2026-01-01T00:00:00Z",
        received_at:   null,
        ...overrides,
    };
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListCommitments.mockResolvedValue([]);
    mockDbCreateCommitment.mockResolvedValue(makeRow());
    mockDbGetCommitment.mockResolvedValue(makeRow());
    mockDbReceiveCommitment.mockResolvedValue(undefined);
    mockDbCancelCommitment.mockResolvedValue(undefined);
});

// ── GET /api/purchase-commitments ────────────────────────────

describe("GET /api/purchase-commitments", () => {
    it("returns empty array when no commitments", async () => {
        const res = await listGET(makeListRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([]);
    });

    it("returns commitments array", async () => {
        mockDbListCommitments.mockResolvedValue([makeRow(), makeRow({ id: "commit-2" })]);
        const res = await listGET(makeListRequest());
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveLength(2);
    });

    it("forwards product_id filter", async () => {
        await listGET(makeListRequest("product_id=prod-1"));
        expect(mockDbListCommitments).toHaveBeenCalledWith(
            expect.objectContaining({ product_id: "prod-1" })
        );
    });

    it("forwards status filter", async () => {
        await listGET(makeListRequest("status=received"));
        expect(mockDbListCommitments).toHaveBeenCalledWith(
            expect.objectContaining({ status: "received" })
        );
    });
});

// ── POST /api/purchase-commitments ───────────────────────────

describe("POST /api/purchase-commitments", () => {
    it("creates commitment and returns 201", async () => {
        const res = await POST(makePostRequest({
            product_id:    "prod-1",
            quantity:      40,
            expected_date: "2025-04-25",
            supplier_name: "ABC Tedarikçi",
        }));
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.quantity).toBe(40);
    });

    it("returns 400 when product_id missing", async () => {
        const res = await POST(makePostRequest({ quantity: 10, expected_date: "2025-04-25" }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/product_id/);
    });

    it("returns 400 when quantity is 0", async () => {
        const res = await POST(makePostRequest({ product_id: "prod-1", quantity: 0, expected_date: "2025-04-25" }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/quantity/);
    });

    it("returns 400 when quantity is negative", async () => {
        const res = await POST(makePostRequest({ product_id: "prod-1", quantity: -5, expected_date: "2025-04-25" }));
        expect(res.status).toBe(400);
    });

    it("returns 400 when expected_date missing", async () => {
        const res = await POST(makePostRequest({ product_id: "prod-1", quantity: 10 }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/expected_date/);
    });

    it("does not require supplier_name", async () => {
        const res = await POST(makePostRequest({
            product_id:    "prod-1",
            quantity:      10,
            expected_date: "2025-04-25",
        }));
        expect(res.status).toBe(201);
    });
});

// ── GET /api/purchase-commitments/[id] ───────────────────────

describe("GET /api/purchase-commitments/[id]", () => {
    it("returns commitment when found", async () => {
        mockDbGetCommitment.mockResolvedValue(makeRow());
        const [req, ctx] = await makeDetailGetRequest("commit-1");
        const res = await detailGET(req, ctx);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe("commit-1");
    });

    it("returns 404 when not found", async () => {
        mockDbGetCommitment.mockResolvedValue(null);
        const [req, ctx] = await makeDetailGetRequest("missing");
        const res = await detailGET(req, ctx);
        expect(res.status).toBe(404);
    });
});

// ── PATCH /api/purchase-commitments/[id] ─────────────────────

describe("PATCH /api/purchase-commitments/[id]", () => {
    it("action=receive returns 200 success", async () => {
        const [req, ctx] = await makePatchRequest("commit-1", { action: "receive" });
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(200);
        expect(mockDbReceiveCommitment).toHaveBeenCalledWith("commit-1");
    });

    it("action=cancel returns 200 success", async () => {
        const [req, ctx] = await makePatchRequest("commit-1", { action: "cancel" });
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(200);
        expect(mockDbCancelCommitment).toHaveBeenCalledWith("commit-1");
    });

    it("unknown action returns 400", async () => {
        const [req, ctx] = await makePatchRequest("commit-1", { action: "explode" });
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/explode/);
    });

    it("missing action returns 400", async () => {
        const [req, ctx] = await makePatchRequest("commit-1", {});
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(400);
    });

    it("action=receive propagates DB error as 500", async () => {
        mockDbReceiveCommitment.mockRejectedValue(new Error("RPC failed"));
        const [req, ctx] = await makePatchRequest("commit-1", { action: "receive" });
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(500);
    });

    it("action=receive returns 409 when CommitmentConflictError thrown", async () => {
        mockDbReceiveCommitment.mockRejectedValue(new CommitmentConflictError("commit-1"));
        const [req, ctx] = await makePatchRequest("commit-1", { action: "receive" });
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(409);
        const data = await res.json();
        expect(data.error).toMatch(/pending değil/);
    });
});
