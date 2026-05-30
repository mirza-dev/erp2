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
