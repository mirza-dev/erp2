/**
 * Faz 2d — GET /api/products/[id]/attachments/[attachmentId]/url
 *
 * Coverage:
 *   - Geçersiz UUID → 400
 *   - Ek bulunamadı → 404
 *   - Cross-product mismatch → 404
 *   - file_path boş → 404
 *   - createSignedUrl null → 500
 *   - Başarı → 200 { url, expires_in: 3600 }
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID   = "00000000-0000-4000-8000-000000000002";
const ATTACH_ID  = "00000000-0000-4000-8000-000000000010";

const mockDbGet           = vi.fn();
const mockDbGetSignedUrl  = vi.fn();

vi.mock("@/lib/supabase/product-attachments", async () => {
    const actual = await vi.importActual<typeof import("@/lib/supabase/product-attachments")>("@/lib/supabase/product-attachments");
    return {
        ...actual,
        dbGetAttachment: (...a: unknown[]) => mockDbGet(...a),
        dbGetSignedUrl:  (...a: unknown[]) => mockDbGetSignedUrl(...a),
    };
});

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { NextRequest } from "next/server";

beforeEach(() => {
    mockDbGet.mockReset();
    mockDbGetSignedUrl.mockReset();
});

function makeReq(): NextRequest {
    return new NextRequest(new URL("http://localhost/x"));
}

function row(overrides: Record<string, unknown> = {}) {
    return {
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
        uploaded_at: "2026-01-01",
        uploaded_by: null,
        ...overrides,
    };
}

describe("GET /api/products/[id]/attachments/[attachmentId]/url", () => {
    it("returns 400 when product id is not a UUID", async () => {
        const { GET } = await import("@/app/api/products/[id]/attachments/[attachmentId]/url/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: "not-a-uuid", attachmentId: ATTACH_ID }) });
        expect(res.status).toBe(400);
    });

    it("returns 400 when attachment id is not a UUID", async () => {
        const { GET } = await import("@/app/api/products/[id]/attachments/[attachmentId]/url/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: "bad" }) });
        expect(res.status).toBe(400);
    });

    it("returns 404 when attachment not found", async () => {
        mockDbGet.mockResolvedValueOnce(null);
        const { GET } = await import("@/app/api/products/[id]/attachments/[attachmentId]/url/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: ATTACH_ID }) });
        expect(res.status).toBe(404);
    });

    it("returns 404 when attachment belongs to different product", async () => {
        mockDbGet.mockResolvedValueOnce(row({ product_id: OTHER_ID }));
        const { GET } = await import("@/app/api/products/[id]/attachments/[attachmentId]/url/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: ATTACH_ID }) });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toMatch(/ait değil/);
    });

    it("returns 404 when file_path is empty", async () => {
        mockDbGet.mockResolvedValueOnce(row({ file_path: "" }));
        const { GET } = await import("@/app/api/products/[id]/attachments/[attachmentId]/url/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: ATTACH_ID }) });
        expect(res.status).toBe(404);
    });

    it("returns 500 when createSignedUrl returns null", async () => {
        mockDbGet.mockResolvedValueOnce(row());
        mockDbGetSignedUrl.mockResolvedValueOnce(null);
        const { GET } = await import("@/app/api/products/[id]/attachments/[attachmentId]/url/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: ATTACH_ID }) });
        expect(res.status).toBe(500);
    });

    it("returns 200 with { url, expires_in: 3600 } on success", async () => {
        mockDbGet.mockResolvedValueOnce(row());
        mockDbGetSignedUrl.mockResolvedValueOnce("https://signed.example/x?token=abc");
        const { GET } = await import("@/app/api/products/[id]/attachments/[attachmentId]/url/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID, attachmentId: ATTACH_ID }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ url: "https://signed.example/x?token=abc", expires_in: 3600 });
        // dbGetSignedUrl called with file_path + TTL
        expect(mockDbGetSignedUrl).toHaveBeenCalledWith(`${PRODUCT_ID}/${ATTACH_ID}.png`, 3600);
    });
});
