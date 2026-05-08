/**
 * Sprint C bulgular 2. tur — "Kararı geri al" akışı: Fix 2 backend doğrulaması.
 *
 * PATCH /api/recommendations/[id] route'unun tüm durum geçişlerini test eder:
 * suggested → decided, decided → suggested ("Kararı geri al"), geçersiz geçiş → 409.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockDbGetRecommendationById = vi.fn();
const mockDbUpdateRecommendationStatus = vi.fn();

vi.mock("@/lib/supabase/recommendations", () => ({
    dbGetRecommendationById: (...a: unknown[]) => mockDbGetRecommendationById(...a),
    dbUpdateRecommendationStatus: (...a: unknown[]) => mockDbUpdateRecommendationStatus(...a),
    dbExpireSuggestedRecommendations: vi.fn(),
    dbExpireAllSuggestedRecommendations: vi.fn(),
    dbExpireStaleRecommendations: vi.fn(),
    dbExpireRecommendationsForMissingEntities: vi.fn(),
    dbGetActiveRecommendationsForEntities: vi.fn(),
    dbExpireEntityRecommendations: vi.fn(),
}));

vi.mock("@/lib/api-mappers", () => ({
    mapRecommendation: (r: unknown) => r,
}));

import { PATCH } from "@/app/api/recommendations/[id]/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRec(status = "suggested") {
    return {
        id: "rec-1", entity_type: "product", entity_id: "prod-1",
        recommendation_type: "purchase_suggestion",
        title: "Test öneri", status,
        decided_at: status === "suggested" ? null : "2026-05-01T10:00:00Z",
        created_at: "2026-05-01T00:00:00Z",
    };
}

function makeReq(body: unknown, id = "rec-1") {
    return new NextRequest(`http://localhost/api/recommendations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

const PARAMS = (id = "rec-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdateRecommendationStatus.mockResolvedValue(makeRec("accepted"));
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PATCH /api/recommendations/[id] — Fix 2: Kararı geri al + tüm geçişler", () => {
    it("suggested → accepted → 200", async () => {
        mockDbUpdateRecommendationStatus.mockResolvedValue(makeRec("accepted"));
        const res = await PATCH(makeReq({ status: "accepted" }), PARAMS());
        expect(res.status).toBe(200);
        expect(mockDbUpdateRecommendationStatus).toHaveBeenCalledWith(
            "rec-1", "accepted", expect.any(Object)
        );
    });

    it("suggested → rejected → 200", async () => {
        mockDbUpdateRecommendationStatus.mockResolvedValue(makeRec("rejected"));
        const res = await PATCH(makeReq({ status: "rejected" }), PARAMS());
        expect(res.status).toBe(200);
    });

    it("accepted → suggested ('Kararı geri al') → 200", async () => {
        // dbUpdateRecommendationStatus handles transition check internally;
        // for this route-level test, we mock it to return the undone state
        mockDbUpdateRecommendationStatus.mockResolvedValue(makeRec("suggested"));
        const res = await PATCH(makeReq({ status: "suggested" }), PARAMS());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.recommendation.status).toBe("suggested");
        expect(mockDbUpdateRecommendationStatus).toHaveBeenCalledWith(
            "rec-1", "suggested", expect.any(Object)
        );
    });

    it("rejected → suggested ('Kararı geri al') → 200", async () => {
        mockDbUpdateRecommendationStatus.mockResolvedValue(makeRec("suggested"));
        const res = await PATCH(makeReq({ status: "suggested" }), PARAMS());
        expect(res.status).toBe(200);
    });

    it("geçersiz geçiş (accepted → rejected) → 409", async () => {
        mockDbUpdateRecommendationStatus.mockRejectedValue(
            new Error("Invalid status transition: accepted → rejected")
        );
        const res = await PATCH(makeReq({ status: "rejected" }), PARAMS());
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain("Invalid status transition");
    });

    it("izin verilmeyen status ('expired') → 400", async () => {
        const res = await PATCH(makeReq({ status: "expired" }), PARAMS());
        expect(res.status).toBe(400);
        expect(mockDbUpdateRecommendationStatus).not.toHaveBeenCalled();
    });

    it("status eksik → 400", async () => {
        const res = await PATCH(makeReq({ feedbackNote: "not" }), PARAMS());
        expect(res.status).toBe(400);
    });

    it("edited status'ta suggestQty zorunlu — eksikse 400", async () => {
        const res = await PATCH(makeReq({ status: "edited" }), PARAMS());
        expect(res.status).toBe(400);
        expect(mockDbUpdateRecommendationStatus).not.toHaveBeenCalled();
    });

    it("edited status'ta geçerli suggestQty → 200", async () => {
        mockDbUpdateRecommendationStatus.mockResolvedValue(makeRec("edited"));
        const res = await PATCH(
            makeReq({ status: "edited", editedMetadata: { suggestQty: 50 } }),
            PARAMS()
        );
        expect(res.status).toBe(200);
    });
});
