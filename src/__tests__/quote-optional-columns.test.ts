/**
 * Teklif satır modeli — Ölçü (Size) VE Ağırlık (Kg) kolonları KALDIRILDI.
 *  - Ölçü: DN/sınıf zaten ürün adında/açıklamada (size_text redundant).
 *  - Ağırlık: birim zaten karşılıyor (kg seçilince miktar kütle; adet → ağırlık gereksiz).
 * size_text / weight_kg veri hattı (form state → payload → RPC → mapper) DORMANT korunur;
 * yalnız görüntü kalkar (migration yok). Bu dosya iki kolonun da YOKLUĞUNU kilitler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QuoteDocument from "@/app/dashboard/quotes/components/QuoteDocument";
import { renderQuotePdfBuffer } from "@/lib/quote-pdf";
import type { QuoteData, QuoteRow } from "@/app/dashboard/quotes/components/quote-types";

function docRow(over: Partial<QuoteRow> = {}): QuoteRow {
    return { code: "KV-600-DN20", lead: "2 hafta", desc: "Küresel Vana Class 600 DN20 A105 SW",
        qty: "5", price: "100", hs: "8481.80", kg: "32", size: "DN20·CL600", note: "", unit: "adet", ...over };
}

function makeDocData(rows: QuoteRow[]): QuoteData {
    return {
        sellerName: "PMT", sellerTel: "", sellerEmail: "", sellerAddr: "", sellerTaxId: "",
        sellerWeb: "", logoSrc: null, custCompany: "4K", custContact: "", custPhone: "",
        custEmail: "", custAddress: "", quoteNo: "TKL-1", quoteDate: "2026-06-16",
        validUntil: "2026-07-16", salesRep: "", salesPhone: "", salesEmail: "",
        currency: "USD", vatRate: 20, rows, subtotal: 500, discountAmount: 0, vatTotal: 100,
        grandTotal: 600, totalKg: 96, notes: "", deliveryMethod: "", paymentMethod: "",
        signatures: [
            { role: "Prepared by", roleTr: "Hazırlayan", name: "", title: "" },
            { role: "Approved by", roleTr: "Onay", name: "", title: "" },
            { role: "Manager Seal", roleTr: "Mühür Onayı", name: "", title: "" },
        ],
        status: "sent",
    };
}

// ── 1. HTML belge — iki kolon + toplam ağırlık satırı YOK ───────────────────

describe("QuoteDocument — Ölçü + Ağırlık kolonları kaldırıldı", () => {
    it("size + kg dolu olsa bile 'Ölçü' ve 'Ağırlık' başlıkları RENDER EDİLMEZ", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ size: "DN20·CL600", kg: "32" })]),
        }));
        expect(html).not.toContain("Ölçü");
        expect(html).not.toContain("Ağırlık");
        // Açıklama (DN içeren ürün adı) yine render edilir
        expect(html).toContain("Küresel Vana Class 600 DN20");
    });

    it("Toplam Ağırlık (totalKg) satırı RENDER EDİLMEZ (totalKg>0 olsa bile)", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ kg: "32" })]),
        }));
        // Toplam ağırlık "96 kg" satırı çıkmamalı (kaldırıldı)
        expect(html).not.toContain("96 kg");
    });

    it("not satırı colSpan=8 (sabit; Size/Kg yok)", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ note: "Montaj notu" })]),
        }));
        expect(html).toMatch(/colspan="8"/i);
        expect(html).toContain("Montaj notu");
    });

    it("boş satır → colSpan=8", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, { data: makeDocData([]) }));
        expect(html).toMatch(/colspan="8"/i);
    });
});

// ── 2. PDF render smoke + source-lock ───────────────────────────────────────

describe("renderQuotePdfBuffer — Size/Kg'siz render", () => {
    it("size + kg dolu data → geçerli PDF (kolonlar render edilmez, crash yok)", async () => {
        const buf = await renderQuotePdfBuffer(makeDocData([
            docRow({ code: "A", unit: "adet", kg: "32", size: "DN20" }),
            docRow({ code: "B", unit: "kg", qty: "500", kg: "99.9" }),
        ]));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.length).toBeGreaterThan(10 * 1024);
    }, 30000);
});

describe("QuotePdfDocument — source-lock (Size + Kg kolonları yok)", () => {
    const PDF_SRC = readFileSync(join(process.cwd(), "src/lib/quote-pdf/QuotePdfDocument.tsx"), "utf8");
    it("showSize/showKg + Size/Kg Th/Td + totalWeight satırı KALDIRILDI", () => {
        expect(PDF_SRC).not.toMatch(/const showSize =/);
        expect(PDF_SRC).not.toMatch(/const showKg =/);
        expect(PDF_SRC).not.toMatch(/<Th label=\{L\.size\}/);
        expect(PDF_SRC).not.toMatch(/<Th label=\{L\.weight\}/);
        expect(PDF_SRC).not.toMatch(/width=\{COL\.size\}/);
        expect(PDF_SRC).not.toMatch(/width=\{COL\.kg\}/);
        expect(PDF_SRC).not.toMatch(/L\.totalWeight/);
    });
});

// ── 3. HTML belge source-lock ──────────────────────────────────────────────

describe("QuoteDocument — source-lock (sabit baseCols, Kg/totalKg yok)", () => {
    const DOC_SRC = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/components/QuoteDocument.tsx"), "utf8");
    it("baseCols sabit 8; showSize/showKg yok; row.kg hücresi + totalKg satırı yok", () => {
        expect(DOC_SRC).toMatch(/const baseCols = 8;/);
        expect(DOC_SRC).not.toMatch(/const showKg =/);
        expect(DOC_SRC).not.toMatch(/const showSize =/);
        expect(DOC_SRC).not.toMatch(/\{row\.kg \|\| "—"\}/);
        expect(DOC_SRC).not.toMatch(/data\.totalKg > 0/);
    });
});

// ── 4. QuoteForm source-lock ────────────────────────────────────────────────

describe("QuoteForm — Ölçü + Ağırlık kolonları yok", () => {
    const FORM_SRC = readFileSync(
        join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"), "utf8",
    );

    it("Size + Kg th/td, toggle, handleKgChange, isWeightBasedUnit KALDIRILDI", () => {
        expect(FORM_SRC).not.toMatch(/showSizeCol|showKgCol|showWeightForced/);
        expect(FORM_SRC).not.toMatch(/aria-label=\{`Satır \$\{idx \+ 1\} ölçü`\}/);
        expect(FORM_SRC).not.toMatch(/aria-label=\{`Satır \$\{idx \+ 1\} ağırlık \(kg\)`\}/);
        expect(FORM_SRC).not.toMatch(/handleKgChange/);
        expect(FORM_SRC).not.toMatch(/isWeightBasedUnit/);
        expect(FORM_SRC).not.toMatch(/Columns3/);
    });

    it("formBaseCols sabit 9 (Size/Kg yok)", () => {
        expect(FORM_SRC).toMatch(/const formBaseCols = 9;/);
        expect(FORM_SRC).toMatch(/colSpan=\{formBaseCols\}/);
    });

    it("size_text + weight_kg veri hattı korunur (auto-fill + payload dormant)", () => {
        // Görüntü kalktı ama veri hattı (auto-fill/payload) sürüyor — migration yok.
        expect(FORM_SRC).toMatch(/updateRow\(rowId, "size", p\.sizeText \?\? ""\)/);
        expect(FORM_SRC).toMatch(/size_text:\s*r\.size \|\| undefined/);
        expect(FORM_SRC).toMatch(/weight_kg:\s*r\.kg \? parseFloat\(r\.kg\)/);
    });
});
