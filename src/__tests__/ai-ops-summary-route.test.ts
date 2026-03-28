/**
 * Tests for POST /api/ai/ops-summary route handler.
 * DB queries and AI service are fully mocked.
 * computeCoverageDays and handleApiError run real (not mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductWithStock, SalesOrderRow, AlertRow } from "@/lib/database.types";

// ─── DB query mocks ───────────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();
const mockDbListAlerts = vi.fn();
const mockDbListOrders = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...args: unknown[]) => mockDbListProducts(...args),
}));
vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts: (...args: unknown[]) => mockDbListAlerts(...args),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders: (...args: unknown[]) => mockDbListOrders(...args),
}));

// ─── AI service mock ──────────────────────────────────────────────────────────

const mockAiGenerateOpsSummary = vi.fn();
const mockIsAIAvailable = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    aiGenerateOpsSummary: (...args: unknown[]) => mockAiGenerateOpsSummary(...args),
    isAIAvailable: () => mockIsAIAvailable(),
}));

import { POST } from "@/app/api/ai/ops-summary/route";
import { ConfigError } from "@/lib/supabase/service";
import { isValidISO } from "./test-helpers";

// ─── Factory functions ────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "p-1",
        name: "Test Product",
        sku: "TP-001",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 50,
        reserved: 5,
        available_now: 45,
        min_stock_level: 10,
        is_active: true,
        product_type: "finished",
        warehouse: null,
        reorder_qty: null,
        preferred_vendor: null,
        daily_usage: 5,
        lead_time_days: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

function makeOrder(overrides: Partial<SalesOrderRow> = {}): SalesOrderRow {
    return {
        id: "o-1",
        order_number: "ORD-2026-0001",
        customer_id: null,
        customer_name: "Test Customer",
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
        item_count: 1,
        parasut_invoice_id: null,
        parasut_sent_at: null,
        parasut_error: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        created_by: null,
        ai_confidence: null,
        ai_reason: null,
        ai_model_version: null,
        ai_risk_level: null,
        ...overrides,
    };
}

function makeAlert(id: string): AlertRow {
    return {
        id,
        type: "stock_critical",
        severity: "critical",
        title: "Low stock",
        description: null,
        entity_type: null,
        entity_id: null,
        status: "open",
        acknowledged_at: null,
        resolved_at: null,
        dismissed_at: null,
        resolution_reason: null,
        ai_confidence: null,
        ai_reason: null,
        ai_model_version: null,
        ai_inputs_summary: null,
        created_at: "2024-01-01T00:00:00Z",
        source: "system",
    };
}

// ─── gatherMetrics computation ────────────────────────────────────────────────

describe("POST /api/ai/ops-summary — gatherMetrics computation", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
    });

    it("criticalStockCount: products where available_now <= min_stock_level", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 8, min_stock_level: 10 }),   // critical
            makeProduct({ id: "p-2", available_now: 14, min_stock_level: 10 }),  // warning
            makeProduct({ id: "p-3", available_now: 50, min_stock_level: 10 }),  // healthy
        ]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbListOrders.mockResolvedValue([]);

        const res = await POST();
        const body = await res.json();
        expect(body.metrics.criticalStockCount).toBe(1);
    });

    it("warningStockCount: available_now > min && available_now <= ceil(min * 1.5)", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-1", available_now: 8, min_stock_level: 10 }),   // critical
            makeProduct({ id: "p-2", available_now: 14, min_stock_level: 10 }),  // warning (14 <= ceil(15) = 15)
            makeProduct({ id: "p-3", available_now: 50, min_stock_level: 10 }),  // healthy
        ]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbListOrders.mockResolvedValue([]);

        const res = await POST();
        const body = await res.json();
        expect(body.metrics.warningStockCount).toBe(1);
    });

    it("topCriticalItems sorted by coverageDays ascending", async () => {
        mockDbListProducts.mockResolvedValue([
            makeProduct({ id: "p-a", name: "Product A", available_now: 9, min_stock_level: 10, daily_usage: 3 }),  // coverageDays = round(9/3) = 3
            makeProduct({ id: "p-b", name: "Product B", available_now: 4, min_stock_level: 10, daily_usage: 2 }),  // coverageDays = round(4/2) = 2
        ]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbListOrders.mockResolvedValue([]);

        const res = await POST();
        const body = await res.json();
        const items = body.metrics.topCriticalItems;
        expect(items[0].name).toBe("Product B");  // 2 days — comes first
        expect(items[1].name).toBe("Product A");  // 3 days — comes second
    });

    it("highRiskOrderCount: ai_risk_level === 'high' across pending + approved", async () => {
        mockDbListProducts.mockResolvedValue([]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbListOrders.mockImplementation((filter: unknown) => {
            const f = filter as { commercial_status?: string };
            if (f.commercial_status === "pending_approval") {
                return Promise.resolve([makeOrder({ id: "o-1", ai_risk_level: "high" })]);
            }
            if (f.commercial_status === "approved") {
                return Promise.resolve([
                    makeOrder({ id: "o-2", ai_risk_level: "high" }),
                    makeOrder({ id: "o-3", ai_risk_level: "low" }),
                ]);
            }
            return Promise.resolve([]);
        });

        const res = await POST();
        const body = await res.json();
        expect(body.metrics.highRiskOrderCount).toBe(2);
    });

    it("openAlertCount equals alerts array length", async () => {
        mockDbListProducts.mockResolvedValue([]);
        mockDbListAlerts.mockResolvedValue([
            makeAlert("a-1"),
            makeAlert("a-2"),
            makeAlert("a-3"),
        ]);
        mockDbListOrders.mockResolvedValue([]);

        const res = await POST();
        const body = await res.json();
        expect(body.metrics.openAlertCount).toBe(3);
    });

    it("calls dbListProducts with { is_active: true, pageSize: 500 }", async () => {
        mockDbListProducts.mockResolvedValue([]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbListOrders.mockResolvedValue([]);

        await POST();
        expect(mockDbListProducts).toHaveBeenCalledWith({ is_active: true, pageSize: 500 });
    });

    it("calls dbListOrders with pending_approval and approved filters", async () => {
        mockDbListProducts.mockResolvedValue([]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbListOrders.mockResolvedValue([]);

        await POST();
        expect(mockDbListOrders).toHaveBeenCalledWith({ commercial_status: "pending_approval", pageSize: 200 });
        expect(mockDbListOrders).toHaveBeenCalledWith({ commercial_status: "approved", pageSize: 200 });
    });
});

// ─── AI unavailable ───────────────────────────────────────────────────────────

describe("POST /api/ai/ops-summary — AI unavailable", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue([makeProduct()]);
        mockDbListAlerts.mockResolvedValue([makeAlert("a-1")]);
        mockDbListOrders.mockResolvedValue([]);
    });

    it("returns HTTP 200", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("ai_available: false", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.ai_available).toBe(false);
    });

    it("metrics object present in response", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.metrics).toBeDefined();
        expect(typeof body.metrics).toBe("object");
    });

    it("summary: '', insights: [], anomalies: [], confidence: 0", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.summary).toBe("");
        expect(body.insights).toEqual([]);
        expect(body.anomalies).toEqual([]);
        expect(body.confidence).toBe(0);
    });

    it("generatedAt is valid ISO string", async () => {
        const res = await POST();
        const body = await res.json();
        expect(isValidISO(body.generatedAt)).toBe(true);
    });

    it("mockAiGenerateOpsSummary NOT called", async () => {
        await POST();
        expect(mockAiGenerateOpsSummary).not.toHaveBeenCalled();
    });
});

// ─── AI available happy path ──────────────────────────────────────────────────

describe("POST /api/ai/ops-summary — AI available happy path", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockAiGenerateOpsSummary.mockResolvedValue({
            summary: "Durum kritik.",
            insights: ["Siparis verin."],
            anomalies: [],
            confidence: 0.75,
            generatedAt: new Date().toISOString(),
        });
        mockDbListProducts.mockResolvedValue([makeProduct()]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbListOrders.mockResolvedValue([]);
    });

    it("returns HTTP 200", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("ai_available: true", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.ai_available).toBe(true);
    });

    it("metrics object present", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.metrics).toBeDefined();
    });

    it("AI result fields spread into response", async () => {
        const res = await POST();
        const body = await res.json();
        expect(typeof body.summary).toBe("string");
        expect(Array.isArray(body.insights)).toBe(true);
        expect(Array.isArray(body.anomalies)).toBe(true);
        expect(typeof body.confidence).toBe("number");
        expect(isValidISO(body.generatedAt)).toBe(true);
    });
});

// ─── metrics gathering DB error ───────────────────────────────────────────────

describe("POST /api/ai/ops-summary — metrics gathering DB error", () => {
    beforeEach(() => {
        mockDbListProducts.mockRejectedValue(new Error("DB connection failed"));
    });

    it("returns HTTP 500", async () => {
        const res = await POST();
        expect(res.status).toBe(500);
    });

    it("response body has error field", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.error).toBeDefined();
    });
});

// ─── AI generation error ──────────────────────────────────────────────────────

describe("POST /api/ai/ops-summary — AI generation error", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockAiGenerateOpsSummary.mockRejectedValue(new Error("AI service failed"));
        mockDbListProducts.mockResolvedValue([]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbListOrders.mockResolvedValue([]);
    });

    it("returns HTTP 500", async () => {
        const res = await POST();
        expect(res.status).toBe(500);
    });

    it("response body has error field", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.error).toBeDefined();
    });
});

// ─── ConfigError on DB failure → 503 ─────────────────────────────────────────

describe("POST /api/ai/ops-summary — ConfigError on DB failure", () => {
    beforeEach(() => {
        mockDbListProducts.mockRejectedValue(new ConfigError("MISSING ENV"));
    });

    it("returns HTTP 503", async () => {
        const res = await POST();
        expect(res.status).toBe(503);
    });

    it("response body has code: 'CONFIG_ERROR'", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.code).toBe("CONFIG_ERROR");
    });
});
