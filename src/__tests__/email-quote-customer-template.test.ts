/**
 * renderQuoteToCustomer — müşteriye giden teklif e-postası şablonu.
 */
import { describe, it, expect } from "vitest";
import { renderQuoteToCustomer } from "@/lib/email/templates";

describe("renderQuoteToCustomer", () => {
    it("subject teklif numarasını içerir", () => {
        const c = renderQuoteToCustomer({ quoteNumber: "TKL-2026-001", customerName: "Acme Ltd" });
        expect(c.subject).toBe("Teklifimiz — TKL-2026-001");
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

    it("companyName verilince gönderen olarak görünür, yoksa Roven", () => {
        const withCo = renderQuoteToCustomer({ quoteNumber: "T", customerName: "X", companyName: "PMT A.Ş." });
        expect(withCo.html).toContain("PMT A.Ş.");
        const without = renderQuoteToCustomer({ quoteNumber: "T", customerName: "X" });
        expect(without.html).toContain("Roven");
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
});
