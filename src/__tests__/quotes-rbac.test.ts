/**
 * Faz 8a — Quotes route RBAC: yazma uçları yetki guard'ı.
 * POST /api/quotes + PATCH/DELETE /api/quotes/[id] + POST revise →
 * yetkisiz (viewer) 403 + mutasyon helper/servis çağrılmaz.
 * GET'ler guard'sız (bu testte yok).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Kontrol edilebilir guard mock — testler return değerini ayarlar.
const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
    requireRole: vi.fn().mockResolvedValue(null),
}));

const mockDbCreateQuote = vi.fn();
const mockDbUpdateQuote = vi.fn();
const mockDbDeleteQuote = vi.fn();
const mockDbGetQuote = vi.fn();
const mockServiceRevise = vi.fn();
vi.mock("@/lib/supabase/quotes", () => ({
    dbCreateQuote: (...a: unknown[]) => mockDbCreateQuote(...a),
    dbUpdateQuote: (...a: unknown[]) => mockDbUpdateQuote(...a),
    dbDeleteQuote: (...a: unknown[]) => mockDbDeleteQuote(...a),
    dbGetQuote: (...a: unknown[]) => mockDbGetQuote(...a),
    dbListQuotes: vi.fn(),
    dbListQuoteChain: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/supabase/orders", () => ({ dbFindOrderByQuoteId: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/services/quote-service", () => ({
    serviceCreateQuoteRevision: (...a: unknown[]) => mockServiceRevise(...a),
    serviceTransitionQuote: vi.fn(),
}));
vi.mock("next/cache", () => ({
    unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
    revalidateTag: vi.fn(),
}));

import { POST as quotesPOST } from "@/app/api/quotes/route";
import { PATCH as quotePATCH, DELETE as quoteDELETE } from "@/app/api/quotes/[id]/route";
import { POST as quoteREVISE } from "@/app/api/quotes/[id]/revise/route";

const FORBIDDEN = NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
function req(body?: unknown, method = "POST") {
    const init: RequestInit = { method };
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { "Content-Type": "application/json" }; }
    return new NextRequest("http://localhost/api/quotes", init);
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    mockRequirePermission.mockReset();
    mockDbCreateQuote.mockReset();
    mockDbUpdateQuote.mockReset();
    mockDbDeleteQuote.mockReset();
    mockDbGetQuote.mockReset();
    mockServiceRevise.mockReset();
});

describe("Faz 8a — quotes yazma uçları RBAC", () => {
    it("POST /api/quotes — yetkisiz → 403 + dbCreateQuote çağrılmaz", async () => {
        mockRequirePermission.mockResolvedValue(FORBIDDEN);
        const res = await quotesPOST(req({ customer_name: "X", lines: [] }));
        expect(res.status).toBe(403);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "manage_quotes");
        expect(mockDbCreateQuote).not.toHaveBeenCalled();
    });

    it("PATCH /api/quotes/[id] — yetkisiz → 403 + dbUpdateQuote çağrılmaz", async () => {
        mockRequirePermission.mockResolvedValue(FORBIDDEN);
        const res = await quotePATCH(req({ customer_name: "Y" }, "PATCH"), params("q-1"));
        expect(res.status).toBe(403);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "manage_quotes");
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
        expect(mockDbGetQuote).not.toHaveBeenCalled();
    });

    it("DELETE /api/quotes/[id] — yetkisiz → 403 + dbDeleteQuote çağrılmaz (delete_quotes)", async () => {
        mockRequirePermission.mockResolvedValue(FORBIDDEN);
        const res = await quoteDELETE(req(undefined, "DELETE"), params("q-1"));
        expect(res.status).toBe(403);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "delete_quotes");
        expect(mockDbDeleteQuote).not.toHaveBeenCalled();
    });

    it("POST revise — yetkisiz → 403 + serviceCreateQuoteRevision çağrılmaz", async () => {
        mockRequirePermission.mockResolvedValue(FORBIDDEN);
        const res = await quoteREVISE(req(undefined, "POST"), params("q-1"));
        expect(res.status).toBe(403);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "manage_quotes");
        expect(mockServiceRevise).not.toHaveBeenCalled();
    });

    it("yetkili (guard null) → POST guard'ı geçer, dbCreateQuote çağrılır", async () => {
        mockRequirePermission.mockResolvedValue(null);
        mockDbCreateQuote.mockResolvedValue({
            id: "q-1", quote_number: "TKL-2026-001", status: "draft", lines: [],
            customer_name: "X", currency: "TRY", subtotal: 0, vat_total: 0, grand_total: 0,
            discount_amount: 0, vat_rate: 20,
        });
        const res = await quotesPOST(req({ customer_name: "X", lines: [], subtotal: 0, discount_amount: 0 }));
        expect(res.status).toBe(201);
        expect(mockDbCreateQuote).toHaveBeenCalled();
    });
});
