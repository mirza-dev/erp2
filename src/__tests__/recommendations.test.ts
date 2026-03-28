/**
 * Tests for AI Recommendation lifecycle + query layer.
 * Supabase client is fully mocked — no real DB calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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

// Thenable builder for queries that use `await query` directly (e.g. dbListRecommendations)
function makeThenableBuilder(rows: unknown[], eqSpy?: ReturnType<typeof vi.fn>) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = eqSpy
        ? (...args: unknown[]) => { eqSpy(...args); return b; }
        : () => b;
    b.order = () => b;
    b.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    return b;
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

// ─── Query layer: dbGetRecommendationById ─────────────────────────────────────

describe("dbGetRecommendationById — returns row when found", () => {
    it("returns the row", async () => {
        const row = makeRow();
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: row, error: null });
                return b;
            },
        });
        const result = await dbGetRecommendationById("rec-1");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("rec-1");
    });
});

describe("dbGetRecommendationById — returns null when not found", () => {
    it("returns null (does not throw)", async () => {
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: null, error: { message: "Row not found" } });
                return b;
            },
        });
        const result = await dbGetRecommendationById("rec-999");
        expect(result).toBeNull();
    });
});

// ─── Query layer: dbListRecommendations ───────────────────────────────────────

describe("dbListRecommendations — returns all rows when no filter", () => {
    it("returns array of all rows", async () => {
        const rows = [makeRow(), makeRow({ id: "rec-2" })];
        setupFrom({
            ai_recommendations: () => makeThenableBuilder(rows),
        });
        const result = await dbListRecommendations();
        expect(result).toHaveLength(2);
    });
});

describe("dbListRecommendations — applies entity_type + status filters", () => {
    it("calls eq with correct filter values", async () => {
        const eqSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableBuilder([], eqSpy),
        });
        await dbListRecommendations({ entity_type: "product", status: "suggested" });
        expect(eqSpy).toHaveBeenCalledWith("entity_type", "product");
        expect(eqSpy).toHaveBeenCalledWith("status", "suggested");
    });
});

describe("dbListRecommendations — applies recommendation_type filter", () => {
    it("calls eq with recommendation_type", async () => {
        const eqSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableBuilder([], eqSpy),
        });
        await dbListRecommendations({ recommendation_type: "purchase_suggestion" });
        expect(eqSpy).toHaveBeenCalledWith("recommendation_type", "purchase_suggestion");
    });
});

describe("dbListRecommendations — returns empty array when data is null", () => {
    it("applies data ?? [] fallback", async () => {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.order = () => b;
        b.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve({ data: null, error: null }).then(resolve, reject);
        setupFrom({ ai_recommendations: () => b });
        const result = await dbListRecommendations();
        expect(result).toEqual([]);
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

// ─── Feedback content verification ────────────────────────────────────────────

describe("ai_feedback content — accepted transition inserts correct payload", () => {
    it("feedback_type=accepted, recommendation_id set, edited_values null", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const acceptedRow = makeRow({ status: "accepted" });
        let feedbackPayload: Record<string, unknown> | null = null;

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
                insert: async (data: Record<string, unknown>) => {
                    feedbackPayload = data;
                    return { data: null, error: null };
                },
            }),
        });

        await dbUpdateRecommendationStatus("rec-1", "accepted");
        expect(feedbackPayload).not.toBeNull();
        const fp = feedbackPayload as Record<string, unknown>;
        expect(fp.feedback_type).toBe("accepted");
        expect(fp.recommendation_id).toBe("rec-1");
        expect(fp.edited_values).toBeNull();
        expect(fp.feedback_note).toBeNull();
    });
});

describe("ai_feedback content — edited transition includes edited_values", () => {
    it("feedback_type=edited and edited_values match editedMetadata", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const editedRow = makeRow({ status: "edited", edited_metadata: { suggestQty: 40 } });
        let feedbackPayload: Record<string, unknown> | null = null;

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
            ai_feedback: () => ({
                insert: async (data: Record<string, unknown>) => {
                    feedbackPayload = data;
                    return { data: null, error: null };
                },
            }),
        });

        await dbUpdateRecommendationStatus("rec-1", "edited", { editedMetadata: { suggestQty: 40 } });
        expect(feedbackPayload).not.toBeNull();
        const fp = feedbackPayload as Record<string, unknown>;
        expect(fp.feedback_type).toBe("edited");
        expect(fp.edited_values).toEqual({ suggestQty: 40 });
    });
});

describe("ai_feedback content — rejected transition stores feedbackNote", () => {
    it("feedback_note matches the feedbackNote option", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const rejectedRow = makeRow({ status: "rejected" });
        let feedbackPayload: Record<string, unknown> | null = null;

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
            ai_feedback: () => ({
                insert: async (data: Record<string, unknown>) => {
                    feedbackPayload = data;
                    return { data: null, error: null };
                },
            }),
        });

        await dbUpdateRecommendationStatus("rec-1", "rejected", { feedbackNote: "Fiyat çok yüksek" });
        expect(feedbackPayload).not.toBeNull();
        const fp = feedbackPayload as Record<string, unknown>;
        expect(fp.feedback_type).toBe("rejected");
        expect(fp.feedback_note).toBe("Fiyat çok yüksek");
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

describe("PATCH /api/recommendations/[id] — 404 when recommendation not found", () => {
    it("returns 404 when row does not exist", async () => {
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: null, error: { message: "Row not found" } });
                b.update = () => { throw new Error("Should not update"); };
                b.not = () => b;
                b.order = () => b;
                return b;
            },
        });

        const { PATCH } = await import("@/app/api/recommendations/[id]/route");

        const req = new Request("http://localhost/api/recommendations/rec-999", {
            method: "PATCH",
            body: JSON.stringify({ status: "accepted" }),
            headers: { "Content-Type": "application/json" },
        });

        const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: Promise.resolve({ id: "rec-999" }) });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain("not found");
    });
});

describe("PATCH /api/recommendations/[id] — 409 on invalid transition", () => {
    it("returns 409 when transitioning from accepted to rejected", async () => {
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

        const { PATCH } = await import("@/app/api/recommendations/[id]/route");

        const req = new Request("http://localhost/api/recommendations/rec-1", {
            method: "PATCH",
            body: JSON.stringify({ status: "rejected" }),
            headers: { "Content-Type": "application/json" },
        });

        const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: Promise.resolve({ id: "rec-1" }) });
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain("Invalid status transition");
    });
});

describe("PATCH /api/recommendations/[id] — edited status with editedMetadata", () => {
    it("returns 200 with editedMetadata in response", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const editedRow = makeRow({ status: "edited", edited_metadata: { suggestQty: 40 } });

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

        const { PATCH } = await import("@/app/api/recommendations/[id]/route");

        const req = new Request("http://localhost/api/recommendations/rec-1", {
            method: "PATCH",
            body: JSON.stringify({ status: "edited", editedMetadata: { suggestQty: 40 } }),
            headers: { "Content-Type": "application/json" },
        });

        const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: Promise.resolve({ id: "rec-1" }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.recommendation.status).toBe("edited");
        expect(body.recommendation.editedMetadata).toEqual({ suggestQty: 40 });
    });
});

describe("PATCH /api/recommendations/[id] — feedbackNote passed to feedback insert", () => {
    it("feedback row receives the feedbackNote from request body", async () => {
        const suggestedRow = makeRow({ status: "suggested" });
        const rejectedRow = makeRow({ status: "rejected" });
        let feedbackPayload: Record<string, unknown> | null = null;

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
            ai_feedback: () => ({
                insert: async (data: Record<string, unknown>) => {
                    feedbackPayload = data;
                    return { data: null, error: null };
                },
            }),
        });

        const { PATCH } = await import("@/app/api/recommendations/[id]/route");

        const req = new Request("http://localhost/api/recommendations/rec-1", {
            method: "PATCH",
            body: JSON.stringify({ status: "rejected", feedbackNote: "Fiyat uygun değil" }),
            headers: { "Content-Type": "application/json" },
        });

        await PATCH(req as Parameters<typeof PATCH>[0], { params: Promise.resolve({ id: "rec-1" }) });
        expect(feedbackPayload).not.toBeNull();
        expect((feedbackPayload as Record<string, unknown>).feedback_note).toBe("Fiyat uygun değil");
    });
});

// ─── GET /api/recommendations ─────────────────────────────────────────────────

describe("GET /api/recommendations — returns 200 with mapped recommendations", () => {
    it("returns array with camelCase keys", async () => {
        const rows = [makeRow(), makeRow({ id: "rec-2" })];
        setupFrom({
            ai_recommendations: () => makeThenableBuilder(rows),
        });

        const { GET } = await import("@/app/api/recommendations/route");
        const req = new NextRequest("http://localhost/api/recommendations");
        const res = await GET(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.recommendations).toHaveLength(2);
        expect(body.recommendations[0].entityType).toBe("product");
        expect(body.recommendations[0].id).toBe("rec-1");
    });
});

describe("GET /api/recommendations — passes query params as filters", () => {
    it("applies entity_type and status from search params", async () => {
        const eqSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableBuilder([], eqSpy),
        });

        const { GET } = await import("@/app/api/recommendations/route");
        const req = new NextRequest("http://localhost/api/recommendations?entity_type=product&status=suggested");
        await GET(req);
        expect(eqSpy).toHaveBeenCalledWith("entity_type", "product");
        expect(eqSpy).toHaveBeenCalledWith("status", "suggested");
    });
});

describe("GET /api/recommendations — returns empty array when no rows", () => {
    it("recommendations is []", async () => {
        setupFrom({
            ai_recommendations: () => makeThenableBuilder([]),
        });

        const { GET } = await import("@/app/api/recommendations/route");
        const req = new NextRequest("http://localhost/api/recommendations");
        const res = await GET(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.recommendations).toEqual([]);
    });
});

describe("GET /api/recommendations — returns 500 on DB error", () => {
    it("returns 500 when dbListRecommendations throws", async () => {
        const errorBuilder: Record<string, unknown> = {};
        errorBuilder.select = () => errorBuilder;
        errorBuilder.eq = () => errorBuilder;
        errorBuilder.order = () => errorBuilder;
        // Supabase returns { data, error } — we resolve with an error field to simulate DB failure
        errorBuilder.then = (resolve: (v: unknown) => void, _reject?: (e: unknown) => void) => {
            resolve({ data: null, error: { message: "DB connection failed" } });
        };
        setupFrom({ ai_recommendations: () => errorBuilder });

        const { GET } = await import("@/app/api/recommendations/route");
        const req = new NextRequest("http://localhost/api/recommendations");
        const res = await GET(req);
        expect(res.status).toBe(500);
    });
});
