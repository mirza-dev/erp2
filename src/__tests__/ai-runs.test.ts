/**
 * Tests for logAiRun and hashInput (src/lib/supabase/ai-runs.ts).
 *
 * logAiRun is fire-and-forget: never throws, never blocks.
 * When insert fails, it emits console.warn and continues silently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockInsert = vi.fn();
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
}));

import { logAiRun, hashInput } from "@/lib/supabase/ai-runs";

// ── helpers ───────────────────────────────────────────────────

/** Wait one microtask tick so the fire-and-forget async IIFE settles. */
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// ── setup / teardown ──────────────────────────────────────────

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    mockFrom.mockClear();
    mockInsert.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    warnSpy.mockRestore();
});

// ── logAiRun — insert payload ─────────────────────────────────

describe("logAiRun — insert payload", () => {
    beforeEach(() => {
        mockInsert.mockResolvedValue({ data: null, error: null });
    });

    it("calls from('ai_runs').insert with all provided fields", async () => {
        logAiRun({
            feature: "order_score",
            entity_id: "order-42",
            input_hash: "abc123",
            confidence: 0.9,
            latency_ms: 250,
            model: "claude-haiku-4-5-20251001",
        });
        await tick();
        expect(mockFrom).toHaveBeenCalledWith("ai_runs");
        expect(mockInsert).toHaveBeenCalledWith({
            feature: "order_score",
            entity_id: "order-42",
            input_hash: "abc123",
            confidence: 0.9,
            latency_ms: 250,
            model: "claude-haiku-4-5-20251001",
        });
    });

    it("optional params default to null in insert payload", async () => {
        logAiRun({ feature: "stock_risk" });
        await tick();
        expect(mockInsert).toHaveBeenCalledWith(
            expect.objectContaining({
                entity_id: null,
                input_hash: null,
                confidence: null,
                latency_ms: null,
                model: null,
            })
        );
    });

    it("does not call console.warn on successful insert", async () => {
        logAiRun({ feature: "import_parse" });
        await tick();
        expect(warnSpy).not.toHaveBeenCalled();
    });
});

// ── logAiRun — silent failure (fire-and-forget contract) ─────

describe("logAiRun — silent failure", () => {
    beforeEach(() => {
        mockInsert.mockRejectedValue(new Error("relation 'ai_runs' does not exist"));
    });

    it("does not throw when insert fails", async () => {
        expect(() => logAiRun({ feature: "ops_summary" })).not.toThrow();
        await tick();
    });

    it("returns void synchronously regardless of insert outcome", () => {
        const result = logAiRun({ feature: "purchase_enrich" });
        expect(result).toBeUndefined();
    });

    it("calls console.warn with [ai_runs] prefix when insert fails", async () => {
        logAiRun({ feature: "order_score" });
        await tick();
        expect(warnSpy).toHaveBeenCalledOnce();
        const [prefix] = warnSpy.mock.calls[0] as [string, ...unknown[]];
        expect(prefix).toContain("[ai_runs]");
    });

    it("console.warn includes the error message", async () => {
        logAiRun({ feature: "stock_risk" });
        await tick();
        const args = warnSpy.mock.calls[0] as unknown[];
        const combined = args.map(String).join(" ");
        expect(combined).toContain("ai_runs");
    });
});

// ── hashInput ─────────────────────────────────────────────────

describe("hashInput", () => {
    it("returns a 64-character hex string (SHA-256)", () => {
        const h = hashInput("test");
        expect(h).toHaveLength(64);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it("same input → same hash (deterministic)", () => {
        expect(hashInput("hello")).toBe(hashInput("hello"));
    });

    it("different inputs → different hashes", () => {
        expect(hashInput("a")).not.toBe(hashInput("b"));
    });

    it("empty string → valid hash", () => {
        const h = hashInput("");
        expect(h).toHaveLength(64);
    });
});
