/**
 * 099 takip — Ölçü (Size) & Ağırlık (Kg) kolonları koşullu.
 *
 * Kural: kolon (th + hücre) yalnız en az bir satırda veri varsa render edilir
 * (form + HTML belge + PDF). Kapsam: QuoteDocument koşullu th/colSpan · PDF render
 * smoke · QuoteForm source-lock (derivation + toggle + dinamik colSpan).
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
    return { code: "KV-1", lead: "2 hafta", desc: "Küresel Vana", qty: "5", price: "100",
        hs: "8481.80", kg: "", size: "", note: "", unit: "adet", ...over };
}

function makeDocData(rows: QuoteRow[]): QuoteData {
    return {
        sellerName: "PMT", sellerTel: "", sellerEmail: "", sellerAddr: "", sellerTaxId: "",
        sellerWeb: "", logoSrc: null, custCompany: "4K", custContact: "", custPhone: "",
        custEmail: "", custAddress: "", quoteNo: "TKL-1", quoteDate: "2026-06-16",
        validUntil: "2026-07-16", salesRep: "", salesPhone: "", salesEmail: "",
        currency: "USD", vatRate: 20, rows, subtotal: 500, discountAmount: 0, vatTotal: 100,
        grandTotal: 600, totalKg: 0, notes: "", deliveryMethod: "", paymentMethod: "",
        signatures: [
            { role: "Prepared by", roleTr: "Hazırlayan", name: "", title: "" },
            { role: "Approved by", roleTr: "Onay", name: "", title: "" },
            { role: "Manager Seal", roleTr: "Mühür Onayı", name: "", title: "" },
        ],
        status: "sent",
    };
}

// ── 1. HTML belge — koşullu Size/Kg kolonları ───────────────────────────────

describe("QuoteDocument — koşullu Ölçü/Ağırlık kolonları", () => {
    it("hiçbir satırda ölçü/ağırlık yoksa Ölçü ve Ağırlık başlıkları RENDER EDİLMEZ", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ size: "", kg: "" }), docRow({ code: "KV-2", size: "", kg: "" })]),
        }));
        expect(html).not.toContain("Ölçü");
        expect(html).not.toContain("Ağırlık");
    });

    it("bir satırda ölçü varsa Ölçü başlığı + hücre görünür", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ size: "DN50" }), docRow({ code: "KV-2", size: "" })]),
        }));
        expect(html).toContain("Ölçü");
        expect(html).toContain("DN50");
        expect(html).not.toContain("Ağırlık"); // kg hâlâ boş
    });

    it("bir satırda ağırlık varsa Ağırlık başlığı görünür", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ kg: "3.5" })]),
        }));
        expect(html).toContain("Ağırlık");
        expect(html).toContain("3.5");
    });

    it("not satırı colSpan'ı kolon sayısına göre dinamik (size+kg yokken 8)", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ size: "", kg: "", note: "Montaj notu" })]),
        }));
        // Size/Kg yok → 8 sabit kolon → not satırı colSpan=8
        expect(html).toMatch(/colspan="8"/i);
        expect(html).toContain("Montaj notu");
    });

    it("size+kg varken colSpan 10'a çıkar", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ size: "DN50", kg: "3", note: "Not" })]),
        }));
        expect(html).toMatch(/colspan="10"/i);
    });
});

// ── 2. PDF render smoke ─────────────────────────────────────────────────────

describe("renderQuotePdfBuffer — koşullu kolonlarla render", () => {
    it("size/kg'siz data → geçerli PDF (kolon gizli, crash yok)", async () => {
        const buf = await renderQuotePdfBuffer(makeDocData([
            docRow({ size: "", kg: "" }),
            docRow({ code: "KV-2", size: "", kg: "" }),
        ]));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.length).toBeGreaterThan(10 * 1024);
    }, 30000);

    it("size+kg'li data → geçerli PDF", async () => {
        const buf = await renderQuotePdfBuffer(makeDocData([
            docRow({ size: "DN50", kg: "3.5" }),
        ]));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.length).toBeGreaterThan(10 * 1024);
    }, 30000);
});

// ── 3. PDF source-lock — Th/Td koşullu ──────────────────────────────────────

describe("QuotePdfDocument — koşullu Th/Td (source-lock)", () => {
    const PDF_SRC = readFileSync(join(process.cwd(), "src/lib/quote-pdf/QuotePdfDocument.tsx"), "utf8");
    it("showSize/showKg türetilir ve ItemRow'a geçer", () => {
        expect(PDF_SRC).toMatch(/const showSize = data\.rows\.some/);
        expect(PDF_SRC).toMatch(/const showKg = data\.rows\.some/);
        expect(PDF_SRC).toMatch(/showSize=\{showSize\}\s+showKg=\{showKg\}/);
    });
    it("Size/Kg Th + Td koşullu render edilir", () => {
        expect(PDF_SRC).toMatch(/\{showSize && <Th label=\{L\.size\}/);
        expect(PDF_SRC).toMatch(/\{showKg && <Th label=\{L\.weight\}/);
        expect(PDF_SRC).toMatch(/\{showSize && <Td width=\{COL\.size\}/);
        expect(PDF_SRC).toMatch(/\{showKg && <Td width=\{COL\.kg\}/);
    });
});

// ── 4. QuoteForm source-lock ────────────────────────────────────────────────

describe("QuoteForm — koşullu kolon entegrasyonu", () => {
    const FORM_SRC = readFileSync(
        join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"), "utf8",
    );

    it("showSizeCol/showKgCol satırlardan + optionalColsForced ile türetilir", () => {
        expect(FORM_SRC).toMatch(/const showSizeCol = optionalColsForced \|\| rows\.some\(r => r\.size\.trim\(\) !== ""\)/);
        expect(FORM_SRC).toMatch(/const showKgCol = optionalColsForced \|\| rows\.some\(r => r\.kg\.trim\(\) !== ""\)/);
    });

    it("optionalColsForced state'i default false", () => {
        expect(FORM_SRC).toMatch(/const \[optionalColsForced, setOptionalColsForced\] = useState\(false\)/);
    });

    it("toggle butonu Columns3 ikonuyla optionalColsForced'ı çevirir", () => {
        expect(FORM_SRC).toMatch(/import\s*\{[^}]*Columns3[^}]*\}\s*from\s*["']lucide-react["']/);
        expect(FORM_SRC).toMatch(/setOptionalColsForced\(v => !v\)/);
        expect(FORM_SRC).toMatch(/aria-pressed=\{optionalColsForced\}/);
    });

    it("Size & Kg th + hücre koşullu render", () => {
        expect(FORM_SRC).toMatch(/\{showSizeCol && <th/);
        expect(FORM_SRC).toMatch(/\{showKgCol && <th/);
        expect(FORM_SRC).toMatch(/\{showSizeCol && <td/);
        expect(FORM_SRC).toMatch(/\{showKgCol && <td/);
    });

    it("not açılır satırı colSpan dinamik (formBaseCols)", () => {
        expect(FORM_SRC).toMatch(/const formBaseCols = 9 \+ \(showSizeCol \? 1 : 0\) \+ \(showKgCol \? 1 : 0\)/);
        expect(FORM_SRC).toMatch(/colSpan=\{formBaseCols\}/);
    });
});
