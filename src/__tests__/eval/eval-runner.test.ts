/**
 * Eval runner — parametric tests across all fixture scenarios.
 * Validates structural properties (schema, category, confidence range)
 * against golden responses for each AI capability.
 *
 * Design principles:
 *   - No exact text matching — structure & behavior only
 *   - Golden responses simulate what a well-behaved model returns
 *   - All AI calls are mocked — no real API in CI
 *   - Run: npx vitest run src/__tests__/eval/
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

const { mockCreate } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
    default: vi.fn(function () {
        return { messages: { create: mockCreate } };
    }),
}));

const mockDbGetOrderById = vi.fn();
vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...args: unknown[]) => mockDbGetOrderById(...args),
}));

const mockEq = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
}));

import {
    aiScoreOrder,
    aiGenerateOpsSummary,
    aiEnrichPurchaseSuggestions,
    aiAssessStockRisk,
} from "@/lib/services/ai-service";
import type { StockRiskItem } from "@/lib/services/ai-service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

import { ALL_ORDER_RISK_SCENARIOS } from "../fixtures/order-risk-fixtures";
import { ALL_OPS_SCENARIOS } from "../fixtures/ops-summary-fixtures";
import { ALL_PURCHASE_SCENARIOS } from "../fixtures/purchase-fixtures";
import { ALL_UNIVERSAL_FAILURES } from "../fixtures/golden-responses";
import { ALL_STOCK_RISK_EVAL_SCENARIOS } from "../fixtures/stock-risk-eval-fixtures";

// ─── Eval helpers ─────────────────────────────────────────────────────────────

import {
    checkConfidenceRange,
    checkCategory,
    checkRequiredKeys,
    checkArrayBounds,
    isValidISO,
} from "./eval-helpers";

import { makeTextResponse } from "../test-helpers";

// ─── Save/restore env ─────────────────────────────────────────────────────────

let savedApiKey: string | undefined;

beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "eval-test-key";
    mockCreate.mockReset();
    mockDbGetOrderById.mockReset();
    mockFrom.mockClear();
    mockUpdate.mockClear();
    mockEq.mockClear();
});

afterEach(() => {
    if (savedApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
    } else {
        process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
});

// (Eval: Import Batch Parse bölümü kaldırıldı — 2026-06-10 sadeleştirme:
// aiBatchParse ve onu kullanan /api/import/[batchId]/parse route'u silindi;
// canlı Excel hattı detect-columns → apply-mappings.)

// ─── Eval: Order Risk ─────────────────────────────────────────────────────────

describe("Eval: Order Risk Scoring", () => {
    for (const scenario of ALL_ORDER_RISK_SCENARIOS) {
        describe(`scenario: ${scenario.label}`, () => {
            beforeEach(() => {
                mockDbGetOrderById.mockResolvedValue(scenario.order);
                mockCreate.mockResolvedValue(makeTextResponse(scenario.goldenResponse));
            });

            it("returns result with required keys", async () => {
                const result = await aiScoreOrder(scenario.order.id);
                const check = checkRequiredKeys(
                    result as unknown as Record<string, unknown>,
                    ["confidence", "risk_level", "reason"],
                    {
                        confidence: "number" as const,
                        risk_level: "string" as const,
                        reason: "string" as const,
                    },
                );
                expect(check.pass, check.message).toBe(true);
            });

            it("risk_level matches expected category", async () => {
                const result = await aiScoreOrder(scenario.order.id);
                const check = checkCategory(
                    result.risk_level,
                    scenario.expected.risk_level,
                    ["low", "medium", "high"] as const,
                );
                expect(check.pass, check.message).toBe(true);
            });

            it("confidence is within expected range", async () => {
                const result = await aiScoreOrder(scenario.order.id);
                const check = checkConfidenceRange(result.confidence, {
                    min: scenario.expected.minConfidence,
                    max: scenario.expected.maxConfidence,
                });
                expect(check.pass, check.message).toBe(true);
            });
        });
    }
});

// ─── Eval: Ops Summary ────────────────────────────────────────────────────────

describe("Eval: Ops Summary", () => {
    for (const scenario of ALL_OPS_SCENARIOS) {
        describe(`scenario: ${scenario.label}`, () => {
            beforeEach(() => {
                mockCreate.mockResolvedValue(makeTextResponse(scenario.goldenResponse));
            });

            it("returns result with required keys", async () => {
                const result = await aiGenerateOpsSummary(scenario.metrics);
                const check = checkRequiredKeys(
                    result as unknown as Record<string, unknown>,
                    ["summary", "insights", "anomalies", "confidence", "generatedAt"],
                    {
                        summary: "string" as const,
                        insights: "array" as const,
                        anomalies: "array" as const,
                        confidence: "number" as const,
                        generatedAt: "string" as const,
                    },
                );
                expect(check.pass, check.message).toBe(true);
            });

            it("insights count is within expected bounds", async () => {
                const result = await aiGenerateOpsSummary(scenario.metrics);
                const check = checkArrayBounds(result.insights, {
                    min: scenario.expected.minInsights,
                    max: scenario.expected.maxInsights,
                });
                expect(check.pass, check.message).toBe(true);
            });

            it("anomalies count is within expected bounds", async () => {
                const result = await aiGenerateOpsSummary(scenario.metrics);
                const check = checkArrayBounds(result.anomalies, {
                    min: scenario.expected.minAnomalies,
                    max: scenario.expected.maxAnomalies,
                });
                expect(check.pass, check.message).toBe(true);
            });

            it("summary meets minimum length", async () => {
                const result = await aiGenerateOpsSummary(scenario.metrics);
                expect(result.summary.length).toBeGreaterThanOrEqual(
                    scenario.expected.minSummaryLength,
                );
            });

            it("generatedAt is valid ISO string", async () => {
                const result = await aiGenerateOpsSummary(scenario.metrics);
                expect(isValidISO(result.generatedAt)).toBe(true);
            });
        });
    }
});

// ─── Eval: Purchase Copilot ───────────────────────────────────────────────────

describe("Eval: Purchase Copilot", () => {
    for (const scenario of ALL_PURCHASE_SCENARIOS) {
        describe(`scenario: ${scenario.label}`, () => {
            beforeEach(() => {
                mockCreate.mockResolvedValue(makeTextResponse(scenario.goldenResponse));
            });

            it("returns enrichments for all input items", async () => {
                const result = await aiEnrichPurchaseSuggestions(scenario.items);
                expect(result.enrichments).toHaveLength(scenario.items.length);
            });

            it("each enrichment has required structural keys", async () => {
                const result = await aiEnrichPurchaseSuggestions(scenario.items);
                for (const enrichment of result.enrichments) {
                    const check = checkRequiredKeys(
                        enrichment as unknown as Record<string, unknown>,
                        ["productId", "whyNow", "quantityRationale", "urgencyLevel", "confidence"],
                        {
                            productId: "string" as const,
                            whyNow: "string" as const,
                            quantityRationale: "string" as const,
                            urgencyLevel: "string" as const,
                            confidence: "number" as const,
                        },
                    );
                    expect(check.pass, check.message).toBe(true);
                }
            });

            it("urgencyLevel matches expected category", async () => {
                const result = await aiEnrichPurchaseSuggestions(scenario.items);
                for (const enrichment of result.enrichments) {
                    const check = checkCategory(
                        enrichment.urgencyLevel,
                        scenario.expected.urgencyLevel,
                        ["critical", "high", "moderate"] as const,
                    );
                    expect(check.pass, check.message).toBe(true);
                }
            });

            it("confidence is within expected range", async () => {
                const result = await aiEnrichPurchaseSuggestions(scenario.items);
                for (const enrichment of result.enrichments) {
                    const check = checkConfidenceRange(enrichment.confidence, {
                        min: scenario.expected.minConfidence,
                        max: scenario.expected.maxConfidence,
                    });
                    expect(check.pass, check.message).toBe(true);
                }
            });

            it("generatedAt is valid ISO string", async () => {
                const result = await aiEnrichPurchaseSuggestions(scenario.items);
                expect(isValidISO(result.generatedAt)).toBe(true);
            });
        });
    }
});

// ─── Eval: Stock Risk Assessment ─────────────────────────────────────────────

describe("Eval: Stock Risk Assessment", () => {
    for (const scenario of ALL_STOCK_RISK_EVAL_SCENARIOS) {
        describe(`scenario: ${scenario.label}`, () => {
            beforeEach(() => {
                mockCreate.mockResolvedValue(makeTextResponse(scenario.goldenResponse));
            });

            it("returns correct number of assessments", async () => {
                const result = await aiAssessStockRisk(scenario.items);
                expect(result.assessments).toHaveLength(scenario.expected.count);
            });

            it("each assessment has required structural keys", async () => {
                const result = await aiAssessStockRisk(scenario.items);
                for (const assessment of result.assessments) {
                    const check = checkRequiredKeys(
                        assessment as unknown as Record<string, unknown>,
                        ["productId", "explanation", "recommendation", "confidence"],
                        {
                            productId: "string" as const,
                            explanation: "string" as const,
                            recommendation: "string" as const,
                            confidence: "number" as const,
                        },
                    );
                    expect(check.pass, check.message).toBe(true);
                }
            });

            it("confidence is within expected range", async () => {
                const result = await aiAssessStockRisk(scenario.items);
                for (const assessment of result.assessments) {
                    const check = checkConfidenceRange(assessment.confidence, {
                        min: scenario.expected.minConfidence,
                        max: scenario.expected.maxConfidence,
                    });
                    expect(check.pass, check.message).toBe(true);
                }
            });

            it("generatedAt is valid ISO string", async () => {
                const result = await aiAssessStockRisk(scenario.items);
                expect(isValidISO(result.generatedAt)).toBe(true);
            });
        });
    }
});

// ─── Eval: Universal Degradation ─────────────────────────────────────────────

describe("Eval: Universal Degradation", () => {
    const STOCK_RISK_ITEMS: StockRiskItem[] = [
        {
            productId: "p-deg-001",
            productName: "Degradation Ürünü",
            sku: "DEG-001",
            available: 15,
            min: 10,
            dailyUsage: 2,
            coverageDays: 7,
            leadTimeDays: 14,
            riskLevel: "coverage_risk",
            deterministicReason: "Degradation test item",
        },
    ];
    const OPS_METRICS = {
        criticalStockCount: 1,
        warningStockCount: 0,
        topCriticalItems: [],
        pendingOrderCount: 1,
        approvedOrderCount: 1,
        highRiskOrderCount: 0,
        openAlertCount: 0,
        atRiskCount: 0,
    };
    const SCORE_ORDER_ID = "order-degradation-test";

    for (const failure of ALL_UNIVERSAL_FAILURES) {
        describe(`failure variant: ${failure.label}`, () => {
            beforeEach(() => {
                mockCreate.mockResolvedValue(makeTextResponse(failure.response));
                mockDbGetOrderById.mockResolvedValue({
                    id: SCORE_ORDER_ID,
                    order_number: "ORD-DEG-001",
                    customer_name: "Degradation Test",
                    customer_country: null,
                    currency: "USD",
                    grand_total: 1000,
                    commercial_status: "approved",
                    notes: null,
                    lines: [{ product_name: "Test Product", quantity: 1, unit_price: 1000, discount_pct: 0 }],
                });
            });

            it("aiGenerateOpsSummary does not throw", async () => {
                await expect(
                    aiGenerateOpsSummary(OPS_METRICS),
                ).resolves.toBeDefined();
            });

            it("aiGenerateOpsSummary returns valid shape", async () => {
                const result = await aiGenerateOpsSummary(OPS_METRICS);
                expect(typeof result.summary).toBe("string");
                expect(Array.isArray(result.insights)).toBe(true);
                expect(Array.isArray(result.anomalies)).toBe(true);
                expect(typeof result.confidence).toBe("number");
                expect(isValidISO(result.generatedAt)).toBe(true);
            });

            it("aiEnrichPurchaseSuggestions does not throw", async () => {
                await expect(
                    aiEnrichPurchaseSuggestions([
                        {
                            productId: "p-test",
                            productName: "Test",
                            sku: "T-001",
                            productType: "commercial",
                            unit: "adet",
                            available: 5,
                            min: 20,
                            dailyUsage: 3,
                            coverageDays: 2,
                            leadTimeDays: 14,
                            suggestQty: 60,
                            moq: 10,
                            targetStock: 62,
                            formula: "lead_time",
                            leadTimeDemand: 42,
                            preferredVendor: null,
                        },
                    ]),
                ).resolves.toBeDefined();
            });

            it("aiEnrichPurchaseSuggestions returns valid shape", async () => {
                const result = await aiEnrichPurchaseSuggestions([
                    {
                        productId: "p-test",
                        productName: "Test",
                        sku: "T-001",
                        productType: "commercial",
                        unit: "adet",
                        available: 5,
                        min: 20,
                        dailyUsage: 3,
                        coverageDays: 2,
                        leadTimeDays: 14,
                        suggestQty: 60,
                        moq: 10,
                        targetStock: 62,
                        formula: "lead_time",
                        leadTimeDemand: 42,
                        preferredVendor: null,
                    },
                ]);
                expect(Array.isArray(result.enrichments)).toBe(true);
                expect(isValidISO(result.generatedAt)).toBe(true);
            });

            it("aiAssessStockRisk does not throw", async () => {
                await expect(
                    aiAssessStockRisk(STOCK_RISK_ITEMS),
                ).resolves.toBeDefined();
            });

            it("aiAssessStockRisk returns valid shape", async () => {
                const result = await aiAssessStockRisk(STOCK_RISK_ITEMS);
                expect(Array.isArray(result.assessments)).toBe(true);
                expect(isValidISO(result.generatedAt)).toBe(true);
            });

            it("aiScoreOrder does not throw", async () => {
                await expect(aiScoreOrder(SCORE_ORDER_ID)).resolves.toBeDefined();
            });
            it("aiScoreOrder returns valid shape", async () => {
                const result = await aiScoreOrder(SCORE_ORDER_ID);
                expect(typeof result.confidence).toBe("number");
                expect(["low", "medium", "high"]).toContain(result.risk_level);
                expect(typeof result.reason).toBe("string");
            });
        });
    }
});
