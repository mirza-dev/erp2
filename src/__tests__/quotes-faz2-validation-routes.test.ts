/**
 * Teklif V7 — Faz 2 route davranışı.
 *
 * V7-A11 qty validator POST + PATCH document-update'te (gerçek satırlarda
 * pozitif tam sayı, değilse 422). PATCH transition branch validationFailed →
 * 422 mapping (V4-A2/V4-A4 send-time hard check route katmanı).
 *
 * Send-time validasyonun GERÇEK mantığı quote-service.test.ts'te; burada
 * route'un serviceTransitionQuote sonucunu doğru HTTP koduna maplediğini test
 * ederiz (serviceTransitionQuote mock'lu).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDbCreateQuote = vi.fn();
const mockDbGetQuote    = vi.fn();
const mockDbUpdateQuote = vi.fn();
const mockTransition    = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbListQuotes:        vi.fn(),
    dbCreateQuote:       (...args: unknown[]) => mockDbCreateQuote(...args),
    dbGetQuote:          (...args: unknown[]) => mockDbGetQuote(...args),
    dbUpdateQuote:       (...args: unknown[]) => mockDbUpdateQuote(...args),
    dbDeleteQuote:       vi.fn(),
    dbFindQuoteByNumber: vi.fn(),
    dbUpdateQuoteStatus: vi.fn(),
    dbListExpiredQuotes: vi.fn(),
}));

vi.mock("@/lib/services/quote-service", () => ({
    serviceTransitionQuote: (...args: unknown[]) => mockTransition(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByQuoteId: vi.fn(() => Promise.resolve(null)),
}));

import { POST } from "@/app/api/quotes/route";
import { PATCH } from "@/app/api/quotes/[id]/route";

const QUOTE_ID = "quote-test-uuid";

const fullRow = {
    id: QUOTE_ID, quote_number: "TKL-2026-001", status: "draft",
    customer_name: "Acme Ltd", customer_address: "İstanbul",
    customer_id: null, customer_contact: null, customer_phone: null, customer_email: null,
    sales_rep: null, sales_phone: null, sales_email: null,
    currency: "USD", vat_rate: 20, subtotal: 1000, vat_total: 200, grand_total: 1200,
    notes: null, sig_prepared: null, sig_approved: null, sig_manager: null,
    quote_date: "2026-05-29", valid_until: null,
    delivery_method: null, payment_method: null,
    created_at: "2026-05-29T00:00:00Z", updated_at: "2026-05-29T00:00:00Z",
    lines: [],
};

function base(extra: Record<string, unknown> = {}) {
    return {
        customer_name: "Acme Ltd", currency: "USD",
        vat_rate: 20, subtotal: 1000, vat_total: 200, grand_total: 1200,
        ...extra,
    };
}
function postReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/quotes", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
}
function patchReq(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/quotes/${QUOTE_ID}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
}
function ctx() { return { params: Promise.resolve({ id: QUOTE_ID }) }; }

beforeEach(() => {
    vi.clearAllMocks();
    mockDbCreateQuote.mockResolvedValue(fullRow);
    mockDbGetQuote.mockResolvedValue(fullRow);
    mockDbUpdateQuote.mockResolvedValue(fullRow);
});

// ─── POST /api/quotes — qty validator (V7-A11) ───────────────────────────────

describe("POST /api/quotes — qty validator", () => {
    it("gerçek satır küsüratlı qty (2.5) → 422 + dbCreateQuote çağrılmaz", async () => {
        const res = await POST(postReq(base({ lines: [{ product_id: "p-1", quantity: 2.5, unit_price: 100 }] })));
        expect(res.status).toBe(422);
        expect((await res.json()).error).toMatch(/pozitif tam sayı/i);
        expect(mockDbCreateQuote).not.toHaveBeenCalled();
    });

    it("gerçek satır qty=0 → 422", async () => {
        const res = await POST(postReq(base({ lines: [{ product_id: "p-1", quantity: 0, unit_price: 100 }] })));
        expect(res.status).toBe(422);
        expect(mockDbCreateQuote).not.toHaveBeenCalled();
    });

    it("gerçek satır qty=3 → 201 + dbCreateQuote çağrılır", async () => {
        const res = await POST(postReq(base({ lines: [{ product_id: "p-1", quantity: 3, unit_price: 100 }] })));
        expect(res.status).toBe(201);
        expect(mockDbCreateQuote).toHaveBeenCalled();
    });

    it("salt-açıklama satırı (qty 0, product/fiyat yok) → 201 (muaf)", async () => {
        const res = await POST(postReq(base({ lines: [{ product_id: null, quantity: 0, unit_price: 0, description: "Başlık" }] })));
        expect(res.status).toBe(201);
        expect(mockDbCreateQuote).toHaveBeenCalled();
    });

    it("fiyatı>0 ama product yok, küsüratlı qty → 422", async () => {
        const res = await POST(postReq(base({ lines: [{ product_id: null, quantity: 2.5, unit_price: 50 }] })));
        expect(res.status).toBe(422);
        expect(mockDbCreateQuote).not.toHaveBeenCalled();
    });
});

// ─── PATCH /api/quotes/[id] — document-update qty validator ───────────────────

describe("PATCH /api/quotes/[id] — document-update qty validator", () => {
    it("küsüratlı qty (2.5) → 422 + dbUpdateQuote çağrılmaz", async () => {
        const res = await PATCH(patchReq(base({ lines: [{ product_id: "p-1", quantity: 2.5, unit_price: 100 }] })), ctx());
        expect(res.status).toBe(422);
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
    });

    it("qty=3 → 200 + dbUpdateQuote çağrılır", async () => {
        const res = await PATCH(patchReq(base({ lines: [{ product_id: "p-1", quantity: 3, unit_price: 100 }] })), ctx());
        expect(res.status).toBe(200);
        expect(mockDbUpdateQuote).toHaveBeenCalled();
    });

    it("non-draft teklif → 409 (regression, qty kontrolüne varmadan)", async () => {
        mockDbGetQuote.mockResolvedValue({ ...fullRow, status: "sent" });
        const res = await PATCH(patchReq(base({ lines: [{ product_id: "p-1", quantity: 2.5, unit_price: 100 }] })), ctx());
        expect(res.status).toBe(409);
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
    });
});

// ─── PATCH transition branch — validationFailed mapping (V4-A2/V4-A4) ─────────

describe("PATCH /api/quotes/[id] — transition mapping", () => {
    it("validationFailed → 422", async () => {
        mockTransition.mockResolvedValue({ success: false, error: "Müşteri adresi girilmeli.", validationFailed: true });
        const res = await PATCH(patchReq({ transition: "sent" }), ctx());
        expect(res.status).toBe(422);
        expect((await res.json()).error).toMatch(/adres/i);
    });

    it("notFound → 404", async () => {
        mockTransition.mockResolvedValue({ success: false, error: "Teklif bulunamadı.", notFound: true });
        const res = await PATCH(patchReq({ transition: "sent" }), ctx());
        expect(res.status).toBe(404);
    });

    it("transition map ihlali (validationFailed yok) → 409", async () => {
        mockTransition.mockResolvedValue({ success: false, error: "geçirilemez" });
        const res = await PATCH(patchReq({ transition: "accepted" }), ctx());
        expect(res.status).toBe(409);
    });

    it("başarılı transition → 200", async () => {
        mockTransition.mockResolvedValue({ success: true });
        const res = await PATCH(patchReq({ transition: "sent" }), ctx());
        expect(res.status).toBe(200);
    });
});
