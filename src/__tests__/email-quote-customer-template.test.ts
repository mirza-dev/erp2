/**
 * renderQuoteToCustomer — müşteriye giden teklif e-postası şablonu.
 */
import { describe, it, expect } from "vitest";
import { renderQuoteToCustomer } from "@/lib/email/templates";

describe("renderQuoteToCustomer", () => {
    it("subject teklif numarasını içerir", () => {
        const c = renderQuoteToCustomer({ quoteNumber: "TKL-2026-001", customerName: "Acme Ltd" });
        expect(c.subject).toBe("Teklif · TKL-2026-001");
    });

    it("gövde müşteri adı + teklif no içerir", () => {
        const c = renderQuoteToCustomer({ quoteNumber: "TKL-2026-001", customerName: "Acme Ltd" });
        expect(c.html).toContain("Acme Ltd");
        expect(c.html).toContain("TKL-2026-001");
        expect(c.text).toContain("Acme Ltd");
    });

    it("validUntil verilince geçerlilik tarihi (tr-TR) render edilir", () => {
        const c = renderQuoteToCustomer({ quoteNumber: "TKL-1", customerName: "X", validUntil: "2026-06-25" });
        expect(c.html).toContain("25.06.2026");
        expect(c.text).toContain("25.06.2026");
    });

    it("validUntil yoksa geçerlilik satırı hiç görünmez", () => {
        const c = renderQuoteToCustomer({ quoteNumber: "TKL-1", customerName: "X" });
        expect(c.html).not.toContain("Geçerlilik Tarihi");
    });

    it("companyName verilince konu ve gövdede görünür; yoksa güvenli fallback kullanılır", () => {
        const withCo = renderQuoteToCustomer({ quoteNumber: "T", customerName: "X", companyName: "PMT A.Ş." });
        expect(withCo.html).toContain("PMT A.Ş.");
        expect(withCo.subject).toBe("PMT A.Ş. | Teklif · T");
        const without = renderQuoteToCustomer({ quoteNumber: "T", customerName: "X" });
        expect(without.html).toContain(">Teklif<");
        expect(without.html).not.toContain("Roven");
    });

    it("XSS: müşteri adı escape edilir", () => {
        const c = renderQuoteToCustomer({ quoteNumber: "T", customerName: "<script>alert(1)</script>" });
        expect(c.html).not.toContain("<script>alert(1)</script>");
        expect(c.html).toContain("&lt;script&gt;");
    });

    it("müşteriye giden e-postada dashboard 'bildirim tercihleri' footer'ı YOK", () => {
        const c = renderQuoteToCustomer({ quoteNumber: "T", customerName: "X" });
        expect(c.html).not.toContain("/dashboard/settings");
        expect(c.html).not.toContain("bildirim tercihlerinizden");
    });

    it("firma logosu ve kompakt iletişim bilgileri render edilir", () => {
        const c = renderQuoteToCustomer({
            quoteNumber: "T",
            customerName: "X",
            companyName: "PMT A.Ş.",
            companyLogoUrl: "https://example.com/logo.png",
            companyPhone: "+90 212 555 01 23",
            companyEmail: "teklif@example.com",
            companyWebsite: "https://example.com",
        });
        expect(c.html).toContain('src="https://example.com/logo.png"');
        expect(c.html).toContain("+90 212 555 01 23");
        expect(c.html).toContain("teklif@example.com");
        expect(c.html).toContain("https://example.com");
        expect(c.html).not.toContain("Roven");
    });

    it("güvenilmeyen logo URL'sini img src olarak render etmez", () => {
        const c = renderQuoteToCustomer({
            quoteNumber: "T",
            customerName: "X",
            companyName: "PMT",
            companyLogoUrl: "javascript:alert(1)",
        });
        expect(c.html).not.toContain("<img");
        expect(c.html).not.toContain("javascript:");
    });

    it("finansal toplam ve kırılgan flex layout içermez", () => {
        const c = renderQuoteToCustomer({ quoteNumber: "T", customerName: "X", companyName: "PMT" });
        expect(c.html).not.toContain("Genel Toplam");
        expect(c.html).not.toContain("display:flex");
        expect(c.html).toContain('role="presentation"');
    });
});
