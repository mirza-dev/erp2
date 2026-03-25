/**
 * Tests for AI Recommendation lifecycle + query layer.
 * Supabase client is fully mocked — no real DB calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase service mock ─────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockNot = vi.fn();

// Builder that returns itself for chaining
function makeBuilder() {
    const b: Record<string, unknown> = {};
    b.select = (..._args: unknown[]) => b;
    b.eq = (..._args: unknown[]) => b;
    b.not = mockNot.mockReturnValue(b);
    b.order = (..._args: unknown[]) => b;
    b.maybeSingle = mockMaybeSingle;
    b.single = mockSingle;
    return b;
}

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: mockFrom,
    }),
    ConfigError: class ConfigError extends Error {
        readonly code = "CONFIG_ERROR";
        constructor(message: string) {
            super(message);
            this.name = "ConfigError";
        }
    },
}));

// ─── Import module under test AFTER mocks ─────────────────────────────────────

import {
    dbUpsertRecommendation,
    dbListRecommendations,
    dbGetRecommendationById,
    dbUpdateRecommendationStatus,
    dbExpireSuggestedRecommendations,
} from "@/lib/supabase/recommendations";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "rec-1",
        entity_type: "product",
        entity_id: "prod-1",
        recommendation_type: "purchase_suggestion",
        title: "Test öneri",
        body: null,
        confidence: null,
        severity: "info",
        status: "suggested",
        model_version: null,
        metadata: null,
        edited_metadata: null,
        decided_at: null,
        expired_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

function setupFrom(tableHandlers: Record<string, () => unknown>) {
    mockFrom.mockImplementation((table: string) => {
        const handler = tableHandlers[table];
        if (handler) return handler();
        return makeBuilder();
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    mockNot.mockReturnValue(makeBuilder());
});

// ─── Query layer: upsert ──────────────────────────────────────────────────────

describe("dbUpsertRecommendation — creates new recommendation", () => {
    it("inserts when no existing suggested row found", async () => {
        const row = makeRow();
        setupFrom({
            ai_recommendations: () => {
                let callCount = 0;
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.maybeSingle = async () => ({ data: null, error: null }); // no existing
                b.insert = (_data: unknown) => {
                    callCount++;
                    return {
                        select: () => ({ single: async () => ({ data: row, error: null }) }),
                    };
                };
                b.update = () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }) });
                b.not = () => b;
                b.order = () => b;
                return b;
            },
        });

        const result = await dbUpsertRecommendation({
            entity_type: "product",
            entity_id: "prod-1",
            recommendation_type: "purchase_suggestion",
            title: "Test öneri",
        });
        expect(result.id).toBe("rec-1");
        expect(result.status).toBe("suggested");
    });
});

describe("dbUpsertRecommendation — refreshes existing suggested row", () => {
    it("updates body+confidence when suggested row exists", async () => {
        const existingRow = makeRow({ body: "old body" });
        const updatedRow = makeRow({ body: "new body", confidence: 0.9 });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.maybeSingle = async () => ({ data: existingRow, error: null });
                b.update = (_data: unknown) => ({
                    eq: () => ({
                        select: () => ({ single: async () => ({ data: updatedRow, error: null }) }),
                    }),
                });
                b.insert = () => { throw new Error("Should not insert when existing row found"); };
                b.not = () => b;
                b.order = () => b;
                return b;
            },
        });

        const result = await dbUpsertRecommendation({
            entity_type: "product",
            entity_id: "prod-1",
            recommendation_type: "purchase_suggestion",
            title: "Test öneri",
            body: "new body",
            confidence: 0.9,
        });
        expect(result.body).toBe("new body");
        expect(result.confidence).toBe(0.9);
    });
});

describe("dbUpsertRecommendation — does not overwrite accepted row", () => {
    it("inserts new row when existing row is accepted (not suggested)", async () => {
        const newRow = makeRow({ id: "rec-2" });
        let insertCalled = false;

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                // maybeSingle: no "suggested" row found (accepted rows filtered out by .eq("status","suggested"))
                b.maybeSingle = async () => ({ data: null, error: null });
                b.insert = (_data: unknown) => {
                    insertCalled = true;
                    return {
                        select: () => ({ single: async () => ({ data: newRow, error: null }) }),
                    };
                };
                b.update = () => { throw new Error("Should not update"); };
                b.not = () => b;
                b.order = () => b;
                return b;
            },
        });

        const result = await dbUpsertRecommendation({
            entity_type: "product",
            entity_id: "prod-1",
            recommendation_type: "purchase_suggestion",
            title: "Test öneri",
        });
        expect(insertCalled).toBe(true);
        expect(result.id).toBe("rec-2");
    });
});

// ─── Lifecycle: status transitions ────────────────────────────────────────────

describe("dbUpdateRecommendationStatus — suggested → accepted", () => {
    it("returns row with accepted status", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const acceptedRow = makeRow({ status: "accepted", decided_at: "2026-01-02T00:00:00Z" });

        setupFrom({
            ai_recommendations: () => {
                let updateCalled = false;
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: suggestedRow, error: null });
                b.update = (_data: unknown) => {
                    updateCalled = true;
                    return {
                        eq: () => ({
                            select: () => ({ single: async () => ({ data: acceptedRow, error: null }) }),
                        }),
                    };
                };
                b.insert = () => ({ then: async () => {} });
                b.not = () => b;
                b.order = () => b;
                void updateCalled;
                return b;
            },
            ai_feedback: () => {
                const b: Record<string, unknown> = {};
                b.insert = async () => ({ data: null, error: null });
                return b;
            },
        });

        const result = await dbUpdateRecommendationStatus("rec-1", "accepted");
        expect(result.status).toBe("accepted");
    });
});

describe("dbUpdateRecommendationStatus — suggested → edited with metadata", () => {
    it("sets edited_metadata on the row", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const editedRow = makeRow({ status: "edited", edited_metadata: { suggestQty: 50 } });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: suggestedRow, error: null });
                b.update = (_data: unknown) => ({
                    eq: () => ({
                        select: () => ({ single: async () => ({ data: editedRow, error: null }) }),
                    }),
                });
                b.not = () => b;
                b.order = () => b;
                return b;
            },
            ai_feedback: () => ({ insert: async () => ({ data: null, error: null }) }),
        });

        const result = await dbUpdateRecommendationStatus("rec-1", "edited", {
            editedMetadata: { suggestQty: 50 },
        });
        expect(result.status).toBe("edited");
        expect((result.edited_metadata as Record<string, unknown>)?.suggestQty).toBe(50);
    });
});

describe("dbUpdateRecommendationStatus — suggested → rejected", () => {
    it("returns row with rejected status", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const rejectedRow = makeRow({ status: "rejected" });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: suggestedRow, error: null });
                b.update = (_data: unknown) => ({
                    eq: () => ({
                        select: () => ({ single: async () => ({ data: rejectedRow, error: null }) }),
                    }),
                });
                b.not = () => b;
                b.order = () => b;
                return b;
            },
            ai_feedback: () => ({ insert: async () => ({ data: null, error: null }) }),
        });

        const result = await dbUpdateRecommendationStatus("rec-1", "rejected");
        expect(result.status).toBe("rejected");
    });
});

describe("dbUpdateRecommendationStatus — invalid transition accepted → rejected", () => {
    it("throws on invalid transition", async () => {
        const acceptedRow = makeRow({ status: "accepted" });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: acceptedRow, error: null });
                b.update = () => { throw new Error("Should not update"); };
                b.not = () => b;
                b.order = () => b;
                return b;
            },
        });

        await expect(
            dbUpdateRecommendationStatus("rec-1", "rejected")
        ).rejects.toThrow("Invalid status transition: accepted → rejected");
    });
});

// ─── Expiry ───────────────────────────────────────────────────────────────────

describe("dbExpireSuggestedRecommendations — marks only suggested rows", () => {
    it("calls update with status=expired and returns count", async () => {
        let updatePayload: Record<string, unknown> | null = null;

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.update = (data: Record<string, unknown>) => {
                    updatePayload = data;
                    return {
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    not: () => ({
                                        select: async () => ({ data: [{ id: "rec-x" }], error: null }),
                                    }),
                                }),
                            }),
                        }),
                    };
                };
                b.not = () => b;
                return b;
            },
        });

        const count = await dbExpireSuggestedRecommendations("product", ["prod-1", "prod-2"], "purchase_suggestion");
        expect(count).toBe(1);
        expect(updatePayload).not.toBeNull();
        expect((updatePayload as unknown as Record<string, unknown>).status).toBe("expired");
        expect((updatePayload as unknown as Record<string, unknown>).expired_at).toBeDefined();
    });

    it("returns 0 and skips DB call when activeEntityIds is empty", async () => {
        const count = await dbExpireSuggestedRecommendations("product", [], "purchase_suggestion");
        expect(count).toBe(0);
        expect(mockFrom).not.toHaveBeenCalled();
    });
});

// ─── Feedback row creation ────────────────────────────────────────────────────

describe("ai_feedback row created on status change", () => {
    it("inserts a feedback row when transitioning to accepted", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const acceptedRow = makeRow({ status: "accepted" });
        let feedbackInserted = false;

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: suggestedRow, error: null });
                b.update = (_data: unknown) => ({
                    eq: () => ({
                        select: () => ({ single: async () => ({ data: acceptedRow, error: null }) }),
                    }),
                });
                b.not = () => b;
                b.order = () => b;
                return b;
            },
            ai_feedback: () => ({
                insert: async (_data: unknown) => {
                    feedbackInserted = true;
                    return { data: null, error: null };
                },
            }),
        });

        await dbUpdateRecommendationStatus("rec-1", "accepted");
        expect(feedbackInserted).toBe(true);
    });

    it("does NOT insert feedback row when expiring", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const expiredRow = makeRow({ status: "expired" });
        let feedbackInserted = false;

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: suggestedRow, error: null });
                b.update = (_data: unknown) => ({
                    eq: () => ({
                        select: () => ({ single: async () => ({ data: expiredRow, error: null }) }),
                    }),
                });
                b.not = () => b;
                b.order = () => b;
                return b;
            },
            ai_feedback: () => ({
                insert: async () => {
                    feedbackInserted = true;
                    return { data: null, error: null };
                },
            }),
        });

        await dbUpdateRecommendationStatus("rec-1", "expired");
        expect(feedbackInserted).toBe(false);
    });
});

// ─── PATCH /api/recommendations/[id] ─────────────────────────────────────────

describe("PATCH /api/recommendations/[id] — returns updated recommendation", () => {
    it("returns 200 with mapped recommendation on accepted transition", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const acceptedRow = makeRow({ status: "accepted", decided_at: "2026-01-02T00:00:00Z" });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: suggestedRow, error: null });
                b.update = (_data: unknown) => ({
                    eq: () => ({
                        select: () => ({ single: async () => ({ data: acceptedRow, error: null }) }),
                    }),
                });
                b.not = () => b;
                b.order = () => b;
                return b;
            },
            ai_feedback: () => ({ insert: async () => ({ data: null, error: null }) }),
        });

        // Dynamically import route after mocks are set
        const { PATCH } = await import("@/app/api/recommendations/[id]/route");

        const req = new Request("http://localhost/api/recommendations/rec-1", {
            method: "PATCH",
            body: JSON.stringify({ status: "accepted" }),
            headers: { "Content-Type": "application/json" },
        });

        const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: Promise.resolve({ id: "rec-1" }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.recommendation.status).toBe("accepted");
        expect(body.recommendation.id).toBe("rec-1");
    });

    it("returns 400 for invalid status value", async () => {
        const { PATCH } = await import("@/app/api/recommendations/[id]/route");

        const req = new Request("http://localhost/api/recommendations/rec-1", {
            method: "PATCH",
            body: JSON.stringify({ status: "expired" }), // not allowed via API
            headers: { "Content-Type": "application/json" },
        });

        const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: Promise.resolve({ id: "rec-1" }) });
        expect(res.status).toBe(400);
    });
});
