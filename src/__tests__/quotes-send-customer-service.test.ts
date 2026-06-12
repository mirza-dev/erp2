/**
 * serviceSendQuoteToCustomer — teklif e-postası: EK YOK, gövdede süreli
 * "Teklifi Görüntüle" linki (/api/quotes/shared/<token>). Eski .html eki
 * Gmail PC'de ham kod görünüyordu — geri gelmemeli.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// serviceArchiveQuotePdf'in kullandığı arşiv DB katmanı (link üretimi arşive bağlı)
const mockGetArchive = vi.fn();
const mockArchiveStatus = vi.fn();
vi.mock("@/lib/supabase/quote-pdf-archives", () => ({
    dbGetQuoteArchive:    (...a: unknown[]) => mockGetArchive(...a),
    dbArchiveObjectStatus: (...a: unknown[]) => mockArchiveStatus(...a),
    dbCreateQuoteArchive: vi.fn(),
    dbDeleteQuoteArchive: vi.fn(),
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
    process.env.QUOTE_SHARE_SECRET = "test-share-secret";
    mockDbGetQuote.mockResolvedValue({ id: "q-1", quote_number: "TKL-2026-001", revision_no: 1 });
    mockMapDetail.mockReturnValue(DETAIL);
    mockGetArchive.mockResolvedValue({ id: "arch-1", file_path: "quotes/q-1/r1.html" });
    mockArchiveStatus.mockResolvedValue("present");
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

afterEach(() => {
    delete process.env.QUOTE_SHARE_SECRET;
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

    it("başarılı: EK YOK, gövdede /api/quotes/shared/ linki + email_logs sent", async () => {
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r).toEqual({ ok: true, messageId: "rs_1" });

        const sendArg = mockSendDirect.mock.calls[0][0];
        expect(sendArg.to).toBe("satinalma@acme.com");
        // .html eki dönemi kapandı (Gmail PC ham kod gösteriyordu) — geri gelmemeli
        expect(sendArg.attachments).toBeUndefined();
        // Belge süreli public linkle açılır (html + text her ikisinde)
        expect(sendArg.html).toContain("/api/quotes/shared/");
        expect(sendArg.html).toContain("Teklifi Görüntüle");
        expect(sendArg.text).toContain("/api/quotes/shared/");
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

    it("secret yokken e-posta yine gider — linksiz, yanıtlamaya yönlendirir", async () => {
        delete process.env.QUOTE_SHARE_SECRET;
        delete process.env.CRON_SECRET;
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r.ok).toBe(true);
        const sendArg = mockSendDirect.mock.calls[0][0];
        expect(sendArg.attachments).toBeUndefined();
        expect(sendArg.html).not.toContain("/api/quotes/shared/");
        expect(sendArg.html).toContain("yanıtlamanız yeterlidir");
    });

    it("arşiv üretilemezse (storage hatası) e-posta linksiz ama yine gider (non-fatal)", async () => {
        mockGetArchive.mockResolvedValue(null);          // arşiv yok
        mockArchiveStatus.mockResolvedValue("unknown");  // (kullanılmaz; create yolunda throw yok ama
        // dbCreateQuoteArchive vi.fn() → undefined döner; serviceArchiveQuotePdf render'a iner.
        mockRenderArchive.mockRejectedValue(new Error("render fail"));
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r.ok).toBe(true);
        const sendArg = mockSendDirect.mock.calls[0][0];
        expect(sendArg.html).not.toContain("/api/quotes/shared/");
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
