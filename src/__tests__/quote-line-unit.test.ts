/**
 * 099 — Teklif satırı bazlı ölçü birimi (unit of measure).
 *
 * Kapsam: migration source-lock (kolon + RPC INSERT'leri + send/accept COALESCE) ·
 * mapper (snake→camel) · dbCreateQuote RPC payload · QuoteDocument (HTML) miktar+birim
 * birleşik hücre · buildQuoteDataFromDetail unit eşlemesi · QuotePdfDocument gerçek
 * render smoke · QuoteForm source-lock · gate baseline kayıtları.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { buildQuoteDataFromDetail } from "@/lib/quote-archive-html";
import { renderQuotePdfBuffer } from "@/lib/quote-pdf";
import QuoteDocument from "@/app/dashboard/quotes/components/QuoteDocument";
import { REDEFINITION_CHAINS } from "@/__tests__/gate/sql-lint-baseline";
import type { QuoteWithLines, QuoteLineItemRow } from "@/lib/database.types";
import type { QuoteData, QuoteRow } from "@/app/dashboard/quotes/components/quote-types";
import type { QuoteDetail, QuoteLineItem } from "@/lib/mock-data";

// ── 1. Migration source-lock ────────────────────────────────────────────────

describe("099 migration — quote_line_unit", () => {
    const SQL = readFileSync(
        join(process.cwd(), "supabase/migrations/099_quote_line_unit.sql"),
        "utf8",
    );

    it("quote_line_items'a nullable unit kolonu ekler", () => {
        expect(SQL).toMatch(/ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS unit text/);
    });

    it("create + update RPC INSERT'lerinde unit kolonu + NULLIF(ln->>'unit')", () => {
        // İki INSERT bloğu (create + update) — her ikisinde de unit kolonu + extraction.
        const unitCols = SQL.match(/kg_manual_override,\s*note,\s*unit/g) ?? [];
        expect(unitCols.length).toBe(2);
        const unitExtract = SQL.match(/NULLIF\(ln->>'unit',\s*''\)/g) ?? [];
        expect(unitExtract.length).toBe(2);
    });

    it("send + accept RPC order_lines.unit = COALESCE(qli.unit, p.unit) (teklif öncelikli)", () => {
        // Yalnız kod satırları (SELECT clause sonu virgül); açıklama satırı boşluksuz
        // yazımıyla (qli.unit,'') hariç tutulur.
        const coalesce = SQL.match(/coalesce\(nullif\(qli\.unit, ''\), p\.unit\),/g) ?? [];
        expect(coalesce.length).toBe(2); // send (pending) + accept (legacy draft)
    });

    it("dört RPC de redefine edilir (create/update/send/accept)", () => {
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION create_quote_with_lines/);
        expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION update_quote_with_lines/);
        expect(SQL).toMatch(/create or replace function send_quote_and_create_pending_order/);
        expect(SQL).toMatch(/create or replace function accept_quote_and_create_order/);
    });
});

// ── 2. Mapper ───────────────────────────────────────────────────────────────

function makeLineRow(over: Partial<QuoteLineItemRow> = {}): QuoteLineItemRow {
    return {
        id: "l-1", quote_id: "q-1", position: 1, product_id: null, product_code: "K1",
        lead_time: null, description: "Vana", quantity: 1, unit_price: 1, line_total: 1,
        hs_code: null, weight_kg: null, size_text: null, unit_weight_kg: null,
        kg_manual_override: false, note: null, unit: null, created_at: "",
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

describe("mapQuoteDetail — satır unit exposure", () => {
    it("unit null → camelCase boş string", () => {
        const result = mapQuoteDetail(makeQuoteRow([makeLineRow({ unit: null })]));
        expect(result.lines[0].unit).toBe("");
    });

    it("unit dolu → aynen geçer (Türkçe/özel karakter korunur)", () => {
        const result = mapQuoteDetail(makeQuoteRow([
            makeLineRow({ id: "l-1", unit: "metre" }),
            makeLineRow({ id: "l-2", unit: "m²" }),
        ]));
        expect(result.lines.map(l => l.unit)).toEqual(["metre", "m²"]);
    });
});

// ── 3. dbCreateQuote RPC payload ────────────────────────────────────────────

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

describe("dbCreateQuote — satır unit RPC p_lines'a düşer", () => {
    beforeEach(() => { mockRpc.mockReset(); mockMaybeSingle.mockReset(); });

    it("unit line payload'da iletilir", async () => {
        mockRpc.mockResolvedValueOnce({ data: "new-id", error: null });
        mockMaybeSingle.mockResolvedValueOnce({ data: { id: "new-id", quote_line_items: [] }, error: null });

        const { dbCreateQuote } = await import("@/lib/supabase/quotes");
        await dbCreateQuote({
            customer_name: "ACME", currency: "USD", vat_rate: 20,
            subtotal: 100, vat_total: 20, grand_total: 120,
            lines: [{
                position: 1, product_code: "KOD-1", description: "Boru",
                quantity: 12, unit_price: 100, line_total: 1200,
                unit: "metre",
            }],
        });

        expect(mockRpc).toHaveBeenCalledWith("create_quote_with_lines", expect.objectContaining({
            p_lines: [expect.objectContaining({ unit: "metre" })],
        }));
    });
});

// ── 4. QuoteDocument (HTML) miktar + birim birleşik ─────────────────────────

function docRow(over: Partial<QuoteRow> = {}): QuoteRow {
    return { code: "KV-1", lead: "2 hafta", desc: "Küresel Vana", qty: "5", price: "100",
        hs: "8481.80", kg: "3", size: "DN50", note: "", unit: "", ...over };
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

describe("QuoteDocument (HTML) — miktar + birim", () => {
    it("unit dolu satırda miktarla birleşik gösterilir ('5 metre')", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ qty: "5", unit: "metre" })]),
        }));
        expect(html).toContain("5 metre");
    });

    it("unit boş satırda yalnız sayı gösterilir (birim eklenmez)", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow({ qty: "5", unit: "" })]),
        }));
        expect(html).not.toContain("5 metre");
        expect(html).toContain(">5<");
    });

    it("başlıkta sabit 'Adet' alt-etiketi YOK (birim artık satır bazlı)", () => {
        const html = renderToStaticMarkup(createElement(QuoteDocument, {
            data: makeDocData([docRow()]),
        }));
        // qty başlığı BILINGUAL "Miktar / Qty" — sabit "Adet" kolon etiketi olmamalı.
        expect(html).not.toMatch(/>Adet</);
    });
});

// ── 5. buildQuoteDataFromDetail unit eşlemesi ───────────────────────────────

function makeLineItem(over: Partial<QuoteLineItem> = {}): QuoteLineItem {
    return {
        id: "l1", position: 1, productId: "p1", productCode: "KV-1", leadTime: "2 hafta",
        description: "Vana", quantity: 10, unitPrice: 100, lineTotal: 1000, hsCode: "8481.80",
        weightKg: 3, sizeText: "DN50", unitWeightKg: 0.3, kgManualOverride: false, note: "",
        unit: "", ...over,
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

describe("buildQuoteDataFromDetail — unit eşlemesi", () => {
    it("satır birimi rows[].unit'e taşınır (null → '')", () => {
        const data = buildQuoteDataFromDetail(makeDetail([
            makeLineItem({ unit: "kg" }),
            makeLineItem({ id: "l2", unit: "" }),
        ]), null);
        expect(data.rows.map(r => r.unit)).toEqual(["kg", ""]);
    });
});

// ── 6. QuotePdfDocument gerçek render smoke ─────────────────────────────────

describe("renderQuotePdfBuffer — birimli satır", () => {
    it("birimli satır → geçerli PDF üretir (crash etmez)", async () => {
        const buf = await renderQuotePdfBuffer(makeDocData([
            docRow({ qty: "12", unit: "metre" }),
            docRow({ code: "KV-2", qty: "3", unit: "" }),
        ]));
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.length).toBeGreaterThan(10 * 1024);
    }, 30000);
});

// ── 7. QuoteForm source-lock ────────────────────────────────────────────────

const FORM_SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
    "utf8",
);

describe("QuoteForm — satır birimi entegrasyonu", () => {
    it("QuoteRow tipinde unit alanı var", () => {
        expect(FORM_SOURCE).toMatch(/unit:\s*string;/);
    });

    it("emptyRow() yeni satırda unit=''", () => {
        expect(FORM_SOURCE).toMatch(/function emptyRow[\s\S]{0,400}unit:\s*""/);
    });

    it("handleSelectProduct ürün seçilince products.unit'ten otomatik doldurur", () => {
        expect(FORM_SOURCE).toMatch(/updateRow\(rowId,\s*"unit",\s*p\.unit\s*\?\?\s*""\)/);
    });

    it("buildQuotePayload unit'i boşsa göndermez", () => {
        expect(FORM_SOURCE).toMatch(/unit:\s*r\.unit\.trim\(\)\s*\|\|\s*undefined/);
    });

    it("initialData hydration unit'i çeker", () => {
        expect(FORM_SOURCE).toMatch(/unit:\s*l\.unit\s*\?\?\s*""/);
    });

    it("Miktar hücresinde birim input'u (datalist + updateRow unit)", () => {
        expect(FORM_SOURCE).toMatch(/list="quote-units"/);
        expect(FORM_SOURCE).toMatch(/updateRow\(row\.id,\s*"unit",\s*e\.target\.value\)/);
    });

    it("yaygın birim önerileri datalist'i tanımlı", () => {
        expect(FORM_SOURCE).toMatch(/<datalist id="quote-units">/);
        expect(FORM_SOURCE).toMatch(/value="adet"/);
        expect(FORM_SOURCE).toMatch(/value="metre"/);
    });
});

// ── 8. Gate baseline kayıtları ──────────────────────────────────────────────

describe("gate — 099 RPC redefinition zincirleri + migration probe", () => {
    it("sql-lint-baseline dört zincire de 099 ekler", () => {
        expect(REDEFINITION_CHAINS.create_quote_with_lines).toContain("099");
        expect(REDEFINITION_CHAINS.update_quote_with_lines).toContain("099");
        expect(REDEFINITION_CHAINS.send_quote_and_create_pending_order).toContain("099");
        expect(REDEFINITION_CHAINS.accept_quote_and_create_order).toContain("099");
    });

    it("check-migrations PROBES'a 099 unit kolonu kaydı eklenir", () => {
        const SRC = readFileSync(join(process.cwd(), "scripts/check-migrations.ts"), "utf8");
        expect(SRC).toMatch(/"099":\s*\{\s*kind:\s*"column",\s*table:\s*"quote_line_items",\s*column:\s*"unit"\s*\}/);
    });
});
