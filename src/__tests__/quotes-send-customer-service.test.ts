/**
 * serviceSendQuoteToCustomer — teklif belgesini müşteriye HTML ek olarak gönderir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbGetQuote = vi.fn();
vi.mock("@/lib/supabase/quotes", () => ({
    dbGetQuote:                 (...a: unknown[]) => mockDbGetQuote(...a),
    dbUpdateQuoteStatus:        vi.fn(),
    dbListExpiredQuotes:        vi.fn(),
    dbCreateQuoteRevision:      vi.fn(),
    dbAcceptQuoteAndCreateOrder: vi.fn(),
}));

const mockGetCompany = vi.fn();
vi.mock("@/lib/supabase/company-settings", () => ({
    dbGetCompanySettings: (...a: unknown[]) => mockGetCompany(...a),
}));

const mockRenderArchive = vi.fn();
vi.mock("@/lib/quote-archive-html", () => ({
    buildQuoteDataFromDetail: vi.fn(() => ({ stub: true })),
    renderQuoteArchiveHtml:   (...a: unknown[]) => mockRenderArchive(...a),
}));

const mockMapDetail = vi.fn();
vi.mock("@/lib/api-mappers", () => ({
    mapQuoteDetail: (...a: unknown[]) => mockMapDetail(...a),
}));

const mockSendDirect = vi.fn();
vi.mock("@/lib/services/email-service", () => ({
    sendDirectEmail: (...a: unknown[]) => mockSendDirect(...a),
}));

const mockCreateLog = vi.fn();
const mockUpdateLog = vi.fn();
vi.mock("@/lib/supabase/email-logs", () => ({
    dbCreateEmailLog:      (...a: unknown[]) => mockCreateLog(...a),
    dbUpdateEmailLogStatus: (...a: unknown[]) => mockUpdateLog(...a),
}));

const mockFindSuppression = vi.fn();
vi.mock("@/lib/supabase/email-maintenance", () => ({
    dbFindActiveSuppression: (...a: unknown[]) => mockFindSuppression(...a),
}));

import { serviceSendQuoteToCustomer } from "@/lib/services/quote-service";

const DETAIL = {
    quoteNumber: "TKL-2026-001",
    customerName: "Acme Ltd",
    customerEmail: "satinalma@acme.com",
    validUntil: "2026-06-25",
    lines: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetQuote.mockResolvedValue({ id: "q-1", quote_number: "TKL-2026-001" });
    mockMapDetail.mockReturnValue(DETAIL);
    mockGetCompany.mockResolvedValue({
        name: "PMT A.Ş.",
        logo_url: "https://example.com/logo.png",
        phone: "+90 212 555 01 23",
        email: "teklif@pmt.example",
        website: "https://pmt.example",
    });
    mockRenderArchive.mockResolvedValue("<html>BELGE</html>");
    mockSendDirect.mockResolvedValue({ ok: true, messageId: "rs_1" });
    mockCreateLog.mockResolvedValue("log-1");
    mockUpdateLog.mockResolvedValue(undefined);
    mockFindSuppression.mockResolvedValue(null);
});

describe("serviceSendQuoteToCustomer", () => {
    it("teklif yok → notFound", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const r = await serviceSendQuoteToCustomer("q-x", "actor-1");
        expect(r).toEqual({ ok: false, notFound: true });
        expect(mockSendDirect).not.toHaveBeenCalled();
    });

    it("müşteri e-postası yok → no_email, gönderim atılmaz", async () => {
        mockMapDetail.mockReturnValue({ ...DETAIL, customerEmail: "" });
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r).toEqual({ ok: false, reason: "no_email" });
        expect(mockSendDirect).not.toHaveBeenCalled();
    });

    it("geçersiz e-posta formatı → no_email", async () => {
        mockMapDetail.mockReturnValue({ ...DETAIL, customerEmail: "bozuk-adres" });
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r.reason).toBe("no_email");
    });

    it("bounce/complaint suppression varsa teklif e-postası gönderilmez", async () => {
        mockFindSuppression.mockResolvedValue({ id: "sup-1" });
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r).toEqual({ ok: false, reason: "suppressed" });
        expect(mockSendDirect).not.toHaveBeenCalled();
    });

    it("başarılı: arşiv HTML'i ek olarak gönderilir + email_logs sent", async () => {
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r).toEqual({ ok: true, messageId: "rs_1" });

        // Belge HTML'i ek olarak iletildi
        const sendArg = mockSendDirect.mock.calls[0][0];
        expect(sendArg.to).toBe("satinalma@acme.com");
        expect(sendArg.attachments[0].filename).toBe("Teklif-TKL-2026-001.html");
        expect(Buffer.isBuffer(sendArg.attachments[0].content)).toBe(true);
        expect(sendArg.attachments[0].content.toString("utf-8")).toBe("<html>BELGE</html>");
        expect(sendArg.replyTo).toBe("teklif@pmt.example");
        expect(sendArg.idempotencyKey).toBe("quote-email-log-log-1");
        expect(sendArg.html).toContain("PMT A.Ş.");
        expect(sendArg.html).not.toContain("Roven");

        // Log pending → sent
        expect(mockCreateLog).toHaveBeenCalledWith(expect.objectContaining({
            notification_type: "quote_customer_send",
            entity_type: "quote",
            entity_id: "q-1",
            recipient_email: "satinalma@acme.com",
        }));
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "sent", { resend_message_id: "rs_1" });
    });

    it("firma e-postası geçersizse replyTo gönderilmez", async () => {
        mockGetCompany.mockResolvedValue({ name: "PMT A.Ş.", email: "geçersiz" });
        await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(mockSendDirect.mock.calls[0][0].replyTo).toBeUndefined();
    });

    it("Resend fail → ok:false + email_logs failed", async () => {
        mockSendDirect.mockResolvedValue({ ok: false, error: "Bounce" });
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r).toEqual({ ok: false, error: "Bounce" });
        expect(mockUpdateLog).toHaveBeenCalledWith("log-1", "failed", { error: "Bounce" });
    });

    it("config_missing → ok:false error iletilir (route 503'e map'ler)", async () => {
        mockSendDirect.mockResolvedValue({ ok: false, error: "config_missing" });
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r.ok).toBe(false);
        expect(r.error).toBe("config_missing");
    });

    it("log create fail olsa bile gönderim yine denenir (best-effort audit)", async () => {
        mockCreateLog.mockRejectedValue(new Error("db down"));
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r.ok).toBe(true);
        expect(mockSendDirect).toHaveBeenCalled();
        expect(mockUpdateLog).not.toHaveBeenCalled();  // logId null → update atlanır
    });
});
