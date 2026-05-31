/**
 * Teklif V7 — Faz 3: header iskonto (discount_amount).
 *
 * Türk fatura standardı: Ara Toplam → İskonto → KDV Matrahı (subtotal − discount)
 * → KDV → Genel Toplam (iskonto KDV ÖNCESİ).
 *
 * Test kapsamı:
 *  - Route behavior (mock db): POST/PATCH discount_amount passthrough + draft guard regression.
 *  - Source-regex (form/document/types): formül, hydrate (sessiz-0 koruması), payload,
 *    İskonto satırı, koşullu PDF render, TS/mapper alanları.
 *
 * Form mantığı inline (extracted helper YOK) — proje konvansiyonu (faz1b/faz2)
 * gereği form tarafı source-regex ile test edilir; round-trip wiring (hydrate +
 * payload) regex ile kilitlenir (advisor must-have: edit+kaydet'te iskonto sıfırlanmaz).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const mockDbCreateQuote = vi.fn();
const mockDbGetQuote    = vi.fn();
const mockDbUpdateQuote = vi.fn();
const mockTransition    = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbListQuotes:        vi.fn(),
    dbCreateQuote:       (...args: unknown[]) => mockDbCreateQuote(...args),
    dbGetQuote:          (...args: unknown[]) => mockDbGetQuote(...args),
    dbUpdateQuote:       (...args: unknown[]) => mockDbUpdateQuote(...args),
    dbDeleteQuote:       vi.fn(),
    dbFindQuoteByNumber: vi.fn(),
    dbUpdateQuoteStatus: vi.fn(),
    dbListExpiredQuotes: vi.fn(),
}));

vi.mock("@/lib/services/quote-service", () => ({
    serviceTransitionQuote: (...args: unknown[]) => mockTransition(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByQuoteId: vi.fn(() => Promise.resolve(null)),
}));

import { POST } from "@/app/api/quotes/route";
import { PATCH } from "@/app/api/quotes/[id]/route";
import { validateDiscount } from "@/lib/quote-validation";

const QUOTE_ID = "quote-faz3-uuid";

const fullRow = {
    id: QUOTE_ID, quote_number: "TKL-2026-003", status: "draft",
    customer_name: "Acme Ltd", customer_address: "İstanbul",
    customer_id: null, customer_contact: null, customer_phone: null, customer_email: null,
    sales_rep: null, sales_phone: null, sales_email: null,
    currency: "USD", vat_rate: 20, subtotal: 1000, vat_total: 180, grand_total: 1080,
    discount_amount: 100,
    notes: null, sig_prepared: null, sig_approved: null, sig_manager: null,
    quote_date: "2026-05-29", valid_until: null,
    delivery_method: null, payment_method: null,
    created_at: "2026-05-29T00:00:00Z", updated_at: "2026-05-29T00:00:00Z",
    lines: [],
};

function base(extra: Record<string, unknown> = {}) {
    return {
        customer_name: "Acme Ltd", currency: "USD",
        vat_rate: 20, subtotal: 1000, vat_total: 180, grand_total: 1080,
        ...extra,
    };
}
function postReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/quotes", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
}
function patchReq(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/quotes/${QUOTE_ID}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
}
function ctx() { return { params: Promise.resolve({ id: QUOTE_ID }) }; }

beforeEach(() => {
    vi.clearAllMocks();
    mockDbCreateQuote.mockResolvedValue(fullRow);
    mockDbGetQuote.mockResolvedValue(fullRow);
    mockDbUpdateQuote.mockResolvedValue(fullRow);
});

// ─── Route behavior: discount_amount passthrough ─────────────────────────────

describe("POST /api/quotes — discount_amount passthrough", () => {
    it("body.discount_amount=100 → dbCreateQuote header'ında discount_amount=100", async () => {
        const res = await POST(postReq(base({ discount_amount: 100, lines: [] })));
        expect(res.status).toBe(201);
        expect(mockDbCreateQuote).toHaveBeenCalledTimes(1);
        expect(mockDbCreateQuote.mock.calls[0][0].discount_amount).toBe(100);
    });

    it("discount_amount=0 → dbCreateQuote'a 0 olarak geçer", async () => {
        const res = await POST(postReq(base({ discount_amount: 0, lines: [] })));
        expect(res.status).toBe(201);
        expect(mockDbCreateQuote.mock.calls[0][0].discount_amount).toBe(0);
    });

    it("negatif discount → 422 + dbCreateQuote çağrılmaz (P2)", async () => {
        const res = await POST(postReq(base({ discount_amount: -10, subtotal: 1000, lines: [] })));
        expect(res.status).toBe(422);
        expect((await res.json()).error).toMatch(/negatif/i);
        expect(mockDbCreateQuote).not.toHaveBeenCalled();
    });

    it("subtotal-üstü discount → 422 (P2)", async () => {
        const res = await POST(postReq(base({ discount_amount: 5000, subtotal: 1000, lines: [] })));
        expect(res.status).toBe(422);
        expect((await res.json()).error).toMatch(/ara toplam/i);
        expect(mockDbCreateQuote).not.toHaveBeenCalled();
    });

    it("malformed discount ('abc') → 422 + dbCreateQuote çağrılmaz (P2 round2)", async () => {
        const res = await POST(postReq(base({ discount_amount: "abc", subtotal: 1000, lines: [] })));
        expect(res.status).toBe(422);
        expect((await res.json()).error).toMatch(/geçerli bir sayı/i);
        expect(mockDbCreateQuote).not.toHaveBeenCalled();
    });

    it("boş string discount ('') → number 0'a normalize edilir + 201 (RPC numeric cast patlamaz)", async () => {
        const res = await POST(postReq(base({ discount_amount: "", subtotal: 1000, lines: [] })));
        expect(res.status).toBe(201);
        // Route normalize eder: dbCreateQuote'a "" değil number 0 gider (RPC ''::numeric 500'ünü önler).
        expect(mockDbCreateQuote.mock.calls[0][0].discount_amount).toBe(0);
        expect(typeof mockDbCreateQuote.mock.calls[0][0].discount_amount).toBe("number");
    });
});

describe("PATCH /api/quotes/[id] — discount_amount passthrough", () => {
    it("document-update discount_amount=150 → dbUpdateQuote'a geçer", async () => {
        const res = await PATCH(patchReq(base({ discount_amount: 150, lines: [] })), ctx());
        expect(res.status).toBe(200);
        expect(mockDbUpdateQuote).toHaveBeenCalledTimes(1);
        expect(mockDbUpdateQuote.mock.calls[0][1].discount_amount).toBe(150);
    });

    it("non-draft teklif → 409 (draft guard regression, iskonto eklenince bozulmadı)", async () => {
        mockDbGetQuote.mockResolvedValue({ ...fullRow, status: "sent" });
        const res = await PATCH(patchReq(base({ discount_amount: 150, lines: [] })), ctx());
        expect(res.status).toBe(409);
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
    });

    it("negatif / subtotal-üstü / malformed discount → 422 (P2)", async () => {
        const neg = await PATCH(patchReq(base({ discount_amount: -5, subtotal: 1000, lines: [] })), ctx());
        expect(neg.status).toBe(422);
        const over = await PATCH(patchReq(base({ discount_amount: 9999, subtotal: 1000, lines: [] })), ctx());
        expect(over.status).toBe(422);
        const bad = await PATCH(patchReq(base({ discount_amount: "abc", subtotal: 1000, lines: [] })), ctx());
        expect(bad.status).toBe(422);
        expect(mockDbUpdateQuote).not.toHaveBeenCalled();
    });
});

// ─── Formül (Türk fatura standardı — referans matematik) ─────────────────────
// effSub=1000, disc=100, vat=20% → matrah=900, vat=180, grand=1080.
// Form inline formülü source-regex ile de kilitlenir (aşağıda).

function refTotals(sub: number, discount: number, vatRate: number) {
    const disc = Math.min(Math.max(discount, 0), sub);
    const vat = (sub - disc) * vatRate / 100;
    return { disc, vat, grand: (sub - disc) + vat };
}

describe("İskonto formülü (KDV öncesi matrah)", () => {
    it("sub 1000, disc 100, vat 20 → matrah 900, vat 180, grand 1080", () => {
        const t = refTotals(1000, 100, 20);
        expect(t.disc).toBe(100);
        expect(t.vat).toBe(180);
        expect(t.grand).toBe(1080);
    });

    it("disc 0 → eski davranış (grand = sub + vat) regression", () => {
        const t = refTotals(1000, 0, 20);
        expect(t.disc).toBe(0);
        expect(t.vat).toBe(200);
        expect(t.grand).toBe(1200);
    });

    it("disc > subtotal → subtotal'a clamp (matrah 0, vat 0)", () => {
        const t = refTotals(1000, 5000, 20);
        expect(t.disc).toBe(1000);
        expect(t.vat).toBe(0);
        expect(t.grand).toBe(0);
    });

    it("negatif disc → 0'a clamp", () => {
        const t = refTotals(1000, -50, 20);
        expect(t.disc).toBe(0);
        expect(t.grand).toBe(1200);
    });
});

// ─── Source-regex: QuoteForm ─────────────────────────────────────────────────

const FORM_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"), "utf8",
);

describe("QuoteForm — iskonto wiring (source-regex)", () => {
    it("discount state", () => {
        expect(FORM_SRC).toMatch(/const \[discount, setDiscount\] = useState\(0\)/);
    });

    it("hydrate: setDiscount(initialData.discountAmount (advisor must-have — sessiz 0'a düşmez)", () => {
        expect(FORM_SRC).toMatch(/setDiscount\(initialData\.discountAmount/);
    });

    it("effDisc clamp 0 ≤ disc ≤ subtotal", () => {
        expect(FORM_SRC).toMatch(/effDisc\s*=\s*Math\.min\(Math\.max\(discount, 0\), effSub\)/);
    });

    it("KDV matrahı iskonto sonrası: (effSub - effDisc)", () => {
        expect(FORM_SRC).toMatch(/\(effSub - effDisc\) \* vatRate \/ 100/);
        expect(FORM_SRC).toMatch(/\(effSub - effDisc\) \+ effVat/);
    });

    it("payload discount_amount: effDisc", () => {
        expect(FORM_SRC).toMatch(/discount_amount: effDisc/);
    });

    it("İskonto satırı input (aria-label) + ↻ revert YOK", () => {
        expect(FORM_SRC).toMatch(/aria-label="İskonto"/);
        // İskonto setDiscount kullanır, setOv* (override paterni) DEĞİL.
        expect(FORM_SRC).toMatch(/setDiscount\(isNaN\(v\) \? 0 : v\)/);
    });
});

// ─── Source-regex: QuoteDocument (PDF) ───────────────────────────────────────

const DOC_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/components/QuoteDocument.tsx"), "utf8",
);

describe("QuoteDocument — koşullu İskonto satırı (source-regex)", () => {
    it("discountAmount > 0 koşullu render (0 ise gizli — eski teklifler temiz)", () => {
        expect(DOC_SRC).toMatch(/data\.discountAmount > 0 &&/);
    });

    it("L.discount TR/EN etiket + eksi işaretli değer", () => {
        expect(DOC_SRC).toMatch(/L\.discount\.tr/);
        expect(DOC_SRC).toMatch(/−\{sym\} \{fmt\(data\.discountAmount\)\}/);
    });
});

// ─── Source-regex: types + mapper + helpers ──────────────────────────────────

describe("TS katmanı — discount alanları (source-regex)", () => {
    it("QuoteRow.discount_amount", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/database.types.ts"), "utf8");
        expect(src).toMatch(/discount_amount: number/);
    });
    it("QuoteDetail.discountAmount + CreateQuoteInput.discount_amount", () => {
        const mock = readFileSync(join(process.cwd(), "src/lib/mock-data.ts"), "utf8");
        expect(mock).toMatch(/discountAmount: number/);
        const q = readFileSync(join(process.cwd(), "src/lib/supabase/quotes.ts"), "utf8");
        expect(q).toMatch(/discount_amount: number/);
    });
    it("mapQuoteDetail discountAmount", () => {
        const m = readFileSync(join(process.cwd(), "src/lib/api-mappers.ts"), "utf8");
        expect(m).toMatch(/discountAmount: Number\(row\.discount_amount\)/);
    });
    it("QuoteData.discountAmount + BILINGUAL_LABELS.discount", () => {
        const t = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/components/quote-types.ts"), "utf8");
        expect(t).toMatch(/discountAmount: number/);
        const h = readFileSync(join(process.cwd(), "src/lib/quote-document-helpers.ts"), "utf8");
        expect(h).toMatch(/discount:\s*\{ tr: "İskonto",\s*en: "Discount" \}/);
    });
    it("migration 070 kolon + 071 RPC discount + draft guard", () => {
        const m70 = readFileSync(join(process.cwd(), "supabase/migrations/070_quotes_discount.sql"), "utf8");
        expect(m70).toMatch(/add column if not exists discount_amount numeric\(15,2\) not null default 0/);
        const m71 = readFileSync(join(process.cwd(), "supabase/migrations/071_quotes_rpc_discount.sql"), "utf8");
        expect(m71).toMatch(/discount_amount/);
        expect(m71).toMatch(/Sadece taslak teklifler düzenlenebilir/);
        // V7-A1: SECURITY DEFINER clause YOK (açıklamadaki "... YOK" ifadesi hariç).
        expect(m71).not.toMatch(/SECURITY DEFINER(?! YOK)/);
    });
});

// ═══ Review düzeltmeleri (Bulgular P2/P3) ════════════════════════════════════

describe("validateDiscount — pure helper (P2)", () => {
    it("negatif → hata", () => {
        expect(validateDiscount(-1, 1000)).toMatch(/negatif/i);
    });
    it("subtotal-üstü → hata", () => {
        expect(validateDiscount(1500, 1000)).toMatch(/ara toplam/i);
    });
    it("0 ≤ disc ≤ subtotal → null", () => {
        expect(validateDiscount(0, 1000)).toBeNull();
        expect(validateDiscount(250, 1000)).toBeNull();
        expect(validateDiscount(1000, 1000)).toBeNull(); // sınır dahil
    });
    it("NaN / Infinity → hata (malformed payload guard)", () => {
        expect(validateDiscount(NaN, 1000)).toMatch(/geçerli bir sayı/i);
        expect(validateDiscount(Infinity, 1000)).toMatch(/geçerli bir sayı/i);
        expect(validateDiscount(Number("abc"), 1000)).toMatch(/geçerli bir sayı/i); // Number("abc")=NaN
        expect(validateDiscount(100, NaN)).toMatch(/ara toplam geçersiz/i);
    });
});

describe("QuoteForm — review fix source-regex (P2/P3)", () => {
    it("autosave teklif_v3 payload'ında discount + restore setDiscount(saved.discount)", () => {
        // Faz 7 Bulgular 2.tur: payload çok-satırlı + notes/deliveryMethod/paymentMethod eklendi.
        expect(FORM_SRC).toMatch(/JSON\.stringify\(\{\s*currency, rows, descDirty, discount\b/);
        expect(FORM_SRC).toMatch(/setDiscount\(saved\.discount\)/);
    });

    it("4 toplam input onFocus'ta ham sayı (yuvarlı String) — formatlı template DEĞİL", () => {
        // String(Math.round(eff*100)/100): binlik ayraç yok (parse fix) + hesaplanan
        // alanlarda uzun ondalık (246.912) görünmesin.
        expect(FORM_SRC).toMatch(/setSubDisp\(effSub > 0 \? String\(Math\.round\(effSub \* 100\) \/ 100\)/);
        expect(FORM_SRC).toMatch(/setVatDisp\(effVat > 0 \? String\(Math\.round\(effVat \* 100\) \/ 100\)/);
        expect(FORM_SRC).toMatch(/setGrandDisp\(effGrand > 0 \? String\(Math\.round\(effGrand \* 100\) \/ 100\)/);
        expect(FORM_SRC).toMatch(/setDiscDisp\(effDisc > 0 \? String\(Math\.round\(effDisc \* 100\) \/ 100\)/);
        // Regression: onFocus'ta artık `${sym} ${fmt(eff*)}` YOK.
        expect(FORM_SRC).not.toMatch(/setSubDisp\(effSub > 0 \? `\$\{sym\}/);
    });
});

describe("Convert iskonto block (P1) + migration 072 CHECK", () => {
    it("quote-service convert discount_amount > 0 → block", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/services/quote-service.ts"), "utf8");
        expect(src).toMatch(/Number\(quote\.discount_amount\) > 0/);
    });
    it("[id]/page.tsx Faz 6: iskonto convert-block notu KALDIRILDI (sipariş artık iskonto destekli)", () => {
        const p = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/[id]/page.tsx"), "utf8");
        // Faz 6 (077): sales_orders.discount_amount geldi → iskontolu teklif de
        // atomik /accept ile siparişe dönüşür; Faz 3 interim blok notu kalkar.
        expect(p).not.toMatch(/quote\.discountAmount > 0/);
        expect(p).not.toMatch(/dönüştürülemiyor/);
        expect(p).not.toMatch(/kaldırırsanız dönüştürebilirsiniz/);
    });
    it("migration 072 discount_amount >= 0 CHECK + idempotent guard (P3 round2)", () => {
        const m72 = readFileSync(join(process.cwd(), "supabase/migrations/072_quotes_discount_check.sql"), "utf8");
        expect(m72).toMatch(/check \(discount_amount >= 0\)/);
        // Idempotent: pg_constraint guard → manuel double-apply patlamaz.
        expect(m72).toMatch(/pg_constraint where conname = 'quotes_discount_nonneg'/);
    });
});
