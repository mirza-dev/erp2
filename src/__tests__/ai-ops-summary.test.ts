/**
 * Tests for aiGenerateOpsSummary — service layer contract.
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

import { aiGenerateOpsSummary, type OpsSummaryInput } from "@/lib/services/ai-service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_METRICS: OpsSummaryInput = {
    criticalStockCount: 3,
    warningStockCount: 5,
    topCriticalItems: [
        { name: "Gate Valve DN50", available: 2, min: 10, coverageDays: 3 },
        { name: "Ball Valve DN25", available: 0, min: 5, coverageDays: 0 },
    ],
    pendingOrderCount: 12,
    approvedOrderCount: 8,
    highRiskOrderCount: 2,
    openAlertCount: 7,
    atRiskCount: 5,
};

const VALID_AI_RESPONSE = JSON.stringify({
    summary: "3 kritik stok uyarisi mevcut.",
    insights: ["Ball Valve DN25 siparis verin.", "Bekleyen siparisler kontrol edin."],
    anomalies: ["Kritik stok orani yuksek."],
});

const GARBLED_RESPONSE = "Sorry, I cannot process this.";
const PARTIAL_RESPONSE = JSON.stringify({ summary: "Durum normal." });
const EMPTY_JSON = JSON.stringify({});

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

describe("aiGenerateOpsSummary — result shape contract", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(VALID_AI_RESPONSE));
    });

    it("result has exactly: summary, insights, anomalies, confidence, generatedAt", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(Object.keys(result).sort()).toEqual(["anomalies", "confidence", "generatedAt", "insights", "summary"]);
    });

    it("summary typeof string", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(typeof result.summary).toBe("string");
    });

    it("insights is an array where every element is a string", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(Array.isArray(result.insights)).toBe(true);
        result.insights.forEach(item => expect(typeof item).toBe("string"));
    });

    it("anomalies is an array where every element is a string", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(Array.isArray(result.anomalies)).toBe(true);
        result.anomalies.forEach(item => expect(typeof item).toBe("string"));
    });

    it("confidence typeof number", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(typeof result.confidence).toBe("number");
    });

    it("generatedAt typeof string and valid ISO 8601", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(typeof result.generatedAt).toBe("string");
        expect(isValidISO(result.generatedAt)).toBe(true);
    });
});

// ─── AI unavailable fallback (§7.2) ──────────────────────────────────────────

describe("aiGenerateOpsSummary — AI unavailable fallback (§7.2)", () => {
    beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it("returns summary: ''", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.summary).toBe("");
    });

    it("returns insights: []", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.insights).toEqual([]);
    });

    it("returns anomalies: []", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.anomalies).toEqual([]);
    });

    it("returns confidence: 0", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.confidence).toBe(0);
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });

    it("does NOT call Anthropic API", async () => {
        await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("aiGenerateOpsSummary — happy path", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(VALID_AI_RESPONSE));
    });

    it("returns non-empty summary string", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.summary.length).toBeGreaterThan(0);
    });

    it("returns insights as string[]", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(Array.isArray(result.insights)).toBe(true);
        result.insights.forEach(item => expect(typeof item).toBe("string"));
    });

    it("returns anomalies as string[]", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(Array.isArray(result.anomalies)).toBe(true);
        result.anomalies.forEach(item => expect(typeof item).toBe("string"));
    });

    it("returns confidence: 0.75 (hardcoded)", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.confidence).toBe(0.75);
    });

    it("returns valid ISO generatedAt", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(isValidISO(result.generatedAt)).toBe(true);
    });

    it("calls client.messages.create exactly once", async () => {
        await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });
});

// ─── Garbled AI response ──────────────────────────────────────────────────────

describe("aiGenerateOpsSummary — garbled AI response", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeTextResponse(GARBLED_RESPONSE));
    });

    it("does not throw", async () => {
        await expect(aiGenerateOpsSummary(FIXTURE_METRICS)).resolves.toBeDefined();
    });

    it("returns summary: ''", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.summary).toBe("");
    });

    it("returns confidence: 0", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.confidence).toBe(0);
    });

    it("returns insights: [], anomalies: []", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.insights).toEqual([]);
        expect(result.anomalies).toEqual([]);
    });
});

// ─── API error graceful degradation ──────────────────────────────────────────

describe("aiGenerateOpsSummary — API error graceful degradation", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockRejectedValue(new Error("rate limit exceeded"));
    });

    it("does not throw", async () => {
        await expect(aiGenerateOpsSummary(FIXTURE_METRICS)).resolves.toBeDefined();
    });

    it("returns summary: ''", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.summary).toBe("");
    });

    it("returns confidence: 0", async () => {
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.confidence).toBe(0);
    });
});

// ─── Output contract across all scenarios (parametric) ───────────────────────

describe("aiGenerateOpsSummary — output contract across all scenarios", () => {
    const SCENARIOS = [
        {
            label: "no API key",
            setup: () => {
                delete process.env.ANTHROPIC_API_KEY;
            },
        },
        {
            label: "API error",
            setup: () => {
                process.env.ANTHROPIC_API_KEY = "test-key";
                mockCreate.mockRejectedValue(new Error("network failure"));
            },
        },
        {
            label: "garbled response",
            setup: () => {
                process.env.ANTHROPIC_API_KEY = "test-key";
                mockCreate.mockResolvedValue(makeTextResponse(GARBLED_RESPONSE));
            },
        },
        {
            label: "valid response",
            setup: () => {
                process.env.ANTHROPIC_API_KEY = "test-key";
                mockCreate.mockResolvedValue(makeTextResponse(VALID_AI_RESPONSE));
            },
        },
        {
            label: "partial response",
            setup: () => {
                process.env.ANTHROPIC_API_KEY = "test-key";
                mockCreate.mockResolvedValue(makeTextResponse(PARTIAL_RESPONSE));
            },
        },
    ] as const;

    for (const scenario of SCENARIOS) {
        describe(`scenario: ${scenario.label}`, () => {
            beforeEach(() => {
                mockCreate.mockReset();
                scenario.setup();
            });

            it("all five keys present", async () => {
                const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
                expect(Object.keys(result).sort()).toEqual(["anomalies", "confidence", "generatedAt", "insights", "summary"]);
            });

            it("types correct (summary:string, insights:array, anomalies:array, confidence:number, generatedAt:string)", async () => {
                const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
                expect(typeof result.summary).toBe("string");
                expect(Array.isArray(result.insights)).toBe(true);
                expect(Array.isArray(result.anomalies)).toBe(true);
                expect(typeof result.confidence).toBe("number");
                expect(typeof result.generatedAt).toBe("string");
            });

            it("generatedAt valid ISO", async () => {
                const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
                expect(isValidISO(result.generatedAt)).toBe(true);
            });
        });
    }
});

// ─── Partial AI response ──────────────────────────────────────────────────────

describe("aiGenerateOpsSummary — partial AI response", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("JSON with summary but no insights/anomalies → insights: [], anomalies: []", async () => {
        mockCreate.mockResolvedValue(makeTextResponse(PARTIAL_RESPONSE));
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.insights).toEqual([]);
        expect(result.anomalies).toEqual([]);
    });

    it("empty JSON object {} → summary: ''", async () => {
        mockCreate.mockResolvedValue(makeTextResponse(EMPTY_JSON));
        const result = await aiGenerateOpsSummary(FIXTURE_METRICS);
        expect(result.summary).toBe("");
    });
});
