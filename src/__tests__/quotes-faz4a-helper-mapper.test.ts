/**
 * Faz 4a (2026-05-23) — Quote helper + mapper + form yeni alan testleri.
 *
 * Coverage:
 *   - CreateQuoteInput/CreateQuoteLineInput delivery_method/payment_method/size_text
 *     opsiyonel olarak kabul edilir + RPC'ye iletilir
 *   - mapQuoteDetail row'dan deliveryMethod/paymentMethod expose eder
 *   - mapQuoteLineItem row'dan sizeText expose eder
 *   - QuoteForm payload yeni alanları doğru gönderir + yeni state alanları + UI elementleri var
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapQuoteDetail } from "@/lib/api-mappers";
import type { QuoteWithLines } from "@/lib/database.types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── 1. Mapper testleri ──────────────────────────────────────────────────────

function makeQuoteRow(over: Partial<QuoteWithLines> = {}): QuoteWithLines {
    return {
        id: "q-1",
        quote_number: "TKL-2026-001",
        status: "draft",
        customer_id: null,
        customer_name: "ACME Ltd",
        customer_contact: null,
        customer_phone: null,
        customer_email: null,
        sales_rep: null,
        sales_phone: null,
        sales_email: null,
        currency: "USD",
        vat_rate: 20,
        subtotal: 100,
        vat_total: 20,
        grand_total: 120,
        notes: null,
        sig_prepared: null,
        sig_approved: null,
        sig_manager: null,
        quote_date: "2026-05-23",
        valid_until: "2026-06-22",
        delivery_method: null,
        payment_method: null,
        created_at: "2026-05-23T00:00:00Z",
        updated_at: "2026-05-23T00:00:00Z",
        lines: [],
        ...over,
    };
}

describe("mapQuoteDetail — Faz 4a delivery/payment exposure", () => {
    it("delivery_method + payment_method null → camelCase boş string", () => {
        const result = mapQuoteDetail(makeQuoteRow());
        expect(result.deliveryMethod).toBe("");
        expect(result.paymentMethod).toBe("");
    });

    it("delivery_method + payment_method dolu → aynen geçer", () => {
        const result = mapQuoteDetail(makeQuoteRow({
            delivery_method: "İSTANBUL PMT DEPO TESLİMİ",
            payment_method: "%50 AVANS, %50 SEVKE HAZIR OLUNCA",
        }));
        expect(result.deliveryMethod).toBe("İSTANBUL PMT DEPO TESLİMİ");
        expect(result.paymentMethod).toBe("%50 AVANS, %50 SEVKE HAZIR OLUNCA");
    });
});

describe("mapQuoteDetail — lines sizeText exposure", () => {
    it("size_text null → sizeText boş string", () => {
        const result = mapQuoteDetail(makeQuoteRow({
            lines: [{
                id: "l-1", quote_id: "q-1", position: 1,
                product_id: null, product_code: "KOD-1",
                lead_time: null, description: "Vana",
                quantity: 10, unit_price: 5, line_total: 50,
                hs_code: null, weight_kg: null, size_text: null,
                created_at: "2026-05-23T00:00:00Z",
            }],
        }));
        expect(result.lines[0].sizeText).toBe("");
    });

    it("size_text dolu → sizeText aynen geçer ('3/4''', 'DN50', '8\\\"')", () => {
        const result = mapQuoteDetail(makeQuoteRow({
            lines: [
                { id: "l-1", quote_id: "q-1", position: 1, product_id: null, product_code: "K1", lead_time: null, description: "v1", quantity: 1, unit_price: 1, line_total: 1, hs_code: null, weight_kg: null, size_text: "3/4''", created_at: "" },
                { id: "l-2", quote_id: "q-1", position: 2, product_id: null, product_code: "K2", lead_time: null, description: "v2", quantity: 1, unit_price: 1, line_total: 1, hs_code: null, weight_kg: null, size_text: "DN50", created_at: "" },
                { id: "l-3", quote_id: "q-1", position: 3, product_id: null, product_code: "K3", lead_time: null, description: "v3", quantity: 1, unit_price: 1, line_total: 1, hs_code: null, weight_kg: null, size_text: "8\"", created_at: "" },
            ],
        }));
        expect(result.lines.map(l => l.sizeText)).toEqual(["3/4''", "DN50", "8\""]);
    });
});

// ── 2. Helper RPC çağrı testi ───────────────────────────────────────────────

const mockRpc = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        rpc: (name: string, args: unknown) => mockRpc(name, args),
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
            }),
        }),
    }),
}));

describe("dbCreateQuote — Faz 4a yeni alanları RPC payload'a iletir", () => {
    beforeEach(() => {
        mockRpc.mockReset();
        mockMaybeSingle.mockReset();
    });

    it("delivery_method + payment_method + size_text RPC p_header/p_lines'a düşer", async () => {
        mockRpc.mockResolvedValueOnce({ data: "new-quote-id", error: null });
        mockMaybeSingle.mockResolvedValueOnce({
            data: { id: "new-quote-id", quote_line_items: [] },
            error: null,
        });

        const { dbCreateQuote } = await import("@/lib/supabase/quotes");
        await dbCreateQuote({
            customer_name: "ACME",
            currency: "USD",
            vat_rate: 20,
            subtotal: 100,
            vat_total: 20,
            grand_total: 120,
            delivery_method: "İSTANBUL PMT DEPO TESLİMİ",
            payment_method: "%50 AVANS, %50 SEVKE HAZIR OLUNCA",
            lines: [{
                position: 1,
                product_code: "KOD-1",
                description: "Vana",
                quantity: 1,
                unit_price: 100,
                line_total: 100,
                size_text: "3/4''",
            }],
        });

        expect(mockRpc).toHaveBeenCalledWith("create_quote_with_lines", expect.objectContaining({
            p_header: expect.objectContaining({
                delivery_method: "İSTANBUL PMT DEPO TESLİMİ",
                payment_method: "%50 AVANS, %50 SEVKE HAZIR OLUNCA",
            }),
            p_lines: [expect.objectContaining({ size_text: "3/4''" })],
        }));
    });
});

// ── 3. Form source-regex (lock) ─────────────────────────────────────────────

const FORM_SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
    "utf8",
);

describe("QuoteForm — Faz 4a UI alanları", () => {
    it("QuoteRow tipinde 'size' field var (size_text karşılığı)", () => {
        expect(FORM_SOURCE).toMatch(/size:\s*string;/);
    });

    it("emptyRow() yeni satırda size=''", () => {
        expect(FORM_SOURCE).toMatch(/function emptyRow[\s\S]{0,200}size:\s*""/);
    });

    it("State'te deliveryMethod + paymentMethod tanımlandı", () => {
        expect(FORM_SOURCE).toMatch(/const \[deliveryMethod, setDeliveryMethod\] = useState\(""\)/);
        expect(FORM_SOURCE).toMatch(/const \[paymentMethod, setPaymentMethod\] = useState\(""\)/);
    });

    it("buildQuotePayload delivery_method + payment_method + size_text yollar", () => {
        expect(FORM_SOURCE).toMatch(/delivery_method:\s*deliveryMethod\s*\|\|\s*undefined/);
        expect(FORM_SOURCE).toMatch(/payment_method:\s*paymentMethod\s*\|\|\s*undefined/);
        expect(FORM_SOURCE).toMatch(/size_text:\s*r\.size\s*\|\|\s*undefined/);
    });

    it("initialData hydration deliveryMethod/paymentMethod/sizeText'i çeker", () => {
        expect(FORM_SOURCE).toMatch(/setDeliveryMethod\(initialData\.deliveryMethod\)/);
        expect(FORM_SOURCE).toMatch(/setPaymentMethod\(initialData\.paymentMethod\)/);
        expect(FORM_SOURCE).toMatch(/size:\s*l\.sizeText/);
    });

    it("Tablo başlığında 'Size / Ölçü' kolonu var", () => {
        expect(FORM_SOURCE).toMatch(/>Size</);
        expect(FORM_SOURCE).toMatch(/>Ölçü</);
    });

    it("Tablo hücresinde size input + aria-label", () => {
        expect(FORM_SOURCE).toMatch(/value=\{row\.size\}/);
        expect(FORM_SOURCE).toMatch(/aria-label=\{`Satır \$\{idx \+ 1\} ölçü`\}/);
    });

    it("Teslimat/Ödeme bloğu bilingual etiket + textarea + aria-label", () => {
        expect(FORM_SOURCE).toMatch(/Delivery Method[\s\S]{0,200}Teslimat Şekli/);
        expect(FORM_SOURCE).toMatch(/Payment Method[\s\S]{0,200}Ödeme Şekli/);
        expect(FORM_SOURCE).toMatch(/aria-label="Teslimat şekli"/);
        expect(FORM_SOURCE).toMatch(/aria-label="Ödeme şekli"/);
    });
});

// ── Faz 4a Review (2026-05-23) — Preview/PDF data contract lock ──────────────

const TYPES_SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/components/quote-types.ts"),
    "utf8",
);

const DOC_SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/components/QuoteDocument.tsx"),
    "utf8",
);

const DOC_HELPERS_SOURCE = readFileSync(
    join(process.cwd(), "src/lib/quote-document-helpers.ts"),
    "utf8",
);

describe("Faz 4a Review — preview/PDF contract", () => {
    it("QuoteData interface deliveryMethod + paymentMethod alanlarını içerir", () => {
        expect(TYPES_SOURCE).toMatch(/deliveryMethod:\s*string;/);
        expect(TYPES_SOURCE).toMatch(/paymentMethod:\s*string;/);
    });

    it("QuoteRow (preview) interface size alanını içerir", () => {
        expect(TYPES_SOURCE).toMatch(/interface QuoteRow\s*\{[\s\S]{0,800}size:\s*string;/);
    });

    it("QuoteForm autoSave() payload deliveryMethod + paymentMethod yazıyor (preview kontratı)", () => {
        // autoSave fullData içinde delivery + payment field var
        // Faz 3: iskonto IIFE'leri autoSave bloğunu uzattı → pencere 2000→2600.
        expect(FORM_SOURCE).toMatch(/const autoSave = useCallback[\s\S]{0,2600}deliveryMethod,\s*\n\s*paymentMethod/);
    });

    it("QuoteForm savePreviewData() payload deliveryMethod + paymentMethod yazıyor", () => {
        expect(FORM_SOURCE).toMatch(/savePreviewData = useCallback[\s\S]{0,2000}deliveryMethod,\s*\n\s*paymentMethod/);
    });

    it("useCallback dep array'lerinde deliveryMethod + paymentMethod var (stale closure önleme)", () => {
        // En az 2 callback dep array'inde ikisi de geçmeli
        const depMatches = FORM_SOURCE.match(/notes,\s*deliveryMethod,\s*paymentMethod/g) ?? [];
        expect(depMatches.length).toBeGreaterThanOrEqual(2);
    });

    it("QuoteDocument terms band conditional render (Faz 4c: 3-column delivery|validity|payment)", () => {
        // Faz 4c güncellemesi (2026-05-25): Eskiden `deliveryMethod || paymentMethod`
        // 2-row vertical; 4c'de validUntil 3. kolona alındı, conditional genişledi.
        expect(DOC_SOURCE).toMatch(/data\.deliveryMethod \|\| data\.validUntil \|\| data\.paymentMethod/);
        // Bilingual etiketler — BILINGUAL_LABELS map'inde tanımlı (quote-document-helpers.ts)
        expect(DOC_HELPERS_SOURCE).toMatch(/Teslimat Şekli/);
        expect(DOC_HELPERS_SOURCE).toMatch(/Delivery Method/);
        expect(DOC_HELPERS_SOURCE).toMatch(/Ödeme Şekli/);
        expect(DOC_HELPERS_SOURCE).toMatch(/Payment Method/);
        // Geçerlilik Tarihi etiketi 3. kolonda (PMT brand 3-col layout).
        // Faz 4c Review (2026-05-25): label "Geçerlilik Süresi" → "Geçerlilik Tarihi"
        // (data ISO tarih olduğu için label semantik fix).
        expect(DOC_HELPERS_SOURCE).toMatch(/Geçerlilik Tarihi/);
    });

    // ── Bulgu 1 (2. review tur, 2026-05-30): müşteri adresi resmi belgede ──────
    it("QuoteData interface custAddress alanını içerir", () => {
        expect(TYPES_SOURCE).toMatch(/custAddress:\s*string;/);
    });

    it("BILINGUAL_LABELS address (Adres/Address) tanımlı", () => {
        expect(DOC_HELPERS_SOURCE).toMatch(/address:\s*\{[^}]*tr:\s*"Adres"[^}]*en:\s*"Address"/);
    });

    it("QuoteDocument müşteri bloğu L.address + data.custAddress satırı içerir", () => {
        expect(DOC_SOURCE).toMatch(/\[L\.address,\s*data\.custAddress\]/);
    });

    it("QuoteForm her iki QuoteData builder'ı + her iki dep array custAddress taşır (preview/arşiv drift'siz)", () => {
        // 2 fullData payload (autoSave + savePreviewData) + 2 useCallback dep array = 4
        const occ = FORM_SOURCE.match(/custEmail, custAddress/g) ?? [];
        expect(occ.length).toBe(4);
    });

    it("QuoteDocument lines tablosu row.size render eder + colSpan empty 10'a güncel", () => {
        expect(DOC_SOURCE).toMatch(/\{row\.size \|\| "—"\}/);
        // Faz 4c güncellemesi: Size header BILINGUAL_LABELS.size'den geliyor (quote-document-helpers.ts).
        // Map içeriği: { tr: "Ölçü", en: "Size" } — TR ana / EN alt italic.
        expect(DOC_HELPERS_SOURCE).toMatch(/size:\s*\{\s*tr:\s*"Ölçü"/);
        // Empty colSpan eskiden 9; yeni Size kolonu ile 10
        expect(DOC_SOURCE).toMatch(/colSpan=\{10\}/);
        expect(DOC_SOURCE).not.toMatch(/colSpan=\{9\}/);
    });
});
