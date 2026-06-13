/**
 * serviceSendQuoteToCustomer — teklif e-postası: belge GERÇEK PDF eki olarak
 * gider (Teklif-<no>.pdf, kullanıcı kararı 2026-06). "Teklifi Görüntüle" linki
 * ve ham .html eki dönemleri kapandı — geri gelmemeli. PDF üretilemezse
 * gönderim FAIL (belgesiz mail müşteriye gitmez).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

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
const mockBuildData = vi.fn();
vi.mock("@/lib/quote-archive-html", () => ({
    buildQuoteDataFromDetail: (...a: unknown[]) => mockBuildData(...a),
    renderQuoteArchiveHtml:   (...a: unknown[]) => mockRenderArchive(...a),
}));

// PDF üretimi mock'lanır — gerçek render quote-pdf-render.test.ts'te kilitli.
const mockRenderPdf = vi.fn();
const mockPdfFilename = vi.fn();
vi.mock("@/lib/quote-pdf", () => ({
    renderQuotePdfBuffer: (...a: unknown[]) => mockRenderPdf(...a),
    quotePdfFilename:     (...a: unknown[]) => mockPdfFilename(...a),
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

// serviceArchiveQuotePdf'in kullandığı arşiv DB katmanı (audit arşivi send'de sürer)
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

const PDF_STUB = Buffer.from("%PDF-1.4 stub icerik");

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetQuote.mockResolvedValue({ id: "q-1", quote_number: "TKL-2026-001", revision_no: 1 });
    mockMapDetail.mockReturnValue(DETAIL);
    mockBuildData.mockReturnValue({ stub: true });
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
    mockRenderPdf.mockResolvedValue(PDF_STUB);
    mockPdfFilename.mockReturnValue("Teklif-TKL-2026-001.pdf");
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
        expect(mockRenderPdf).not.toHaveBeenCalled();
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

    it("başarılı: Teklif-<no>.pdf eki + gövdede link YOK + email_logs sent", async () => {
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r).toEqual({ ok: true, messageId: "rs_1" });

        // PDF, detail+company'den kurulan QuoteData ile üretilir
        expect(mockBuildData).toHaveBeenCalledWith(DETAIL, expect.objectContaining({ name: "PMT A.Ş." }));
        expect(mockRenderPdf).toHaveBeenCalledWith({ stub: true });

        const sendArg = mockSendDirect.mock.calls[0][0];
        expect(sendArg.to).toBe("satinalma@acme.com");
        // Belge gerçek PDF eki olarak gider
        expect(sendArg.attachments).toEqual([
            { filename: "Teklif-TKL-2026-001.pdf", content: PDF_STUB },
        ]);
        // Link ve ham .html dönemleri kapandı — gövdede geri gelmemeli
        expect(sendArg.html).not.toContain("/api/quotes/shared/");
        expect(sendArg.html).not.toContain("Teklifi Görüntüle");
        expect(sendArg.text).not.toContain("/api/quotes/shared/");
        // Gövde eki anlatır (dosya adıyla)
        expect(sendArg.html).toContain("ekinde PDF olarak");
        expect(sendArg.html).toContain("Teklif-TKL-2026-001.pdf");
        expect(sendArg.text).toContain("ekinde PDF olarak");
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

    it("PDF üretilemezse gönderim FAIL — belgesiz mail gitmez, log açılmaz", async () => {
        mockRenderPdf.mockRejectedValue(new Error("yoga patladı"));
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r).toEqual({ ok: false, reason: "pdf_failed" });
        expect(mockSendDirect).not.toHaveBeenCalled();
        expect(mockCreateLog).not.toHaveBeenCalled();
    });

    it("arşiv üretilemezse (storage hatası) gönderim YİNE sürer — arşiv non-fatal audit", async () => {
        mockGetArchive.mockResolvedValue(null);
        mockArchiveStatus.mockResolvedValue("unknown");
        mockRenderArchive.mockRejectedValue(new Error("render fail"));
        const r = await serviceSendQuoteToCustomer("q-1", "actor-1");
        expect(r.ok).toBe(true);
        expect(mockSendDirect.mock.calls[0][0].attachments).toHaveLength(1);
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

describe("kaynak kilitleri — link dönemi e-posta yoluna geri gelmez", () => {
    const SRC = readFileSync("src/lib/services/quote-service.ts", "utf8");

    it("quote-service e-posta yolunda share-token üretimi YOK", () => {
        expect(SRC).not.toMatch(/^\s*import\b.*quote-share-token/m);
        expect(SRC).not.toContain("createQuoteShareToken(");
    });

    it("audit HTML arşivi send akışında DURUYOR (silinmedi)", () => {
        expect(SRC).toContain("serviceArchiveQuotePdf(quoteId, actorUserId)");
    });

    it("PDF modülü lazy import edilir (cold-start koruması)", () => {
        expect(SRC).toMatch(/await import\("@\/lib\/quote-pdf"\)/);
    });
});
