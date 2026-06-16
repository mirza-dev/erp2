import { describe, it, expect } from "vitest";
import { fmtRfqDate, RFQ_LABELS, type RfqDocData } from "@/lib/rfq-document-helpers";
import { renderRfqArchiveHtml } from "@/lib/rfq-archive-html";

describe("rfq-document-helpers", () => {
    it("fmtRfqDate ISO → DD.MM.YYYY (TZ kayması yok)", () => {
        expect(fmtRfqDate("2026-06-16")).toBe("16.06.2026");
        expect(fmtRfqDate("")).toBe("");
        expect(fmtRfqDate(null)).toBe("");
    });
    it("belge başlığı iki dilli", () => {
        expect(RFQ_LABELS.title).toMatch(/Fiyat Talebi/);
        expect(RFQ_LABELS.title).toMatch(/Request for Quotation/);
    });
});

describe("renderRfqArchiveHtml — belge render (fiyat YOK)", () => {
    const data: RfqDocData = {
        rfqNo: "RFQ-2026-0001",
        title: "DN50 vana",
        rfqDate: "2026-06-16",
        dueDate: "2026-06-30",
        currency: "TRY",
        notes: "Acil",
        sellerName: "PMT Endüstri",
        sellerTel: "", sellerEmail: "", sellerAddr: "", sellerTaxId: "", sellerWeb: "",
        logoSrc: null,
        vendorName: "ABC Vana Ltd.",
        vendorContact: "",
        vendorEmail: "abc@example.com",
        lines: [
            { position: 1, code: "KV-DN50", description: "Küresel Vana DN50", qty: "10", unit: "adet", targetDate: "2026-07-01", notes: "" },
        ],
    };

    it("self-contained HTML üretir; talep no + tedarikçi + kalem içerir, fiyat içermez", async () => {
        const html = await renderRfqArchiveHtml(data);
        expect(html).toMatch(/^<!doctype html>/i);
        expect(html).toContain("RFQ-2026-0001");
        expect(html).toContain("ABC Vana Ltd.");
        expect(html).toContain("Küresel Vana DN50");
        expect(html).toContain("10 adet");
        // Talep belgesinde fiyat sütunu yok
        expect(html).not.toMatch(/Birim Fiyat|Unit Price/);
    });
});
