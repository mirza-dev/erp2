/**
 * Faz 2a — /api/products/[id]/attachments route tests
 *
 * Covers:
 *   POST viewer → 403
 *   POST geçersiz MIME → 400
 *   POST 10MB+ → 400
 *   POST happy → 201 + revalidateTag
 *   DELETE happy → 204
 *   PATCH is_primary_image:true (image) → ok
 *   PATCH is_primary_image:true (datasheet kind) → 400
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
const ATTACH_ID  = "00000000-0000-4000-8000-000000000003";

const mockDbCreate          = vi.fn();
const mockDbGet             = vi.fn();
const mockDbDelete          = vi.fn();
const mockDbSetPrimary      = vi.fn();

vi.mock("@/lib/supabase/product-attachments", async () => {
    const actual = await vi.importActual<typeof import("@/lib/supabase/product-attachments")>("@/lib/supabase/product-attachments");
    return {
        ...actual,
        dbCreateAttachment:     (...a: unknown[]) => mockDbCreate(...a),
        dbGetAttachment:        (...a: unknown[]) => mockDbGet(...a),
        dbDeleteAttachment:     (...a: unknown[]) => mockDbDelete(...a),
        dbSetPrimaryImage:      (...a: unknown[]) => mockDbSetPrimary(...a),
        dbListAttachmentsByProduct: vi.fn(),
    };
});

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
    requireRoleFor: (...a: unknown[]) => mockRequireRole(...a),
    resolveAuthContext: async () => ({ user: { id: "test-user" }, userId: "test-user", roles: ["admin"], perms: new Set() }),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "test-user" } } }) },
    }),
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
    mockDbCreate.mockReset();
    mockDbGet.mockReset();
    mockDbDelete.mockReset();
    mockDbSetPrimary.mockReset();
    mockRequireRole.mockReset();
    mockRevalidateTag.mockReset();
});

function makeFormRequest(url: string, formData: FormData): NextRequest {
    return new NextRequest(new URL(url, "http://localhost"), {
        method: "POST",
        body: formData,
    });
}

function makeJsonRequest(url: string, body: unknown, method = "PATCH"): NextRequest {
    return new NextRequest(new URL(url, "http://localhost"), {
        method,
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

describe("POST /api/products/[id]/attachments", () => {
    it("viewer → 403", async () => {
        mockRequireRole.mockReturnValueOnce(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const fd = new FormData();
        fd.append("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
        fd.append("kind", "image");
        const { POST } = await import("@/app/api/products/[id]/attachments/route");
        const res = await POST(
            makeFormRequest(`/api/products/${PRODUCT_ID}/attachments`, fd),
            { params: Promise.resolve({ id: PRODUCT_ID }) },
        );
        expect(res.status).toBe(403);
    });

    it("geçersiz MIME → 400", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        const fd = new FormData();
        fd.append("file", new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
        fd.append("kind", "image");
        const { POST } = await import("@/app/api/products/[id]/attachments/route");
        const res = await POST(
            makeFormRequest(`/api/products/${PRODUCT_ID}/attachments`, fd),
            { params: Promise.resolve({ id: PRODUCT_ID }) },
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/dosya türü/i);
    });

    it("10MB+ → 400", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        const big = new Uint8Array(10 * 1024 * 1024 + 1);
        const fd = new FormData();
        fd.append("file", new File([big], "big.pdf", { type: "application/pdf" }));
        fd.append("kind", "datasheet");
        const { POST } = await import("@/app/api/products/[id]/attachments/route");
        const res = await POST(
            makeFormRequest(`/api/products/${PRODUCT_ID}/attachments`, fd),
            { params: Promise.resolve({ id: PRODUCT_ID }) },
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/sınırını aşıyor/i);
    });

    it("geçersiz kind → 400", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        const fd = new FormData();
        fd.append("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
        fd.append("kind", "photo");
        const { POST } = await import("@/app/api/products/[id]/attachments/route");
        const res = await POST(
            makeFormRequest(`/api/products/${PRODUCT_ID}/attachments`, fd),
            { params: Promise.resolve({ id: PRODUCT_ID }) },
        );
        expect(res.status).toBe(400);
    });

    it("happy path → 201 + revalidateTag", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockDbCreate.mockResolvedValueOnce({
            id: ATTACH_ID,
            product_id: PRODUCT_ID,
            file_path: `${PRODUCT_ID}/${ATTACH_ID}.png`,
            file_name: "x.png",
            file_size: 100,
            mime_type: "image/png",
            kind: "image",
            is_primary_image: false,
            version: 1,
            superseded_by: null,
            metadata: null,
            uploaded_at: "2026-05-19T00:00:00Z",
            uploaded_by: null,
        });
        const fd = new FormData();
        fd.append("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
        fd.append("kind", "image");
        const { POST } = await import("@/app/api/products/[id]/attachments/route");
        const res = await POST(
            makeFormRequest(`/api/products/${PRODUCT_ID}/attachments`, fd),
            { params: Promise.resolve({ id: PRODUCT_ID }) },
        );
        expect(res.status).toBe(201);
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });
});

describe("PATCH /api/products/[id]/attachments/[attachmentId]", () => {
    it("is_primary_image:true + image kind → ok", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockDbGet.mockResolvedValueOnce({ id: ATTACH_ID, product_id: PRODUCT_ID, kind: "image" });
        mockDbSetPrimary.mockResolvedValueOnce(undefined);

        const { PATCH } = await import("@/app/api/products/[id]/attachments/[attachmentId]/route");
        const res = await PATCH(
            makeJsonRequest(`/api/products/${PRODUCT_ID}/attachments/${ATTACH_ID}`, { is_primary_image: true }),
            { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: ATTACH_ID }) },
        );
        expect(res.status).toBe(200);
        expect(mockDbSetPrimary).toHaveBeenCalledWith(PRODUCT_ID, ATTACH_ID);
    });

    it("is_primary_image:true + non-image kind → 400", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockDbGet.mockResolvedValueOnce({ id: ATTACH_ID, product_id: PRODUCT_ID, kind: "datasheet" });

        const { PATCH } = await import("@/app/api/products/[id]/attachments/[attachmentId]/route");
        const res = await PATCH(
            makeJsonRequest(`/api/products/${PRODUCT_ID}/attachments/${ATTACH_ID}`, { is_primary_image: true }),
            { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: ATTACH_ID }) },
        );
        expect(res.status).toBe(400);
    });
});

describe("DELETE /api/products/[id]/attachments/[attachmentId]", () => {
    it("happy path → 204", async () => {
        mockRequireRole.mockReturnValueOnce(null);
        mockDbGet.mockResolvedValueOnce({ id: ATTACH_ID, product_id: PRODUCT_ID, kind: "image" });
        mockDbDelete.mockResolvedValueOnce(undefined);

        const { DELETE } = await import("@/app/api/products/[id]/attachments/[attachmentId]/route");
        const res = await DELETE(
            makeJsonRequest(`/api/products/${PRODUCT_ID}/attachments/${ATTACH_ID}`, undefined, "DELETE"),
            { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: ATTACH_ID }) },
        );
        expect(res.status).toBe(204);
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });
});
