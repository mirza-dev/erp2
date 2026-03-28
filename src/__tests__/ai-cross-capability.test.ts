/**
 * Cross-capability consistency tests.
 * Verifies that all AI route handlers share the same behavioral contracts:
 *   - ai_available flag
 *   - graceful degradation when AI is unavailable
 *   - graceful degradation when AI throws
 *   - generatedAt is a valid ISO string
 *
 * NOTE: import/[batchId]/parse has a different calling convention (NextRequest + params)
 * and is covered by import-parse-route.test.ts instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock, SalesOrderRow, AlertRow } from "@/lib/database.types";

// ─── Mocks: stock-risk ────────────────────────────────────────────────────────

const mockDbListProductsForStockRisk = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...args: unknown[]) => mockDbListProductsForStockRisk(...args),
}));

const mockAiAssessStockRisk = vi.fn();
const mockAiEnrichPurchaseSuggestions = vi.fn();
const mockAiGenerateOpsSummary = vi.fn();
const mockIsAIAvailable = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    aiAssessStockRisk: (...args: unknown[]) => mockAiAssessStockRisk(...args),
    aiEnrichPurchaseSuggestions: (...args: unknown[]) => mockAiEnrichPurchaseSuggestions(...args),
    aiGenerateOpsSummary: (...args: unknown[]) => mockAiGenerateOpsSummary(...args),
    isAIAvailable: () => mockIsAIAvailable(),
}));

// ─── Mocks: ops-summary DB ────────────────────────────────────────────────────

const mockDbListAlerts = vi.fn();
const mockDbListOrders = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts: (...args: unknown[]) => mockDbListAlerts(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders: (...args: unknown[]) => mockDbListOrders(...args),
    dbGetOrderById: vi.fn(),
}));

// ─── Mocks: purchase-copilot recommendations ─────────────────────────────────

vi.mock("@/lib/supabase/recommendations", () => ({
    dbUpsertRecommendation: vi.fn().mockResolvedValue({ id: "rec-mock" }),
    dbExpireSuggestedRecommendations: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: vi.fn(),
    ConfigError: class ConfigError extends Error {
        constructor(msg: string) { super(msg); this.name = "ConfigError"; }
    },
}));

import { POST as stockRiskPOST } from "@/app/api/ai/stock-risk/route";
import { POST as purchasePOST } from "@/app/api/ai/purchase-copilot/route";
import { POST as opsSummaryPOST } from "@/app/api/ai/ops-summary/route";
import { isValidISO } from "./test-helpers";

// ─── Factory functions ────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "p-cross-1",
        name: "Cross Cap Product",
        sku: "XCP-001",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 5,
        reserved: 0,
        available_now: 5,
        min_stock_level: 20,
        is_active: true,
        product_type: "raw_material",
        warehouse: null,
        reorder_qty: 10,
        preferred_vendor: null,
        daily_usage: 3,
        lead_time_days: 14,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

function makeOrder(overrides: Partial<SalesOrderRow> = {}): SalesOrderRow {
    return {
        id: "o-cross-1",
        order_number: "ORD-2026-0099",
        customer_id: null,
        customer_name: "Cross Test Customer",
        customer_email: null,
        customer_country: null,
        customer_tax_office: null,
        customer_tax_number: null,
        commercial_status: "pending_approval",
        fulfillment_status: "unallocated",
        currency: "USD",
        subtotal: 1000,
        vat_total: 200,
        grand_total: 1200,
        notes: null,
        ai_confidence: null,
        ai_reason: null,
        ai_risk_level: null,
        parasut_invoice_id: null,
        parasut_sent_at: null,
        parasut_error: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

function makeAlert(overrides: Partial<AlertRow> = {}): AlertRow {
    return {
        id: "alert-cross-1",
        product_id: "p-cross-1",
        product_name: "Cross Cap Product",
        alert_type: "critical_stock",
        status: "open",
        threshold_value: 10,
        current_value: 5,
        message: "Critical stock",
        resolved_at: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

// Setup ops-summary DB mocks with minimal data
function setupOpsSummaryDB() {
    mockDbListAlerts.mockResolvedValue([makeAlert()]);
    mockDbListOrders.mockResolvedValue([makeOrder()]);
}

// ─── Reset all mocks ──────────────────────────────────────────────────────────

beforeEach(() => {
    mockDbListProductsForStockRisk.mockReset();
    mockAiAssessStockRisk.mockReset();
    mockAiEnrichPurchaseSuggestions.mockReset();
    mockAiGenerateOpsSummary.mockReset();
    mockIsAIAvailable.mockReset();
    mockDbListAlerts.mockReset();
    mockDbListOrders.mockReset();
});

// ─── ai_available flag consistency ───────────────────────────────────────────

describe("cross-capability — ai_available flag consistency", () => {
    it("stock-risk: AI available → ai_available: true", async () => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProductsForStockRisk.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 22, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
        mockAiAssessStockRisk.mockResolvedValue({ assessments: [], generatedAt: new Date().toISOString() });
        const res = await stockRiskPOST();
        const body = await res.json();
        expect(body.ai_available).toBe(true);
    });

    it("stock-risk: AI unavailable → ai_available: false", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        const res = await stockRiskPOST();
        const body = await res.json();
        expect(body.ai_available).toBe(false);
    });

    it("purchase-copilot: AI available → ai_available: true", async () => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProductsForStockRisk.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        mockAiEnrichPurchaseSuggestions.mockResolvedValue({
            enrichments: [],
            generatedAt: new Date().toISOString(),
        });
        const res = await purchasePOST();
        const body = await res.json();
        expect(body.ai_available).toBe(true);
    });

    it("purchase-copilot: AI unavailable → ai_available: false", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        const res = await purchasePOST();
        const body = await res.json();
        expect(body.ai_available).toBe(false);
    });

    it("ops-summary: AI available → ai_available: true", async () => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        setupOpsSummaryDB();
        mockAiGenerateOpsSummary.mockResolvedValue({
            summary: "Normal.",
            insights: [],
            anomalies: [],
            confidence: 0.75,
            generatedAt: new Date().toISOString(),
        });
        const res = await opsSummaryPOST();
        const body = await res.json();
        expect(body.ai_available).toBe(true);
    });

    it("ops-summary: AI unavailable → ai_available: false", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        setupOpsSummaryDB();
        const res = await opsSummaryPOST();
        const body = await res.json();
        expect(body.ai_available).toBe(false);
    });
});

// ─── Graceful degradation — AI unavailable ────────────────────────────────────

describe("cross-capability — graceful degradation when AI unavailable", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
    });

    it("stock-risk: HTTP 200 when AI unavailable", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        const res = await stockRiskPOST();
        expect(res.status).toBe(200);
    });

    it("purchase-copilot: HTTP 200 when AI unavailable", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        const res = await purchasePOST();
        expect(res.status).toBe(200);
    });

    it("ops-summary: HTTP 200 when AI unavailable", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        setupOpsSummaryDB();
        const res = await opsSummaryPOST();
        expect(res.status).toBe(200);
    });

    it("purchase-copilot: deterministic fields populated even without AI", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20, daily_usage: 3, lead_time_days: 14 }),
        ]);
        const res = await purchasePOST();
        const body = await res.json();
        expect(body.items).toHaveLength(1);
        expect(typeof body.items[0].suggestQty).toBe("number");
        expect(body.items[0].suggestQty).toBeGreaterThan(0);
    });

    it("purchase-copilot: AI fields null when AI unavailable", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        const res = await purchasePOST();
        const body = await res.json();
        const item = body.items[0];
        expect(item.aiWhyNow).toBeNull();
        expect(item.aiQuantityRationale).toBeNull();
        expect(item.aiUrgencyLevel).toBeNull();
        expect(item.aiConfidence).toBeNull();
    });
});

// ─── Graceful degradation — AI service throws ─────────────────────────────────
//
// NOTE: stock-risk and purchase-copilot catch AI errors and return HTTP 200.
// ops-summary does NOT degrade gracefully — it returns HTTP 500 on AI error.
// This asymmetry is intentional and tested per-route in their own test files.

describe("cross-capability — stock-risk + purchase-copilot degrade gracefully when AI throws", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
    });

    it("stock-risk: HTTP 200 when aiAssessStockRisk throws", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 22, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
        mockAiAssessStockRisk.mockRejectedValue(new Error("AI timeout"));
        const res = await stockRiskPOST();
        expect(res.status).toBe(200);
    });

    it("purchase-copilot: HTTP 200 when aiEnrichPurchaseSuggestions throws", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 5, min_stock_level: 20 }),
        ]);
        mockAiEnrichPurchaseSuggestions.mockRejectedValue(new Error("AI timeout"));
        const res = await purchasePOST();
        expect(res.status).toBe(200);
    });

    it("ops-summary: HTTP 500 when aiGenerateOpsSummary throws (no graceful degradation)", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        setupOpsSummaryDB();
        mockAiGenerateOpsSummary.mockRejectedValue(new Error("AI timeout"));
        const res = await opsSummaryPOST();
        expect(res.status).toBe(500);
    });

    it("stock-risk: deterministic fields still present when AI throws", async () => {
        mockDbListProductsForStockRisk.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 22, min_stock_level: 10, daily_usage: 3, lead_time_days: 14 }),
        ]);
        mockAiAssessStockRisk.mockRejectedValue(new Error("AI timeout"));
        const res = await stockRiskPOST();
        const body = await res.json();
        expect(body.counts).toBeDefined();
        expect(typeof body.counts.total_products).toBe("number");
    });
});

// ─── generatedAt consistency ──────────────────────────────────────────────────

describe("cross-capability — generatedAt is valid ISO string", () => {
    it("stock-risk: generatedAt is valid ISO string", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        const res = await stockRiskPOST();
        const body = await res.json();
        expect(isValidISO(body.generatedAt)).toBe(true);
    });

    it("purchase-copilot: generatedAt is valid ISO string", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        const res = await purchasePOST();
        const body = await res.json();
        expect(isValidISO(body.generatedAt)).toBe(true);
    });

    it("ops-summary: generatedAt is valid ISO string", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProductsForStockRisk.mockResolvedValue([]);
        setupOpsSummaryDB();
        const res = await opsSummaryPOST();
        const body = await res.json();
        expect(isValidISO(body.generatedAt)).toBe(true);
    });
});
