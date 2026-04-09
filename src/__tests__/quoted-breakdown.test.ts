/**
 * Tests for dbGetQuotedBreakdownByProduct (src/lib/supabase/products.ts)
 *
 * Kurallar:
 *   - Sadece draft + pending_approval siparişler dahil edilir
 *   - Approved siparişler filtrelenir (inner join + IN filter)
 *   - Sonuçlar orderCreatedAt DESC sıralı
 *   - Supabase error → [] döner (graceful)
 */
import { describe, it, expect, vi } from "vitest";

// ── Mock ──────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({
            select: (...args: unknown[]) => mockSelect(...args),
        }),
    }),
}));

import { dbGetQuotedBreakdownByProduct } from "@/lib/supabase/products";

// ── Helpers ───────────────────────────────────────────────────

function makeLine(overrides: {
    quantity?: number;
    unit_price?: number;
    discount_pct?: number;
    line_total?: number;
    sales_orders: {
        id: string;
        order_number: string;
        commercial_status: "draft" | "pending_approval";
        created_at: string;
        created_by: string | null;
        customer_id: string;
        customer_name: string;
    };
}) {
    return {
        quantity: overrides.quantity ?? 10,
        unit_price: overrides.unit_price ?? 100,
        discount_pct: overrides.discount_pct ?? 0,
        line_total: overrides.line_total ?? 1000,
        sales_orders: overrides.sales_orders,
    };
}

function setupMockChain(result: { data: unknown[] | null; error: unknown | null }) {
    mockIn.mockResolvedValue(result);
    mockEq.mockReturnValue({ in: mockIn });
    mockSelect.mockReturnValue({ eq: mockEq });
}

// ── Tests ─────────────────────────────────────────────────────

describe("dbGetQuotedBreakdownByProduct — temel kurallar", () => {
    it("3 aktif teklif → 3 satır, orderCreatedAt DESC sıralı", async () => {
        const lines = [
            makeLine({
                quantity: 10,
                sales_orders: { id: "o1", order_number: "ORD-001", commercial_status: "draft", created_at: "2024-06-01T08:00:00Z", created_by: null, customer_id: "c1", customer_name: "Acme" },
            }),
            makeLine({
                quantity: 5,
                sales_orders: { id: "o2", order_number: "ORD-002", commercial_status: "pending_approval", created_at: "2024-06-03T08:00:00Z", created_by: null, customer_id: "c2", customer_name: "Beta" },
            }),
            makeLine({
                quantity: 8,
                sales_orders: { id: "o3", order_number: "ORD-003", commercial_status: "draft", created_at: "2024-06-02T08:00:00Z", created_by: null, customer_id: "c3", customer_name: "Gamma" },
            }),
        ];
        setupMockChain({ data: lines, error: null });

        const result = await dbGetQuotedBreakdownByProduct("prod-1");

        expect(result).toHaveLength(3);
        // DESC sıralı: ORD-002 (06-03) > ORD-003 (06-02) > ORD-001 (06-01)
        expect(result[0].orderNumber).toBe("ORD-002");
        expect(result[1].orderNumber).toBe("ORD-003");
        expect(result[2].orderNumber).toBe("ORD-001");
    });

    it("teklif yok → [] döner", async () => {
        setupMockChain({ data: [], error: null });

        const result = await dbGetQuotedBreakdownByProduct("prod-empty");
        expect(result).toEqual([]);
    });

    it("Supabase error → [] döner (graceful)", async () => {
        setupMockChain({ data: null, error: { message: "DB error" } });

        const result = await dbGetQuotedBreakdownByProduct("prod-err");
        expect(result).toEqual([]);
    });

    it("aynı siparişte aynı üründen 2 line item → 2 ayrı satır", async () => {
        const lines = [
            makeLine({ quantity: 5, sales_orders: { id: "o1", order_number: "ORD-001", commercial_status: "draft", created_at: "2024-06-01T00:00:00Z", created_by: null, customer_id: "c1", customer_name: "Acme" } }),
            makeLine({ quantity: 3, sales_orders: { id: "o1", order_number: "ORD-001", commercial_status: "draft", created_at: "2024-06-01T00:00:00Z", created_by: null, customer_id: "c1", customer_name: "Acme" } }),
        ];
        setupMockChain({ data: lines, error: null });

        const result = await dbGetQuotedBreakdownByProduct("prod-1");
        expect(result).toHaveLength(2);
        expect(result[0].quantity + result[1].quantity).toBe(8);
    });

    it("satır verileri doğru map ediliyor", async () => {
        const lines = [
            makeLine({
                quantity: 12,
                unit_price: 450,
                discount_pct: 5,
                line_total: 5130,
                sales_orders: {
                    id: "o-abc",
                    order_number: "ORD-155",
                    commercial_status: "draft",
                    created_at: "2024-06-05T10:00:00Z",
                    created_by: "user-uuid-1",
                    customer_id: "cust-1",
                    customer_name: "Müşteri A",
                },
            }),
        ];
        setupMockChain({ data: lines, error: null });

        const result = await dbGetQuotedBreakdownByProduct("prod-1");
        const row = result[0];

        expect(row.orderId).toBe("o-abc");
        expect(row.orderNumber).toBe("ORD-155");
        expect(row.customerName).toBe("Müşteri A");
        expect(row.quantity).toBe(12);
        expect(row.unitPrice).toBe(450);
        expect(row.discountPct).toBe(5);
        expect(row.lineTotal).toBe(5130);
        expect(row.commercialStatus).toBe("draft");
        expect(row.createdBy).toBe("user-uuid-1");
    });
});
