/**
 * Teklif satırı "Teslim Süresi" — hafta bazlı giriş GÖRÜNÜR (2026-09-12).
 *
 * Kullanıcı: "lead time hafta bazlı da giriş olabilsin — 3 hafta, 4 hafta vs
 * tarzı". Ölçüm: alan ZATEN serbest metindi (`quote_line_items.lead_time text`,
 * mig.034; altı RPC nesli `NULLIF(ln->>'lead_time','')` ile ham geçirir, hiçbir
 * katman güne ayrıştırmaz — bu dosyanın 4. bloğu tam bu zinciri kanıtlar) ama
 * form yalnız "30 gün" yer tutucusu veriyordu: hafta yazılabildiği ekranda
 * görünmüyordu. Düzeltme, 099'un Birim kolonu deseni: `<datalist>` önerileri
 * (gün VE hafta) + serbest yazım korunur ("Stoktan", "2-3 hafta").
 *
 * Kaynak iddiaları YORUMLARI SOYULMUŞ metin üzerinde ve İLGİLİ ELEMANIN
 * GÖVDESİNE sınırlı (lead input'unun kendi `<input … />` etiketi; datalist'in
 * kendi `<datalist>…</datalist>` gövdesi) — kuralın gerekçe yorumu kuralı
 * tetiklemesin, mutasyon sınırın içine düşsün.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { buildQuoteDataFromDetail, renderQuoteArchiveHtml } from "@/lib/quote-archive-html";
import QuoteDocument from "@/app/dashboard/quotes/components/QuoteDocument";
import type { QuoteWithLines, QuoteLineItemRow } from "@/lib/database.types";

// Satır yorumları ÖNCE: bir `//` yorumundaki `/*` aksi hâlde blok başlangıcı
// sanılıp gerçek kodu yutar (2026-08 dersi).
const code = (src: string) =>
    src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const FORM = code(readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
    "utf8",
));

/**
 * Teslim süresi hücresinin KENDİ `<input … />` etiketi. `[^>]*` KULLANILAMAZ:
 * `onChange={e => …}` içindeki `=>` etiketi erken keser; bu yüzden `/>`
 * geçmeyen tempered tarama. Bir önceki input (ürün kodu) kendi `/>`ıyla
 * biter, o yüzden yakalama komşuya taşamaz.
 */
function leadInput(): string {
    const m = FORM.match(/<input(?:(?!\/>)[\s\S])*?teslim süresi(?:(?!\/>)[\s\S])*?\/>/);
    expect(m, "teslim süresi input'u bulunamadı").not.toBeNull();
    return m![0];
}

function leadDatalistValues(): string[] {
    const m = FORM.match(/<datalist id="quote-lead-times">([\s\S]*?)<\/datalist>/);
    expect(m, "quote-lead-times datalist'i tanımlı değil").not.toBeNull();
    const values = Array.from(m![1].matchAll(/<option value="([^"]+)" \/>/g), x => x[1]);
    expect(values.length, "datalist boş — boş küme denetlenmesin").toBeGreaterThanOrEqual(5);
    return values;
}

// ── 1. Hücre öneri listesine bağlı ──────────────────────────────────────────

describe("QuoteForm — teslim süresi hücresi", () => {
    it("lead input'u quote-lead-times önerilerine bağlı (aynı etiket içinde)", () => {
        const input = leadInput();
        expect(input).toMatch(/list="quote-lead-times"/);
        // Veri yolu değişmedi: aynı input hâlâ satırın `lead` alanına yazar.
        expect(input).toMatch(/updateRow\(row\.id,\s*"lead",\s*e\.target\.value\)/);
    });

    it("yer tutucu artık yalnız gün demiyor", () => {
        const input = leadInput();
        expect(input).toMatch(/placeholder="gün \/ hafta"/);
        // Kusurun ta kendisi geri gelmesin.
        expect(input, "yer tutucu yine yalnız '30 gün'").not.toMatch(/placeholder="30 gün"/);
    });
});

// ── 2. Öneri listesi: gün VE hafta ──────────────────────────────────────────

describe("QuoteForm — quote-lead-times önerileri", () => {
    it("hem gün hem hafta seçenekleri var; kullanıcının örnekleri birebir", () => {
        const values = leadDatalistValues();
        // İstek "hafta bazlı DA": gün seçenekleri kalır …
        expect(values.filter(v => /^\d+ gün$/.test(v)).length).toBeGreaterThanOrEqual(1);
        expect(values).toContain("30 gün");
        // … hafta seçenekleri gelir — kullanıcının söylediği ikisi harfi harfine.
        expect(values.filter(v => /^\d+ hafta$/.test(v)).length).toBeGreaterThanOrEqual(3);
        expect(values).toContain("3 hafta");
        expect(values).toContain("4 hafta");
    });

    it("liste öneridir, kısıt değil: input serbest metin kalır (sayı tipi / pattern yok)", () => {
        const input = leadInput();
        expect(input).not.toMatch(/type="number"/);
        expect(input).not.toMatch(/\bpattern=/);
        // Stoktan teslim de listede — sayı-birim kalıbına sığmayan meşru değer.
        expect(leadDatalistValues()).toContain("Stoktan");
    });
});

// ── 3. Davranış: haftalık değer hiçbir katmanda güne çevrilmez ──────────────

function makeLineRow(over: Partial<QuoteLineItemRow> = {}): QuoteLineItemRow {
    return {
        id: "l-1", quote_id: "q-1", position: 1, product_id: null, product_code: "KV-3P-DN50",
        lead_time: null, description: "3 Parçalı Küresel Vana DN50", quantity: 10, unit_price: 450,
        line_total: 4500, hs_code: "8481.80", weight_kg: null, size_text: null, unit_weight_kg: null,
        kg_manual_override: false, note: null, unit: "adet", created_at: "",
        ...over,
    };
}

function makeQuoteRow(lines: QuoteLineItemRow[]): QuoteWithLines {
    return {
        id: "q-1", quote_number: "TKL-2026-001", status: "draft", customer_id: null,
        customer_name: "ACME", customer_contact: null, customer_phone: null, customer_email: null,
        sales_rep: null, sales_phone: null, sales_email: null, currency: "USD", vat_rate: 20,
        subtotal: 4500, vat_total: 900, grand_total: 5400, notes: null, sig_prepared: null,
        sig_approved: null, sig_manager: null, quote_date: "2026-09-12", valid_until: null,
        delivery_method: null, payment_method: null,
        created_at: "2026-09-12T00:00:00Z", updated_at: "2026-09-12T00:00:00Z",
        lines,
    } as unknown as QuoteWithLines;
}

describe("teslim süresi — DB → mapper → belge zinciri metni aynen taşır", () => {
    it("'3 hafta' mapper'dan ve arşiv veri modelinden aynen geçer", () => {
        const detail = mapQuoteDetail(makeQuoteRow([makeLineRow({ lead_time: "3 hafta" })]));
        expect(detail.lines[0].leadTime).toBe("3 hafta");

        const data = buildQuoteDataFromDetail(detail, null);
        expect(data.rows[0].lead).toBe("3 hafta");
    });

    it("belge (HTML) ve arşiv hücrede '3 hafta' basar, güne ÇEVİRMEZ", async () => {
        const detail = mapQuoteDetail(makeQuoteRow([makeLineRow({ lead_time: "3 hafta" })]));
        const data = buildQuoteDataFromDetail(detail, null);

        const html = renderToStaticMarkup(createElement(QuoteDocument, { data }));
        expect(html).toMatch(/<td[^>]*>3 hafta<\/td>/);
        expect(html, "haftalık değer güne çevrildi").not.toMatch(/21 gün/);

        const archive = await renderQuoteArchiveHtml(data);
        expect(archive).toMatch(/<td[^>]*>3 hafta<\/td>/);
    });
});
