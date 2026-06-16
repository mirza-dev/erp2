import { describe, it, expect } from "vitest";
import { rfqPdfFilename, renderRfqPdfBuffer } from "@/lib/rfq-pdf";
import type { RfqDocData } from "@/lib/rfq-document-helpers";

describe("rfq-pdf — dosya adı", () => {
    it("Fiyat-Talebi-<no>.pdf, güvenli karakter", () => {
        expect(rfqPdfFilename("RFQ-2026-0001")).toBe("Fiyat-Talebi-RFQ-2026-0001.pdf");
        expect(rfqPdfFilename("")).toBe("Fiyat-Talebi-Belge.pdf");
    });
});

describe("rfq-pdf — renderRfqPdfBuffer (gerçek PDF, fiyatsız)", () => {
    const data: RfqDocData = {
        rfqNo: "RFQ-2026-0001", title: "DN50 vana", rfqDate: "2026-06-16", dueDate: "2026-06-30",
        currency: "TRY", notes: "Acil",
        sellerName: "PMT Endüstri", sellerTel: "", sellerEmail: "", sellerAddr: "", sellerTaxId: "", sellerWeb: "",
        logoSrc: null,
        vendorName: "ABC Vana Ltd.", vendorContact: "", vendorEmail: "abc@example.com",
        lines: [{ position: 1, code: "KV-DN50", description: "Küresel Vana DN50", qty: "10", unit: "adet", targetDate: "2026-07-01", notes: "" }],
    };

    it("PDF buffer üretir (%PDF magic)", async () => {
        const buf = await renderRfqPdfBuffer(data);
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.length).toBeGreaterThan(1000);
    }, 30000);
});
