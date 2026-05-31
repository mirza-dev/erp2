/**
 * RBAC R3 — redact.ts pure helper testleri.
 *
 * KRİTİK doğruluk: route'lar snake_case döndürür → redactor snake_case alanları
 * null'lamalı. camelCase null'lamak alanı SIZDIRIR (regresyon kilidi).
 */
import { describe, it, expect } from "vitest";
import {
    redactProductsForPerms,
    redactCustomersForPerms,
    redactOrdersForPerms,
    redactOrderForPerms,
    redactQuotesForPerms,
    redactQuoteForPerms,
    redactPurchaseOrdersForPerms,
    redactPurchaseOrderForPerms,
} from "@/lib/auth/redact";
import type { Permission } from "@/lib/auth/permissions";

const P = (...perms: Permission[]) => new Set<Permission>(perms);

// ── products ────────────────────────────────────────────────────────────────
describe("redactProductsForPerms", () => {
    const rows = [{ id: "p1", name: "Vana", price: 100, cost_price: 60, currency: "USD" }];

    it("tam yetki (sales+cost) → no-op (aynı referans)", () => {
        const perms = P("view_sales_prices", "view_purchase_costs");
        expect(redactProductsForPerms(rows, perms)).toBe(rows);
    });

    it("yetki yok → price VE cost_price null (SNAKE_CASE)", () => {
        const out = redactProductsForPerms(rows, P());
        expect(out[0].price).toBeNull();
        expect(out[0].cost_price).toBeNull();
        expect(out[0].name).toBe("Vana"); // finansal olmayan korunur
    });

    it("REGRESYON: cost_price null'lanır, camelCase costPrice SIZMAZ", () => {
        const withCamel = [{ id: "p1", cost_price: 60, costPrice: 60 }];
        const out = redactProductsForPerms(withCamel, P());
        expect(out[0].cost_price).toBeNull(); // gerçek route alanı kapanır
        // camelCase alan bu route'ta YOK; helper snake_case'i hedeflediği için
        // sadece cost_price kapanır → asıl response'ta sızıntı olmaz.
    });

    it("sadece sales yetkisi → price kalır, cost_price null", () => {
        const out = redactProductsForPerms(rows, P("view_sales_prices"));
        expect(out[0].price).toBe(100);
        expect(out[0].cost_price).toBeNull();
    });

    it("sadece cost yetkisi → cost_price kalır, price null", () => {
        const out = redactProductsForPerms(rows, P("view_purchase_costs"));
        expect(out[0].price).toBeNull();
        expect(out[0].cost_price).toBe(60);
    });

    it("orijinal diziyi mutate ETMEZ (immutable)", () => {
        redactProductsForPerms(rows, P());
        expect(rows[0].price).toBe(100);
        expect(rows[0].cost_price).toBe(60);
    });

    it("alanı olmayan satıra null key EKLEMEZ (spurious key guard)", () => {
        const minimal = [{ id: "p1", name: "X" }];
        const out = redactProductsForPerms(minimal, P());
        expect("price" in out[0]).toBe(false);
        expect("cost_price" in out[0]).toBe(false);
    });
});

// ── customers ─────────────────────────────────────────────────────────────────
describe("redactCustomersForPerms", () => {
    const rows = [{ id: "c1", name: "Tüpraş", total_revenue: 50000, currency: "TRY" }];

    it("view_financial_summary VAR → no-op", () => {
        expect(redactCustomersForPerms(rows, P("view_financial_summary"))).toBe(rows);
    });

    it("yetki yok → total_revenue null (SNAKE_CASE)", () => {
        const out = redactCustomersForPerms(rows, P());
        expect(out[0].total_revenue).toBeNull();
        expect(out[0].name).toBe("Tüpraş");
    });

    it("immutable + spurious key guard", () => {
        const minimal = [{ id: "c1" }];
        const out = redactCustomersForPerms(minimal, P());
        expect("total_revenue" in out[0]).toBe(false);
        expect(rows[0].total_revenue).toBe(50000);
    });
});

// ── orders (list + detail) ─────────────────────────────────────────────────────
describe("redactOrdersForPerms (list)", () => {
    const list = [{ id: "o1", order_number: "ORD-1", grand_total: 1200, subtotal: 1000, vat_total: 200 }];

    it("view_sales_prices VAR → no-op", () => {
        expect(redactOrdersForPerms(list, P("view_sales_prices"))).toBe(list);
    });

    it("yetki yok → grand_total/subtotal/vat_total null", () => {
        const out = redactOrdersForPerms(list, P());
        expect(out[0].grand_total).toBeNull();
        expect(out[0].subtotal).toBeNull();
        expect(out[0].vat_total).toBeNull();
        expect(out[0].order_number).toBe("ORD-1"); // finansal olmayan korunur
    });

    it("list'te lines yoksa hata vermez (spurious lines key eklenmez)", () => {
        const out = redactOrdersForPerms(list, P());
        expect("lines" in out[0]).toBe(false);
    });
});

describe("redactOrderForPerms (detail, lines'lı)", () => {
    const detail = {
        id: "o1",
        grand_total: 1200,
        subtotal: 1000,
        vat_total: 200,
        lines: [{ id: "l1", unit_price: 500, line_total: 1000, quantity: 2 }],
    };

    it("view_sales_prices VAR → no-op", () => {
        expect(redactOrderForPerms(detail, P("view_sales_prices"))).toBe(detail);
    });

    it("yetki yok → header + satır fiyatları null, quantity korunur", () => {
        const out = redactOrderForPerms(detail, P());
        expect(out.grand_total).toBeNull();
        expect((out.lines as Array<Record<string, unknown>>)[0].unit_price).toBeNull();
        expect((out.lines as Array<Record<string, unknown>>)[0].line_total).toBeNull();
        expect((out.lines as Array<Record<string, unknown>>)[0].quantity).toBe(2); // adet sızıntı değil
    });

    it("orijinal lines dizisini mutate ETMEZ", () => {
        redactOrderForPerms(detail, P());
        expect(detail.lines[0].unit_price).toBe(500);
    });
});

// ── quotes (CAMELCASE — mapper'lı; orders'ın aksine) ────────────────────────────
describe("redactQuotesForPerms (list, CAMELCASE)", () => {
    const list = [{ id: "q1", quoteNumber: "TKL-1", grandTotal: 5000, status: "sent" }];

    it("view_sales_prices VAR → no-op", () => {
        expect(redactQuotesForPerms(list, P("view_sales_prices"))).toBe(list);
    });

    it("yetki yok → grandTotal null (CAMELCASE), quoteNumber korunur", () => {
        const out = redactQuotesForPerms(list, P());
        expect(out[0].grandTotal).toBeNull();
        expect(out[0].quoteNumber).toBe("TKL-1");
        expect(out[0].status).toBe("sent");
    });

    it("REGRESYON: quotes camelCase'tir — snake_case grand_total null'lamak SIZDIRIRDI", () => {
        // Quote route mapper'lı çıktı verir; alan grandTotal'dır. Helper camelCase'i
        // hedefler. (Eğer yanlışlıkla grand_total hedefleseydi grandTotal sızardı.)
        const out = redactQuotesForPerms(list, P());
        expect("grandTotal" in out[0]).toBe(true);
        expect(out[0].grandTotal).toBeNull();
    });

    it("immutable + spurious key guard", () => {
        const minimal = [{ id: "q1" }];
        const out = redactQuotesForPerms(minimal, P());
        expect("grandTotal" in out[0]).toBe(false);
        expect(list[0].grandTotal).toBe(5000);
    });
});

describe("redactQuoteForPerms (detail, CAMELCASE, lines'lı)", () => {
    const detail = {
        id: "q1",
        subtotal: 4000,
        vatTotal: 800,
        grandTotal: 4800,
        discountAmount: 200,
        lines: [{ id: "l1", unitPrice: 2000, lineTotal: 4000, quantity: 2, productName: "Vana" }],
    };

    it("view_sales_prices VAR → no-op", () => {
        expect(redactQuoteForPerms(detail, P("view_sales_prices"))).toBe(detail);
    });

    it("yetki yok → header (subtotal/vatTotal/grandTotal/discountAmount) + satır fiyatları null", () => {
        const out = redactQuoteForPerms(detail, P());
        expect(out.subtotal).toBeNull();
        expect(out.vatTotal).toBeNull();
        expect(out.grandTotal).toBeNull();
        expect(out.discountAmount).toBeNull();
        const lines = out.lines as Array<Record<string, unknown>>;
        expect(lines[0].unitPrice).toBeNull();
        expect(lines[0].lineTotal).toBeNull();
        expect(lines[0].quantity).toBe(2);          // adet sızıntı değil
        expect(lines[0].productName).toBe("Vana");  // ürün adı korunur
    });

    it("orijinal detail'i mutate ETMEZ", () => {
        redactQuoteForPerms(detail, P());
        expect(detail.grandTotal).toBe(4800);
        expect(detail.lines[0].unitPrice).toBe(2000);
    });
});

// ── purchase-orders (SNAKE_CASE — raw row, mapper YOK) ──────────────────────────
describe("redactPurchaseOrdersForPerms (list, SNAKE_CASE)", () => {
    const list = [{ id: "po1", po_number: "PO-1", subtotal: 1000, vat_total: 200, grand_total: 1200, vat_rate: 20 }];

    it("view_purchase_costs VAR → no-op", () => {
        expect(redactPurchaseOrdersForPerms(list, P("view_purchase_costs"))).toBe(list);
    });

    it("yetki yok → subtotal/vat_total/grand_total null; vat_rate (yüzde) korunur", () => {
        const out = redactPurchaseOrdersForPerms(list, P());
        expect(out[0].subtotal).toBeNull();
        expect(out[0].vat_total).toBeNull();
        expect(out[0].grand_total).toBeNull();
        expect(out[0].vat_rate).toBe(20);       // yüzde, maliyet değil
        expect(out[0].po_number).toBe("PO-1");
    });

    it("sales/production view_sales_prices'a sahip olsa bile PO maliyeti GÖRMEZ (ayrı sınıf)", () => {
        const out = redactPurchaseOrdersForPerms(list, P("view_sales_prices"));
        expect(out[0].grand_total).toBeNull(); // view_purchase_costs gerekir
    });
});

describe("redactPurchaseOrderForPerms (detail, SNAKE_CASE, lines'lı)", () => {
    const detail = {
        id: "po1",
        subtotal: 1000,
        vat_total: 200,
        grand_total: 1200,
        lines: [{ id: "l1", unit_price: 500, line_total: 1000, quantity: 2, discount_pct: 10 }],
    };

    it("view_purchase_costs VAR → no-op", () => {
        expect(redactPurchaseOrderForPerms(detail, P("view_purchase_costs"))).toBe(detail);
    });

    it("yetki yok → header + satır unit_price/line_total null; quantity/discount_pct korunur", () => {
        const out = redactPurchaseOrderForPerms(detail, P());
        expect(out.grand_total).toBeNull();
        const lines = out.lines as Array<Record<string, unknown>>;
        expect(lines[0].unit_price).toBeNull();
        expect(lines[0].line_total).toBeNull();
        expect(lines[0].quantity).toBe(2);
        expect(lines[0].discount_pct).toBe(10);  // yüzde, mutlak maliyet değil
    });

    it("orijinal detail'i mutate ETMEZ", () => {
        redactPurchaseOrderForPerms(detail, P());
        expect(detail.grand_total).toBe(1200);
        expect(detail.lines[0].unit_price).toBe(500);
    });
});
