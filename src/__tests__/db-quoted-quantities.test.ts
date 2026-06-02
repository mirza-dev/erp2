/**
 * Tests for dbGetQuotedQuantities()
 * (src/lib/supabase/products.ts)
 *
 * Mocks the Supabase service client. Verifies aggregation of quoted quantities
 * across DRAFT orders from the order_lines table (migration 082: pending_approval
 * artık HARD rezerve → quoted'a girmez, çift sayma önlenir).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────

const mockEq = vi.fn();

function makeBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = mockEq;
    return b;
}

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: mockFrom,
    }),
    ConfigError: class ConfigError extends Error {
        readonly code = "CONFIG_ERROR";
        constructor(message: string) {
            super(message);
            this.name = "ConfigError";
        }
    },
}));

// ── Import under test (after mock) ───────────────────────────

import { dbGetQuotedQuantities } from "@/lib/supabase/products";

// ── Helpers ───────────────────────────────────────────────────

function makeLine(product_id: string, quantity: number) {
    return { product_id, quantity };
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
    mockFrom.mockReset();
    mockEq.mockReset();
    mockFrom.mockImplementation(() => makeBuilder());
});

// ── Tests ─────────────────────────────────────────────────────

describe("dbGetQuotedQuantities", () => {
    it("returns empty Map when no active order lines exist", async () => {
        mockEq.mockResolvedValue({ data: [], error: null });
        const result = await dbGetQuotedQuantities();
        expect(result.size).toBe(0);
    });

    it("throws on Supabase error", async () => {
        mockEq.mockResolvedValue({ data: null, error: { message: "DB error" } });
        await expect(dbGetQuotedQuantities()).rejects.toThrow("DB error");
    });

    it("returns empty Map when data is null without error", async () => {
        mockEq.mockResolvedValue({ data: null, error: null });
        const result = await dbGetQuotedQuantities();
        expect(result.size).toBe(0);
    });

    it("aggregates a single product from a single line", async () => {
        mockEq.mockResolvedValue({ data: [makeLine("prod-1", 30)], error: null });
        const result = await dbGetQuotedQuantities();
        expect(result.get("prod-1")).toBe(30);
        expect(result.size).toBe(1);
    });

    it("aggregates the same product across multiple lines/orders", async () => {
        mockEq.mockResolvedValue({
            data: [makeLine("prod-1", 20), makeLine("prod-1", 10)],
            error: null,
        });
        const result = await dbGetQuotedQuantities();
        expect(result.get("prod-1")).toBe(30);
        expect(result.size).toBe(1);
    });

    it("tracks multiple products independently", async () => {
        mockEq.mockResolvedValue({
            data: [
                makeLine("prod-1", 30),
                makeLine("prod-2", 15),
                makeLine("prod-1", 5),
            ],
            error: null,
        });
        const result = await dbGetQuotedQuantities();
        expect(result.get("prod-1")).toBe(35);
        expect(result.get("prod-2")).toBe(15);
        expect(result.size).toBe(2);
    });

    it("queries the order_lines table", async () => {
        mockEq.mockResolvedValue({ data: [], error: null });
        await dbGetQuotedQuantities();
        expect(mockFrom).toHaveBeenCalledWith("order_lines");
    });

    it("filters by draft status only (pending artık reserved)", async () => {
        mockEq.mockResolvedValue({ data: [], error: null });
        await dbGetQuotedQuantities();
        expect(mockEq).toHaveBeenCalledWith(
            "sales_orders.commercial_status",
            "draft"
        );
    });
});
