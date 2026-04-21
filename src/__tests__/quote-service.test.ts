/**
 * Tests for quote-service.ts — transition validation, serviceTransitionQuote, serviceExpireQuotes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockDbGetQuote          = vi.fn();
const mockDbUpdateQuoteStatus = vi.fn();
const mockDbListExpiredQuotes = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbGetQuote:          (...args: unknown[]) => mockDbGetQuote(...args),
    dbUpdateQuoteStatus: (...args: unknown[]) => mockDbUpdateQuoteStatus(...args),
    dbListExpiredQuotes: (...args: unknown[]) => mockDbListExpiredQuotes(...args),
    dbListQuotes:        vi.fn(),
    dbCreateQuote:       vi.fn(),
    dbUpdateQuote:       vi.fn(),
    dbDeleteQuote:       vi.fn(),
    dbFindQuoteByNumber: vi.fn(),
}));

import {
    isValidQuoteTransition,
    serviceTransitionQuote,
    serviceExpireQuotes,
    serviceGetQuote,
} from "@/lib/services/quote-service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const QUOTE_ID = "quote-test-uuid";

const stubQuote = (status: string) => ({
    id: QUOTE_ID,
    quote_number: "TKL-2026-001",
    status,
    customer_name: "Acme Ltd",
    currency: "USD",
    grand_total: 1200,
    valid_until: null,
    created_at: "2026-04-21T10:00:00Z",
    updated_at: "2026-04-21T10:00:00Z",
    lines: [],
});

beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdateQuoteStatus.mockResolvedValue(true);
});

// ─── isValidQuoteTransition ──────────────────────────────────────────────────

describe("isValidQuoteTransition", () => {
    // Valid transitions
    it("draft → sent ✓", () => expect(isValidQuoteTransition("draft", "sent")).toBe(true));
    it("sent → accepted ✓", () => expect(isValidQuoteTransition("sent", "accepted")).toBe(true));
    it("sent → rejected ✓", () => expect(isValidQuoteTransition("sent", "rejected")).toBe(true));

    // Invalid from draft
    it("draft → accepted ✗", () => expect(isValidQuoteTransition("draft", "accepted")).toBe(false));
    it("draft → rejected ✗", () => expect(isValidQuoteTransition("draft", "rejected")).toBe(false));
    it("draft → expired ✗", () => expect(isValidQuoteTransition("draft", "expired")).toBe(false));

    // Invalid from sent
    it("sent → draft ✗", () => expect(isValidQuoteTransition("sent", "draft")).toBe(false));
    it("sent → expired ✗", () => expect(isValidQuoteTransition("sent", "expired")).toBe(false));

    // Terminal states
    it("accepted → sent ✗", () => expect(isValidQuoteTransition("accepted", "sent")).toBe(false));
    it("rejected → sent ✗", () => expect(isValidQuoteTransition("rejected", "sent")).toBe(false));
    it("expired → sent ✗", () => expect(isValidQuoteTransition("expired", "sent")).toBe(false));
    it("expired → draft ✗", () => expect(isValidQuoteTransition("expired", "draft")).toBe(false));
});

// ─── serviceTransitionQuote ──────────────────────────────────────────────────

describe("serviceTransitionQuote", () => {
    it("draft → sent başarılı: dbUpdateQuoteStatus çağrılır", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("draft"));
        const result = await serviceTransitionQuote(QUOTE_ID, "sent");
        expect(result.success).toBe(true);
        expect(mockDbUpdateQuoteStatus).toHaveBeenCalledWith(QUOTE_ID, "sent", "draft");
    });

    it("sent → accepted başarılı", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("sent"));
        const result = await serviceTransitionQuote(QUOTE_ID, "accepted");
        expect(result.success).toBe(true);
        expect(mockDbUpdateQuoteStatus).toHaveBeenCalledWith(QUOTE_ID, "accepted", "sent");
    });

    it("sent → rejected başarılı", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("sent"));
        const result = await serviceTransitionQuote(QUOTE_ID, "rejected");
        expect(result.success).toBe(true);
        expect(mockDbUpdateQuoteStatus).toHaveBeenCalledWith(QUOTE_ID, "rejected", "sent");
    });

    it("draft → accepted geçersiz: dbUpdateQuoteStatus çağrılmaz", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("draft"));
        const result = await serviceTransitionQuote(QUOTE_ID, "accepted");
        expect(result.success).toBe(false);
        expect(result.error).toContain("geçirilemez");
        expect(mockDbUpdateQuoteStatus).not.toHaveBeenCalled();
    });

    it("sent → draft (reverse) geçersiz", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("sent"));
        // "sent" as QuoteTransition would be wrong but testing the guard
        const result = await serviceTransitionQuote(QUOTE_ID, "sent" as "sent");
        // sent→sent is not in the map
        expect(result.success).toBe(false);
        expect(mockDbUpdateQuoteStatus).not.toHaveBeenCalled();
    });

    it("teklif bulunamadı → { success: false }", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const result = await serviceTransitionQuote(QUOTE_ID, "sent");
        expect(result.success).toBe(false);
        expect(result.error).toContain("bulunamadı");
        expect(mockDbUpdateQuoteStatus).not.toHaveBeenCalled();
    });

    it("terminal state (expired → sent) geçersiz", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("expired"));
        const result = await serviceTransitionQuote(QUOTE_ID, "sent");
        expect(result.success).toBe(false);
        expect(mockDbUpdateQuoteStatus).not.toHaveBeenCalled();
    });

    it("optimistic lock başarısız (DB false döndü) → { success: false, eşzamanlı }", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("draft"));
        mockDbUpdateQuoteStatus.mockResolvedValue(false);
        const result = await serviceTransitionQuote(QUOTE_ID, "sent");
        expect(result.success).toBe(false);
        expect(result.error).toContain("eşzamanlı");
    });
});

// ─── serviceExpireQuotes ─────────────────────────────────────────────────────

describe("serviceExpireQuotes", () => {
    it("boş liste → { expired: 0, expiredIds: [] }", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([]);
        const result = await serviceExpireQuotes();
        expect(result).toEqual({ expired: 0, expiredIds: [] });
        expect(mockDbUpdateQuoteStatus).not.toHaveBeenCalled();
    });

    it("1 draft expired → { expired: 1, expiredIds: ['q1'] }", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([{ id: "q1", status: "draft" }]);
        const result = await serviceExpireQuotes();
        expect(result).toEqual({ expired: 1, expiredIds: ["q1"] });
        expect(mockDbUpdateQuoteStatus).toHaveBeenCalledWith("q1", "expired", "draft");
    });

    it("1 sent expired → { expired: 1, expiredIds: ['q2'] }", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([{ id: "q2", status: "sent" }]);
        const result = await serviceExpireQuotes();
        expect(result).toEqual({ expired: 1, expiredIds: ["q2"] });
        expect(mockDbUpdateQuoteStatus).toHaveBeenCalledWith("q2", "expired", "sent");
    });

    it("mix: 2 draft + 1 sent → { expired: 3, expiredIds: ['q1','q2','q3'] }", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([
            { id: "q1", status: "draft" },
            { id: "q2", status: "draft" },
            { id: "q3", status: "sent" },
        ]);
        const result = await serviceExpireQuotes();
        expect(result).toEqual({ expired: 3, expiredIds: ["q1", "q2", "q3"] });
        expect(mockDbUpdateQuoteStatus).toHaveBeenCalledTimes(3);
    });

    it("optimistic lock başarısız → expiredIds'e eklenmez", async () => {
        mockDbListExpiredQuotes.mockResolvedValue([{ id: "q1", status: "sent" }]);
        mockDbUpdateQuoteStatus.mockResolvedValue(false);
        const result = await serviceExpireQuotes();
        expect(result).toEqual({ expired: 0, expiredIds: [] });
    });

    it("DB hatası → hata fırlatır", async () => {
        mockDbListExpiredQuotes.mockRejectedValue(new Error("DB error"));
        await expect(serviceExpireQuotes()).rejects.toThrow("DB error");
    });
});

// ─── serviceGetQuote ─────────────────────────────────────────────────────────

describe("serviceGetQuote", () => {
    it("dbGetQuote'a delege eder", async () => {
        const q = stubQuote("draft");
        mockDbGetQuote.mockResolvedValue(q);
        const result = await serviceGetQuote(QUOTE_ID);
        expect(result).toBe(q);
        expect(mockDbGetQuote).toHaveBeenCalledWith(QUOTE_ID);
    });
});
