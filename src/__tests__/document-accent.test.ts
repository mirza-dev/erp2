/**
 * Belge vurgu rengi (mig.112) — yardımcı + dört belge ailesinin renderı.
 *
 * 2026-09-18'e kadar `#0072BC` (PMT mavisi) 8 dosyada sabitti. Bu dosya iki şeyi
 * kilitler: (1) varsayılanda çıktı eskisiyle BİREBİR (PMT'de tek piksel değişmez),
 * (2) firma rengi verilince HİÇBİR belgede eski mavi kalmaz ve dışarıdan gelen değer
 * `<style>` metnine ancak `#RRGGBB` olarak girebilir.
 */
import { describe, it, expect } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    DEFAULT_DOCUMENT_ACCENT,
    MIN_ACCENT_CONTRAST,
    accentRgba,
    accentTint,
    contrastWithWhite,
    isHexColor,
    resolveDocumentAccent,
    validateDocumentAccent,
} from "@/lib/document-accent";
import QuoteDocument, { PRINT_CSS, quotePrintCss } from "@/app/dashboard/quotes/components/QuoteDocument";
import { buildQuoteDataFromDetail } from "@/lib/quote-archive-html";
import { buildRfqDocData, renderRfqArchiveHtml } from "@/lib/rfq-archive-html";
import type { QuoteData } from "@/app/dashboard/quotes/components/quote-types";
import type { QuoteDetail } from "@/lib/mock-data";
import type { CompanySettingsRow } from "@/lib/database.types";
import type { RfqDocData } from "@/lib/rfq-document-helpers";
import type { RfqDetail, RfqVendorWithPrices } from "@/lib/supabase/supplier-rfqs";

const NAVY = "#123F73";
const LEGACY_RGB = /0,\s*114,\s*188/;

function quoteData(accentColor?: string): QuoteData {
    return {
        sellerName: "Firma", sellerTel: "", sellerEmail: "", sellerAddr: "", sellerTaxId: "",
        sellerWeb: "", logoSrc: null, accentColor,
        custCompany: "Müşteri", custContact: "", custPhone: "", custEmail: "", custAddress: "",
        quoteNo: "TKL-2026-001", quoteDate: "2026-09-18", validUntil: "2026-10-18",
        salesRep: "", salesPhone: "", salesEmail: "", currency: "USD", vatRate: 20,
        rows: [{ code: "KV-1", lead: "2 hafta", desc: "Küresel Vana", qty: "5", price: "100",
            hs: "8481.80", kg: "", size: "", note: "Basınç testi", unit: "adet" }],
        subtotal: 500, discountAmount: 0, vatTotal: 100, grandTotal: 600, totalKg: 0,
        notes: "Genel not", deliveryMethod: "EXW", paymentMethod: "Peşin",
        signatures: [
            { role: "Prepared by", roleTr: "Hazırlayan", name: "", title: "" },
            { role: "Approved by", roleTr: "Onay", name: "", title: "" },
            { role: "Manager Seal", roleTr: "Mühür Onayı", name: "", title: "" },
        ],
        status: "sent",
    };
}

const renderQuote = (accentColor?: string) =>
    renderToStaticMarkup(createElement(QuoteDocument, { data: quoteData(accentColor) }));

describe("document-accent — çözümleme ve doğrulama", () => {
    it("geçerli #RRGGBB büyük harfe normalize edilir; varsayılan PMT mavisi", () => {
        expect(DEFAULT_DOCUMENT_ACCENT).toBe("#0072BC");
        expect(resolveDocumentAccent("#123f73")).toBe(NAVY);
        expect(resolveDocumentAccent(NAVY)).toBe(NAVY);
    });

    it("biçim dışı her değer varsayılana düşer (enjeksiyon kapısı)", () => {
        for (const bad of [undefined, null, "", "red", "#FFF", "#GGGGGG", "123F73", " #123F73",
            "#123F73;}</style><script>x</script>", 0x123f73, {}]) {
            expect(resolveDocumentAccent(bad), String(bad)).toBe(DEFAULT_DOCUMENT_ACCENT);
            expect(isHexColor(bad)).toBe(false);
        }
    });

    it("varsayılanda türetilen tonlar 2026-09-18 öncesi sabitlerle BİREBİR", () => {
        expect(accentRgba(DEFAULT_DOCUMENT_ACCENT, 0.08)).toBe("rgba(0,114,188,0.08)");
        expect(accentRgba(DEFAULT_DOCUMENT_ACCENT, 0.2)).toBe("rgba(0,114,188,0.2)");
        expect(accentRgba(DEFAULT_DOCUMENT_ACCENT, 0.05)).toBe("rgba(0,114,188,0.05)");
        expect(accentRgba(DEFAULT_DOCUMENT_ACCENT, 0.25)).toBe("rgba(0,114,188,0.25)");
        // PDF'teki eski düz sabit
        expect(accentTint(DEFAULT_DOCUMENT_ACCENT, 0.2)).toBe("#cce3f2");
    });

    it("özel renkte tonlar o renkten türer", () => {
        expect(accentRgba(NAVY, 0.2)).toBe("rgba(18,63,115,0.2)");
        expect(accentTint(NAVY, 0.2)).toBe("#d0d9e3");
    });

    it("beyaz yazı kontrastı: varsayılan ve lacivert geçer, sarı/pastel reddedilir", () => {
        expect(contrastWithWhite(DEFAULT_DOCUMENT_ACCENT)).toBeGreaterThan(5);
        expect(contrastWithWhite(NAVY)).toBeGreaterThan(10);
        expect(contrastWithWhite("#FF0000")).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
        expect(contrastWithWhite("#FFE600")).toBeLessThan(MIN_ACCENT_CONTRAST);
        expect(validateDocumentAccent(DEFAULT_DOCUMENT_ACCENT)).toBeNull();
        expect(validateDocumentAccent("#FF0000")).toBeNull();
        expect(validateDocumentAccent("#FFE600")).toMatch(/çok açık/);
        expect(validateDocumentAccent("#CCE3F2")).toMatch(/çok açık/);
        expect(validateDocumentAccent("mavi")).toMatch(/#RRGGBB/);
    });
});

describe("QuoteDocument (HTML + gömülü baskı CSS'i)", () => {
    it("varsayılan: eski mavi ve rgba tonları aynen basılır", () => {
        const html = renderQuote();
        expect(html).toContain("#0072BC");
        expect(html).toContain("rgba(0,114,188,0.2)");
        expect(html).toContain("background: #0072BC !important");
    });

    it("özel renk: markup ve baskı CSS'i firma rengini taşır, eski mavinin İZİ kalmaz", () => {
        const html = renderQuote(NAVY);
        expect(html).toContain(NAVY);
        expect(html).toContain("rgba(18,63,115,0.2)");
        expect(html).toContain(`background: ${NAVY} !important`);
        expect(html).toContain(`color: ${NAVY} !important`);
        expect(html.toUpperCase()).not.toContain("#0072BC");
        expect(html).not.toMatch(LEGACY_RGB);
    });

    it("küçük harfli ayar da aynı sonucu verir (tek biçim)", () => {
        expect(renderQuote("#123f73")).toBe(renderQuote(NAVY));
    });

    it("zararlı değer <style>'a sızmaz — varsayılana düşer", () => {
        const html = renderQuote("#123F73;}</style><script>alert(1)</script>");
        expect(html).not.toContain("<script>");
        expect(html).toContain("#0072BC");
    });

    it("PRINT_CSS dışa aktarımı varsayılan renkli baskı CSS'idir (geriye dönük)", () => {
        expect(PRINT_CSS).toBe(quotePrintCss(DEFAULT_DOCUMENT_ACCENT));
        expect(quotePrintCss(NAVY)).toContain(`background: ${NAVY} !important`);
    });
});

describe("Arşiv verisi (buildQuoteDataFromDetail) — gönderim anındaki firma rengi", () => {
    const detail = { currency: "USD", status: "sent", lines: [] } as unknown as QuoteDetail;

    it("firma rengi normalize edilerek QuoteData'ya geçer", () => {
        const company = { document_accent_color: "#123f73" } as CompanySettingsRow;
        expect(buildQuoteDataFromDetail(detail, company).accentColor).toBe(NAVY);
    });

    it("migration'sız DB (alan yok) ve firma satırı yok → varsayılan", () => {
        expect(buildQuoteDataFromDetail(detail, {} as CompanySettingsRow).accentColor).toBe(DEFAULT_DOCUMENT_ACCENT);
        expect(buildQuoteDataFromDetail(detail, null).accentColor).toBe(DEFAULT_DOCUMENT_ACCENT);
    });
});

describe("PurchaseOrderDocument — firma rengi", () => {
    const po = {
        id: "po-1", po_number: "PO-2026-0901", vendor_id: "v-1", status: "confirmed" as const,
        order_date: "2026-09-01", expected_date: "2026-09-10", currency: "TRY",
        subtotal: 1000, vat_rate: 20, vat_total: 200, grand_total: 1200, notes: null,
        sent_at: null, confirmed_at: "2026-09-01T10:00:00Z", cancelled_at: null, cancel_reason: null,
        created_by: "u", created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-01T09:00:00Z",
        lines: [{ id: "l-1", po_id: "po-1", product_id: "p-1", quantity: 10, unit_price: 100,
            discount_pct: 0, line_total: 1000, received_qty: 0, notes: null }],
    };

    async function renderPo(company: CompanySettingsRow | null): Promise<string> {
        const { default: PurchaseOrderDocument } = await import("@/components/purchase/PurchaseOrderDocument");
        return renderToStaticMarkup(React.createElement(PurchaseOrderDocument, {
            po, vendor: null, company, products: [{ id: "p-1", sku: "GV-DN50", name: "Gate Valve", unit: "adet" }],
        }));
    }

    it("firma satırı yok → varsayılan mavi", async () => {
        expect(await renderPo(null)).toContain("#0072BC");
    });

    it("firma rengi verilince eski mavi kalmaz", async () => {
        const html = await renderPo({ name: "Firma", document_accent_color: "#8b1e3f" } as CompanySettingsRow);
        expect(html).toContain("#8B1E3F");
        expect(html.toUpperCase()).not.toContain("#0072BC");
    });
});

describe("RFQ arşivi (HTML) — firma rengi sarmalayıcı CSS'ine ve belgeye girer", () => {
    const base: RfqDocData = {
        rfqNo: "RFQ-2026-0001", title: "DN50 vana", rfqDate: "2026-09-18", dueDate: "2026-09-30",
        currency: "TRY", notes: "", sellerName: "Firma", sellerTel: "", sellerEmail: "", sellerAddr: "",
        sellerTaxId: "", sellerWeb: "", logoSrc: null, vendorName: "ABC Vana", vendorContact: "",
        vendorEmail: "abc@example.com",
        lines: [{ position: 1, code: "KV-DN50", description: "Küresel Vana", qty: "10", unit: "adet", targetDate: "", notes: "" }],
    };

    it("özel renk: th zemini + başlıklar firma rengi, eski mavi yok", async () => {
        const html = await renderRfqArchiveHtml({ ...base, accentColor: NAVY });
        expect(html).toContain(`.rfq-doc th { background: ${NAVY};`);
        expect(html).toContain(`color:${NAVY}`);
        expect(html.toUpperCase()).not.toContain("#0072BC");
    });

    it("renk yoksa varsayılan", async () => {
        const html = await renderRfqArchiveHtml(base);
        expect(html).toContain(".rfq-doc th { background: #0072BC;");
    });

    it("buildRfqDocData firma rengini taşır", () => {
        const detail = { rfq_number: "RFQ-1", title: null, rfq_date: "2026-09-18", due_date: null,
            currency: "TRY", notes: null, lines: [] } as unknown as RfqDetail;
        const vendor = { vendor_name: "ABC", vendor_email: null } as unknown as RfqVendorWithPrices;
        const company = { name: "Firma", document_accent_color: "#123f73" } as CompanySettingsRow;
        expect(buildRfqDocData(detail, vendor, company).accentColor).toBe(NAVY);
        expect(buildRfqDocData(detail, vendor, null).accentColor).toBe(DEFAULT_DOCUMENT_ACCENT);
    });
});

describe("PDF belgeleri — marka stilleri renkten türer", () => {
    it("teklif PDF: varsayılanda eski değerler, özel renkte yeni renk", async () => {
        const { brandStyles } = await import("@/lib/quote-pdf/QuotePdfDocument");
        const d = brandStyles(DEFAULT_DOCUMENT_ACCENT);
        expect(d.headRow.backgroundColor).toBe("#0072BC");
        expect(d.metaSectionHead.borderBottomColor).toBe("#cce3f2");
        const n = brandStyles("#123f73");
        for (const key of ["headerBand", "headRow"] as const) expect(n[key].backgroundColor).toBe(NAVY);
        for (const key of ["titleText", "metaSectionHead", "tableLabel", "noteLabel", "sectionHead"] as const) {
            expect(n[key].color).toBe(NAVY);
        }
        expect(n.noteRow.borderLeftColor).toBe(NAVY);
        expect(n.metaSectionHead.borderBottomColor).toBe("#d0d9e3");
        expect(brandStyles("kötü değer").brand).toBe(DEFAULT_DOCUMENT_ACCENT);
    });

    it("RFQ PDF: başlıklar ve tablo başlığı firma rengi", async () => {
        const { rfqBrandStyles } = await import("@/lib/rfq-pdf/RfqPdfDocument");
        const b = rfqBrandStyles("#123f73");
        expect(b.th.backgroundColor).toBe(NAVY);
        expect(b.title.color).toBe(NAVY);
        expect(b.sellerName.color).toBe(NAVY);
    });

    it("özel renkle gerçek teklif PDF'i üretilir (react-pdf rengi kabul eder)", async () => {
        const { renderQuotePdfBuffer } = await import("@/lib/quote-pdf");
        const buf = await renderQuotePdfBuffer(quoteData(NAVY));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.length).toBeGreaterThan(10_000);
    }, 30_000);
});
