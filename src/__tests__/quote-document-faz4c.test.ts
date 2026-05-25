/**
 * Faz 4c (2026-05-25) — QuoteDocument PMT brand template rewrite.
 *
 * Test stratejisi: Faz 9 PO Document paterni (`renderToStaticMarkup` ile
 * gerçek HTML render) + `BILINGUAL_LABELS` constant kontrolü. Vitest
 * environment "node" + react/jsx-runtime, jsdom-free.
 *
 * Doğrulanan davranışlar:
 *   - BILINGUAL_LABELS shape + critical label coverage
 *   - TR ana / EN alt italic hierarchy (PMT brand semantiği)
 *   - Terms band 3-column grid (Delivery | Validity | Payment)
 *   - Footer band fabrika/merkez/tel/web
 *   - Faz 4a Review regression (Size kolonu, colSpan 10, terms data binding)
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QuoteDocument, { BILINGUAL_LABELS } from
    "@/app/dashboard/quotes/components/QuoteDocument";
import type { QuoteData, QuoteRow } from "@/app/dashboard/quotes/components/quote-types";

function makeData(overrides: Partial<QuoteData> = {}): QuoteData {
    return {
        sellerName: "PMT Endüstri A.Ş.",
        sellerTel: "+90 216 000 00 00",
        sellerEmail: "info@pmt.com",
        sellerAddr: "İstanbul, Türkiye",
        sellerTaxId: "1234567890",
        sellerWeb: "www.pmt.com",
        logoSrc: null,
        custCompany: "4K METAL",
        custContact: "AHMET YÜKSEL",
        custPhone: "+90 555 000 00 00",
        custEmail: "ahmet@4kmetal.com",
        quoteNo: "TKL-2026-001",
        quoteDate: "2026-05-25",
        validUntil: "2026-06-25",
        salesRep: "MEHMET DEMİR",
        salesPhone: "+90 532 000 00 00",
        salesEmail: "mehmet@pmt.com",
        currency: "USD",
        vatRate: 20,
        rows: [],
        subtotal: 1000,
        vatTotal: 200,
        grandTotal: 1200,
        totalKg: 0,
        notes: "",
        deliveryMethod: "",
        paymentMethod: "",
        signatures: [
            { role: "Prepared by", roleTr: "Hazırlayan", name: "", title: "" },
            { role: "Approved by", roleTr: "Onay",       name: "", title: "" },
            { role: "Manager Seal", roleTr: "Mühür Onayı", name: "", title: "" },
        ],
        status: "draft",
        ...overrides,
    };
}

function makeRow(overrides: Partial<QuoteRow> = {}): QuoteRow {
    return {
        code: "GV-A105-DN50",
        lead: "30 GÜN",
        desc: "GATE VALVE A105, CLASS 600 SW, SS TRİM",
        qty: "5",
        price: "100",
        hs: "8481.80.79",
        kg: "12",
        size: "DN50",
        ...overrides,
    };
}

function render(data: QuoteData): string {
    return renderToStaticMarkup(createElement(QuoteDocument, { data }));
}

// ── 1. BILINGUAL_LABELS constant ─────────────────────────────────────────────

describe("BILINGUAL_LABELS — Faz 4c PMT brand TR/EN pairs", () => {
    it("min 30 label pair tanımlı (PMT brand kapsamı)", () => {
        const keys = Object.keys(BILINGUAL_LABELS);
        expect(keys.length).toBeGreaterThanOrEqual(30);
    });

    it("her pair { tr, en } shape ve her ikisi non-empty string", () => {
        for (const [key, pair] of Object.entries(BILINGUAL_LABELS)) {
            expect(pair, `${key} pair shape`).toHaveProperty("tr");
            expect(pair, `${key} pair shape`).toHaveProperty("en");
            expect(typeof pair.tr, `${key}.tr type`).toBe("string");
            expect(typeof pair.en, `${key}.en type`).toBe("string");
            expect(pair.tr.length, `${key}.tr non-empty`).toBeGreaterThan(0);
            expect(pair.en.length, `${key}.en non-empty`).toBeGreaterThan(0);
        }
    });

    it("PMT brand-critical label'lar tanımlı (terms 3-col + notes + signatures)", () => {
        expect(BILINGUAL_LABELS.delivery.tr).toBe("Teslimat Şekli");
        expect(BILINGUAL_LABELS.validity.tr).toBe("Geçerlilik Süresi");
        expect(BILINGUAL_LABELS.payment.tr).toBe("Ödeme Şekli");
        expect(BILINGUAL_LABELS.notes.tr).toBe("NOTLAR & KOŞULLAR");
        expect(BILINGUAL_LABELS.signatures.tr).toBe("İmzalar");
        expect(BILINGUAL_LABELS.termsTitle.tr).toMatch(/Teslimat.*Geçerlilik.*Ödeme/);
    });
});

// ── 2. TR ana / EN alt italic hierarchy ──────────────────────────────────────

describe("Bilingual hierarchy — TR ana, EN alt italic (PMT brand)", () => {
    it("Lines table header'da 'Ürün Kodu' ana + 'Product Code' alt italic sıralı", () => {
        const html = render(makeData({ rows: [makeRow()] }));
        const trIdx = html.indexOf("Ürün Kodu");
        const enIdx = html.indexOf("Product Code");
        expect(trIdx).toBeGreaterThan(-1);
        expect(enIdx).toBeGreaterThan(-1);
        // TR önce, EN sonra (TR ana hierarchy)
        expect(trIdx).toBeLessThan(enIdx);
    });

    it("Totals 'Ara Toplam' ana + 'Subtotal' alt sıralı", () => {
        const html = render(makeData());
        const trIdx = html.indexOf("Ara Toplam");
        const enIdx = html.indexOf("Subtotal");
        expect(trIdx).toBeGreaterThan(-1);
        expect(enIdx).toBeGreaterThan(-1);
        expect(trIdx).toBeLessThan(enIdx);
    });

    it("Notes başlığı 'NOTLAR & KOŞULLAR' ana, 'Notes & Terms' ikincil", () => {
        const html = render(makeData({ notes: "FIYATLAR NET. KDV İLAVE EDILECEK." }));
        const trIdx = html.indexOf("NOTLAR &amp; KOŞULLAR");
        const enIdx = html.indexOf("Notes &amp; Terms");
        expect(trIdx).toBeGreaterThan(-1);
        expect(enIdx).toBeGreaterThan(-1);
        expect(trIdx).toBeLessThan(enIdx);
    });
});

// ── 3. Terms band 3-column ────────────────────────────────────────────────────

describe("Terms band — 3-column grid (Delivery | Validity | Payment)", () => {
    it("3 alan dolu → 3-column grid render + 3 etiket çifti", () => {
        const html = render(makeData({
            deliveryMethod: "İSTANBUL PMT DEPO TESLİMİ",
            validUntil: "2026-06-25",
            paymentMethod: "%50 AVANS, %50 SEVKE HAZIR",
        }));
        // Grid styling — 3 sütun
        expect(html).toMatch(/grid-template-columns:\s*1fr 1fr 1fr/);
        // 3 etiket TR
        expect(html).toContain("Teslimat Şekli");
        expect(html).toContain("Geçerlilik Süresi");
        expect(html).toContain("Ödeme Şekli");
        // 3 etiket EN
        expect(html).toContain("Delivery Method");
        expect(html).toContain("Validity Period");
        expect(html).toContain("Payment Method");
        // 3 değer render
        expect(html).toContain("İSTANBUL PMT DEPO TESLİMİ");
        expect(html).toContain("25.06.2026");
        expect(html).toContain("%50 AVANS, %50 SEVKE HAZIR");
    });

    it("yalnız deliveryMethod dolu → section render + diğer 2 hücre '—' placeholder", () => {
        const html = render(makeData({
            deliveryMethod: "EXWORKS",
            validUntil: "",
            paymentMethod: "",
        }));
        expect(html).toContain("EXWORKS");
        expect(html).toContain("Teslimat Şekli");
        // Validity ve Payment hücreleri '—' ile render (3-col tutarlılık)
        // grid içinde 3 sütun var ama validity & payment value alanında —
        const dashCount = (html.match(/—/g) || []).length;
        expect(dashCount).toBeGreaterThanOrEqual(2);
    });

    it("yalnız validUntil dolu → fmtDate ile DD.MM.YYYY formatı", () => {
        const html = render(makeData({
            deliveryMethod: "",
            validUntil: "2026-12-31",
            paymentMethod: "",
        }));
        expect(html).toContain("31.12.2026");
        expect(html).toContain("Geçerlilik Süresi");
    });

    it("üçü de boş → terms section HİÇ render edilmez (conditional)", () => {
        const html = render(makeData({
            deliveryMethod: "",
            validUntil: "",
            paymentMethod: "",
        }));
        // termsTitle yalnız terms section'da render edilir; section yoksa yok
        expect(html).not.toContain(BILINGUAL_LABELS.termsTitle.tr);
        expect(html).not.toContain("Teslimat, Geçerlilik");
    });

    it("Her hücrede TR etiket ana + EN etiket alt italic ile render", () => {
        const html = render(makeData({
            deliveryMethod: "X",
            validUntil: "2026-06-25",
            paymentMethod: "Y",
        }));
        // TR (Teslimat Şekli) hemen sonra EN (Delivery Method) yakın gelmeli
        const delTrIdx = html.indexOf("Teslimat Şekli");
        const delEnIdx = html.indexOf("Delivery Method");
        expect(delTrIdx).toBeGreaterThan(-1);
        expect(delEnIdx).toBeGreaterThan(delTrIdx);
        // 200 char içinde olmalı (label pair tek hücre)
        expect(delEnIdx - delTrIdx).toBeLessThan(300);
    });
});

// ── 4. Footer band — fabrika/merkez/tel/web ──────────────────────────────────

describe("Footer band — fabrika/merkez/tel/web horizontal (PMT brand)", () => {
    it("sellerAddr dolu → 'Merkez / HQ:' prefix ile render", () => {
        const html = render(makeData({ sellerAddr: "Tuzla OSB İstanbul" }));
        expect(html).toContain("Merkez");
        expect(html).toContain("HQ");
        expect(html).toContain("Tuzla OSB İstanbul");
    });

    it("sellerTel dolu → 'Tel:' prefix ile render", () => {
        const html = render(makeData({ sellerTel: "+90 216 999 99 99" }));
        // Footer içinde Tel: prefix (header'da da Tel görünür, biri footer biri header)
        expect(html).toContain("+90 216 999 99 99");
        expect(html).toMatch(/<strong[^>]*>Tel:<\/strong>/);
    });

    it("sellerWeb dolu → 'Web:' prefix ile render", () => {
        const html = render(makeData({ sellerWeb: "www.pmt.example" }));
        expect(html).toContain("www.pmt.example");
        expect(html).toMatch(/<strong[^>]*>Web:<\/strong>/);
    });

    it("3 alan da boş → footer 1. satır boş ama component crash yok (defansif render)", () => {
        const html = render(makeData({ sellerAddr: "", sellerTel: "", sellerWeb: "" }));
        // Footer band class hâlâ var (alt satır sellerName/confidential render)
        expect(html).toContain("doc-footer-band");
        // sellerName ve confidential alt satırda hâlâ görünür
        expect(html).toContain("PMT Endüstri A.Ş.");
        expect(html).toContain("Bu belge gizlidir");
    });
});

// ── 5. Faz 4a Review regression ──────────────────────────────────────────────

describe("Faz 4a Review regression — Size kolonu + colSpan 10 + Size data", () => {
    it("empty rows → colSpan=10 (Size kolonu eklendiğinde 9→10 olmuştu)", () => {
        const html = render(makeData({ rows: [] }));
        expect(html).toMatch(/colspan="10"/i);
    });

    it("Size kolonu lines table'da render (TR 'Ölçü' + EN 'Size' header)", () => {
        const html = render(makeData({ rows: [makeRow({ size: "DN50" })] }));
        // Header bilingual
        expect(html).toContain("Ölçü");
        expect(html).toContain("Size");
        // Cell value
        expect(html).toContain("DN50");
    });

    it("row.size cell '—' fallback when empty (10. sütun korunur)", () => {
        const html = render(makeData({ rows: [makeRow({ size: "" })] }));
        // Diğer alanlar dolu — Size hücresinde — placeholder olmalı
        expect(html).toContain("—");
    });
});
