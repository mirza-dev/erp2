/**
 * Tests for GET + POST /api/quotes route handler.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockDbListQuotes  = vi.fn();
const mockDbCreateQuote = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbListQuotes:        (...args: unknown[]) => mockDbListQuotes(...args),
    dbCreateQuote:       (...args: unknown[]) => mockDbCreateQuote(...args),
    dbGetQuote:          vi.fn(),
    dbUpdateQuote:       vi.fn(),
    dbDeleteQuote:       vi.fn(),
    dbFindQuoteByNumber: vi.fn(),
}));

import { GET, POST } from "@/app/api/quotes/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const QUOTE_ID = "quote-test-uuid";

const stubQuoteRow = {
    id:            QUOTE_ID,
    quote_number:  "TKL-2026-001",
    status:        "draft",
    customer_name: "Acme Ltd",
    currency:      "USD",
    grand_total:   1200,
    quote_date:    "2026-04-21",
    valid_until:   null,
    created_at:    "2026-04-21T10:00:00Z",
    updated_at:    "2026-04-21T10:00:00Z",
};

const stubQuoteWithLines = {
    ...stubQuoteRow,
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

const validPostBody = {
    customer_name: "Acme Ltd",
    currency:      "USD",
    vat_rate:      20,
    subtotal:      1000,
    vat_total:     200,
    grand_total:   1200,
    lines:         [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGet(query = ""): NextRequest {
    return new NextRequest(`http://localhost/api/quotes${query ? `?${query}` : ""}`, { method: "GET" });
}

function makePost(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListQuotes.mockResolvedValue([]);
    mockDbCreateQuote.mockResolvedValue(stubQuoteWithLines);
});

// ─── GET /api/quotes ──────────────────────────────────────────────────────────

describe("GET /api/quotes", () => {
    it("boş tablo → 200, boş dizi döner", async () => {
        const res = await GET(makeGet());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([]);
    });

    it("teklif varsa QuoteSummary dizisi döner", async () => {
        mockDbListQuotes.mockResolvedValue([stubQuoteRow]);
        const res = await GET(makeGet());
        expect(res.status).toBe(200);
        const body = await res.json() as Array<{ id: string; quoteNumber: string }>;
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(QUOTE_ID);
        expect(body[0].quoteNumber).toBe("TKL-2026-001");
    });

    it("?status=draft → dbListQuotes({ status: 'draft' }) çağrılır", async () => {
        await GET(makeGet("status=draft"));
        expect(mockDbListQuotes).toHaveBeenCalledWith({ status: "draft" });
    });

    it("?status yoksa → dbListQuotes({}) çağrılır", async () => {
        await GET(makeGet());
        expect(mockDbListQuotes).toHaveBeenCalledWith({});
    });

    it("DB hatası → 500 döner", async () => {
        mockDbListQuotes.mockRejectedValue(new Error("DB hatası"));
        const res = await GET(makeGet());
        expect(res.status).toBe(500);
    });
});

// ─── POST /api/quotes ─────────────────────────────────────────────────────────

describe("POST /api/quotes", () => {
    it("geçerli payload → 201 ve QuoteDetail döner", async () => {
        const res = await POST(makePost(validPostBody));
        expect(res.status).toBe(201);
        const body = await res.json() as { id: string; quoteNumber: string };
        expect(body.id).toBe(QUOTE_ID);
        expect(body.quoteNumber).toBe("TKL-2026-001");
    });

    it("dbCreateQuote payload ile çağrılır", async () => {
        await POST(makePost(validPostBody));
        expect(mockDbCreateQuote).toHaveBeenCalledWith(
            expect.objectContaining({ customer_name: "Acme Ltd", currency: "USD" })
        );
    });

    it("başarılı kayıt → revalidateTag('quotes') çağrılır", async () => {
        await POST(makePost(validPostBody));
        expect(revalidateTag).toHaveBeenCalledWith("quotes", "max");
    });

    it("DB hatası → 500, revalidateTag çağrılmaz", async () => {
        mockDbCreateQuote.mockRejectedValue(new Error("RPC hatası"));
        const res = await POST(makePost(validPostBody));
        expect(res.status).toBe(500);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});
