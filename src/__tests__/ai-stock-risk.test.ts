/**
 * Tests for aiAssessStockRisk — service layer contract.
 * Anthropic SDK is fully mocked. No real API calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Module mocks (hoisted by vitest before imports) ─────────────────────────

const { mockCreate } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
    default: vi.fn(function () {
        return { messages: { create: mockCreate } };
    }),
}));

// Side-effect import chain prevention (ai-service.ts imports these at module level)
vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { aiAssessStockRisk, type StockRiskItem } from "@/lib/services/ai-service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRiskItem(overrides: Partial<StockRiskItem> = {}): StockRiskItem {
    return {
        productId: "p-1",
        productName: "Gate Valve DN50",
        sku: "GV-DN50",
        available: 30,
        min: 10,
        dailyUsage: 3,
        coverageDays: 10,
        leadTimeDays: 14,
        riskLevel: "coverage_risk",
        deterministicReason: "Kalan stok (~10 gün) tedarik süresinden (14 gün) kısa.",
        ...overrides,
    };
}

const VALID_ASSESSMENT = {
    productId: "p-1",
    explanation: "Stok tükenme süresi tedarik süresinden kısa.",
    recommendation: "Hemen sipariş verin.",
    confidence: 0.85,
};

const VALID_AI_RESPONSE = JSON.stringify({
    assessments: [VALID_ASSESSMENT],
});

const GARBLED_RESPONSE = "I cannot provide stock risk assessments.";
const PARTIAL_RESPONSE = JSON.stringify({ assessments: [{ productId: "p-1" }] });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTextResponse(text: string) {
    return { content: [{ type: "text", text }] };
}

function isValidISO(dateString: string): boolean {
    const d = new Date(dateString);
    return !isNaN(d.getTime()) && dateString.includes("T");
}

// ─── Save/restore env ─────────────────────────────────────────────────────────

let savedApiKey: string | undefined;

beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    mockCreate.mockReset();
});

afterEach(() => {
    if (savedApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
    } else {
        process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
});

// ─── Result shape contract ────────────────────────────────────────────────────

describe("aiAssessStockRisk — result shape contract", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(VALID_AI_RESPONSE));
    });

    it("result has exactly: assessments, generatedAt", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(Object.keys(result).sort()).toEqual(["assessments", "generatedAt"]);
    });

    it("assessments is an array", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(Array.isArray(result.assessments)).toBe(true);
    });

    it("generatedAt is a valid ISO 8601 string", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });

    it("each assessment has productId, explanation, recommendation, confidence", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        for (const a of result.assessments) {
            expect(typeof a.productId).toBe("string");
            expect(typeof a.explanation).toBe("string");
            expect(typeof a.recommendation).toBe("string");
            expect(typeof a.confidence).toBe("number");
        }
    });
});

// ─── AI unavailable fallback ──────────────────────────────────────────────────

describe("aiAssessStockRisk — AI unavailable fallback", () => {
    beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it("returns assessments: []", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(result.assessments).toEqual([]);
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });

    it("does NOT call Anthropic API", async () => {
        await aiAssessStockRisk([makeRiskItem()]);
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

// ─── Empty items array ────────────────────────────────────────────────────────

describe("aiAssessStockRisk — empty items array", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("returns assessments: []", async () => {
        const result = await aiAssessStockRisk([]);
        expect(result.assessments).toEqual([]);
    });

    it("does NOT call Anthropic API", async () => {
        await aiAssessStockRisk([]);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiAssessStockRisk([]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("aiAssessStockRisk — happy path", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(VALID_AI_RESPONSE));
    });

    it("returns non-empty assessments", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(result.assessments.length).toBeGreaterThan(0);
    });

    it("assessment productId matches input", async () => {
        const result = await aiAssessStockRisk([makeRiskItem({ productId: "p-1" })]);
        expect(result.assessments[0].productId).toBe("p-1");
    });

    it("calls client.messages.create exactly once", async () => {
        await aiAssessStockRisk([makeRiskItem()]);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("assessment has non-empty explanation", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(result.assessments[0].explanation.length).toBeGreaterThan(0);
    });

    it("assessment has non-empty recommendation", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(result.assessments[0].recommendation.length).toBeGreaterThan(0);
    });
});

// ─── Garbled AI response ──────────────────────────────────────────────────────

describe("aiAssessStockRisk — garbled AI response", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(GARBLED_RESPONSE));
    });

    it("does not throw", async () => {
        await expect(aiAssessStockRisk([makeRiskItem()])).resolves.toBeDefined();
    });

    it("returns assessments: []", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(result.assessments).toEqual([]);
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });
});

// ─── API error graceful degradation ──────────────────────────────────────────

describe("aiAssessStockRisk — API error graceful degradation", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockRejectedValue(new Error("rate limit exceeded"));
    });

    it("does not throw", async () => {
        await expect(aiAssessStockRisk([makeRiskItem()])).resolves.toBeDefined();
    });

    it("returns assessments: []", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(result.assessments).toEqual([]);
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });
});

// ─── Partial AI response (missing fields default gracefully) ─────────────────

describe("aiAssessStockRisk — partial AI response", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(PARTIAL_RESPONSE));
    });

    it("does not throw", async () => {
        await expect(aiAssessStockRisk([makeRiskItem()])).resolves.toBeDefined();
    });

    it("missing explanation defaults to empty string", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(result.assessments.length).toBeGreaterThan(0);
        expect(typeof result.assessments[0].explanation).toBe("string");
    });

    it("missing recommendation defaults to empty string", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(typeof result.assessments[0].recommendation).toBe("string");
    });

    it("missing confidence defaults to 0.5", async () => {
        const result = await aiAssessStockRisk([makeRiskItem()]);
        expect(result.assessments[0].confidence).toBe(0.5);
    });
});
