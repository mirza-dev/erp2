/**
 * 098 — Teklif satırı bazlı serbest "Not" alanı (description'dan AYRI).
 *
 * Kapsam: mapper (snake→camel) · dbCreateQuote RPC payload · BILINGUAL_LABELS
 * label · QuoteDocument (HTML) satır-altı not bloğu · buildQuoteDataFromDetail
 * not eşlemesi · QuotePdfDocument gerçek render smoke · QuoteForm source-lock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { BILINGUAL_LABELS } from "@/lib/quote-document-helpers";
import { buildQuoteDataFromDetail } from "@/lib/quote-archive-html";
import { renderQuotePdfBuffer } from "@/lib/quote-pdf";
import QuoteDocument from "@/app/dashboard/quotes/components/QuoteDocument";
import type { QuoteWithLines, QuoteLineItemRow } from "@/lib/database.types";
import type { QuoteData, QuoteRow } from "@/app/dashboard/quotes/components/quote-types";
import type { QuoteDetail, QuoteLineItem } from "@/lib/mock-data";

// ── 1. Mapper ───────────────────────────────────────────────────────────────

function makeLineRow(over: Partial<QuoteLineItemRow> = {}): QuoteLineItemRow {
    return {
        id: "l-1", quote_id: "q-1", position: 1, product_id: null, product_code: "K1",
        lead_time: null, description: "Vana", quantity: 1, unit_price: 1, line_total: 1,
        hs_code: null, weight_kg: null, size_text: null, unit_weight_kg: null,
        kg_manual_override: false, note: null, created_at: "",
        ...over,
    };
}

function makeQuoteRow(lines: QuoteLineItemRow[]): QuoteWithLines {
    return {
        id: "q-1", quote_number: "TKL-2026-001", status: "draft", customer_id: null,
        customer_name: "ACME", customer_contact: null, customer_phone: null, customer_email: null,
        sales_rep: null, sales_phone: null, sales_email: null, currency: "USD", vat_rate: 20,
        subtotal: 1, vat_total: 0, grand_total: 1, notes: null, sig_prepared: null,
        sig_approved: null, sig_manager: null, quote_date: "2026-06-15", valid_until: null,
        delivery_method: null, payment_method: null,
        created_at: "2026-06-15T00:00:00Z", updated_at: "2026-06-15T00:00:00Z",
        lines,
    } as unknown as QuoteWithLines;
}

describe("mapQuoteDetail — satır note exposure", () => {
    it("note null → camelCase boş string", () => {
        const result = mapQuoteDetail(makeQuoteRow([makeLineRow({ note: null })]));
        expect(result.lines[0].note).toBe("");
    });

    it("note dolu → aynen geçer (Türkçe karakter korunur)", () => {
        const result = mapQuoteDetail(makeQuoteRow([
            makeLineRow({ id: "l-1", note: "Sızdırmazlık testi yapılacaktır" }),
            makeLineRow({ id: "l-2", note: "" }),
        ]));
        expect(result.lines.map(l => l.note)).toEqual(["Sızdırmazlık testi yapılacaktır", ""]);
    });
});

// ── 2. dbCreateQuote RPC payload ────────────────────────────────────────────

const mockRpc = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        rpc: (name: string, args: unknown) => mockRpc(name, args),
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }),
            insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        }),
    }),
}));

describe("dbCreateQuote — satır note RPC p_lines'a düşer", () => {
    beforeEach(() => { mockRpc.mockReset(); mockMaybeSingle.mockReset(); });

    it("note line payload'da iletilir", async () => {
        mockRpc.mockResolvedValueOnce({ data: "new-id", error: null });
        mockMaybeSingle.mockResolvedValueOnce({ data: { id: "new-id", quote_line_items: [] }, error: null });

        const { dbCreateQuote } = await import("@/lib/supabase/quotes");
        await dbCreateQuote({
            customer_name: "ACME", currency: "USD", vat_rate: 20,
            subtotal: 100, vat_total: 20, grand_total: 120,
            lines: [{
                position: 1, product_code: "KOD-1", description: "Vana",
                quantity: 1, unit_price: 100, line_total: 100,
                note: "Ürüne özel not",
            }],
        });

        expect(mockRpc).toHaveBeenCalledWith("create_quote_with_lines", expect.objectContaining({
            p_lines: [expect.objectContaining({ note: "Ürüne özel not" })],
        }));
    });
});

// ── 3. Bilingual label ──────────────────────────────────────────────────────

describe("BILINGUAL_LABELS.lineNote", () => {
    it("TR 'Not' / EN 'Note'", () => {
        expect(BILINGUAL_LABELS.lineNote).toEqual({ tr: "Not", en: "Note" });
    });
});

// ── 4. QuoteDocument (HTML) satır-altı not bloğu ─────────────────────────────

function docRow(over: Partial<QuoteRow> = {}): QuoteRow {
    return { code: "KV-1", lead: "2 hafta", desc: "Küresel Vana", qty: "5", price: "100",
        hs: "8481.80", kg: "3", size: "DN50", note: "", ...over };
}

function makeDocData(rows: QuoteRow[]): QuoteData {
    return {
        sellerName: "PMT", sellerTel: "", sellerEmail: "", sellerAddr: "", sellerTaxId: "",
        sellerWeb: "", logoSrc: null, custCompany: "4K", custContact: "", custPhone: "",
        custEmail: "", custAddress: "", quoteNo: "TKL-1", quoteDate: "2026-06-15",
        validUntil: "2026-07-15", salesRep: "", salesPhone: "", salesEmail: "",
        currency: "USD", vatRate: 20, rows, subtotal: 500, discountAmount: 0, vatTotal: 100,
        grandTotal: 600, totalKg: 3, notes: "", deliveryMethod: "", paymentMethod: "",
        signatures: [
            { role: "Prepared by", roleTr: "Hazırlayan", name: "", title: "" },
            { role: "Approved by", roleTr: "Onay", name: "", title: "" },
            { role: "Manager Seal", roleTr: "Mühür Onayı", name: "", title: "" },
        ],
        status: "sent",
    };
}

describe("QuoteDocument (HTML) — satır notu", () => {
    it("note dolu satırda 'Not / Note:' bloğu + metin render edilir", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ note: "Montaj öncesi basınç testi" })]),
        }));
        expect(html).toContain("Not / Note:");
        expect(html).toContain("Montaj öncesi basınç testi");
    });

    it("note boş satırda not bloğu render EDİLMEZ", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ note: "" })]),
        }));
        expect(html).not.toContain("Not / Note:");
    });

    it("not satırı sayfa-kırpılmasına karşı doc-note-row sınıfı kullanır (doc-no-break DEĞİL)", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ note: "uzun not" })]),
        }));
        expect(html).toContain('class="doc-note-row"');
    });
});

// ── 4b. Uzun not sayfa-kırpılma fix'i (source-lock) ─────────────────────────

describe("QuoteDocument — uzun not page-break override", () => {
    const DOC_SOURCE = readFileSync(
        join(process.cwd(), "src/app/dashboard/quotes/components/QuoteDocument.tsx"),
        "utf8",
    );
    it("PAGE_CSS not satırı için break-inside:auto override içerir", () => {
        expect(DOC_SOURCE).toMatch(/tr\.doc-note-row[\s\S]{0,120}break-inside:\s*auto\s*!important/);
    });
    it("not satırı doc-note-row sınıfı kullanır, blanket avoid'e takılmaz", () => {
        expect(DOC_SOURCE).toMatch(/<tr className="doc-note-row">/);
    });
});

// ── 5. buildQuoteDataFromDetail not eşlemesi ────────────────────────────────

function makeLineItem(over: Partial<QuoteLineItem> = {}): QuoteLineItem {
    return {
        id: "l1", position: 1, productId: "p1", productCode: "KV-1", leadTime: "2 hafta",
        description: "Vana", quantity: 10, unitPrice: 100, lineTotal: 1000, hsCode: "8481.80",
        weightKg: 3, sizeText: "DN50", unitWeightKg: 0.3, kgManualOverride: false, note: "",
        ...over,
    };
}

function makeDetail(lines: QuoteLineItem[]): QuoteDetail {
    return {
        id: "q1", quoteNumber: "TKL-2026-001", status: "sent", customerName: "Tüpraş",
        currency: "USD", grandTotal: 1200, quoteDate: "2026-06-15", validUntil: "2026-07-15",
        createdAt: "2026-06-15T10:00:00Z", revisionNo: 1, rootQuoteId: null, customerId: "c1",
        customerContact: "", customerPhone: "", customerEmail: "", customerAddress: "",
        salesRep: "", salesPhone: "", salesEmail: "", vatRate: 20, subtotal: 1000,
        vatTotal: 200, discountAmount: 0, notes: "", sigPrepared: "", sigApproved: "",
        sigManager: "", deliveryMethod: "", paymentMethod: "", totalWeightKg: 3,
        sellerName: "", sellerPhone: "", sellerEmail: "", sellerAddress: "", sellerTaxId: "",
        sellerWebsite: "", sellerLogoUrl: "", lines,
    } as unknown as QuoteDetail;
}

describe("buildQuoteDataFromDetail — not eşlemesi", () => {
    it("satır notu rows[].note'a taşınır (null → '')", () => {
        const data = buildQuoteDataFromDetail(makeDetail([
            makeLineItem({ note: "Özel not" }),
            makeLineItem({ id: "l2", note: "" }),
        ]), null);
        expect(data.rows.map(r => r.note)).toEqual(["Özel not", ""]);
    });
});

// ── 6. QuotePdfDocument gerçek render smoke ─────────────────────────────────

describe("renderQuotePdfBuffer — notlu satır", () => {
    it("notlu satır → geçerli PDF üretir (crash etmez)", async () => {
        const buf = await renderQuotePdfBuffer(makeDocData([
            docRow({ note: "Sızdırmazlık testi — şğİıçöü ĞŞÇÖÜ" }),
            docRow({ code: "KV-2", note: "" }),
        ]));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.length).toBeGreaterThan(10 * 1024);
    }, 30000);

    it("ÇOK UZUN not (çok-sayfalık) → kırpılmadan geçerli PDF üretir", async () => {
        const huge = Array.from({ length: 200 }, (_, i) => `Not satırı ${i + 1} — uzun açıklama şğİ.`).join("\n");
        const buf = await renderQuotePdfBuffer(makeDocData([docRow({ note: huge })]));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.length).toBeGreaterThan(10 * 1024);
    }, 30000);
});

describe("QuotePdfDocument — not View'ı wrap=false DEĞİL (sayfalara akar)", () => {
    const PDF_SOURCE = readFileSync(
        join(process.cwd(), "src/lib/quote-pdf/QuotePdfDocument.tsx"),
        "utf8",
    );
    it("not View'ında wrap={false} yok (ürün satırı S.row'da wrap={false} kalır)", () => {
        // noteRow View'ı backgroundColor ile açılır ve wrap={false} İÇERMEZ
        expect(PDF_SOURCE).toMatch(/\.\.\.S\.noteRow,\s*backgroundColor:\s*bg\s*\}\}>/);
        expect(PDF_SOURCE).not.toMatch(/\.\.\.S\.noteRow[\s\S]{0,40}wrap=\{false\}/);
    });
});

// ── 7. QuoteForm source-lock ────────────────────────────────────────────────

const FORM_SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
    "utf8",
);

describe("QuoteForm — satır notu entegrasyonu", () => {
    it("StickyNote ikonu import edilir", () => {
        expect(FORM_SOURCE).toMatch(/import\s*\{[^}]*StickyNote[^}]*\}\s*from\s*["']lucide-react["']/);
    });

    it("expandedNoteRowIds state'i Set<number> ile init", () => {
        expect(FORM_SOURCE).toMatch(/const\s*\[\s*expandedNoteRowIds\s*,\s*setExpandedNoteRowIds\s*\]\s*=\s*useState<Set<number>>\(\s*new Set\(\)\s*\)/);
    });

    it("toggleNoteRow fonksiyonu Set'i immutable aç/kapa eder", () => {
        expect(FORM_SOURCE).toMatch(/function\s+toggleNoteRow\(id:\s*number\)[\s\S]{0,200}next\.has\(id\)/);
    });

    it("emptyRow() yeni satırda note=''", () => {
        expect(FORM_SOURCE).toMatch(/function emptyRow[\s\S]{0,300}note:\s*""/);
    });

    it("QuoteRow tipinde note alanı var", () => {
        expect(FORM_SOURCE).toMatch(/note:\s*string;/);
    });

    it("buildQuotePayload note'u boşsa göndermez", () => {
        expect(FORM_SOURCE).toMatch(/note:\s*r\.note\.trim\(\)\s*\|\|\s*undefined/);
    });

    it("initialData hydration note'u çeker", () => {
        expect(FORM_SOURCE).toMatch(/note:\s*l\.note\s*\?\?\s*""/);
    });

    it("açılır not satırı toggle butonu + tam-genişlik textarea içerir", () => {
        expect(FORM_SOURCE).toMatch(/onClick=\{\(\)\s*=>\s*toggleNoteRow\(row\.id\)\}/);
        // colSpan'lı not satırı + updateRow(row.id, "note", ...)
        expect(FORM_SOURCE).toMatch(/colSpan=\{11\}/);
        expect(FORM_SOURCE).toMatch(/updateRow\(row\.id,\s*"note",\s*e\.target\.value\)/);
    });

    it("readOnly modda not satırı gizli (noteOpen && !readOnly guard)", () => {
        expect(FORM_SOURCE).toMatch(/!readOnly\s*&&\s*noteOpen/);
    });

    it("not textarea MAX_QUOTE_LINE_NOTE ile maxLength + karakter sayacı", () => {
        expect(FORM_SOURCE).toMatch(/import\s*\{[^}]*MAX_QUOTE_LINE_NOTE[^}]*\}\s*from\s*["']@\/lib\/quote-validation["']/);
        expect(FORM_SOURCE).toMatch(/maxLength=\{MAX_QUOTE_LINE_NOTE\}/);
        expect(FORM_SOURCE).toMatch(/\{row\.note\.length\}\/\{MAX_QUOTE_LINE_NOTE\}/);
    });
});

describe("quotes route'ları — satır notu uzunluk 422 kilidi (source-lock)", () => {
    const POST_SRC = readFileSync(join(process.cwd(), "src/app/api/quotes/route.ts"), "utf8");
    const PATCH_SRC = readFileSync(join(process.cwd(), "src/app/api/quotes/[id]/route.ts"), "utf8");
    it("POST + PATCH validateQuoteLineNotes çağırır → 422", () => {
        for (const src of [POST_SRC, PATCH_SRC]) {
            expect(src).toMatch(/validateQuoteLineNotes\(\(body\.lines\s*\?\?\s*\[\]\)/);
            expect(src).toMatch(/noteErr[\s\S]{0,60}status:\s*422/);
        }
    });
});
