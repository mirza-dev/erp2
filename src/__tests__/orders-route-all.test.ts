/**
 * GET /api/orders — ?all=1 pagination bypass.
 *
 * Bug (2026-06-01): /api/orders sadece `page` okuyordu, dbListOrders default
 * pageSize=50 → UI hiçbir zaman en yeni 50 siparişten fazlasını tutamıyordu.
 * Tab sayaçları + müşteri cirosu (CustomerDetailPanel) 50-cap'e takılıyordu.
 * Fix: ?all=1 → page=1, pageSize=10000 (products ?all=1 paterni).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
}));

// Redaction'ı identity'e indir — bu test pagination'a odaklı (redaction ayrı test).
vi.mock("@/lib/auth/redact", () => ({
    redactOrdersForPerms: (rows: unknown[]) => rows,
}));

const mockServiceListOrders = vi.fn();
vi.mock("@/lib/services/order-service", () => ({
    serviceListOrders: (...args: unknown[]) => mockServiceListOrders(...args),
    serviceCreateOrder: vi.fn(),
    validateOrderCreate: vi.fn(),
}));

vi.mock("@/lib/services/ai-service", () => ({ aiScoreOrder: vi.fn() }));
vi.mock("@/lib/services/email-service", () => ({ notifyUsersByEmail: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/orders/route";

function req(qs: string): NextRequest {
    return new NextRequest(`http://localhost/api/orders${qs}`, { method: "GET" });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockServiceListOrders.mockResolvedValue([]);
});

describe("GET /api/orders ?all=1", () => {
    it("?all=1 → pageSize 10000, page 1 (pagination bypass)", async () => {
        await GET(req("?all=1"));
        expect(mockServiceListOrders).toHaveBeenCalledWith(
            expect.objectContaining({ page: 1, pageSize: 10000 }),
        );
    });

    it("all yokken → page-based, pageSize undefined (default 50)", async () => {
        await GET(req("?page=3"));
        expect(mockServiceListOrders).toHaveBeenCalledWith(
            expect.objectContaining({ page: 3, pageSize: undefined }),
        );
    });

    it("?all=1 → 50'den fazla sipariş döner (cap kalktı)", async () => {
        const rows = Array.from({ length: 60 }, (_, i) => ({
            id: `o-${i}`, order_number: `ORD-2026-${i}`, customer_name: "X",
            commercial_status: "approved", fulfillment_status: "allocated",
            grand_total: 100, currency: "TRY", created_at: "2026-01-01", item_count: 1,
        }));
        mockServiceListOrders.mockResolvedValue(rows);
        const res = await GET(req("?all=1"));
        const json = await res.json();
        expect(Array.isArray(json)).toBe(true);
        expect(json).toHaveLength(60);
    });

    it("?all=1 filtreler ile birlikte çalışır (commercial_status + customer_id)", async () => {
        await GET(req("?all=1&commercial_status=approved&customer_id=c-1"));
        expect(mockServiceListOrders).toHaveBeenCalledWith(
            expect.objectContaining({
                commercial_status: "approved",
                customer_id: "c-1",
                page: 1,
                pageSize: 10000,
            }),
        );
    });
});
