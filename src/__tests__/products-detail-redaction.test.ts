/**
 * RBAC F1 — products DETAY uçları (GET + PATCH + POST) redaction.
 *
 * Liste route'u (products-get-redaction.test.ts) zaten redakte ediyordu; detay
 * GET/PATCH ve create POST atlanmıştı → ham price/cost_price (demo dahil) sızıyordu.
 * Diskriminatif: AYNI mock veri, FARKLI perm → farklı response (per-request, cache yok).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Permission } from "@/lib/auth/permissions";

const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockQuoted = vi.fn();
const mockIncoming = vi.fn();
const mockGetPerms = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById:      (...a: unknown[]) => mockGetById(...a),
    dbUpdateProduct:       (...a: unknown[]) => mockUpdate(...a),
    dbDeleteProduct:       vi.fn(),
    dbCreateProduct:       (...a: unknown[]) => mockCreate(...a),
    dbGetQuotedQuantities: (...a: unknown[]) => mockQuoted(...a),
    dbListProducts:        vi.fn(),
}));
vi.mock("@/lib/supabase/purchase-commitments", () => ({
    dbGetIncomingQuantities: (...a: unknown[]) => mockIncoming(...a),
}));
vi.mock("@/lib/supabase/alerts", () => ({ dbBatchResolveAlerts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/supabase/recommendations", () => ({ dbExpireEntityRecommendations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth/role-guard", () => ({
    // Guard allow — bu test redaction'a odaklı (guard wiring rbac-mutation-guards'ta).
    requirePermission: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: (...a: unknown[]) => mockGetPerms(...a),
}));
vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, // products/route module-load'da kullanır
}));

import { GET, PATCH } from "@/app/api/products/[id]/route";
import { POST } from "@/app/api/products/route";

const P = (...perms: Permission[]) => new Set<Permission>(perms);
const params = { params: Promise.resolve({ id: "p1" }) };

function product() {
    return {
        id: "p1", name: "Vana", sku: "SKU-1", category: null, unit: "adet",
        price: 100, currency: "USD", on_hand: 10, reserved: 2, available_now: 8,
        min_stock_level: 5, is_active: true, product_type: "manufactured",
        cost_price: 60, daily_usage: null, lead_time_days: null,
        created_at: "2024-01-01", updated_at: "2024-01-01",
    };
}
function getReq() { return new NextRequest("http://localhost/api/products/p1", { method: "GET" }); }
function patchReq(body: unknown) {
    return new NextRequest("http://localhost/api/products/p1", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
}
function postReq(body: unknown) {
    return new NextRequest("http://localhost/api/products", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(product());
    mockUpdate.mockResolvedValue(product());
    mockCreate.mockResolvedValue(product());
    mockQuoted.mockResolvedValue(new Map());
    mockIncoming.mockResolvedValue(new Map());
});

describe("GET /api/products/[id] — F1 redaction", () => {
    it("tam yetki → price + cost_price görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices", "view_purchase_costs"));
        const data = await (await GET(getReq(), params)).json();
        expect(data.price).toBe(100);
        expect(data.cost_price).toBe(60);
        expect(data.promisable).toBe(8); // enrich alanı korunur
    });
    it("production/viewer (finansal yok) → price + cost_price null, stok korunur", async () => {
        mockGetPerms.mockResolvedValue(P("view_products"));
        const data = await (await GET(getReq(), params)).json();
        expect(data.price).toBeNull();
        expect(data.cost_price).toBeNull();
        expect(data.on_hand).toBe(10);   // operasyonel alan sızıntı değil
        expect(data.name).toBe("Vana");
    });
    it("sales → price var, cost_price null", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices"));
        const data = await (await GET(getReq(), params)).json();
        expect(data.price).toBe(100);
        expect(data.cost_price).toBeNull();
    });
    it("purchasing → cost_price var, price null", async () => {
        mockGetPerms.mockResolvedValue(P("view_purchase_costs"));
        const data = await (await GET(getReq(), params)).json();
        expect(data.price).toBeNull();
        expect(data.cost_price).toBe(60);
    });
    it("DİSKRİMİNATİF: admin→viewer art arda farklı (cache leak yok)", async () => {
        mockGetPerms.mockResolvedValueOnce(P("view_sales_prices", "view_purchase_costs"));
        const admin = await (await GET(getReq(), params)).json();
        mockGetPerms.mockResolvedValueOnce(P("view_products"));
        const viewer = await (await GET(getReq(), params)).json();
        expect(admin.cost_price).toBe(60);
        expect(viewer.cost_price).toBeNull();
    });
    it("404 → redaction çağrılmadan döner", async () => {
        mockGetById.mockResolvedValueOnce(null);
        const res = await GET(getReq(), params);
        expect(res.status).toBe(404);
    });
});

describe("PATCH /api/products/[id] — F1 redaction", () => {
    it("purchasing PATCH → response'ta price null (kendi girmediği satış fiyatı sızmaz)", async () => {
        mockGetPerms.mockResolvedValue(P("view_purchase_costs"));
        const data = await (await PATCH(patchReq({ cost_price: 70 }), params)).json();
        expect(data.cost_price).toBe(60); // mock döndürdü
        expect(data.price).toBeNull();    // sales yetkisi yok → sızmaz
    });
    it("admin PATCH → price + cost_price görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices", "view_purchase_costs"));
        const data = await (await PATCH(patchReq({ price: 120 }), params)).json();
        expect(data.price).toBe(100);
        expect(data.cost_price).toBe(60);
    });
});

describe("POST /api/products — F1 redaction", () => {
    const validBody = { name: "Yeni", sku: "SKU-NEW", unit: "adet", price: 100, cost_price: 60 };
    it("purchasing POST → 201 + price null", async () => {
        mockGetPerms.mockResolvedValue(P("view_purchase_costs"));
        const res = await POST(postReq(validBody));
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.cost_price).toBe(60);
        expect(data.price).toBeNull();
    });
    it("admin POST → 201 + price + cost_price görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices", "view_purchase_costs"));
        const res = await POST(postReq(validBody));
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.price).toBe(100);
        expect(data.cost_price).toBe(60);
    });
});
