/**
 * Tests for AI Recommendation lifecycle + query layer.
 * Supabase client is fully mocked — no real DB calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Supabase service mock ─────────────────────────────────────────────────────

const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockNot = vi.fn();

// Builder that returns itself for chaining
function makeBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.lt = () => b;
    b.not = mockNot.mockReturnValue(b);
    b.order = () => b;
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
    dbExpireRecommendationsForMissingEntities,
    dbExpireStaleRecommendations,
    dbGetActiveRecommendationsForEntities,
    dbUpdateSuggestedRecommendation,
    dbUpdateRecommendationMetadata,
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
function makeThenableBuilder(
    rows: unknown[],
    eqSpy?: ReturnType<typeof vi.fn>,
    inSpy?: ReturnType<typeof vi.fn>,
) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = eqSpy
        ? (...args: unknown[]) => { (eqSpy as (...args: unknown[]) => unknown)(...args); return b; }
        : () => b;
    b.in = inSpy
        ? (...args: unknown[]) => { (inSpy as (...args: unknown[]) => unknown)(...args); return b; }
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
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.maybeSingle = async () => ({ data: null, error: null }); // no existing
                b.insert = () => {
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

// Behavior changed (idempotent): existing suggested rows are returned unchanged,
// not overwritten. Callers must use dbGetActiveRecommendationsForEntities to
// check first and skip the upsert call entirely for stable recommendations.
describe("dbUpsertRecommendation — idempotent for existing suggested row", () => {
    it("returns existing row unchanged when suggested row exists (no overwrite)", async () => {
        const existingRow = makeRow({ body: "old body", confidence: 0.7 });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.maybeSingle = async () => ({ data: existingRow, error: null });
                b.update = () => { throw new Error("Should not update when existing row found"); };
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
            body: "new body",    // ignored — existing row is returned as-is
            confidence: 0.9,     // ignored — existing row is returned as-is
        });
        // Returns the EXISTING row, not the new values
        expect(result.body).toBe("old body");
        expect(result.confidence).toBe(0.7);
        expect(result.id).toBe(existingRow.id);
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
                b.insert = () => {
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

// ─── Audit 7. tur Fix 3 — statusIn filter ─────────────────────────────────

describe("dbListRecommendations — statusIn filter", () => {
    it("statusIn dizisi geçildiğinde .in('status', [...]) çağrılır", async () => {
        const inSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableBuilder([], undefined, inSpy),
        });
        await dbListRecommendations({ statusIn: ["accepted", "edited", "rejected"] });
        expect(inSpy).toHaveBeenCalledWith("status", ["accepted", "edited", "rejected"]);
    });

    it("statusIn boş dizi → .in çağrılmaz, .eq da çağrılmaz", async () => {
        const eqSpy = vi.fn();
        const inSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableBuilder([], eqSpy, inSpy),
        });
        await dbListRecommendations({ statusIn: [] });
        const statusEqCalls = eqSpy.mock.calls.filter(([col]) => col === "status");
        expect(statusEqCalls).toHaveLength(0);
        expect(inSpy).not.toHaveBeenCalled();
    });

    it("statusIn varsa status field'ı yoksayılır (statusIn öncelikli)", async () => {
        const eqSpy = vi.fn();
        const inSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableBuilder([], eqSpy, inSpy),
        });
        await dbListRecommendations({
            status: "suggested", // bu yoksayılmalı
            statusIn: ["accepted", "edited"],
        });
        // .in çağrıldı
        expect(inSpy).toHaveBeenCalledWith("status", ["accepted", "edited"]);
        // .eq("status", "suggested") çağrılmadı
        const statusEqCalls = eqSpy.mock.calls.filter(([col]) => col === "status");
        expect(statusEqCalls).toHaveLength(0);
    });

    it("status verildi statusIn yok → eski davranış: .eq('status', ...)", async () => {
        const eqSpy = vi.fn();
        const inSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableBuilder([], eqSpy, inSpy),
        });
        await dbListRecommendations({ status: "suggested" });
        expect(eqSpy).toHaveBeenCalledWith("status", "suggested");
        expect(inSpy).not.toHaveBeenCalled();
    });
});

// ─── Audit 9-10. tur — decidedAfter filter (SQL .or) ───────────────────────

describe("dbListRecommendations — decidedAfter filter", () => {
    function makeThenableWithOr(rows: unknown[], orSpy: ReturnType<typeof vi.fn>) {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.in = () => b;
        b.or = (...args: unknown[]) => { orSpy(...args); return b; };
        b.order = () => b;
        b.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        return b;
    }

    it("decidedAfter geçildiğinde .or('decided_at.gte.X,decided_at.is.null') çağrılır", async () => {
        // Audit 10. tur Fix 1: NULL legacy kayıtları kapsayan .or filter
        const orSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableWithOr([], orSpy),
        });
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await dbListRecommendations({ decidedAfter: cutoff });
        expect(orSpy).toHaveBeenCalledWith(`decided_at.gte.${cutoff},decided_at.is.null`);
    });

    it("decidedAfter geçilmediyse .or çağrılmaz (regresyon)", async () => {
        const orSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => makeThenableWithOr([], orSpy),
        });
        await dbListRecommendations({ entity_type: "product" });
        expect(orSpy).not.toHaveBeenCalled();
    });

    it("decidedAfter + statusIn birlikte: hem .or hem .in çağrılır", async () => {
        const orSpy = vi.fn();
        const inSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.in = (...args: unknown[]) => { inSpy(...args); return b; };
                b.or = (...args: unknown[]) => { orSpy(...args); return b; };
                b.order = () => b;
                b.then = (resolve: (v: unknown) => void) =>
                    Promise.resolve({ data: [], error: null }).then(resolve);
                return b;
            },
        });
        const cutoff = "2026-01-01T00:00:00.000Z";
        await dbListRecommendations({
            statusIn: ["accepted", "edited", "rejected"],
            decidedAfter: cutoff,
        });
        expect(orSpy).toHaveBeenCalledWith(`decided_at.gte.${cutoff},decided_at.is.null`);
        expect(inSpy).toHaveBeenCalledWith("status", ["accepted", "edited", "rejected"]);
    });

    // Audit 10. tur Fix 1: regresyon — eski .gte kullanılmamalı
    it("decidedAfter geçildiğinde eski .gte('decided_at',...) çağrılmaz (yeni .or yolu)", async () => {
        const gteSpy = vi.fn();
        const orSpy = vi.fn();
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.in = () => b;
                b.gte = (...args: unknown[]) => { gteSpy(...args); return b; };
                b.or = (...args: unknown[]) => { orSpy(...args); return b; };
                b.order = () => b;
                b.then = (resolve: (v: unknown) => void) =>
                    Promise.resolve({ data: [], error: null }).then(resolve);
                return b;
            },
        });
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await dbListRecommendations({ decidedAfter: cutoff });
        // Yeni davranış: .or kullanılır (NULL kayıtları da kapsar), .gte çağrılmaz
        expect(orSpy).toHaveBeenCalled();
        const gteOnDecidedAt = gteSpy.mock.calls.filter(([col]) => col === "decided_at");
        expect(gteOnDecidedAt).toHaveLength(0);
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
                b.update = () => {
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
                b.update = () => ({
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
                b.update = () => ({
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

// Sprint C G1: silinmiş entity için tüm aktif rec statüleri expire edilir
describe("dbExpireRecommendationsForMissingEntities — all active statuses (Sprint C G1)", () => {
    it("status filter olarak suggested+accepted+edited+rejected geçer", async () => {
        let inStatusArg: unknown = null;
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.update = () => ({
                    eq: () => ({
                        eq: () => ({
                            in: (col: string, vals: unknown) => {
                                if (col === "status") inStatusArg = vals;
                                return {
                                    not: () => ({
                                        select: async () => ({ data: [{ id: "r1" }, { id: "r2" }], error: null }),
                                    }),
                                };
                            },
                        }),
                    }),
                });
                return b;
            },
        });

        const count = await dbExpireRecommendationsForMissingEntities("product", ["p-1"], "purchase_suggestion");
        expect(count).toBe(2);
        expect(inStatusArg).toEqual(["suggested", "accepted", "edited", "rejected"]);
    });

    it("validEntityIds boş → no-op (DB call yok, veri kaybı koruması)", async () => {
        const count = await dbExpireRecommendationsForMissingEntities("product", [], "purchase_suggestion");
        expect(count).toBe(0);
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it("update payload status=expired ve expired_at set ediliyor", async () => {
        let updatePayload: Record<string, unknown> | null = null;
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.update = (data: Record<string, unknown>) => {
                    updatePayload = data;
                    return {
                        eq: () => ({
                            eq: () => ({
                                in: () => ({
                                    not: () => ({
                                        select: async () => ({ data: [], error: null }),
                                    }),
                                }),
                            }),
                        }),
                    };
                };
                return b;
            },
        });

        await dbExpireRecommendationsForMissingEntities("product", ["p-1", "p-2"], "purchase_suggestion");
        expect(updatePayload).not.toBeNull();
        expect((updatePayload as unknown as Record<string, unknown>).status).toBe("expired");
        expect((updatePayload as unknown as Record<string, unknown>).expired_at).toBeDefined();
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
                b.update = () => ({
                    eq: () => ({
                        select: () => ({ single: async () => ({ data: acceptedRow, error: null }) }),
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
                b.update = () => ({
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
                b.update = () => ({
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
        const fp = feedbackPayload as unknown as Record<string, unknown>;
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
                b.update = () => ({
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
        const fp = feedbackPayload as unknown as Record<string, unknown>;
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
                b.update = () => ({
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
        const fp = feedbackPayload as unknown as Record<string, unknown>;
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
                b.update = () => ({
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
                b.update = () => ({
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
                b.update = () => ({
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
        expect((feedbackPayload as unknown as Record<string, unknown>).feedback_note).toBe("Fiyat uygun değil");
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
        errorBuilder.then = (resolve: (v: unknown) => void) => {
            resolve({ data: null, error: { message: "DB connection failed" } });
        };
        setupFrom({ ai_recommendations: () => errorBuilder });

        const { GET } = await import("@/app/api/recommendations/route");
        const req = new NextRequest("http://localhost/api/recommendations");
        const res = await GET(req);
        expect(res.status).toBe(500);
    });
});

// ─── GET /api/recommendations/[id] ──────────────────────────────────────────

describe("GET /api/recommendations/[id] — returns recommendation by id", () => {
    it("returns 200 with mapped recommendation", async () => {
        const row = makeRow({ decided_at: "2026-01-02T10:00:00Z" });
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: row, error: null });
                return b;
            },
        });

        const { GET } = await import("@/app/api/recommendations/[id]/route");
        const req = new Request("http://localhost/api/recommendations/rec-1", { method: "GET" });
        const res = await GET(req as Parameters<typeof GET>[0], { params: Promise.resolve({ id: "rec-1" }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.recommendation.id).toBe("rec-1");
        expect(body.recommendation.decidedAt).toBe("2026-01-02T10:00:00Z");
    });

    it("returns 404 when not found", async () => {
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.single = async () => ({ data: null, error: { message: "Row not found" } });
                return b;
            },
        });

        const { GET } = await import("@/app/api/recommendations/[id]/route");
        const req = new Request("http://localhost/api/recommendations/rec-999", { method: "GET" });
        const res = await GET(req as Parameters<typeof GET>[0], { params: Promise.resolve({ id: "rec-999" }) });
        expect(res.status).toBe(404);
    });
});

// ─── dbExpireStaleRecommendations ─────────────────────────────────────────────

describe("dbExpireStaleRecommendations — marks old suggested rows as expired", () => {
    it("calls update with status=expired and returns count", async () => {
        let updatePayload: Record<string, unknown> | null = null;

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.update = (data: Record<string, unknown>) => {
                    updatePayload = data;
                    return {
                        eq: () => ({
                            lt: () => ({
                                select: async () => ({ data: [{ id: "rec-old" }, { id: "rec-old-2" }], error: null }),
                            }),
                        }),
                    };
                };
                return b;
            },
        });

        const count = await dbExpireStaleRecommendations(48);
        expect(count).toBe(2);
        expect(updatePayload).not.toBeNull();
        expect((updatePayload as Record<string, unknown>).status).toBe("expired");
        expect((updatePayload as Record<string, unknown>).expired_at).toBeDefined();
    });

    it("returns 0 and still calls DB when no stale rows found", async () => {
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.update = () => ({
                    eq: () => ({
                        lt: () => ({
                            select: async () => ({ data: [], error: null }),
                        }),
                    }),
                });
                return b;
            },
        });

        const count = await dbExpireStaleRecommendations(48);
        expect(count).toBe(0);
    });

    // Audit 3. tur Fix 4: recommendation_type opsiyonel filter
    it("recommendationType belirtildi → ek .eq('recommendation_type', ...) zinciri", async () => {
        const eqCalls: Array<[string, unknown]> = [];
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.update = () => ({
                    eq: (col: string, val: unknown) => {
                        eqCalls.push([col, val]);
                        return {
                            lt: () => ({
                                eq: (col2: string, val2: unknown) => {
                                    eqCalls.push([col2, val2]);
                                    return {
                                        select: async () => ({ data: [{ id: "r1" }], error: null }),
                                    };
                                },
                            }),
                        };
                    },
                });
                return b;
            },
        });

        const count = await dbExpireStaleRecommendations(48, "purchase_suggestion");
        expect(count).toBe(1);
        expect(eqCalls).toContainEqual(["status", "suggested"]);
        expect(eqCalls).toContainEqual(["recommendation_type", "purchase_suggestion"]);
    });

    it("recommendationType belirtilmedi → recommendation_type filter eklenmiyor (regresyon)", async () => {
        const eqCalls: Array<[string, unknown]> = [];
        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.update = () => ({
                    eq: (col: string, val: unknown) => {
                        eqCalls.push([col, val]);
                        return {
                            lt: () => ({
                                select: async () => ({ data: [], error: null }),
                            }),
                        };
                    },
                });
                return b;
            },
        });

        await dbExpireStaleRecommendations(48);
        const types = eqCalls.filter(([c]) => c === "recommendation_type");
        expect(types).toHaveLength(0);
    });
});

// ─── dbGetActiveRecommendationsForEntities — 7-day decided window ─────────────

describe("dbGetActiveRecommendationsForEntities — accepted within 7 days is active", () => {
    it("includes accepted row decided 1 day ago", async () => {
        const recentDecidedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const row = makeRow({ status: "accepted", decided_at: recentDecidedAt });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.in = () => b;
                b.order = () => b;
                b.then = (resolve: (v: unknown) => void) =>
                    Promise.resolve({ data: [row], error: null }).then(resolve);
                return b;
            },
        });

        const result = await dbGetActiveRecommendationsForEntities("product", ["prod-1"], "purchase_suggestion");
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe("accepted");
    });
});

describe("dbGetActiveRecommendationsForEntities — accepted older than 7 days is stale", () => {
    it("excludes accepted row decided 8 days ago", async () => {
        const oldDecidedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
        const row = makeRow({ status: "accepted", decided_at: oldDecidedAt });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.in = () => b;
                b.order = () => b;
                b.then = (resolve: (v: unknown) => void) =>
                    Promise.resolve({ data: [row], error: null }).then(resolve);
                return b;
            },
        });

        const result = await dbGetActiveRecommendationsForEntities("product", ["prod-1"], "purchase_suggestion");
        expect(result).toHaveLength(0);
    });
});

// ─── dbUpdateSuggestedRecommendation ─────────────────────────────────────────
// Audit 3. tur Fix 5: levelChanged akışında expire+upsert dansı yerine in-place
// UPDATE. Bu helper sadece status='suggested' olan rec'leri günceller.

describe("dbUpdateSuggestedRecommendation — atomic content update", () => {
    it("body + confidence + severity + metadata atomik UPDATE'le yazılır", async () => {
        let updatePayload: Record<string, unknown> | null = null;
        let eqStatus: string | null = null;
        const existingRow = makeRow({
            id: "rec-1", status: "suggested",
            metadata: { existingKey: "preserved", suggestQty: 50 },
        });

        // İlk çağrı: dbGetRecommendationById (metadata merge için)
        // İkinci çağrı: update().eq("id").eq("status","suggested").select().single()
        let callCount = 0;
        setupFrom({
            ai_recommendations: () => {
                callCount++;
                if (callCount === 1) {
                    const b: Record<string, unknown> = {};
                    b.select = () => b;
                    b.eq = () => b;
                    b.single = async () => ({ data: existingRow, error: null });
                    return b;
                }
                const b: Record<string, unknown> = {};
                b.update = (data: Record<string, unknown>) => {
                    updatePayload = data;
                    return {
                        eq: () => ({
                            eq: (col2: string, val2: unknown) => {
                                if (col2 === "status") eqStatus = String(val2);
                                return {
                                    select: () => ({
                                        single: async () => ({ data: { ...existingRow, ...data }, error: null }),
                                    }),
                                };
                            },
                        }),
                    };
                };
                return b;
            },
        });

        const updated = await dbUpdateSuggestedRecommendation("rec-1", {
            body: "Yeni AI metni",
            confidence: 0.9,
            severity: "critical",
            metadata: { suggestQty: 80, urgencyLevel: "critical" },
        });

        expect(updated.id).toBe("rec-1");
        expect(eqStatus).toBe("suggested"); // sadece suggested rec'ler güncellenir
        expect(updatePayload).not.toBeNull();
        const payload = updatePayload as Record<string, unknown>;
        expect(payload.body).toBe("Yeni AI metni");
        expect(payload.confidence).toBe(0.9);
        expect(payload.severity).toBe("critical");
        // Metadata JS-merge: existingKey korunur, suggestQty overwrite
        const meta = payload.metadata as Record<string, unknown>;
        expect(meta.existingKey).toBe("preserved");
        expect(meta.suggestQty).toBe(80);
        expect(meta.urgencyLevel).toBe("critical");
    });

    it("suggested rec yoksa (decided veya silinmiş) error throw eder", async () => {
        let callCount = 0;
        setupFrom({
            ai_recommendations: () => {
                callCount++;
                if (callCount === 1) {
                    const b: Record<string, unknown> = {};
                    b.select = () => b;
                    b.eq = () => b;
                    b.single = async () => ({ data: null, error: null });
                    return b;
                }
                const b: Record<string, unknown> = {};
                b.update = () => ({
                    eq: () => ({
                        eq: () => ({
                            select: () => ({
                                single: async () => ({ data: null, error: { message: "no row" } }),
                            }),
                        }),
                    }),
                });
                return b;
            },
        });

        await expect(
            dbUpdateSuggestedRecommendation("rec-missing", { body: "x" })
        ).rejects.toThrow();
    });
});

// ─── dbUpdateRecommendationMetadata ──────────────────────────────────────────
// Audit 12. tur: UPDATE'te status="suggested" guard'ı zorunlu — yarış senaryosunda
// (CRON metadata patch'i hesaplarken kullanıcı kabul/red ederse) decided rec'in
// frozen metadata'sının yenilenmesi engellenir.

describe("dbUpdateRecommendationMetadata — status=suggested guard (race condition)", () => {
    it("status=suggested rec için UPDATE çalışır + .eq('status','suggested') filtre uygulanır", async () => {
        const eqCalls: Array<[string, unknown]> = [];
        let updatePayload: Record<string, unknown> | null = null;
        const existingRow = makeRow({
            id: "rec-1", status: "suggested",
            metadata: { aiWhyNow: "preserved", suggestQty: 50 },
        });

        let callCount = 0;
        setupFrom({
            ai_recommendations: () => {
                callCount++;
                if (callCount === 1) {
                    // dbGetRecommendationById
                    const b: Record<string, unknown> = {};
                    b.select = () => b;
                    b.eq = () => b;
                    b.single = async () => ({ data: existingRow, error: null });
                    return b;
                }
                // UPDATE
                const b: Record<string, unknown> = {};
                b.update = (data: Record<string, unknown>) => {
                    updatePayload = data;
                    const chain: Record<string, unknown> = {};
                    chain.eq = (col: string, val: unknown) => {
                        eqCalls.push([col, val]);
                        return chain;
                    };
                    chain.then = (resolve: (v: unknown) => void) =>
                        Promise.resolve({ data: null, error: null }).then(resolve);
                    return chain;
                };
                return b;
            },
        });

        await dbUpdateRecommendationMetadata("rec-1", {
            suggestQty: 80,
            urgencyLevel: "critical",
        });

        expect(updatePayload).not.toBeNull();
        expect(eqCalls).toEqual([
            ["id", "rec-1"],
            ["status", "suggested"],
        ]);
        // Metadata JS-merge: aiWhyNow korunur, suggestQty overwrite
        const meta = (updatePayload as Record<string, unknown>).metadata as Record<string, unknown>;
        expect(meta.aiWhyNow).toBe("preserved");
        expect(meta.suggestQty).toBe(80);
        expect(meta.urgencyLevel).toBe("critical");
    });

    it("status=accepted rec için erken return (UPDATE hiç çağrılmaz)", async () => {
        // Yarış senaryosu: rec CRON başlangıcında suggested'tı, GET sırasında
        // kullanıcı kabul etti → mevcut row accepted dönüyor → UPDATE atılmamalı,
        // decided rec'in frozen metadata'sı korunur.
        let updateCalled = false;
        const acceptedRow = makeRow({
            id: "rec-1", status: "accepted",
            metadata: { suggestQty: 50, aiWhyNow: "frozen" },
            decided_at: "2026-05-10T10:00:00Z",
        });

        let callCount = 0;
        setupFrom({
            ai_recommendations: () => {
                callCount++;
                if (callCount === 1) {
                    const b: Record<string, unknown> = {};
                    b.select = () => b;
                    b.eq = () => b;
                    b.single = async () => ({ data: acceptedRow, error: null });
                    return b;
                }
                const b: Record<string, unknown> = {};
                b.update = () => {
                    updateCalled = true;
                    return {
                        eq: () => ({
                            eq: () => Promise.resolve({ data: null, error: null }),
                        }),
                    };
                };
                return b;
            },
        });

        await dbUpdateRecommendationMetadata("rec-1", { suggestQty: 80 });

        expect(updateCalled).toBe(false);
    });

    it("status=rejected rec için erken return (UPDATE hiç çağrılmaz)", async () => {
        let updateCalled = false;
        const rejectedRow = makeRow({
            id: "rec-1", status: "rejected",
            metadata: { suggestQty: 50 },
        });

        let callCount = 0;
        setupFrom({
            ai_recommendations: () => {
                callCount++;
                if (callCount === 1) {
                    const b: Record<string, unknown> = {};
                    b.select = () => b;
                    b.eq = () => b;
                    b.single = async () => ({ data: rejectedRow, error: null });
                    return b;
                }
                const b: Record<string, unknown> = {};
                b.update = () => {
                    updateCalled = true;
                    return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
                };
                return b;
            },
        });

        await dbUpdateRecommendationMetadata("rec-1", { suggestQty: 80 });
        expect(updateCalled).toBe(false);
    });

    it("rec hiç bulunamazsa (null) UPDATE çağrılmaz", async () => {
        let updateCalled = false;
        let callCount = 0;
        setupFrom({
            ai_recommendations: () => {
                callCount++;
                if (callCount === 1) {
                    const b: Record<string, unknown> = {};
                    b.select = () => b;
                    b.eq = () => b;
                    b.single = async () => ({ data: null, error: null });
                    return b;
                }
                const b: Record<string, unknown> = {};
                b.update = () => {
                    updateCalled = true;
                    return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
                };
                return b;
            },
        });

        await dbUpdateRecommendationMetadata("rec-missing", { suggestQty: 80 });
        expect(updateCalled).toBe(false);
    });
});

describe("dbGetActiveRecommendationsForEntities — suggested row is always active regardless of age", () => {
    it("includes suggested row created 10 days ago", async () => {
        const oldCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        const row = makeRow({ status: "suggested", created_at: oldCreatedAt, decided_at: null });

        setupFrom({
            ai_recommendations: () => {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.in = () => b;
                b.order = () => b;
                b.then = (resolve: (v: unknown) => void) =>
                    Promise.resolve({ data: [row], error: null }).then(resolve);
                return b;
            },
        });

        const result = await dbGetActiveRecommendationsForEntities("product", ["prod-1"], "purchase_suggestion");
        // suggested is always "active" (TTL expiry is handled by dbExpireStaleRecommendations,
        // which runs at route start before this query)
        expect(result).toHaveLength(1);
    });
});
