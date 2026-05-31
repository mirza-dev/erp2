/**
 * RBAC R3 — products GET route end-to-end redaction (per-request).
 *
 * Advisor diskriminatif testi: AYNI mock'lu veri, FARKLI perm setleri → farklı
 * response. Redaction'ın cache içine değil per-request uygulandığını + snake_case
 * alanların (cost_price/price) gerçekten kapandığını kanıtlar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Permission } from "@/lib/auth/permissions";

const mockDbListProducts = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();
const mockDbGetIncomingQuantities = vi.fn();
const mockGetPerms = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts:         (...a: unknown[]) => mockDbListProducts(...a),
    dbCreateProduct:        vi.fn(),
    dbGetQuotedQuantities:  (...a: unknown[]) => mockDbGetQuotedQuantities(...a),
}));
vi.mock("@/lib/supabase/purchase-commitments", () => ({
    dbGetIncomingQuantities: (...a: unknown[]) => mockDbGetIncomingQuantities(...a),
    dbListCommitments: vi.fn(), dbCreateCommitment: vi.fn(),
    dbGetCommitment: vi.fn(), dbReceiveCommitment: vi.fn(), dbCancelCommitment: vi.fn(),
}));
vi.mock("@/lib/auth/role-guard", () => ({
    getCurrentUserPermissions: (...a: unknown[]) => mockGetPerms(...a),
}));

import { GET } from "@/app/api/products/route";

function req(): NextRequest {
    return new NextRequest("http://localhost/api/products", { method: "GET" });
}
function product() {
    return {
        id: "p1", name: "Vana", sku: "SKU-1", category: null, unit: "adet",
        price: 100, currency: "USD", on_hand: 10, reserved: 2, available_now: 8,
        min_stock_level: 5, is_active: true, product_type: "manufactured",
        cost_price: 60, daily_usage: null, lead_time_days: null,
        created_at: "2024-01-01", updated_at: "2024-01-01",
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListProducts.mockResolvedValue([product()]);
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbGetIncomingQuantities.mockResolvedValue(new Map());
});

const P = (...perms: Permission[]) => new Set<Permission>(perms);

describe("GET /api/products — R3 redaction (per-request)", () => {
    it("tam yetki → price + cost_price görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices", "view_purchase_costs"));
        const data = await (await GET(req())).json();
        expect(data[0].price).toBe(100);
        expect(data[0].cost_price).toBe(60);
    });

    it("viewer (finansal yetki yok) → price VE cost_price null, AYNI veri", async () => {
        mockGetPerms.mockResolvedValue(P()); // viewer
        const data = await (await GET(req())).json();
        expect(data[0].price).toBeNull();
        expect(data[0].cost_price).toBeNull();
        expect(data[0].name).toBe("Vana");          // finansal olmayan korunur
        expect(data[0].on_hand).toBe(10);            // stok sızıntı değil
    });

    it("sales (sadece sales_prices) → price görünür, cost_price null", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices"));
        const data = await (await GET(req())).json();
        expect(data[0].price).toBe(100);
        expect(data[0].cost_price).toBeNull(); // maliyet gizli
    });

    it("DİSKRİMİNATİF: aynı kaynak, art arda admin→viewer çağrısı farklı çıktı (cache leak yok)", async () => {
        mockGetPerms.mockResolvedValueOnce(P("view_sales_prices", "view_purchase_costs"));
        const adminData = await (await GET(req())).json();
        mockGetPerms.mockResolvedValueOnce(P());
        const viewerData = await (await GET(req())).json();
        expect(adminData[0].cost_price).toBe(60);
        expect(viewerData[0].cost_price).toBeNull(); // ilk çağrının yetkisi sızmadı
    });
});
