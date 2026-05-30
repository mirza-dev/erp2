/**
 * Faz 4 (V7) — Teklif PDF arşivi: buildQuoteDataFromDetail + renderQuoteArchiveHtml.
 *
 * renderQuoteArchiveHtml testi aynı zamanda Phase 0 doğrulamasıdır: QuoteDocument
 * "use client" KALDIRILDIĞI için server-side renderToStaticMarkup GERÇEK markup üretir
 * (client-reference proxy → boş çıktı riski ortadan kalktı).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildQuoteDataFromDetail, renderQuoteArchiveHtml } from "@/lib/quote-archive-html";
import type { QuoteDetail, QuoteLineItem } from "@/lib/mock-data";
import type { CompanySettingsRow } from "@/lib/database.types";

function makeLine(over: Partial<QuoteLineItem> = {}): QuoteLineItem {
    return {
        id: "l1",
        position: 1,
        productId: "p1",
        productCode: "KV-3P-DN50",
        leadTime: "4 hafta",
        description: "3 Parçalı Küresel Vana DN50",
        quantity: 10,
        unitPrice: 450,
        lineTotal: 4500,
        hsCode: "8481.80",
        weightKg: 12.5,
        sizeText: "DN50",
        unitWeightKg: 1.25,
        kgManualOverride: false,
        ...over,
    };
}

function makeDetail(over: Partial<QuoteDetail> = {}): QuoteDetail {
    return {
        id: "q1",
        quoteNumber: "TKL-2026-001",
        status: "sent",
        customerName: "Tüpraş",
        currency: "USD",
        grandTotal: 5400,
        quoteDate: "2026-05-30",
        validUntil: "2026-06-30",
        createdAt: "2026-05-30T10:00:00Z",
        revisionNo: 1,
        rootQuoteId: null,
        customerId: "c1",
        customerContact: "Ali Veli",
        customerPhone: "+90 555 111 22 33",
        customerEmail: "ali@tupras.com",
        customerAddress: "İzmit",
        salesRep: "Mehmet",
        salesPhone: "+90 555 444 55 66",
        salesEmail: "mehmet@pmt.com",
        vatRate: 20,
        subtotal: 4500,
        vatTotal: 900,
        discountAmount: 0,
        notes: "Özel koşullar",
        sigPrepared: "Hazırlayan A",
        sigApproved: "Onay B",
        sigManager: "Müdür C",
        deliveryMethod: "EXWORKS PMT İSTANBUL",
        paymentMethod: "%50 AVANS",
        sellerName: "PMT Endüstri A.Ş.",
        sellerPhone: "+90 212 000 00 00",
        sellerEmail: "info@pmt.com",
        sellerAddress: "İstanbul",
        sellerTaxId: "1234567890",
        sellerWebsite: "pmt.com",
        sellerLogoUrl: "",
        lines: [makeLine()],
        ...over,
    };
}

const COMPANY: CompanySettingsRow = {
    id: "1",
    name: "PMT (company)",
    tax_office: "Beşiktaş",
    tax_no: "9999999999",
    address: "Şirket Adresi",
    phone: "+90 212 999",
    email: "company@pmt.com",
    website: "company.pmt.com",
    logo_url: "https://cdn.pmt.com/logo.png",
    currency: "USD",
    quote_number_prefix: "TKL",
    quote_number_separator: "-",
    updated_at: "2026-05-30T00:00:00Z",
};

describe("buildQuoteDataFromDetail", () => {
    it("seller snapshot dolu → quote'tan alır (company fallback'e düşmez)", () => {
        const d = buildQuoteDataFromDetail(makeDetail(), COMPANY);
        expect(d.sellerName).toBe("PMT Endüstri A.Ş.");
        expect(d.sellerTaxId).toBe("1234567890");
        expect(d.sellerEmail).toBe("info@pmt.com");
    });

    it("seller snapshot boş → company_settings fallback", () => {
        const d = buildQuoteDataFromDetail(
            makeDetail({ sellerName: "", sellerEmail: "", sellerAddress: "", sellerTaxId: "", sellerWebsite: "", sellerPhone: "", sellerLogoUrl: "" }),
            COMPANY,
        );
        expect(d.sellerName).toBe("PMT (company)");
        expect(d.sellerTaxId).toBe("9999999999");
        expect(d.logoSrc).toBe("https://cdn.pmt.com/logo.png");
    });

    it("company yoksa boş seller → boş string / null logo (QuoteDocument handle eder)", () => {
        const d = buildQuoteDataFromDetail(makeDetail({ sellerName: "", sellerLogoUrl: "" }), null);
        expect(d.sellerName).toBe("");
        expect(d.logoSrc).toBeNull();
    });

    it("header iskonto (discountAmount) taşınır; totals DB snapshot'tan", () => {
        const d = buildQuoteDataFromDetail(makeDetail({ discountAmount: 250, subtotal: 4500, vatTotal: 850, grandTotal: 5100 }), null);
        expect(d.discountAmount).toBe(250);
        expect(d.subtotal).toBe(4500);
        expect(d.vatTotal).toBe(850);
        expect(d.grandTotal).toBe(5100);
    });

    it("satır eşlemesi: code/size/lead/qty/price + weightKg → kg string", () => {
        const d = buildQuoteDataFromDetail(makeDetail(), null);
        expect(d.rows[0]).toMatchObject({
            code: "KV-3P-DN50",
            size: "DN50",
            lead: "4 hafta",
            qty: "10",
            price: "450",
            hs: "8481.80",
            kg: "12.5",
        });
    });

    it("weightKg null → kg boş string; totalKg = satır weightKg toplamı", () => {
        const d = buildQuoteDataFromDetail(
            makeDetail({ lines: [makeLine({ weightKg: null }), makeLine({ id: "l2", weightKg: 7.5 })] }),
            null,
        );
        expect(d.rows[0].kg).toBe("");
        expect(d.totalKg).toBe(7.5);
    });

    it("bilinmeyen currency → TRY; status 'revised' → 'sent' (defansif map)", () => {
        const d = buildQuoteDataFromDetail(makeDetail({ currency: "GBP", status: "revised" }), null);
        expect(d.currency).toBe("TRY");
        expect(d.status).toBe("sent");
    });

    // Bulgu 1 (2. review tur): müşteri adresi (gönderimde zorunlu) belgeye taşınır.
    it("custAddress: detail.customerAddress'ten alınır; boş → boş string", () => {
        expect(buildQuoteDataFromDetail(makeDetail(), null).custAddress).toBe("İzmit");
        expect(buildQuoteDataFromDetail(makeDetail({ customerAddress: "" }), null).custAddress).toBe("");
    });
});

describe("renderQuoteArchiveHtml (Phase 0: server-side gerçek render)", () => {
    let html = "";
    beforeAll(async () => {
        html = await renderQuoteArchiveHtml(buildQuoteDataFromDetail(makeDetail(), null));
    });

    it("gerçek markup üretir (boş/placeholder değil) — doctype + quote-document + içerik", () => {
        expect(html).toMatch(/^<!doctype html>/i);
        expect(html).toContain('id="quote-document"');
        expect(html).toContain("TKL-2026-001");
        expect(html).toContain("KV-3P-DN50");
        // boş client-reference değil → anlamlı uzunluk
        expect(html.length).toBeGreaterThan(2000);
    });

    it("font self-containment: :root --font-doc-* + Google Fonts link gömülü", () => {
        expect(html).toContain("--font-doc-heading");
        expect(html).toContain("--font-doc-body");
        expect(html).toMatch(/fonts\.googleapis\.com\/css2\?family=Montserrat/);
    });

    it("PAGE_CSS A4 portrait gömülü", () => {
        expect(html).toMatch(/@page[\s\S]{0,40}A4 portrait/);
    });

    it("renkler concrete hex (PMT brand #0072BC) — CSS var'a bağımlı değil", () => {
        expect(html).toContain("#0072BC");
    });

    it("uygulama tema CSS var'ları SIZMAZ (standalone'da çözülmez olurdu)", () => {
        expect(html).not.toContain("var(--bg-primary)");
        expect(html).not.toContain("var(--text-primary)");
        expect(html).not.toContain("var(--accent)");
    });

    // Bulgu 1 (2. review tur): müşteri adresi + bilingual Adres/Address etiketi belgede.
    it("müşteri adresi dolu → değer + 'Adres'/'Address' bilingual etiket render edilir", () => {
        expect(html).toContain("İzmit");
        expect(html).toContain("Adres");
        expect(html).toContain("Address");
    });

    it("müşteri adresi boş → adres satırı render edilmez", async () => {
        const noAddr = await renderQuoteArchiveHtml(buildQuoteDataFromDetail(makeDetail({ customerAddress: "" }), null));
        expect(noAddr).not.toContain("İzmit");
    });
});

describe("V3-B6 — 0 fiyat '0.00' (içerikli satırda '—' değil)", () => {
    it("gerçek satırda unitPrice 0 → fiyat '0,00' (tr-TR) render edilir", async () => {
        const data = buildQuoteDataFromDetail(
            makeDetail({ lines: [makeLine({ unitPrice: 0, lineTotal: 0, description: "Numune kalem" })] }),
            null,
        );
        const html = await renderQuoteArchiveHtml(data);
        expect(html).toContain("Numune kalem");
        expect(html).toContain("0,00");
    });
});
