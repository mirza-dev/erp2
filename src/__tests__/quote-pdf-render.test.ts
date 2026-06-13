/**
 * Teklif PDF eki — gerçek render smoke testleri (@react-pdf/renderer).
 *
 * Mock YOK: renderQuotePdfBuffer gerçekten koşar (yoga layout + TTF font embed).
 * Amaç: Türkçe karakterli tam bir QuoteData'nın geçerli, dolu bir PDF üretmesini
 * ve kenar durumların (boş satır, logosuz) crash etmemesini kilitlemek.
 */
import { describe, it, expect } from "vitest";
import { renderQuotePdfBuffer, quotePdfFilename, resolvePdfLogo } from "@/lib/quote-pdf";
import type { QuoteData } from "@/app/dashboard/quotes/components/quote-types";

function makeQuoteData(overrides: Partial<QuoteData> = {}): QuoteData {
    return {
        sellerName: "PMT Endüstriyel Vana Sanayi ve Ticaret Ltd. Şti.",
        sellerTel: "0216 596 17 18",
        sellerEmail: "satis@example.com",
        sellerAddr: "Şeyhli Mah. Pendik / İstanbul",
        sellerTaxId: "7290567890",
        sellerWeb: "www.pmtendustriyel.com.tr",
        logoSrc: null,
        custCompany: "Çağlayan Isı Sistemleri A.Ş.",
        custContact: "Müdür Şükrü Öğütülmüş",
        custPhone: "0212 555 11 22",
        custEmail: "satinalma@example.com",
        custAddress: "Güneşli Mah. İğde Sok. No:3 Bağcılar / İstanbul",
        quoteNo: "TKL-2026-00042",
        quoteDate: "2026-06-13",
        validUntil: "2026-07-13",
        salesRep: "Işıl Gümüş",
        salesPhone: "0532 111 22 33",
        salesEmail: "isil@example.com",
        currency: "TRY",
        vatRate: 20,
        rows: [
            {
                code: "KV-3P-DN50", lead: "2-3 hafta", desc: "Küresel Vana ½″ Paslanmaz — şğİıçöü ĞŞÇÖÜ test",
                qty: "10", price: "1250.5", hs: "8481.80.81", kg: "3.4", size: "DN50",
            },
            { code: "", lead: "", desc: "", qty: "", price: "", hs: "", kg: "", size: "" },
        ],
        subtotal: 12505,
        discountAmount: 500,
        vatTotal: 2401,
        grandTotal: 14406,
        totalKg: 34,
        notes: "Fiyatlarımıza KDV dahil değildir.\nÖdeme: %50 peşin, %50 teslimatta.",
        deliveryMethod: "EXWORKS İstanbul",
        paymentMethod: "Havale / EFT",
        signatures: [
            { role: "Prepared by", roleTr: "Hazırlayan", name: "Işıl Gümüş", title: "" },
            { role: "Approved by", roleTr: "Onay", name: "", title: "" },
            { role: "Manager Seal", roleTr: "Mühür Onayı", name: "", title: "" },
        ],
        status: "sent",
        ...overrides,
    };
}

describe("renderQuotePdfBuffer (gerçek render)", () => {
    it("Türkçe karakterli dolu teklif → geçerli, dolu PDF üretir", async () => {
        const buf = await renderQuotePdfBuffer(makeQuoteData());
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        // Font embed edildiği için boş iskeletten belirgin büyük olmalı
        expect(buf.length).toBeGreaterThan(10 * 1024);
    }, 30000);

    it("satırsız + logosuz + opsiyonel alanlar boş → crash etmez, PDF üretir", async () => {
        const buf = await renderQuotePdfBuffer(makeQuoteData({
            rows: [],
            logoSrc: null,
            notes: "",
            deliveryMethod: "",
            paymentMethod: "",
            validUntil: "",
            discountAmount: 0,
            totalKg: 0,
        }));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }, 30000);

    it("USD para birimi ve iskontolu toplamlar render edilir", async () => {
        const buf = await renderQuotePdfBuffer(makeQuoteData({ currency: "USD" }));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }, 30000);
});

describe("quotePdfFilename", () => {
    it("teklif numarasını sanitize eder", () => {
        expect(quotePdfFilename("TKL-2026-00042")).toBe("Teklif-TKL-2026-00042.pdf");
        expect(quotePdfFilename("TKL 2026/42*ş")).toBe("Teklif-TKL-2026-42.pdf");
        expect(quotePdfFilename("")).toBe("Teklif-Belge.pdf");
    });
});

describe("resolvePdfLogo", () => {
    it("http olmayan / boş kaynak → null (fetch hiç denenmez)", async () => {
        expect(await resolvePdfLogo(null)).toBeNull();
        expect(await resolvePdfLogo("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBeNull();
    });
});
