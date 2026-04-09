/**
 * Tests for GET /api/products/[id]/quotes
 *
 * Faz 5 — Teklif Kırılımı: breakdown endpoint for active quotes on a product.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbGetQuotedBreakdownByProduct = vi.fn();
const mockDbLookupUserEmails = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbGetQuotedBreakdownByProduct: (...args: unknown[]) => mockDbGetQuotedBreakdownByProduct(...args),
    dbLookupUserEmails: (...args: unknown[]) => mockDbLookupUserEmails(...args),
}));

import { GET } from "@/app/api/products/[id]/quotes/route";
import type { QuotedBreakdownRow } from "@/lib/supabase/products";

// ── Helpers ───────────────────────────────────────────────────

function makeRow(overrides: Partial<QuotedBreakdownRow> = {}): QuotedBreakdownRow {
    return {
        orderId: "order-1",
        orderNumber: "ORD-001",
        customerId: "cust-1",
        customerName: "Müşteri A",
        quantity: 10,
        unitPrice: 100,
        discountPct: 0,
        lineTotal: 1000,
        currency: "USD",
        commercialStatus: "draft",
        orderCreatedAt: "2024-06-01T00:00:00Z",
        createdBy: null,
        quoteValidUntil: null,
        ...overrides,
    };
}

function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbLookupUserEmails.mockResolvedValue(new Map());
});

// ── Tests ─────────────────────────────────────────────────────

describe("GET /api/products/[id]/quotes", () => {
    it("2 teklif + 2 farklı user → items.length=2, createdByEmail dolu", async () => {
        const rows = [
            makeRow({ orderId: "o1", quantity: 10, createdBy: "uid-1" }),
            makeRow({ orderId: "o2", quantity: 8, createdBy: "uid-2" }),
        ];
        mockDbGetQuotedBreakdownByProduct.mockResolvedValue(rows);
        mockDbLookupUserEmails.mockResolvedValue(
            new Map([["uid-1", "ahmet@pmt.com.tr"], ["uid-2", "mehmet@pmt.com.tr"]])
        );

        const req = new NextRequest("http://localhost/api/products/prod-1/quotes");
        const res = await GET(req, makeParams("prod-1"));
        const body = await res.json();

        expect(body.items).toHaveLength(2);
        expect(body.totalQuoted).toBe(18);
        expect(body.items[0].createdByEmail).toBe("ahmet@pmt.com.tr");
        expect(body.items[1].createdByEmail).toBe("mehmet@pmt.com.tr");
    });

    it("createdBy null olan satır → createdByEmail = null, liste yine döner", async () => {
        mockDbGetQuotedBreakdownByProduct.mockResolvedValue([
            makeRow({ orderId: "o1", quantity: 5, createdBy: null }),
        ]);

        const req = new NextRequest("http://localhost/api/products/prod-1/quotes");
        const res = await GET(req, makeParams("prod-1"));
        const body = await res.json();

        expect(body.items).toHaveLength(1);
        expect(body.items[0].createdByEmail).toBeNull();
    });

    it("teklif yok → { items: [], totalQuoted: 0 }", async () => {
        mockDbGetQuotedBreakdownByProduct.mockResolvedValue([]);

        const req = new NextRequest("http://localhost/api/products/prod-empty/quotes");
        const res = await GET(req, makeParams("prod-empty"));
        const body = await res.json();

        expect(body.items).toEqual([]);
        expect(body.totalQuoted).toBe(0);
        expect(res.status).toBe(200);
    });

    it("doğru product_id ile dbGetQuotedBreakdownByProduct çağrılır", async () => {
        mockDbGetQuotedBreakdownByProduct.mockResolvedValue([]);

        const req = new NextRequest("http://localhost/api/products/specific-id/quotes");
        await GET(req, makeParams("specific-id"));

        expect(mockDbGetQuotedBreakdownByProduct).toHaveBeenCalledWith("specific-id");
    });

    it("createdBy dolu ama emailMap'te yok → createdByEmail = null", async () => {
        mockDbGetQuotedBreakdownByProduct.mockResolvedValue([
            makeRow({ quantity: 7, createdBy: "uid-unknown" }),
        ]);
        mockDbLookupUserEmails.mockResolvedValue(new Map()); // email bulunamadı

        const req = new NextRequest("http://localhost/api/products/p1/quotes");
        const res = await GET(req, makeParams("p1"));
        const body = await res.json();

        expect(body.items[0].createdByEmail).toBeNull();
    });
});
