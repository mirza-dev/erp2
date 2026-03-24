/**
 * Tests for aiBatchParse — §7.2 graceful degradation + §11.1 output contract.
 * Anthropic SDK is fully mocked — no real API calls in CI.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Module mocks (hoisted by vitest before imports) ─────────────────────────
// vi.hoisted() runs before module initialization, making mockCreate available
// inside the vi.mock() factory without TDZ (temporal dead zone) issues.

const { mockCreate } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
    // Must be a regular function (not arrow) to be usable as a constructor with `new`
    default: vi.fn(function () {
        return { messages: { create: mockCreate } };
    }),
}));

// Prevent side-effect import chain from pulling in Supabase clients
vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { aiBatchParse } from "@/lib/services/ai-service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAnthropicTextResponse(text: string) {
    return { content: [{ type: "text", text }] };
}

const VALID_AI_BATCH_RESPONSE = JSON.stringify({
    items: [
        { parsed_data: { name: "Acme Vana", email: "acme@example.com" }, confidence: 0.92, ai_reason: "All fields mapped", unmatched_fields: [] },
        { parsed_data: { name: "Beta Corp" }, confidence: 0.55, ai_reason: "Partial match", unmatched_fields: ["xyz_col"] },
    ],
});

const CUSTOMER_ROWS = [
    { firma_adi: "Acme Vana", email: "acme@example.com", ulke: "TR" },
    { firma_adi: "Beta Corp", xyz_col: "value" },
];

// ─── Save/restore env ────────────────────────────────────────────────────────

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

// ─── §7.2 Graceful degradation — AI unavailable ──────────────────────────────

describe("aiBatchParse — §7.2 graceful degradation: AI unavailable (no API key)", () => {
    beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    it("returns fallback-mapped items when API key is missing", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        expect(result.items).toHaveLength(CUSTOMER_ROWS.length);
    });

    it("sets confidence to 0.5 for all items", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        result.items.forEach(item => expect(item.confidence).toBe(0.5));
    });

    it("sets ai_reason to Turkish fallback message string", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        result.items.forEach(item => {
            expect(typeof item.ai_reason).toBe("string");
            expect(item.ai_reason.length).toBeGreaterThan(0);
        });
    });

    it("output item count matches input row count", async () => {
        const threeRows = [
            { firma_adi: "A" },
            { firma_adi: "B" },
            { firma_adi: "C" },
        ];
        const result = await aiBatchParse({ entity_type: "customer", rows: threeRows });
        expect(result.items).toHaveLength(3);
    });
});

// ─── §7.2 Graceful degradation — unsupported entity type ────────────────────

describe("aiBatchParse — §7.2 graceful degradation: unsupported entity type", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("returns fallback items for unknown entity_type without throwing", async () => {
        // @ts-expect-error testing invalid entity_type
        const result = await aiBatchParse({ entity_type: "invoice", rows: [{ col: "val" }] });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].confidence).toBe(0.5);
    });
});

// ─── §7.2 Graceful degradation — API error ──────────────────────────────────

describe("aiBatchParse — §7.2 graceful degradation: API error", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockRejectedValue(new Error("rate limit exceeded"));
    });

    it("returns fallback items and does not throw on API error", async () => {
        await expect(
            aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS })
        ).resolves.toBeDefined();
    });

    it("confidence is 0.5 for all items on API error", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        result.items.forEach(item => expect(item.confidence).toBe(0.5));
    });

    it("output item count matches input row count on API error", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        expect(result.items).toHaveLength(CUSTOMER_ROWS.length);
    });
});

// ─── §7.2 Graceful degradation — unparseable response ───────────────────────

describe("aiBatchParse — §7.2 graceful degradation: unparseable response", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("returns fallback items when AI returns plain text (no JSON)", async () => {
        mockCreate.mockResolvedValue(makeAnthropicTextResponse("This is plain text with no JSON."));
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        expect(result.items).toHaveLength(CUSTOMER_ROWS.length);
        result.items.forEach(item => expect(item.confidence).toBe(0.5));
    });

    it("returns fallback items when AI JSON has no 'items' array", async () => {
        mockCreate.mockResolvedValue(makeAnthropicTextResponse(JSON.stringify({ result: "ok" })));
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        expect(result.items).toHaveLength(CUSTOMER_ROWS.length);
        result.items.forEach(item => expect(item.confidence).toBe(0.5));
    });

    it("returns fallback when AI response has malformed JSON", async () => {
        mockCreate.mockResolvedValue(makeAnthropicTextResponse("{items: [broken]"));
        const result = await aiBatchParse({ entity_type: "product", rows: [{ urun_kodu: "X" }] });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].confidence).toBe(0.5);
    });
});

// ─── Happy path — AI available and responds correctly ────────────────────────

describe("aiBatchParse — happy path: AI available and responds correctly", () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        mockCreate.mockResolvedValue(makeAnthropicTextResponse(VALID_AI_BATCH_RESPONSE));
    });

    it("returns parsed items from AI response", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        expect(result.items[0].parsed_data).toMatchObject({ name: "Acme Vana", email: "acme@example.com" });
    });

    it("item count matches the AI response items array length", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        expect(result.items).toHaveLength(2);
    });

    it("each item has confidence from AI response", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        expect(result.items[0].confidence).toBe(0.92);
        expect(result.items[1].confidence).toBe(0.55);
    });

    it("each item has unmatched_fields array from AI response", async () => {
        const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
        expect(Array.isArray(result.items[0].unmatched_fields)).toBe(true);
        expect(result.items[1].unmatched_fields).toContain("xyz_col");
    });
});

// ─── §11.1 Output contract ───────────────────────────────────────────────────

describe("aiBatchParse — §11.1 output contract: AI advisory fields always present", () => {
    const SCENARIOS = [
        {
            label: "no API key (fallback)",
            setup: () => { delete process.env.ANTHROPIC_API_KEY; },
        },
        {
            label: "API error (fallback)",
            setup: () => {
                process.env.ANTHROPIC_API_KEY = "test-key";
                mockCreate.mockRejectedValue(new Error("fail"));
            },
        },
        {
            label: "unparseable response (fallback)",
            setup: () => {
                process.env.ANTHROPIC_API_KEY = "test-key";
                mockCreate.mockResolvedValue(makeAnthropicTextResponse("no json here"));
            },
        },
        {
            label: "valid AI response (happy path)",
            setup: () => {
                process.env.ANTHROPIC_API_KEY = "test-key";
                mockCreate.mockResolvedValue(makeAnthropicTextResponse(VALID_AI_BATCH_RESPONSE));
            },
        },
    ];

    for (const scenario of SCENARIOS) {
        it(`all items have confidence (number), ai_reason (string), unmatched_fields (array) — ${scenario.label}`, async () => {
            scenario.setup();
            const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
            for (const item of result.items) {
                expect(typeof item.confidence).toBe("number");
                expect(typeof item.ai_reason).toBe("string");
                expect(Array.isArray(item.unmatched_fields)).toBe(true);
            }
        });

        it(`parsed_data is always an object, never null/undefined — ${scenario.label}`, async () => {
            scenario.setup();
            const result = await aiBatchParse({ entity_type: "customer", rows: CUSTOMER_ROWS });
            for (const item of result.items) {
                expect(typeof item.parsed_data).toBe("object");
                expect(item.parsed_data).not.toBeNull();
            }
        });
    }
});
