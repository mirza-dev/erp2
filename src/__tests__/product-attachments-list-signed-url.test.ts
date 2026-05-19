/**
 * Faz 2d — GET /api/products/[id]/attachments yeni shape: { items, expires_in }
 *
 * Coverage:
 *   - Response shape { items: ProductAttachment[], expires_in: 3600 }
 *   - Her item'da signedUrl alanı (mapper'dan)
 *   - dbGetSignedUrlsForRows TEK bulk çağrı yapıyor (N+1 önler)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";

const mockDbList     = vi.fn();
const mockDbGetBulk  = vi.fn();

vi.mock("@/lib/supabase/product-attachments", async () => {
    const actual = await vi.importActual<typeof import("@/lib/supabase/product-attachments")>("@/lib/supabase/product-attachments");
    return {
        ...actual,
        dbListAttachmentsByProduct: (...a: unknown[]) => mockDbList(...a),
        dbGetSignedUrlsForRows:     (...a: unknown[]) => mockDbGetBulk(...a),
    };
});

vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "test-user" } } }) },
    }),
}));

vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: () => unknown) => fn,
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { NextRequest } from "next/server";

beforeEach(() => {
    mockDbList.mockReset();
    mockDbGetBulk.mockReset();
});

function row(id: string, file_path: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        product_id: PRODUCT_ID,
        file_path,
        file_name: `${id}.png`,
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

function makeReq(): NextRequest {
    return new NextRequest(new URL(`http://localhost/api/products/${PRODUCT_ID}/attachments`));
}

describe("GET /api/products/[id]/attachments — list response shape", () => {
    it("returns { items, expires_in: 3600 } shape (no longer raw array)", async () => {
        mockDbList.mockResolvedValueOnce([]);
        mockDbGetBulk.mockResolvedValueOnce(new Map());
        const { GET } = await import("@/app/api/products/[id]/attachments/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty("items");
        expect(body).toHaveProperty("expires_in", 3600);
        expect(Array.isArray(body.items)).toBe(true);
    });

    it("each item exposes signedUrl from the bulk URL map", async () => {
        const rows = [
            row("00000000-0000-4000-8000-000000000010", "p/a.png"),
            row("00000000-0000-4000-8000-000000000011", "p/b.png"),
        ];
        mockDbList.mockResolvedValueOnce(rows);
        mockDbGetBulk.mockResolvedValueOnce(new Map([
            ["p/a.png", "https://signed/a"],
            ["p/b.png", "https://signed/b"],
        ]));
        const { GET } = await import("@/app/api/products/[id]/attachments/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID }) });
        const body = await res.json();
        expect(body.items[0].signedUrl).toBe("https://signed/a");
        expect(body.items[1].signedUrl).toBe("https://signed/b");
        // file_path NOT exposed
        expect(body.items[0]).not.toHaveProperty("file_path");
        expect(body.items[0]).not.toHaveProperty("filePath");
    });

    it("calls dbGetSignedUrlsForRows EXACTLY ONCE (bulk, no N+1)", async () => {
        const rows = [
            row("00000000-0000-4000-8000-000000000010", "p/a.png"),
            row("00000000-0000-4000-8000-000000000011", "p/b.png"),
            row("00000000-0000-4000-8000-000000000012", "p/c.png"),
        ];
        mockDbList.mockResolvedValueOnce(rows);
        mockDbGetBulk.mockResolvedValueOnce(new Map());
        const { GET } = await import("@/app/api/products/[id]/attachments/route");
        await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID }) });
        expect(mockDbGetBulk).toHaveBeenCalledTimes(1);
        expect(mockDbGetBulk).toHaveBeenCalledWith(rows, 3600);
    });

    // ── Faz 2d Review P3-003: invalid kind → 400 ──────────────────────────

    it("returns 400 when ?kind=bad (invalid whitelist value)", async () => {
        const req = new NextRequest(new URL(`http://localhost/api/products/${PRODUCT_ID}/attachments?kind=bad`));
        const { GET } = await import("@/app/api/products/[id]/attachments/route");
        const res = await GET(req, { params: Promise.resolve({ id: PRODUCT_ID }) });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/kind/i);
        // CRITICAL: dbListAttachmentsByProduct should NOT be called (fail-closed)
        expect(mockDbList).not.toHaveBeenCalled();
    });

    it("accepts valid kind and passes it to the helper", async () => {
        mockDbList.mockResolvedValueOnce([]);
        mockDbGetBulk.mockResolvedValueOnce(new Map());
        const req = new NextRequest(new URL(`http://localhost/api/products/${PRODUCT_ID}/attachments?kind=image`));
        const { GET } = await import("@/app/api/products/[id]/attachments/route");
        const res = await GET(req, { params: Promise.resolve({ id: PRODUCT_ID }) });
        expect(res.status).toBe(200);
        expect(mockDbList).toHaveBeenCalledWith(PRODUCT_ID, "image");
    });

    it("treats missing kind as 'no filter' (legacy behavior preserved)", async () => {
        mockDbList.mockResolvedValueOnce([]);
        mockDbGetBulk.mockResolvedValueOnce(new Map());
        const { GET } = await import("@/app/api/products/[id]/attachments/route");
        const res = await GET(makeReq(), { params: Promise.resolve({ id: PRODUCT_ID }) });
        expect(res.status).toBe(200);
        expect(mockDbList).toHaveBeenCalledWith(PRODUCT_ID, undefined);
    });
});
