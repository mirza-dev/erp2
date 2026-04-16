/**
 * aiParseEntity + aiDetectColumns branch coverage.
 *
 * Covers:
 *   - aiParseEntity: AI unavailable path, success path (logAiRun called), catch/error path
 *   - aiDetectColumns: AI unavailable fallback, success path (JSON parsed), catch fallback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Module mocks ─────────────────────────────────────────────────────────────

const { mockCreate } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
    default: vi.fn(function () {
        return { messages: { create: mockCreate } };
    }),
}));

vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const mockLogAiRun = vi.fn().mockResolvedValue(undefined);
const mockHashInput = vi.fn().mockReturnValue("hash-abc");
vi.mock("@/lib/supabase/ai-runs", () => ({
    logAiRun: (...args: unknown[]) => mockLogAiRun(...args),
    hashInput: (...args: unknown[]) => mockHashInput(...args),
}));

import { aiParseEntity, aiDetectColumns } from "@/lib/services/ai-service";
import { makeTextResponse } from "./test-helpers";

// ─── Env helpers ──────────────────────────────────────────────────────────────

let savedApiKey: string | undefined;

beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    mockCreate.mockReset();
    mockLogAiRun.mockReset();
});

afterEach(() => {
    if (savedApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
    } else {
        process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
});

// ─── aiParseEntity ────────────────────────────────────────────────────────────

describe("aiParseEntity — AI unavailable path", () => {
    beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it("returns degraded result without calling Anthropic API", async () => {
        const result = await aiParseEntity({ entity_type: "customer", raw_text: "Acme Vana" });
        expect(result.confidence).toBe(0);
        expect(result.parsed_data).toEqual({});
        expect(result.unmatched_fields).toContain("all");
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("throws for unknown entity_type regardless of AI availability", async () => {
        await expect(
            aiParseEntity({ entity_type: "widget" as "customer", raw_text: "x" })
        ).rejects.toThrow(/widget/i);
    });
});

describe("aiParseEntity — success path", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("returns parsed_data from AI response and calls logAiRun", async () => {
        const aiJson = JSON.stringify({
            parsed_data: { name: "Acme Vana", email: "acme@example.com" },
            confidence: 0.9,
            ai_reason: "All fields mapped",
            unmatched_fields: [],
        });
        mockCreate.mockResolvedValue(makeTextResponse(aiJson));

        const result = await aiParseEntity({ entity_type: "customer", raw_text: "Acme Vana, acme@example.com" });

        expect(result.confidence).toBeGreaterThan(0);
        expect(mockLogAiRun).toHaveBeenCalledWith(
            expect.objectContaining({ feature: "import_parse" })
        );
    });
});

describe("aiParseEntity — catch/error path", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("returns graceful degradation result when API throws", async () => {
        mockCreate.mockRejectedValue(new Error("network timeout"));

        const result = await aiParseEntity({ entity_type: "customer", raw_text: "Acme" });

        expect(result.confidence).toBe(0);
        expect(result.parsed_data).toEqual({});
        expect(result.ai_reason).toMatch(/yanıt veremedi/i);
    });
});

// ─── aiDetectColumns ──────────────────────────────────────────────────────────

describe("aiDetectColumns — AI unavailable fallback", () => {
    beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it("returns usedAI=false and fallback mappings without calling API", async () => {
        const result = await aiDetectColumns({
            headers: ["firma_adi", "email"],
            sampleRows: [{ firma_adi: "Acme", email: "a@b.com" }],
            entityType: "customer",
        });

        expect(result.usedAI).toBe(false);
        expect(Array.isArray(result.mappings)).toBe(true);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("includes past mappings context when provided (AI unavailable path)", async () => {
        const result = await aiDetectColumns({
            headers: ["firma_adi"],
            sampleRows: [],
            entityType: "customer",
            pastMappings: [{ source_column: "firma_adi", target_field: "name", success_count: 5 }],
        });

        expect(result.usedAI).toBe(false);
    });
});

describe("aiDetectColumns — success path (AI parses JSON array)", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("returns usedAI=true and AI-parsed mappings", async () => {
        const aiJson = JSON.stringify([
            { source_column: "firma_adi", target_field: "name", confidence: 0.95 },
            { source_column: "email", target_field: "email", confidence: 0.99 },
        ]);
        mockCreate.mockResolvedValue(makeTextResponse(aiJson));

        const result = await aiDetectColumns({
            headers: ["firma_adi", "email"],
            sampleRows: [{ firma_adi: "Acme", email: "a@b.com" }],
            entityType: "customer",
        });

        expect(result.usedAI).toBe(true);
        expect(result.mappings).toHaveLength(2);
        expect(result.mappings[0].target_field).toBe("name");
    });

    it("clamps confidence to [0,1] range", async () => {
        const aiJson = JSON.stringify([
            { source_column: "firma_adi", target_field: "name", confidence: 1.5 },
        ]);
        mockCreate.mockResolvedValue(makeTextResponse(aiJson));

        const result = await aiDetectColumns({
            headers: ["firma_adi"],
            sampleRows: [],
            entityType: "customer",
        });

        expect(result.usedAI).toBe(true);
        expect(result.mappings[0].confidence).toBeLessThanOrEqual(1);
    });
});

describe("aiDetectColumns — catch fallback (API error)", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("falls back to non-AI mappings when API throws", async () => {
        mockCreate.mockRejectedValue(new Error("network error"));

        const result = await aiDetectColumns({
            headers: ["firma_adi"],
            sampleRows: [],
            entityType: "customer",
        });

        expect(result.usedAI).toBe(false);
    });

    it("falls back when AI returns non-JSON text", async () => {
        mockCreate.mockResolvedValue(makeTextResponse("Üzgünüm, anlayamadım."));

        const result = await aiDetectColumns({
            headers: ["firma_adi"],
            sampleRows: [],
            entityType: "customer",
        });

        expect(result.usedAI).toBe(false);
    });
});
