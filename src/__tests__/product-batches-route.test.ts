/**
 * Faz 2a — /api/products/[id]/batches route tests
 *
 * Covers:
 *   POST viewer → 403
 *   POST geçersiz body (heat_no boş) → 400
 *   POST happy → 201 + revalidateTag("products")
 *   DELETE happy → 204
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
const BATCH_ID   = "00000000-0000-4000-8000-000000000002";

// ── Module mocks ──────────────────────────────────────────────

const mockDbCreateBatch = vi.fn();
const mockDbGetBatch    = vi.fn();
const mockDbDeleteBatch = vi.fn();
const mockDbListBatches = vi.fn();

vi.mock("@/lib/supabase/product-batches", () => ({
    dbCreateBatch:  (...a: unknown[]) => mockDbCreateBatch(...a),
    dbGetBatch:     (...a: unknown[]) => mockDbGetBatch(...a),
    dbDeleteBatch:  (...a: unknown[]) => mockDbDeleteBatch(...a),
    dbUpdateBatch:  vi.fn(),
    dbListBatchesByProduct: (...a: unknown[]) => mockDbListBatches(...a),
}));

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
    revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
    unstable_cache: (fn: () => unknown) => fn,
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { NextRequest, NextResponse } from "next/server";

beforeEach(() => {
    mockDbCreateBatch.mockReset();
    mockDbGetBatch.mockReset();
    mockDbDeleteBatch.mockReset();
    mockDbListBatches.mockReset();
    mockRequireRole.mockReset();
    mockRevalidateTag.mockReset();
});

function makeRequest(url: string, body?: unknown, method = "POST"): NextRequest {
    return new NextRequest(new URL(url, "http://localhost"), {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: { "content-type": "application/json" },
    });
}

describe("POST /api/products/[id]/batches", () => {
    it("viewer → 403", async () => {
        mockRequireRole.mockResolvedValueOnce(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const { POST } = await import("@/app/api/products/[id]/batches/route");
        const res = await POST(
            makeRequest(`/api/products/${PRODUCT_ID}/batches`, { heat_no: "H-1", initial_qty: 50 }),
            { params: Promise.resolve({ id: PRODUCT_ID }) },
        );
        expect(res.status).toBe(403);
    });

    it("heat_no boş → 400", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockDbCreateBatch.mockRejectedValueOnce(new Error("Parti numarası (heat_no) zorunludur."));
        const { POST } = await import("@/app/api/products/[id]/batches/route");
        const res = await POST(
            makeRequest(`/api/products/${PRODUCT_ID}/batches`, { heat_no: "", initial_qty: 50 }),
            { params: Promise.resolve({ id: PRODUCT_ID }) },
        );
        expect(res.status).toBe(400);
    });

    it("happy path → 201 + revalidateTag products", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockDbCreateBatch.mockResolvedValueOnce({
            id: BATCH_ID,
            product_id: PRODUCT_ID,
            heat_no: "H-100",
            initial_qty: 80,
            remaining_qty: 80,
            batch_date: null,
            certificate_attachment_id: null,
            notes: null,
            created_at: "2026-05-19T00:00:00Z",
            updated_at: "2026-05-19T00:00:00Z",
        });
        const { POST } = await import("@/app/api/products/[id]/batches/route");
        const res = await POST(
            makeRequest(`/api/products/${PRODUCT_ID}/batches`, { heat_no: "H-100", initial_qty: 80 }),
            { params: Promise.resolve({ id: PRODUCT_ID }) },
        );
        expect(res.status).toBe(201);
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });
});

describe("DELETE /api/products/[id]/batches/[batchId]", () => {
    it("happy path → 204", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockDbGetBatch.mockResolvedValueOnce({ id: BATCH_ID, product_id: PRODUCT_ID });
        mockDbDeleteBatch.mockResolvedValueOnce(undefined);

        const { DELETE } = await import("@/app/api/products/[id]/batches/[batchId]/route");
        const res = await DELETE(
            makeRequest(`/api/products/${PRODUCT_ID}/batches/${BATCH_ID}`, undefined, "DELETE"),
            { params: Promise.resolve({ id: PRODUCT_ID, batchId: BATCH_ID }) },
        );
        expect(res.status).toBe(204);
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("cross-product batch → 404", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockDbGetBatch.mockResolvedValueOnce({ id: BATCH_ID, product_id: "00000000-0000-4000-8000-000000000099" });

        const { DELETE } = await import("@/app/api/products/[id]/batches/[batchId]/route");
        const res = await DELETE(
            makeRequest(`/api/products/${PRODUCT_ID}/batches/${BATCH_ID}`, undefined, "DELETE"),
            { params: Promise.resolve({ id: PRODUCT_ID, batchId: BATCH_ID }) },
        );
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain("bu ürüne ait değil");
    });
});
