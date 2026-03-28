/**
 * Tests for aiScoreOrder — mocked integration tests.
 * Anthropic SDK, Supabase orders, and service client are fully mocked.
 * No real API calls in CI.
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

import { aiScoreOrder } from "@/lib/services/ai-service";

import { makeTextResponse } from "./test-helpers";

const VALID_SCORE_RESPONSE = "CONFIDENCE: 0.87\nRISK_LEVEL: low\nREASON: Bilinen müşteri, standart sipariş";
const GARBLED_RESPONSE = "Sorry, I cannot process this request.";

// ─── Order fixture ────────────────────────────────────────────────────────────

const FIXTURE_ORDER = {
    id: "order-1",
    order_number: "ORD-2026-0050",
    customer_name: "SOCAR Turkey",
    customer_country: "TR",
    currency: "USD",
    grand_total: 45000,
    commercial_status: "approved",
    notes: "Standard quarterly order",
    lines: [{ product_name: "Küresel Vana DN25", quantity: 100, unit_price: 450, discount_pct: 0 }],
};

// ─── Save/restore env ─────────────────────────────────────────────────────────

let savedApiKey: string | undefined;

beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    mockCreate.mockReset();
    mockFrom.mockClear();
    mockUpdate.mockClear();
    mockEq.mockClear();
    mockDbGetOrderById.mockReset();
});

afterEach(() => {
    if (savedApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
    } else {
        process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
});

// ─── Order not found ──────────────────────────────────────────────────────────

describe("aiScoreOrder — order not found", () => {
    it("throws 'Sipariş bulunamadı.' when dbGetOrderById returns null", async () => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockDbGetOrderById.mockResolvedValue(null);
        await expect(aiScoreOrder("order-1")).rejects.toThrow("Sipariş bulunamadı.");
    });
});

// ─── AI unavailable fallback ──────────────────────────────────────────────────

describe("aiScoreOrder — AI unavailable fallback", () => {
    beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
        mockDbGetOrderById.mockResolvedValue(FIXTURE_ORDER);
    });

    it("returns confidence: 0", async () => {
        const result = await aiScoreOrder("order-1");
        expect(result.confidence).toBe(0);
    });

    it("returns risk_level: 'medium'", async () => {
        const result = await aiScoreOrder("order-1");
        expect(result.risk_level).toBe("medium");
    });

    it("does NOT call Anthropic API", async () => {
        await aiScoreOrder("order-1");
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("does NOT write to DB", async () => {
        await aiScoreOrder("order-1");
        expect(mockFrom).not.toHaveBeenCalled();
    });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("aiScoreOrder — happy path", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockDbGetOrderById.mockResolvedValue(FIXTURE_ORDER);
        mockCreate.mockResolvedValue(makeTextResponse(VALID_SCORE_RESPONSE));
    });

    it("returns confidence as number in [0, 1]", async () => {
        const result = await aiScoreOrder("order-1");
        expect(typeof result.confidence).toBe("number");
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("returns risk_level as 'low' | 'medium' | 'high'", async () => {
        const result = await aiScoreOrder("order-1");
        expect(result.risk_level).toMatch(/^(low|medium|high)$/);
    });

    it("returns reason as non-empty string", async () => {
        const result = await aiScoreOrder("order-1");
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
    });

    it("persists ai_confidence, ai_reason, ai_risk_level, ai_model_version to sales_orders", async () => {
        await aiScoreOrder("order-1");
        expect(mockFrom).toHaveBeenCalledWith("sales_orders");
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                ai_confidence: expect.any(Number),
                ai_reason: expect.any(String),
                ai_risk_level: expect.stringMatching(/^(low|medium|high)$/),
                ai_model_version: expect.any(String),
            })
        );
    });

    it("passes orderId to .eq('id', orderId)", async () => {
        await aiScoreOrder("order-1");
        expect(mockEq).toHaveBeenCalledWith("id", "order-1");
    });
});

// ─── Result shape contract ────────────────────────────────────────────────────

describe("aiScoreOrder — result shape contract", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockDbGetOrderById.mockResolvedValue(FIXTURE_ORDER);
        mockCreate.mockResolvedValue(makeTextResponse(VALID_SCORE_RESPONSE));
    });

    it("result has exactly: confidence, risk_level, reason", async () => {
        const result = await aiScoreOrder("order-1");
        expect(Object.keys(result).sort()).toEqual(["confidence", "reason", "risk_level"]);
    });

    it("confidence typeof number", async () => {
        const result = await aiScoreOrder("order-1");
        expect(typeof result.confidence).toBe("number");
    });

    it("risk_level typeof string, matches /^(low|medium|high)$/", async () => {
        const result = await aiScoreOrder("order-1");
        expect(typeof result.risk_level).toBe("string");
        expect(result.risk_level).toMatch(/^(low|medium|high)$/);
    });

    it("reason typeof string", async () => {
        const result = await aiScoreOrder("order-1");
        expect(typeof result.reason).toBe("string");
    });
});

// ─── API error graceful degradation ──────────────────────────────────────────

describe("aiScoreOrder — API error graceful degradation", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockDbGetOrderById.mockResolvedValue(FIXTURE_ORDER);
        mockCreate.mockRejectedValue(new Error("rate limit exceeded"));
    });

    it("does not throw", async () => {
        await expect(aiScoreOrder("order-1")).resolves.toBeDefined();
    });

    it("returns confidence: 0, risk_level: 'medium'", async () => {
        const result = await aiScoreOrder("order-1");
        expect(result.confidence).toBe(0);
        expect(result.risk_level).toBe("medium");
    });

    it("does NOT write to DB", async () => {
        await aiScoreOrder("order-1");
        expect(mockFrom).not.toHaveBeenCalled();
    });
});

// ─── Garbled AI response ──────────────────────────────────────────────────────

describe("aiScoreOrder — garbled AI response", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockDbGetOrderById.mockResolvedValue(FIXTURE_ORDER);
        mockCreate.mockResolvedValue(makeTextResponse(GARBLED_RESPONSE));
    });

    it("returns regex defaults: confidence 0.5, risk_level 'medium', reason ''", async () => {
        const result = await aiScoreOrder("order-1");
        expect(result.confidence).toBe(0.5);
        expect(result.risk_level).toBe("medium");
        expect(result.reason).toBe("");
    });

    it("still persists to DB (inside try, not catch)", async () => {
        await aiScoreOrder("order-1");
        expect(mockFrom).toHaveBeenCalledWith("sales_orders");
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                ai_confidence: 0.5,
                ai_risk_level: "medium",
                ai_reason: "",
            })
        );
        expect(mockEq).toHaveBeenCalledWith("id", "order-1");
    });
});
