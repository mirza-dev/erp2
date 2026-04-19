/**
 * Tests for aiEnrichPurchaseSuggestions — service layer contract.
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

import { aiEnrichPurchaseSuggestions, type PurchaseSuggestionItem } from "@/lib/services/ai-service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePurchaseItem(overrides: Partial<PurchaseSuggestionItem> = {}): PurchaseSuggestionItem {
    return {
        productId: "p-1",
        productName: "Gate Valve DN50",
        sku: "GV-DN50",
        productType: "commercial",
        unit: "adet",
        available: 5,
        min: 20,
        dailyUsage: 3,
        coverageDays: 2,
        leadTimeDays: 14,
        suggestQty: 50,
        moq: 10,
        targetStock: 62,
        formula: "lead_time",
        leadTimeDemand: 42,
        preferredVendor: "Vendor A",
        ...overrides,
    };
}

const VALID_ENRICHMENT = {
    productId: "p-1",
    whyNow: "Stok 2 günde tükenecek, tedarik süresi 14 gün.",
    quantityRationale: "50 adet tedarik süresini karşılar ve emniyet stoğu oluşturur.",
    urgencyLevel: "critical",
    confidence: 0.85,
};

const VALID_AI_RESPONSE = JSON.stringify({
    enrichments: [VALID_ENRICHMENT],
});

const GARBLED_RESPONSE = "I cannot provide purchase suggestions.";
const PARTIAL_RESPONSE = JSON.stringify({ enrichments: [{ productId: "p-1" }] });

import { makeTextResponse, isValidISO } from "./test-helpers";

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

describe("aiEnrichPurchaseSuggestions — result shape contract", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(VALID_AI_RESPONSE));
    });

    it("result has exactly: enrichments, generatedAt", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(Object.keys(result).sort()).toEqual(["enrichments", "generatedAt"]);
    });

    it("enrichments is an array", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(Array.isArray(result.enrichments)).toBe(true);
    });

    it("generatedAt is a valid ISO 8601 string", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });

    it("each enrichment has productId, whyNow, quantityRationale, urgencyLevel, confidence", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        for (const e of result.enrichments) {
            expect(typeof e.productId).toBe("string");
            expect(typeof e.whyNow).toBe("string");
            expect(typeof e.quantityRationale).toBe("string");
            expect(["critical", "high", "moderate"]).toContain(e.urgencyLevel);
            expect(typeof e.confidence).toBe("number");
        }
    });
});

// ─── AI unavailable fallback ──────────────────────────────────────────────────

describe("aiEnrichPurchaseSuggestions — AI unavailable fallback", () => {
    beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it("returns enrichments: []", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments).toEqual([]);
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });

    it("does NOT call Anthropic API", async () => {
        await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

// ─── Empty items array ────────────────────────────────────────────────────────

describe("aiEnrichPurchaseSuggestions — empty items array", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("returns enrichments: []", async () => {
        const result = await aiEnrichPurchaseSuggestions([]);
        expect(result.enrichments).toEqual([]);
    });

    it("does NOT call Anthropic API", async () => {
        await aiEnrichPurchaseSuggestions([]);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiEnrichPurchaseSuggestions([]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("aiEnrichPurchaseSuggestions — happy path", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(VALID_AI_RESPONSE));
    });

    it("returns non-empty enrichments", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments.length).toBeGreaterThan(0);
    });

    it("enrichment productId matches input", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem({ productId: "p-1" })]);
        expect(result.enrichments[0].productId).toBe("p-1");
    });

    it("calls client.messages.create exactly once", async () => {
        await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("enrichment has non-empty whyNow", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments[0].whyNow.length).toBeGreaterThan(0);
    });

    it("enrichment has non-empty quantityRationale", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments[0].quantityRationale.length).toBeGreaterThan(0);
    });
});

// ─── Garbled AI response ──────────────────────────────────────────────────────

describe("aiEnrichPurchaseSuggestions — garbled AI response", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(GARBLED_RESPONSE));
    });

    it("does not throw", async () => {
        await expect(aiEnrichPurchaseSuggestions([makePurchaseItem()])).resolves.toBeDefined();
    });

    it("returns enrichments: []", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments).toEqual([]);
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });
});

// ─── API error graceful degradation ──────────────────────────────────────────

describe("aiEnrichPurchaseSuggestions — API error graceful degradation", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockRejectedValue(new Error("rate limit exceeded"));
    });

    it("does not throw", async () => {
        await expect(aiEnrichPurchaseSuggestions([makePurchaseItem()])).resolves.toBeDefined();
    });

    it("returns enrichments: []", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments).toEqual([]);
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });
});

// ─── Partial AI response (missing fields default gracefully) ─────────────────

describe("aiEnrichPurchaseSuggestions — partial AI response", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(PARTIAL_RESPONSE));
    });

    it("does not throw", async () => {
        await expect(aiEnrichPurchaseSuggestions([makePurchaseItem()])).resolves.toBeDefined();
    });

    it("missing whyNow defaults to empty string", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments.length).toBeGreaterThan(0);
        expect(typeof result.enrichments[0].whyNow).toBe("string");
        expect(result.enrichments[0].whyNow).toBe("");
    });

    it("missing quantityRationale defaults to empty string", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments[0].quantityRationale).toBe("");
    });

    it("missing urgencyLevel defaults to 'moderate'", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments[0].urgencyLevel).toBe("moderate");
    });

    it("missing confidence defaults to 0.5", async () => {
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments[0].confidence).toBe(0.5);
    });
});

// ─── Confidence bounds ────────────────────────────────────────────────────────

describe("aiEnrichPurchaseSuggestions — confidence bounds", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("confidence > 1 is clamped to 1 (§12 guardrail)", async () => {
        mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify({
            enrichments: [{ productId: "p-1", whyNow: "test", quantityRationale: "test", urgencyLevel: "high", confidence: 1.5 }],
        })));
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments[0].confidence).toBe(1);
    });

    it("confidence < 0 is clamped to 0 (§12 guardrail)", async () => {
        mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify({
            enrichments: [{ productId: "p-1", whyNow: "test", quantityRationale: "test", urgencyLevel: "high", confidence: -0.3 }],
        })));
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments[0].confidence).toBe(0);
    });

    it("non-number confidence defaults to 0.5", async () => {
        mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify({
            enrichments: [{ productId: "p-1", whyNow: "test", quantityRationale: "test", urgencyLevel: "high", confidence: "high" }],
        })));
        const result = await aiEnrichPurchaseSuggestions([makePurchaseItem()]);
        expect(result.enrichments[0].confidence).toBe(0.5);
    });
});
