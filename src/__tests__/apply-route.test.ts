/**
 * Faz 3c — POST /api/import/documents/[id]/apply behavior tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockApplyService = vi.fn();
const mockGetUser = vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } } }));
const mockRevalidate = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

vi.mock("@/lib/services/import-apply-service", () => ({
    serviceApplyImportDocument: (...a: unknown[]) => mockApplyService(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => mockGetUser() },
    }),
}));

vi.mock("next/cache", () => ({
    revalidateTag: (...a: unknown[]) => mockRevalidate(...a),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { NextRequest } from "next/server";

beforeEach(() => {
    mockRequireRole.mockReset();
    mockApplyService.mockReset();
    mockRevalidate.mockReset();
    mockGetUser.mockReset();
    mockGetUser.mockImplementation(() => Promise.resolve({ data: { user: { id: "user-1" } } }));
});

function makeReq(id: string): NextRequest {
    return new NextRequest(new URL(`http://localhost/api/import/documents/${id}/apply`), { method: "POST" });
}

async function callPOST(id: string) {
    const { POST } = await import("@/app/api/import/documents/[id]/apply/route");
    return POST(makeReq(id), { params: Promise.resolve({ id }) });
}

const RESULT = {
    products_created: 2, products_updated: 1, attachments_created: 0,
    skipped: 0, errors: [], untyped_products: 0,
};

describe("POST /api/import/documents/[id]/apply", () => {
    it("viewer → 403 (requireRole)", async () => {
        mockRequireRole.mockResolvedValueOnce(new Response(null, { status: 403 }));
        const res = await callPOST("doc-1");
        expect(res.status).toBe(403);
        expect(mockApplyService).not.toHaveBeenCalled();
    });

    it("happy: service başarılı → 200 + result + revalidateTag('products','max')", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockApplyService.mockResolvedValueOnce(RESULT);
        const res = await callPOST("doc-1");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.result.products_created).toBe(2);
        expect(mockRevalidate).toHaveBeenCalledWith("products", "max");
    });

    it("service throw 'bulunamadı' → 400 (pre-check)", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockApplyService.mockRejectedValueOnce(new Error("Belge bulunamadı"));
        const res = await callPOST("doc-x");
        expect(res.status).toBe(400);
    });

    it("service throw 'uygulanmaya hazır değil' → 400 (idempotency)", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockApplyService.mockRejectedValueOnce(new Error("Belge uygulanmaya hazır değil (durum: applied)"));
        const res = await callPOST("doc-1");
        expect(res.status).toBe(400);
    });

    it("service throw generic → 500", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockApplyService.mockRejectedValueOnce(new Error("DB exploded"));
        const res = await callPOST("doc-1");
        expect(res.status).toBe(500);
    });

    it("actor user.id apply service'e forward edilir", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockApplyService.mockResolvedValueOnce(RESULT);
        await callPOST("doc-1");
        expect(mockApplyService).toHaveBeenCalledWith("doc-1", "user-1");
    });
});
