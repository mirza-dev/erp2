/**
 * Tests that alert-service uses promisable (available_now - quoted) for
 * order_deadline calculation — not available_now alone.
 *
 * Regression: Before Faz 4.6, alert-service used available_now directly,
 * causing UI and alert deadline to diverge for products with active quotes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListProducts          = vi.fn();
const mockDbGetOpenShortagesByProduct = vi.fn();
const mockDbGetQuotedQuantities   = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts:              (...args: unknown[]) => mockDbListProducts(...args),
    dbGetOpenShortagesByProduct: () => mockDbGetOpenShortagesByProduct(),
    dbGetQuotedQuantities:       (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
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
    dbListAlerts:            (...args: unknown[]) => mockDbListAlerts(...args),
    dbGetAlertById:          (...args: unknown[]) => mockDbGetAlertById(...args),
    dbCreateAlert:           (...args: unknown[]) => mockDbCreateAlert(...args),
    dbUpdateAlertStatus:     (...args: unknown[]) => mockDbUpdateAlertStatus(...args),
    dbDismissAlertsBySource: (...args: unknown[]) => mockDbDismissAlertsBySource(...args),
    dbListActiveAlerts:      (...args: unknown[]) => mockDbListActiveAlerts(...args),
    dbBatchResolveAlerts:    (...args: unknown[]) => mockDbBatchResolveAlerts(...args),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => false,
    aiGenerateOpsSummary: vi.fn(),
}));

import { serviceScanStockAlerts } from "@/lib/services/alert-service";
import type { ProductWithStock } from "@/lib/database.types";

// ── Fixtures ──────────────────────────────────────────────────

const FIXED_NOW = new Date("2024-06-01T12:00:00Z").getTime();

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "prod-1",
        name: "Test Ürün",
        sku: "T-001",
        category: null,
        unit: "adet",
        price: 100,
        currency: "TRY",
        on_hand: 100,
        reserved: 0,
        available_now: 100,
        min_stock_level: 5,
        is_active: true,
        product_type: "finished",
        warehouse: null,
        reorder_qty: null,
        preferred_vendor: null,
        daily_usage: null,
        lead_time_days: null,
        product_family: null,
        sub_category: null,
        sector_compatibility: null,
        cost_price: null,
        weight_kg: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    mockDbListActiveAlerts.mockResolvedValue([]);
    mockDbCreateAlert.mockResolvedValue({ id: "alert-1" });
    mockDbBatchResolveAlerts.mockResolvedValue(0);
    mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map());
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
});

// ── Tests ─────────────────────────────────────────────────────

describe("alert-service — order_deadline uses promisable (not available_now)", () => {
    it("quoted reduces effective promisable → imminent deadline created with critical severity", async () => {
        // available_now=30, quoted=25 → promisable=5
        // daily_usage=10 → stockout_days = floor(5/10) = 0 (today)
        // lead_time_days=5 → deadline = 0 - 5 - 7 = -12 days → critical
        const product = makeProduct({
            available_now: 30,
            min_stock_level: 5,  // healthy stock by min threshold
            daily_usage: 10,
            lead_time_days: 5,
        });
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 25]]));

        await serviceScanStockAlerts();

        const deadlineAlerts = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_deadline"
        );
        expect(deadlineAlerts).toHaveLength(1);
        expect(deadlineAlerts[0][0].severity).toBe("critical");
    });

    it("quoted=0 → deadline based on full available_now (regression check)", async () => {
        // available_now=30, quoted=0 → promisable=30
        // daily_usage=10 → stockout_days=3
        // lead_time_days=5 → deadline = 3 - 5 - 7 = -9 days → critical
        const product = makeProduct({
            available_now: 30,
            min_stock_level: 5,
            daily_usage: 10,
            lead_time_days: 5,
        });
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map()); // no quotes

        await serviceScanStockAlerts();

        const deadlineAlerts = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_deadline"
        );
        expect(deadlineAlerts).toHaveLength(1);
        expect(deadlineAlerts[0][0].severity).toBe("critical");
    });

    it("large quoted reduces deadline urgency: alert fires that would NOT fire with available_now alone", async () => {
        // available_now=200, quoted=185 → promisable=15
        // daily_usage=10 → stockout_days=1 → deadline = 1 - 5 - 7 = -11 days (critical, fires)
        // OLD code (available_now=200): stockout_days=20 → deadline = 20-5-7 = +8 days (no alert, daysLeft > 7)
        const product = makeProduct({
            available_now: 200,
            min_stock_level: 10,
            daily_usage: 10,
            lead_time_days: 5,
        });
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 185]]));

        await serviceScanStockAlerts();

        const deadlineAlerts = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_deadline"
        );
        // With promisable, alert should fire. Old code would NOT create this alert.
        expect(deadlineAlerts).toHaveLength(1);
        expect(deadlineAlerts[0][0].severity).toBe("critical");
    });

    it("small quoted with comfortable deadline → no deadline alert", async () => {
        // available_now=500, quoted=10 → promisable=490
        // daily_usage=10 → stockout_days=49 → deadline = 49 - 5 - 7 = +37 days (> 7, no alert)
        const product = makeProduct({
            available_now: 500,
            min_stock_level: 10,
            daily_usage: 10,
            lead_time_days: 5,
        });
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 10]]));

        await serviceScanStockAlerts();

        const deadlineAlerts = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_deadline"
        );
        expect(deadlineAlerts).toHaveLength(0);
    });
});
