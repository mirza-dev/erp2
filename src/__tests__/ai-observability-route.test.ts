/**
 * Tests for GET /api/ai/observability route handler.
 *
 * Guards:
 *   - always returns 200 with valid shape (no crash on empty tables)
 *   - counts are correct when rows exist
 *   - DB errors in individual queries are non-fatal (try/catch in route)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let tableData: Record<string, Row[]> = {};
let throwOnTable: string | null = null;

function makeQuery(table: string) {
    if (table === throwOnTable) throw new Error("simulated DB error");
    const rows = tableData[table] ?? [];
    const resolved = Promise.resolve({ data: rows, error: null });
    return Object.assign(resolved, {
        gte: () => Promise.resolve({ data: rows, error: null }),
    });
}

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: (table: string) => ({
            select: () => makeQuery(table),
        }),
    }),
}));

import { GET } from "@/app/api/ai/observability/route";

beforeEach(() => {
    tableData = {};
    throwOnTable = null;
});

// ─── Shape guard ─────────────────────────────────────────────────────────────

describe("GET /api/ai/observability — response shape", () => {
    it("returns 200 with all top-level keys", async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty("runs");
        expect(body).toHaveProperty("recommendations");
        expect(body).toHaveProperty("feedback");
        expect(body).toHaveProperty("generatedAt");
    });

    it("returns zeros when all tables are empty", async () => {
        const res = await GET();
        const body = await res.json();
        expect(body.runs.last7d).toBe(0);
        expect(body.runs.fallbackCount).toBe(0);
        expect(body.recommendations.activeCount).toBe(0);
        expect(body.recommendations.decidedCount).toBe(0);
    });

    it("generatedAt is a valid ISO string", async () => {
        const res = await GET();
        const body = await res.json();
        expect(() => new Date(body.generatedAt)).not.toThrow();
        expect(new Date(body.generatedAt).getFullYear()).toBeGreaterThan(2020);
    });
});

// ─── Counting logic ───────────────────────────────────────────────────────────

describe("GET /api/ai/observability — counting", () => {
    it("counts ai_runs correctly and detects fallbacks (null model)", async () => {
        tableData.ai_runs = [
            { feature: "order_score", model: "claude-haiku-4-5" },
            { feature: "order_score", model: null },
            { feature: "stock_risk", model: "claude-haiku-4-5" },
        ];
        const res = await GET();
        const { runs } = await res.json();
        expect(runs.last7d).toBe(3);
        expect(runs.fallbackCount).toBe(1);
        expect(runs.byFeature.order_score).toBe(2);
        expect(runs.byFeature.stock_risk).toBe(1);
    });

    it("counts ai_recommendations by status", async () => {
        tableData.ai_recommendations = [
            { status: "suggested" },
            { status: "suggested" },
            { status: "accepted" },
            { status: "rejected" },
        ];
        const res = await GET();
        const { recommendations } = await res.json();
        expect(recommendations.byStatus.suggested).toBe(2);
        expect(recommendations.byStatus.accepted).toBe(1);
        expect(recommendations.byStatus.rejected).toBe(1);
        expect(recommendations.decidedCount).toBe(2); // accepted + rejected
    });

    it("counts ai_feedback last7d by type", async () => {
        tableData.ai_feedback = [
            { feedback_type: "accepted" },
            { feedback_type: "accepted" },
            { feedback_type: "edited" },
        ];
        const res = await GET();
        const { feedback } = await res.json();
        expect(feedback.last7d.accepted).toBe(2);
        expect(feedback.last7d.edited).toBe(1);
        expect(feedback.last7d.rejected).toBe(0);
    });
});

// ─── Resilience ───────────────────────────────────────────────────────────────

describe("GET /api/ai/observability — resilience", () => {
    it("returns 200 and zeros for runs when ai_runs table throws", async () => {
        throwOnTable = "ai_runs";
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.runs.last7d).toBe(0);
        expect(body.runs.fallbackCount).toBe(0);
    });

    it("returns 200 and zero recommendations when ai_recommendations throws", async () => {
        throwOnTable = "ai_recommendations";
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.recommendations.activeCount).toBe(0);
    });
});
