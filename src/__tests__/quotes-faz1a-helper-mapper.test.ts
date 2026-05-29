/**
 * Teklif Faz 1a — mapper + helper yeni alan testleri.
 *
 * - mapProduct → hsCode / sizeText (V4-B3)
 * - mapQuoteDetail → customerAddress + seller_* (V4-A2, V4-A3)
 * - mapQuoteLineItem → unitWeightKg / kgManualOverride (V3-B5, V4-A7)
 * - dbCreateQuote → yeni header/line alanları RPC payload'a iletir
 * - dbCreateProduct → hs_code / size_text insert'e iletir
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapProduct, mapQuoteDetail } from "@/lib/api-mappers";
import type { ProductWithStock, QuoteWithLines, QuoteLineItemRow } from "@/lib/database.types";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeProductRow(over: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "p-1", name: "Vana", sku: "KV-DN50", category: null, unit: "adet",
        price: 100, currency: "USD", on_hand: 10, reserved: 0, min_stock_level: 0,
        is_active: true, product_type: "finished", warehouse: null, reorder_qty: null,
        preferred_vendor: null, preferred_vendor_id: null, daily_usage: null,
        lead_time_days: null, created_at: "", updated_at: "", product_family: null,
        sub_category: null, sector_compatibility: null, cost_price: null, weight_kg: null,
        material_quality: null, origin_country: null, production_site: null, use_cases: null,
        industries: null, standards: null, certifications: null, product_notes: null,
        parasut_product_id: null, parasut_synced_at: null, parasut_product_creating_until: null,
        parasut_product_creating_owner: null, product_type_id: null, attributes: {},
        hs_code: null, size_text: null, available_now: 10,
        ...over,
    };
}

function makeLine(over: Partial<QuoteLineItemRow> = {}): QuoteLineItemRow {
    return {
        id: "l-1", quote_id: "q-1", position: 1, product_id: null, product_code: "K1",
        lead_time: null, description: "Vana", quantity: 1, unit_price: 1, line_total: 1,
        hs_code: null, weight_kg: null, size_text: null, unit_weight_kg: null,
        kg_manual_override: false, created_at: "",
        ...over,
    };
}

function makeQuoteRow(over: Partial<QuoteWithLines> = {}): QuoteWithLines {
    return {
        id: "q-1", quote_number: "TKL-2026-001", status: "draft", customer_id: null,
        customer_name: "ACME Ltd", customer_contact: null, customer_phone: null,
        customer_email: null, customer_address: null, sales_rep: null, sales_phone: null,
        sales_email: null, currency: "USD", vat_rate: 20, subtotal: 100, vat_total: 20,
        grand_total: 120, notes: null, sig_prepared: null, sig_approved: null,
        sig_manager: null, quote_date: null, valid_until: null, delivery_method: null,
        payment_method: null, seller_name: null, seller_phone: null, seller_email: null,
        seller_address: null, seller_tax_id: null, seller_website: null, seller_logo_url: null,
        created_at: "", updated_at: "", lines: [],
        ...over,
    };
}

// ── 1. mapProduct ───────────────────────────────────────────────────────────

describe("mapProduct — Faz 1a GTİP + ölçü", () => {
    it("hs_code/size_text null → null", () => {
        const r = mapProduct(makeProductRow());
        expect(r.hsCode).toBeNull();
        expect(r.sizeText).toBeNull();
    });
    it("hs_code/size_text dolu → aynen geçer", () => {
        const r = mapProduct(makeProductRow({ hs_code: "8481.80.99", size_text: "DN50" }));
        expect(r.hsCode).toBe("8481.80.99");
        expect(r.sizeText).toBe("DN50");
    });
});

// ── 2. mapQuoteDetail — customer_address + seller_* ─────────────────────────

describe("mapQuoteDetail — Faz 1a snapshot alanları", () => {
    it("null değerler → boş string", () => {
        const r = mapQuoteDetail(makeQuoteRow());
        expect(r.customerAddress).toBe("");
        expect(r.sellerName).toBe("");
        expect(r.sellerLogoUrl).toBe("");
    });
    it("dolu değerler aynen geçer", () => {
        const r = mapQuoteDetail(makeQuoteRow({
            customer_address: "İstanbul",
            seller_name: "PMT Endüstri A.Ş.", seller_phone: "+90 212",
            seller_email: "info@pmt.com", seller_address: "OSB 5. Cad",
            seller_tax_id: "1234567890", seller_website: "pmt.com.tr",
            seller_logo_url: "https://x/logo.png",
        }));
        expect(r.customerAddress).toBe("İstanbul");
        expect(r.sellerName).toBe("PMT Endüstri A.Ş.");
        expect(r.sellerPhone).toBe("+90 212");
        expect(r.sellerEmail).toBe("info@pmt.com");
        expect(r.sellerAddress).toBe("OSB 5. Cad");
        expect(r.sellerTaxId).toBe("1234567890");
        expect(r.sellerWebsite).toBe("pmt.com.tr");
        expect(r.sellerLogoUrl).toBe("https://x/logo.png");
    });
});

// ── 3. mapQuoteLineItem (via mapQuoteDetail) — unitWeight + override ─────────

describe("mapQuoteLineItem — Faz 1a birim ağırlık + override", () => {
    it("null/false default", () => {
        const r = mapQuoteDetail(makeQuoteRow({ lines: [makeLine()] }));
        expect(r.lines[0].unitWeightKg).toBeNull();
        expect(r.lines[0].kgManualOverride).toBe(false);
    });
    it("dolu değerler geçer", () => {
        const r = mapQuoteDetail(makeQuoteRow({
            lines: [makeLine({ unit_weight_kg: 2.5, kg_manual_override: true })],
        }));
        expect(r.lines[0].unitWeightKg).toBe(2.5);
        expect(r.lines[0].kgManualOverride).toBe(true);
    });
});

// ── 4. Helper RPC / insert forward ──────────────────────────────────────────

const mockRpc = vi.fn();
const mockMaybeSingle = vi.fn();
const mockInsertSingle = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        rpc: (name: string, args: unknown) => mockRpc(name, args),
        from: () => ({
            // dbGetQuote: select().eq().maybeSingle()
            select: () => ({
                eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
            }),
            // dbCreateProduct: insert().select().single()
            insert: (payload: unknown) => ({
                select: () => ({ single: () => mockInsertSingle(payload) }),
            }),
        }),
    }),
}));

describe("dbCreateQuote — Faz 1a yeni alanları RPC payload'a iletir", () => {
    beforeEach(() => { mockRpc.mockReset(); mockMaybeSingle.mockReset(); });

    it("customer_address + seller_* + line unit_weight_kg/kg_manual_override düşer", async () => {
        mockRpc.mockResolvedValueOnce({ data: "new-id", error: null });
        mockMaybeSingle.mockResolvedValueOnce({ data: { id: "new-id", quote_line_items: [] }, error: null });

        const { dbCreateQuote } = await import("@/lib/supabase/quotes");
        await dbCreateQuote({
            customer_name: "ACME", customer_address: "İstanbul",
            currency: "USD", vat_rate: 20, subtotal: 100, vat_total: 20, grand_total: 120,
            seller_name: "PMT", seller_tax_id: "1234567890",
            lines: [{
                position: 1, product_code: "K1", description: "Vana",
                quantity: 2, unit_price: 50, line_total: 100,
                unit_weight_kg: 2.5, kg_manual_override: true,
            }],
        });

        expect(mockRpc).toHaveBeenCalledWith("create_quote_with_lines", expect.objectContaining({
            p_header: expect.objectContaining({
                customer_address: "İstanbul", seller_name: "PMT", seller_tax_id: "1234567890",
            }),
            p_lines: [expect.objectContaining({ unit_weight_kg: 2.5, kg_manual_override: true })],
        }));
    });
});

describe("dbCreateProduct — Faz 1a hs_code/size_text insert'e iletir", () => {
    beforeEach(() => { mockInsertSingle.mockReset(); });

    it("hs_code + size_text insert payload'a düşer", async () => {
        mockInsertSingle.mockResolvedValueOnce({
            data: { id: "p-1", on_hand: 0, reserved: 0 }, error: null,
        });
        const { dbCreateProduct } = await import("@/lib/supabase/products");
        await dbCreateProduct({ name: "Vana", sku: "KV-DN50", unit: "adet", hs_code: "8481.80.99", size_text: "DN50" });

        expect(mockInsertSingle).toHaveBeenCalledWith(expect.objectContaining({
            hs_code: "8481.80.99", size_text: "DN50",
        }));
    });
});
