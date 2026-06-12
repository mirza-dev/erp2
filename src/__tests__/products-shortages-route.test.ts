/**
 * Faz 10 — GET /api/products/[id]/shortages route
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockDbGetOpenShortagesByProductId = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbGetOpenShortagesByProductId: (...args: unknown[]) => mockDbGetOpenShortagesByProductId(...args),
}));

import { GET } from "@/app/api/products/[id]/shortages/route";

function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

// ── Denetim Y1 (2026-06): route artık view_products şartı arar (demo-dostu requirePermissionFor) ──
const mockResolveAuthContext = vi.fn();
const mockRequirePermissionFor = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: (...a: unknown[]) => mockResolveAuthContext(...a),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermissionFor(...a),
}));

beforeEach(() => {
    mockResolveAuthContext.mockResolvedValue({
        user: { id: "u-1" }, userId: "u-1", roles: ["admin"], perms: new Set(["view_products"]),
    });
    mockRequirePermissionFor.mockReturnValue(null);
    mockDbGetOpenShortagesByProductId.mockReset();
});

describe("GET /api/products/[id]/shortages", () => {
    it("happy path: 2 satır → items + totalShortage", async () => {
        mockDbGetOpenShortagesByProductId.mockResolvedValue([
            { shortageId: "s1", orderId: "o1", orderNumber: "ORD-001", customerId: "c1", customerName: "Müşteri A",
              requestedQty: 10, availableQty: 4, shortageQty: 6, createdAt: "2026-05-01T00:00:00Z" },
            { shortageId: "s2", orderId: "o2", orderNumber: "ORD-002", customerId: "c2", customerName: "Müşteri B",
              requestedQty: 20, availableQty: 0, shortageQty: 20, createdAt: "2026-05-02T00:00:00Z" },
        ]);
        const req = new NextRequest("http://test/api/products/p-1/shortages");
        const res = await GET(req, makeParams("p-1"));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.items).toHaveLength(2);
        expect(body.totalShortage).toBe(26);
        expect(mockDbGetOpenShortagesByProductId).toHaveBeenCalledWith("p-1");
    });

    it("empty result → items=[], totalShortage=0", async () => {
        mockDbGetOpenShortagesByProductId.mockResolvedValue([]);
        const req = new NextRequest("http://test/api/products/p-x/shortages");
        const res = await GET(req, makeParams("p-x"));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toEqual({ items: [], totalShortage: 0 });
    });

    it("helper throw → 500 (handleApiError mapping)", async () => {
        mockDbGetOpenShortagesByProductId.mockRejectedValue(new Error("db unreachable"));
        const req = new NextRequest("http://test/api/products/p-1/shortages");
        const res = await GET(req, makeParams("p-1"));
        expect(res.status).toBe(500);
    });

    it("totalShortage doğru hesaplanır (5 satır toplamı)", async () => {
        mockDbGetOpenShortagesByProductId.mockResolvedValue([
            { shortageId: "s1", orderId: "o1", orderNumber: "ORD-001", customerId: "c1", customerName: "A", requestedQty: 10, availableQty: 0, shortageQty: 10, createdAt: "2026-05-01T00:00:00Z" },
            { shortageId: "s2", orderId: "o2", orderNumber: "ORD-002", customerId: "c2", customerName: "B", requestedQty: 5, availableQty: 0, shortageQty: 5, createdAt: "2026-05-02T00:00:00Z" },
            { shortageId: "s3", orderId: "o3", orderNumber: "ORD-003", customerId: "c3", customerName: "C", requestedQty: 8, availableQty: 0, shortageQty: 8, createdAt: "2026-05-03T00:00:00Z" },
            { shortageId: "s4", orderId: "o4", orderNumber: "ORD-004", customerId: "c4", customerName: "D", requestedQty: 2, availableQty: 0, shortageQty: 2, createdAt: "2026-05-04T00:00:00Z" },
            { shortageId: "s5", orderId: "o5", orderNumber: "ORD-005", customerId: "c5", customerName: "E", requestedQty: 25, availableQty: 0, shortageQty: 25, createdAt: "2026-05-05T00:00:00Z" },
        ]);
        const req = new NextRequest("http://test/api/products/p-1/shortages");
        const res = await GET(req, makeParams("p-1"));
        const body = await res.json();
        expect(body.totalShortage).toBe(50);
    });
});

describe("Y1 RBAC guard", () => {
    it("izin yoksa 403 döner ve DB'ye inmez", async () => {
        mockRequirePermissionFor.mockReturnValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await GET({} as never, { params: Promise.resolve({ id: "p-1" }) });
        expect(res.status).toBe(403);
        expect(mockDbGetOpenShortagesByProductId).not.toHaveBeenCalled();
    });
});
