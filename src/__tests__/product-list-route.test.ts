/**
 * Tests for GET /api/products route handler.
 *
 * Documents the actual supported filter contract:
 *   ?category=xxx          → forwarded to dbListProducts
 *   ?product_type=manufactured → forwarded
 *   ?is_active=false       → forwarded (default: true)
 *   ?page=2                → forwarded
 *
 * low_stock is NOT a supported query param — it was removed after being
 * declared in ListProductsFilter but never implemented in dbListProducts
 * or forwarded from the route. This test suite acts as a regression guard
 * to prevent re-introducing that drift.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();
const mockDbGetIncomingQuantities = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts:          (...args: unknown[]) => mockDbListProducts(...args),
    dbCreateProduct:         vi.fn(),
    dbGetQuotedQuantities:   (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
}));

vi.mock("@/lib/supabase/purchase-commitments", () => ({
    dbGetIncomingQuantities: (...args: unknown[]) => mockDbGetIncomingQuantities(...args),
    dbListCommitments:       vi.fn(),
    dbCreateCommitment:      vi.fn(),
    dbGetCommitment:         vi.fn(),
    dbReceiveCommitment:     vi.fn(),
    dbCancelCommitment:      vi.fn(),
}));

import { GET } from "@/app/api/products/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGetRequest(query = ""): NextRequest {
    return new NextRequest(`http://localhost/api/products${query ? `?${query}` : ""}`, { method: "GET" });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListProducts.mockResolvedValue([]);
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbGetIncomingQuantities.mockResolvedValue(new Map());
});

// ─── Query param forwarding ───────────────────────────────────────────────────

describe("GET /api/products — query param forwarding", () => {
    it("params olmadan dbListProducts çağrılır (is_active default true)", async () => {
        await GET(makeGetRequest());
        expect(mockDbListProducts).toHaveBeenCalledWith(
            expect.objectContaining({ is_active: true })
        );
    });

    it("?category=vana → category iletilir", async () => {
        await GET(makeGetRequest("category=vana"));
        expect(mockDbListProducts).toHaveBeenCalledWith(
            expect.objectContaining({ category: "vana" })
        );
    });

    it("?product_type=raw_material → product_type iletilir", async () => {
        await GET(makeGetRequest("product_type=raw_material"));
        expect(mockDbListProducts).toHaveBeenCalledWith(
            expect.objectContaining({ product_type: "raw_material" })
        );
    });

    it("?is_active=false → is_active false iletilir", async () => {
        await GET(makeGetRequest("is_active=false"));
        expect(mockDbListProducts).toHaveBeenCalledWith(
            expect.objectContaining({ is_active: false })
        );
    });

    it("?page=3 → page iletilir", async () => {
        await GET(makeGetRequest("page=3"));
        expect(mockDbListProducts).toHaveBeenCalledWith(
            expect.objectContaining({ page: 3 })
        );
    });

    it("200 ve boş array döner", async () => {
        const res = await GET(makeGetRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([]);
    });
});

// ─── low_stock param — silently ignored (no implementation) ──────────────────
// Regression guard: low_stock was listed in the route comment and ListProductsFilter
// type but was never implemented. The field has been removed from the type and the
// comment. If someone passes ?low_stock=true, it must not crash — it is ignored.

describe("GET /api/products — low_stock param silinmiş, route çökmemeli", () => {
    it("?low_stock=true geçilirse 200 döner, hata yok", async () => {
        const res = await GET(makeGetRequest("low_stock=true"));
        expect(res.status).toBe(200);
    });

    it("?low_stock=true, dbListProducts çağrısında low_stock alanı yok", async () => {
        await GET(makeGetRequest("low_stock=true"));
        const call = mockDbListProducts.mock.calls[0][0] as Record<string, unknown>;
        expect(call).not.toHaveProperty("low_stock");
    });
});
