/**
 * Tests for GET + PATCH + DELETE /api/quotes/[id] route handler.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockDbGetQuote    = vi.fn();
const mockDbUpdateQuote = vi.fn();
const mockDbDeleteQuote = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbListQuotes:        vi.fn(),
    dbCreateQuote:       vi.fn(),
    dbGetQuote:          (...args: unknown[]) => mockDbGetQuote(...args),
    dbUpdateQuote:       (...args: unknown[]) => mockDbUpdateQuote(...args),
    dbDeleteQuote:       (...args: unknown[]) => mockDbDeleteQuote(...args),
    dbFindQuoteByNumber: vi.fn(),
    dbUpdateQuoteStatus: vi.fn(),
    dbListExpiredQuotes: vi.fn(),
}));

const mockServiceTransitionQuote = vi.fn();

vi.mock("@/lib/services/quote-service", () => ({
    serviceTransitionQuote: (...args: unknown[]) => mockServiceTransitionQuote(...args),
}));

import { GET, PATCH, DELETE } from "@/app/api/quotes/[id]/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const QUOTE_ID = "quote-test-uuid";

const stubQuote = {
    id:            QUOTE_ID,
    quote_number:  "TKL-2026-001",
    status:        "draft" as string,
    customer_name: "Acme Ltd",
    currency:      "USD",
    grand_total:   1200,
    quote_date:    "2026-04-21",
    valid_until:   null,
    created_at:    "2026-04-21T10:00:00Z",
    updated_at:    "2026-04-21T10:00:00Z",
    customer_id:      null,
    customer_contact: null,
    customer_phone:   null,
    customer_email:   null,
    sales_rep:        null,
    sales_phone:      null,
    sales_email:      null,
    vat_rate:         20,
    subtotal:         1000,
    vat_total:        200,
    notes:            null,
    sig_prepared:     null,
    sig_approved:     null,
    sig_manager:      null,
    lines:            [],
};

const validPatchBody = {
    customer_name: "Acme Ltd",
    currency:      "USD",
    vat_rate:      20,
    subtotal:      1000,
    vat_total:     200,
    grand_total:   1200,
    lines:         [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(method: string, body?: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/quotes/${QUOTE_ID}`, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body:    body ? JSON.stringify(body) : undefined,
    });
}

function idCtx() {
    return { params: Promise.resolve({ id: QUOTE_ID }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetQuote.mockResolvedValue(stubQuote);
    mockDbUpdateQuote.mockResolvedValue(stubQuote);
    mockDbDeleteQuote.mockResolvedValue(undefined);
});

// ─── GET /api/quotes/[id] ─────────────────────────────────────────────────────

describe("GET /api/quotes/[id]", () => {
    it("var olan teklif → 200 + QuoteDetail döner", async () => {
        const res = await GET(makeReq("GET"), idCtx());
        expect(res.status).toBe(200);
        const body = await res.json() as { id: string; quoteNumber: string };
        expect(body.id).toBe(QUOTE_ID);
        expect(body.quoteNumber).toBe("TKL-2026-001");
    });

    it("bulunamayan teklif → 404 döner", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const res = await GET(makeReq("GET"), idCtx());
        expect(res.status).toBe(404);
    });

    it("DB hatası → 500 döner", async () => {
        mockDbGetQuote.mockRejectedValue(new Error("DB hatası"));
        const res = await GET(makeReq("GET"), idCtx());
        expect(res.status).toBe(500);
    });
});

// ─── PATCH /api/quotes/[id] ───────────────────────────────────────────────────

describe("PATCH /api/quotes/[id]", () => {
    it("var olan teklif → 200 + güncel QuoteDetail döner", async () => {
        const res = await PATCH(makeReq("PATCH", validPatchBody), idCtx());
        expect(res.status).toBe(200);
        const body = await res.json() as { id: string };
        expect(body.id).toBe(QUOTE_ID);
    });

    it("bulunamayan teklif → 404, dbUpdateQuote çağrılmaz", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const res = await PATCH(makeReq("PATCH", validPatchBody), idCtx());
        expect(res.status).toBe(404);
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
    });

    it("başarılı güncelleme → revalidateTag çağrılır", async () => {
        await PATCH(makeReq("PATCH", validPatchBody), idCtx());
        expect(revalidateTag).toHaveBeenCalledWith("quotes", "max");
        expect(revalidateTag).toHaveBeenCalledWith(`quote-${QUOTE_ID}`, "max");
    });

    it("DB hatası → 500, revalidateTag çağrılmaz", async () => {
        mockDbUpdateQuote.mockRejectedValue(new Error("RPC hatası"));
        const res = await PATCH(makeReq("PATCH", validPatchBody), idCtx());
        expect(res.status).toBe(500);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── PATCH /api/quotes/[id] — status transitions ─────────────────────────────

describe("PATCH /api/quotes/[id] — status transitions", () => {
    it("draft → sent: 200 + güncel QuoteDetail", async () => {
        mockServiceTransitionQuote.mockResolvedValue({ success: true });
        mockDbGetQuote.mockResolvedValue({ ...stubQuote, status: "sent" });
        const res = await PATCH(makeReq("PATCH", { transition: "sent" }), idCtx());
        expect(res.status).toBe(200);
        expect(mockServiceTransitionQuote).toHaveBeenCalledWith(QUOTE_ID, "sent");
        const body = await res.json() as { status: string };
        expect(body.status).toBe("sent");
    });

    it("draft → accepted (geçersiz) → 409", async () => {
        mockServiceTransitionQuote.mockResolvedValue({
            success: false,
            error: "'draft' durumundaki teklif 'accepted' durumuna geçirilemez.",
        });
        const res = await PATCH(makeReq("PATCH", { transition: "accepted" }), idCtx());
        expect(res.status).toBe(409);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("geçirilemez");
    });

    it("sent → accepted: 200", async () => {
        mockServiceTransitionQuote.mockResolvedValue({ success: true });
        mockDbGetQuote.mockResolvedValue({ ...stubQuote, status: "accepted" });
        const res = await PATCH(makeReq("PATCH", { transition: "accepted" }), idCtx());
        expect(res.status).toBe(200);
    });

    it("sent → rejected: 200", async () => {
        mockServiceTransitionQuote.mockResolvedValue({ success: true });
        mockDbGetQuote.mockResolvedValue({ ...stubQuote, status: "rejected" });
        const res = await PATCH(makeReq("PATCH", { transition: "rejected" }), idCtx());
        expect(res.status).toBe(200);
    });

    it("teklif bulunamadı → 409", async () => {
        mockServiceTransitionQuote.mockResolvedValue({
            success: false,
            error: "Teklif bulunamadı.",
        });
        const res = await PATCH(makeReq("PATCH", { transition: "sent" }), idCtx());
        expect(res.status).toBe(409);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("bulunamadı");
    });

    it("başarılı transition → revalidateTag çağrılır", async () => {
        mockServiceTransitionQuote.mockResolvedValue({ success: true });
        mockDbGetQuote.mockResolvedValue({ ...stubQuote, status: "sent" });
        await PATCH(makeReq("PATCH", { transition: "sent" }), idCtx());
        expect(revalidateTag).toHaveBeenCalledWith("quotes", "max");
        expect(revalidateTag).toHaveBeenCalledWith(`quote-${QUOTE_ID}`, "max");
    });

    it("başarısız transition → revalidateTag çağrılmaz", async () => {
        mockServiceTransitionQuote.mockResolvedValue({ success: false, error: "hata" });
        await PATCH(makeReq("PATCH", { transition: "accepted" }), idCtx());
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── DELETE /api/quotes/[id] ──────────────────────────────────────────────────

describe("DELETE /api/quotes/[id]", () => {
    it("draft teklif → 200, ok:true döner", async () => {
        const res = await DELETE(makeReq("DELETE"), idCtx());
        expect(res.status).toBe(200);
        const body = await res.json() as { ok: boolean };
        expect(body.ok).toBe(true);
    });

    it("bulunamayan teklif → 404", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const res = await DELETE(makeReq("DELETE"), idCtx());
        expect(res.status).toBe(404);
    });

    it("status=accepted → 409, silinmez", async () => {
        mockDbGetQuote.mockResolvedValue({ ...stubQuote, status: "accepted" });
        const res = await DELETE(makeReq("DELETE"), idCtx());
        expect(res.status).toBe(409);
        expect(mockDbDeleteQuote).not.toHaveBeenCalled();
    });

    it("status=rejected → 409, silinmez", async () => {
        mockDbGetQuote.mockResolvedValue({ ...stubQuote, status: "rejected" });
        const res = await DELETE(makeReq("DELETE"), idCtx());
        expect(res.status).toBe(409);
        expect(mockDbDeleteQuote).not.toHaveBeenCalled();
    });

    it("status=expired → 409, silinmez", async () => {
        mockDbGetQuote.mockResolvedValue({ ...stubQuote, status: "expired" });
        const res = await DELETE(makeReq("DELETE"), idCtx());
        expect(res.status).toBe(409);
        expect(mockDbDeleteQuote).not.toHaveBeenCalled();
    });

    it("status=sent → 200, silinir", async () => {
        mockDbGetQuote.mockResolvedValue({ ...stubQuote, status: "sent" });
        const res = await DELETE(makeReq("DELETE"), idCtx());
        expect(res.status).toBe(200);
        expect(mockDbDeleteQuote).toHaveBeenCalledWith(QUOTE_ID);
    });

    it("başarılı silme → revalidateTag çağrılır", async () => {
        await DELETE(makeReq("DELETE"), idCtx());
        expect(revalidateTag).toHaveBeenCalledWith("quotes", "max");
        expect(revalidateTag).toHaveBeenCalledWith(`quote-${QUOTE_ID}`, "max");
    });
});
