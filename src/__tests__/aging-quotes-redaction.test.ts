/**
 * RBAC Faz 7b — yeni server-side redaction (aging + product quotes).
 *
 * Faz 7 UI maskelemesini "tiyatro"dan kurtarmak için bu iki route Faz 7'de
 * redaction kazandı (önceden ham cost/sales fiyatı sızdırıyordu):
 *   - GET /api/products/aging — boundCapital/costPrice ← view_purchase_costs; price ← view_sales_prices
 *     (F5: boundCapital price-fallback YALNIZ view_sales_prices varken — purchasing satış fiyatı türetemez)
 *   - GET /api/products/[id]/quotes — unitPrice + lineTotal ← view_sales_prices
 *     (F2: lineTotal de null'lanmalı; lineTotal/quantity ile birim fiyat türetilebilirdi)
 * Diskriminatif: AYNI kaynak, FARKLI perm → farklı çıktı (per-request).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Permission } from "@/lib/auth/permissions";

const mockDbListProducts = vi.fn();
const mockGetLastSale = vi.fn();
const mockGetLastIncoming = vi.fn();
const mockGetLastProduction = vi.fn();
const mockGetPerms = vi.fn();
const mockGetQuotedBreakdown = vi.fn();
const mockLookupEmails = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...a: unknown[]) => mockDbListProducts(...a),
    dbGetQuotedBreakdownByProduct: (...a: unknown[]) => mockGetQuotedBreakdown(...a),
    dbLookupUserEmails: (...a: unknown[]) => mockLookupEmails(...a),
}));
vi.mock("@/lib/supabase/aging", async (orig) => {
    const actual = await (orig as () => Promise<Record<string, unknown>>)();
    return {
        ...actual,
        dbGetLastSaleDates: (...a: unknown[]) => mockGetLastSale(...a),
        dbGetLastIncomingDates: (...a: unknown[]) => mockGetLastIncoming(...a),
        dbGetLastProductionDates: (...a: unknown[]) => mockGetLastProduction(...a),
    };
});
vi.mock("@/lib/auth/role-guard", () => ({
    getCurrentUserPermissions: (...a: unknown[]) => mockGetPerms(...a),
}));

import { GET as AGING_GET } from "@/app/api/products/aging/route";
import { GET as QUOTES_GET } from "@/app/api/products/[id]/quotes/route";

const P = (...perms: Permission[]) => new Set<Permission>(perms);

function agingReq(): NextRequest {
    return new NextRequest("http://localhost/api/products/aging?type=all", { method: "GET" });
}
function quotesReq(): NextRequest {
    return new NextRequest("http://localhost/api/products/p1/quotes", { method: "GET" });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListProducts.mockResolvedValue([{
        id: "p1", name: "Vana", sku: "SKU-1", category: null, unit: "adet",
        on_hand: 10, price: 100, currency: "USD", product_type: "commercial",
        cost_price: 60,
    }]);
    mockGetLastSale.mockResolvedValue(new Map());
    mockGetLastIncoming.mockResolvedValue(new Map());
    mockGetLastProduction.mockResolvedValue(new Map());
    mockGetQuotedBreakdown.mockResolvedValue([
        { orderId: "o1", orderNumber: "ORD-1", customerId: "c1", customerName: "X",
          quantity: 5, unitPrice: 100, lineTotal: 480, discountPct: 4, currency: "USD",
          commercialStatus: "draft", orderCreatedAt: "2024-01-01", quoteValidUntil: null, createdBy: null },
    ]);
    mockLookupEmails.mockResolvedValue(new Map());
});

describe("GET /api/products/aging — Faz 7 redaction", () => {
    it("view_purchase_costs → boundCapital + costPrice görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_purchase_costs", "view_sales_prices"));
        const data = await (await AGING_GET(agingReq())).json();
        expect(data[0].boundCapital).toBe(600); // 10 * 60
        expect(data[0].costPrice).toBe(60);
        expect(data[0].price).toBe(100);
    });

    it("production (cost/sales yok) → boundCapital/costPrice/price null, operasyonel alan korunur", async () => {
        mockGetPerms.mockResolvedValue(P("view_products", "view_production"));
        const data = await (await AGING_GET(agingReq())).json();
        expect(data[0].boundCapital).toBeNull();
        expect(data[0].costPrice).toBeNull();
        expect(data[0].price).toBeNull();
        expect(data[0].sku).toBe("SKU-1");  // sızıntı değil
        expect(data[0].onHand).toBe(10);
    });

    it("DİSKRİMİNATİF: art arda admin→viewer farklı çıktı (cache leak yok)", async () => {
        mockGetPerms.mockResolvedValueOnce(P("view_purchase_costs"));
        const admin = await (await AGING_GET(agingReq())).json();
        mockGetPerms.mockResolvedValueOnce(P());
        const viewer = await (await AGING_GET(agingReq())).json();
        expect(admin[0].boundCapital).toBe(600);
        expect(viewer[0].boundCapital).toBeNull();
    });

    it("F5: cost_price null + SADECE view_purchase_costs → boundCapital 0 (price'tan TÜREMEZ)", async () => {
        mockDbListProducts.mockResolvedValueOnce([{
            id: "p1", name: "Vana", sku: "SKU-1", category: null, unit: "adet",
            on_hand: 10, price: 100, currency: "USD", product_type: "commercial",
            cost_price: null,
        }]);
        mockGetPerms.mockResolvedValue(P("view_purchase_costs")); // sales YOK
        const data = await (await AGING_GET(agingReq())).json();
        expect(data[0].boundCapital).toBe(0);   // cost null → 0; 10*price (1000) sızıntısı YOK
        expect(data[0].price).toBeNull();        // sales yetkisi yok
    });

    it("F5: cost_price null + view_purchase_costs + view_sales_prices → price fallback (10*100)", async () => {
        mockDbListProducts.mockResolvedValueOnce([{
            id: "p1", name: "Vana", sku: "SKU-1", category: null, unit: "adet",
            on_hand: 10, price: 100, currency: "USD", product_type: "commercial",
            cost_price: null,
        }]);
        mockGetPerms.mockResolvedValue(P("view_purchase_costs", "view_sales_prices"));
        const data = await (await AGING_GET(agingReq())).json();
        expect(data[0].boundCapital).toBe(1000); // canSales true → cost null'da price fallback korunur
    });
});

describe("GET /api/products/[id]/quotes — Faz 7 redaction", () => {
    it("view_sales_prices → unitPrice + lineTotal görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices"));
        const data = await (await QUOTES_GET(quotesReq(), { params: Promise.resolve({ id: "p1" }) })).json();
        expect(data.items[0].unitPrice).toBe(100);
        expect(data.items[0].lineTotal).toBe(480);
    });

    it("F2: yetki yok → unitPrice VE lineTotal null, qty korunur", async () => {
        mockGetPerms.mockResolvedValue(P("view_products"));
        const data = await (await QUOTES_GET(quotesReq(), { params: Promise.resolve({ id: "p1" }) })).json();
        expect(data.items[0].unitPrice).toBeNull();
        expect(data.items[0].lineTotal).toBeNull(); // lineTotal/quantity → birim fiyat türetilemesin
        expect(data.items[0].quantity).toBe(5); // operasyonel alan korunur
        expect(data.totalQuoted).toBe(5);
    });
});
