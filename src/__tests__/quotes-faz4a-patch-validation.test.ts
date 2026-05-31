/**
 * Faz 4a Review (2026-05-23) — PATCH /api/quotes/[id] string length parity.
 *
 * Bulgu: POST /api/quotes route.ts:35 validateStringLengths çalıştırıyor,
 * PATCH /api/quotes/[id] draft-update branch'i body'yi doğrudan dbUpdateQuote'a
 * iletiyordu. Faz 4a iki yeni serbest text alanı (delivery_method,
 * payment_method) eklediği için PATCH path da aynı guard'ı kullanmalı
 * (defense-in-depth + symmetry). Mevcut text alanları (notes, customer_*)
 * için de zaten parity gerekliydi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDbGetQuote    = vi.fn();
const mockDbUpdateQuote = vi.fn();

// Faz 8a: RBAC guard — varsayılan izinli (mevcut testler davranışı korur).
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase/quotes", () => ({
    dbListQuotes:        vi.fn(),
    dbCreateQuote:       vi.fn(),
    dbGetQuote:          (...args: unknown[]) => mockDbGetQuote(...args),
    dbUpdateQuote:       (...args: unknown[]) => mockDbUpdateQuote(...args),
    dbDeleteQuote:       vi.fn(),
    dbFindQuoteByNumber: vi.fn(),
    dbUpdateQuoteStatus: vi.fn(),
    dbListExpiredQuotes: vi.fn(),
}));

vi.mock("@/lib/services/quote-service", () => ({
    serviceTransitionQuote: vi.fn(),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByQuoteId: vi.fn(() => Promise.resolve(null)),
}));

import { PATCH } from "@/app/api/quotes/[id]/route";

const QUOTE_ID = "quote-test-uuid";

const draftQuote = {
    id: QUOTE_ID, quote_number: "TKL-2026-001", status: "draft",
    customer_name: "Acme", currency: "USD", grand_total: 100,
    quote_date: "2026-05-23", valid_until: null,
    created_at: "2026-05-23T00:00:00Z", updated_at: "2026-05-23T00:00:00Z",
    customer_id: null, customer_contact: null, customer_phone: null,
    customer_email: null, sales_rep: null, sales_phone: null, sales_email: null,
    vat_rate: 20, subtotal: 100, vat_total: 20, notes: null,
    sig_prepared: null, sig_approved: null, sig_manager: null,
    delivery_method: null, payment_method: null,
    lines: [],
};

function makeReq(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/quotes/${QUOTE_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function ctx() { return { params: Promise.resolve({ id: QUOTE_ID }) }; }

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetQuote.mockResolvedValue(draftQuote);
    mockDbUpdateQuote.mockResolvedValue(draftQuote);
});

describe("PATCH /api/quotes/[id] — string length parity (Faz 4a Review)", () => {
    it("delivery_method 10001 char → 400 + Türkçe hata + dbUpdateQuote ÇAĞRILMAZ", async () => {
        // MAX_STRING_LENGTH = 10_000 (api-error.ts:80)
        const tooLong = "x".repeat(10_001);
        const res = await PATCH(makeReq({
            customer_name: "Acme",
            currency: "USD",
            vat_rate: 20,
            subtotal: 100,
            vat_total: 20,
            grand_total: 120,
            delivery_method: tooLong,
            lines: [],
        }), ctx());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/delivery_method.*çok uzun.*10000/i);
        // CRITICAL: DB'ye yazılmamalı (guard fail-closed)
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
    });

    it("payment_method 10001 char → 400 + dbUpdateQuote ÇAĞRILMAZ", async () => {
        const tooLong = "y".repeat(10_001);
        const res = await PATCH(makeReq({
            customer_name: "Acme",
            currency: "USD",
            vat_rate: 20,
            subtotal: 100,
            vat_total: 20,
            grand_total: 120,
            payment_method: tooLong,
            lines: [],
        }), ctx());
        expect(res.status).toBe(400);
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
    });

    it("lines[].size_text 10001 char → 400 (nested validation) + dbUpdateQuote ÇAĞRILMAZ", async () => {
        // validateStringLengths recursive — array.object alanlarını da tarar
        const res = await PATCH(makeReq({
            customer_name: "Acme",
            currency: "USD",
            vat_rate: 20,
            subtotal: 100,
            vat_total: 20,
            grand_total: 120,
            lines: [{
                position: 1,
                product_code: "K1",
                description: "v1",
                quantity: 1,
                unit_price: 100,
                line_total: 100,
                size_text: "z".repeat(10_001),
            }],
        }), ctx());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/lines\[0\]\.size_text.*çok uzun/i);
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
    });

    it("normal body (kısa string'ler) → 200 + dbUpdateQuote çağrılır (regression korunur)", async () => {
        const res = await PATCH(makeReq({
            customer_name: "Acme",
            currency: "USD",
            vat_rate: 20,
            subtotal: 100,
            vat_total: 20,
            grand_total: 120,
            delivery_method: "İSTANBUL PMT DEPO TESLİMİ",
            payment_method: "%50 AVANS",
            lines: [{
                position: 1, product_code: "K1", description: "v1",
                quantity: 1, unit_price: 100, line_total: 100,
                size_text: "DN50",
            }],
        }), ctx());
        expect(res.status).toBe(200);
        expect(mockDbUpdateQuote).toHaveBeenCalledWith(QUOTE_ID, expect.objectContaining({
            delivery_method: "İSTANBUL PMT DEPO TESLİMİ",
            payment_method: "%50 AVANS",
        }));
    });
});
