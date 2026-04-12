/**
 * Concurrency-specific tests for the alert system.
 *
 * Covers:
 *   - dbCreateAlert returns null on unique violation (not throw)
 *   - dbBatchResolveAlerts groups by type+reason correctly
 *   - N+1 optimization: scan uses in-memory Set instead of per-product queries
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────���───────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();
const mockDbGetOpenShortagesByProduct = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts:            (...args: unknown[]) => mockDbListProducts(...args),
    dbGetOpenShortagesByProduct: () => mockDbGetOpenShortagesByProduct(),
    dbGetQuotedQuantities:     (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders: vi.fn().mockResolvedValue([]),
}));

const mockDbCreateAlert        = vi.fn();
const mockDbListAlerts         = vi.fn();
const mockDbGetAlertById       = vi.fn();
const mockDbUpdateAlertStatus  = vi.fn();
const mockDbDismissAlertsBySource = vi.fn();
const mockDbListActiveAlerts   = vi.fn();
const mockDbBatchResolveAlerts = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:             (...args: unknown[]) => mockDbListAlerts(...args),
    dbGetAlertById:           (...args: unknown[]) => mockDbGetAlertById(...args),
    dbCreateAlert:            (...args: unknown[]) => mockDbCreateAlert(...args),
    dbUpdateAlertStatus:      (...args: unknown[]) => mockDbUpdateAlertStatus(...args),
    dbDismissAlertsBySource:  (...args: unknown[]) => mockDbDismissAlertsBySource(...args),
    dbListActiveAlerts:       (...args: unknown[]) => mockDbListActiveAlerts(...args),
    dbBatchResolveAlerts:     (...args: unknown[]) => mockDbBatchResolveAlerts(...args),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => false,
    aiGenerateOpsSummary: vi.fn(),
}));

import { serviceScanStockAlerts } from "@/lib/services/alert-service";
import type { ProductWithStock } from "@/lib/database.types";

// ── Fixtures ────��─────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "prod-1",
        name: "Ürün 1",
        sku: "P-001",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 200,
        reserved: 0,
        available_now: 200,
        min_stock_level: 10,
        is_active: true,
        product_type: "manufactured",
        warehouse: null, reorder_qty: null, preferred_vendor: null,
        daily_usage: null, lead_time_days: null, product_family: null,
        sub_category: null, sector_compatibility: null, cost_price: null,
        weight_kg: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListActiveAlerts.mockResolvedValue([]);
    mockDbCreateAlert.mockResolvedValue({ id: "new-alert" });
    mockDbBatchResolveAlerts.mockResolvedValue(0);
    mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map());
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
});

// ── dbCreateAlert null safety (unique violation) ─────────────────────────────

describe("dbCreateAlert null return — scan handles gracefully", () => {
    it("null return (unique violation) → created count NOT incremented", async () => {
        const criticalProduct = makeProduct({
            id: "prod-crit",
            on_hand: 3,
            available_now: 3,
            min_stock_level: 10,
        });
        mockDbListProducts.mockResolvedValue([criticalProduct]);
        mockDbCreateAlert.mockResolvedValue(null); // unique violation

        const result = await serviceScanStockAlerts();

        expect(result.created).toBe(0);
        expect(mockDbCreateAlert).toHaveBeenCalled();
    });

    it("normal return → created count incremented", async () => {
        const criticalProduct = makeProduct({
            id: "prod-crit2",
            on_hand: 3,
            available_now: 3,
            min_stock_level: 10,
        });
        mockDbListProducts.mockResolvedValue([criticalProduct]);
        mockDbCreateAlert.mockResolvedValue({ id: "new-alert-id" });

        const result = await serviceScanStockAlerts();

        expect(result.created).toBeGreaterThanOrEqual(1);
    });
});

// ── N+1 optimization: in-memory Set ──────────────────────────────────────────

describe("N+1 optimization — activeSet replaces per-product dbOpenAlertExists", () => {
    it("dbListActiveAlerts scan başında bir kere çağrılır", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p1" }),
            makeProduct({ id: "p2" }),
            makeProduct({ id: "p3" }),
        ]);

        await serviceScanStockAlerts();

        expect(mockDbListActiveAlerts).toHaveBeenCalledOnce();
    });

    it("aktif alert var → create çağrılmaz (Set lookup)", async () => {
        const criticalProduct = makeProduct({
            id: "prod-existing",
            on_hand: 3,
            available_now: 3,
            min_stock_level: 10,
        });
        mockDbListProducts.mockResolvedValue([criticalProduct]);
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "stock_critical", entity_id: "prod-existing", status: "open" },
        ]);

        await serviceScanStockAlerts();

        const critCreates = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "stock_critical"
        );
        expect(critCreates).toHaveLength(0);
    });

    it("aktif alert yok → create çağrılır", async () => {
        const criticalProduct = makeProduct({
            id: "prod-new",
            on_hand: 3,
            available_now: 3,
            min_stock_level: 10,
        });
        mockDbListProducts.mockResolvedValue([criticalProduct]);
        mockDbListActiveAlerts.mockResolvedValue([]); // no existing alerts

        await serviceScanStockAlerts();

        const critCreates = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "stock_critical"
        );
        expect(critCreates).toHaveLength(1);
    });
});

// ── Batch resolve ───────────���────────────────────────────────────────────────

describe("Batch resolve — resolve calls collected and sent as one batch", () => {
    it("healthy products → batch resolve stock_critical + stock_risk + order_shortage entries", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p1" }),
            makeProduct({ id: "p2" }),
        ]);
        mockDbBatchResolveAlerts.mockResolvedValue(0);

        await serviceScanStockAlerts();

        expect(mockDbBatchResolveAlerts).toHaveBeenCalledOnce();
        const entries = mockDbBatchResolveAlerts.mock.calls[0][0];

        // Each healthy product pushes: stock_critical, stock_risk (stock_recovered)
        // + order_shortage (shortage_resolved) + order_deadline (not_computable when daily_usage null)
        const p1Entries = entries.filter((e: { entityId: string }) => e.entityId === "p1");
        expect(p1Entries).toHaveLength(4);

        const types = p1Entries.map((e: { type: string }) => e.type).sort();
        expect(types).toEqual(["order_deadline", "order_shortage", "stock_critical", "stock_risk"]);
    });

    it("critical product → batch resolve includes stock_risk escalation", async () => {
        const criticalProduct = makeProduct({
            id: "prod-esc",
            on_hand: 3,
            available_now: 3,
            min_stock_level: 10,
        });
        mockDbListProducts.mockResolvedValue([criticalProduct]);

        await serviceScanStockAlerts();

        const entries = mockDbBatchResolveAlerts.mock.calls[0][0];
        const escalate = entries.filter(
            (e: { type: string; reason: string }) =>
                e.type === "stock_risk" && e.reason === "escalated_to_critical"
        );
        expect(escalate).toHaveLength(1);
        expect(escalate[0].entityId).toBe("prod-esc");
    });

    it("batch resolve return value → result.resolved", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct()]);
        mockDbBatchResolveAlerts.mockResolvedValue(5);

        const result = await serviceScanStockAlerts();
        expect(result.resolved).toBe(5);
    });
});
