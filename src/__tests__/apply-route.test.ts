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
    requireRoleFor: (...a: unknown[]) => mockRequireRole(...a),
    resolveAuthContext: async () => {
        const { data: { user } } = await mockGetUser();
        return { user: user ?? null, userId: user?.id ?? null, roles: ["admin"], perms: new Set() };
    },
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

function makeReq(id: string, body?: unknown): NextRequest {
    return new NextRequest(new URL(`http://localhost/api/import/documents/${id}/apply`), {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    });
}

async function callPOST(id: string, body?: unknown) {
    const { POST } = await import("@/app/api/import/documents/[id]/apply/route");
    return POST(makeReq(id, body), { params: Promise.resolve({ id }) });
}

const RESULT = {
    products_created: 2, products_updated: 1, attachments_created: 0,
    skipped: 0, errors: [], untyped_products: 0,
};

describe("POST /api/import/documents/[id]/apply", () => {
    it("viewer → 403 (requireRole)", async () => {
        mockRequireRole.mockReturnValueOnce(new Response(null, { status: 403 }));
        const res = await callPOST("doc-1");
        expect(res.status).toBe(403);
        expect(mockApplyService).not.toHaveBeenCalled();
    });

    it("happy: service başarılı → 200 + result + revalidateTag('products','max')", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockApplyService.mockResolvedValueOnce(RESULT);
        const res = await callPOST("doc-1");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.result.products_created).toBe(2);
        expect(mockRevalidate).toHaveBeenCalledWith("products", "max");
    });

    it("service throw 'bulunamadı' → 400 (pre-check)", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockApplyService.mockRejectedValueOnce(new Error("Belge bulunamadı"));
        const res = await callPOST("doc-x");
        expect(res.status).toBe(400);
    });

    it("service throw 'uygulanmaya hazır değil' → 400 (idempotency)", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockApplyService.mockRejectedValueOnce(new Error("Belge uygulanmaya hazır değil (durum: applied)"));
        const res = await callPOST("doc-1");
        expect(res.status).toBe(400);
    });

    it("service throw generic → 500", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockApplyService.mockRejectedValueOnce(new Error("DB exploded"));
        const res = await callPOST("doc-1");
        expect(res.status).toBe(500);
    });

    it("actor user.id apply service'e forward edilir", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockApplyService.mockResolvedValueOnce(RESULT);
        await callPOST("doc-1");
        expect(mockApplyService).toHaveBeenCalledWith("doc-1", "user-1", { fieldApprovals: undefined });
    });

    it("fieldApprovals body normalize edilir ve apply service'e forward edilir", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockApplyService.mockResolvedValueOnce(RESULT);
        await callPOST("doc-1", {
            fieldApprovals: {
                "line-1": {
                    productFields: ["name", "sku", "price", "product_type_id", "name"],
                    technicalAttributeKeys: ["dn", "pn_class", "DN", "bad-key!", "dn"],
                },
                "line-2": { technicalAttributeKeys: ["material"] },
            },
        });
        expect(mockApplyService).toHaveBeenCalledWith("doc-1", "user-1", {
            fieldApprovals: {
                "line-1": {
                    productFields: ["name", "sku", "product_type_id"],
                    technicalAttributeKeys: ["dn", "pn_class"],
                },
                "line-2": { productFields: [], technicalAttributeKeys: ["material"] },
            },
        });
    });

    // ── Faz 3c Review 4.tur (P3) — 409 mapping for 'applying' state ──────

    it("service throw 'hazır değil (durum: applying)' → 409 Conflict + net mesaj", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockApplyService.mockRejectedValueOnce(
            new Error("Belge uygulanmaya hazır değil (durum: applying)"),
        );
        const res = await callPOST("doc-1");
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toMatch(/başka bir oturumda uygulanıyor/i);
    });

    it("service throw 'hazır değil (durum: applied)' → 400 korunur (applying değil)", async () => {
        // Sadece 'applying' 409'a maplenir; diğer terminal/transient state'ler 400.
        mockRequireRole.mockReturnValueOnce(null);
        mockApplyService.mockRejectedValueOnce(
            new Error("Belge uygulanmaya hazır değil (durum: applied)"),
        );
        const res = await callPOST("doc-1");
        expect(res.status).toBe(400);
    });
});
