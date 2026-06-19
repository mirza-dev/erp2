/**
 * Öneriler sayfası — validation parity + RBAC hardening
 *
 * Kapsam (ürünler PATCH/POST parity hamlesinin öneriler karşılığı):
 *   PATCH /api/recommendations/[id]:
 *     - 10k+ feedbackNote → 400, dbUpdateRecommendationStatus ÇAĞRILMAZ
 *     - normal kısa feedbackNote → geçer (status mantığına devam)
 *   POST /api/purchase-orders/from-recommendations:
 *     - 10k+ notes → 400, serviceCreatePOFromRecommendations ÇAĞRILMAZ
 *     - nested lines[].notes 10k+ → 400 (validateStringLengths recursive)
 *     - normal kısa body → 201
 *
 * validateStringLengths GERÇEK çalışır (mock'lanmaz — standalone modül).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockRequirePermission = vi.fn();
const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
    // O1: actor sunucu-otoriter — route getCurrentUserId() ile oturum kullanıcısını alır.
    getCurrentUserId: vi.fn().mockResolvedValue("session-user-id"),
}));

const mockDbGetRec = vi.fn();
const mockDbUpdateRecStatus = vi.fn();
vi.mock("@/lib/supabase/recommendations", () => ({
    dbGetRecommendationById: (...a: unknown[]) => mockDbGetRec(...a),
    dbUpdateRecommendationStatus: (...a: unknown[]) => mockDbUpdateRecStatus(...a),
}));

vi.mock("@/lib/api-mappers", () => ({
    mapRecommendation: (r: unknown) => r,
}));

const mockServiceCreatePO = vi.fn();
vi.mock("@/lib/services/purchase-order-service", async () => {
    const actual = await vi.importActual("@/lib/services/purchase-order-service") as Record<string, unknown>;
    return { ...actual, serviceCreatePOFromRecommendations: (...a: unknown[]) => mockServiceCreatePO(...a) };
});

vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (_fn: () => unknown) => _fn,
}));
vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

// ── Imports (mock sonrası) ────────────────────────────────────

import { PATCH as recPatch } from "@/app/api/recommendations/[id]/route";
import { POST as poFromRecsPost } from "@/app/api/purchase-orders/from-recommendations/route";

const REC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function patchReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/recommendations/" + REC_ID, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}
const patchCtx = { params: Promise.resolve({ id: REC_ID }) };

function poReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/purchase-orders/from-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

const LONG = "a".repeat(10_001);

beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(null); // yetkili
    mockRequireRole.mockResolvedValue(null);       // yetkili
    mockDbUpdateRecStatus.mockResolvedValue({ id: REC_ID, status: "accepted" });
    mockServiceCreatePO.mockResolvedValue({ id: "po-1", po_number: "PO-2026-0001" });
});

// ── PATCH /api/recommendations/[id] ───────────────────────────

describe("PATCH /api/recommendations/[id] — feedbackNote validation parity", () => {
    it("10k+ feedbackNote → 400, dbUpdateRecommendationStatus çağrılmaz", async () => {
        const res = await recPatch(patchReq({ status: "rejected", feedbackNote: LONG }), patchCtx);
        expect(res.status).toBe(400);
        expect(mockDbUpdateRecStatus).not.toHaveBeenCalled();
    });

    it("normal kısa feedbackNote → status mantığına devam (200)", async () => {
        const res = await recPatch(patchReq({ status: "rejected", feedbackNote: "Fiyat yüksek" }), patchCtx);
        expect(res.status).toBe(200);
        expect(mockDbUpdateRecStatus).toHaveBeenCalledTimes(1);
    });

    // Not: validateStringLengths yalnız top-level + array-of-objects'e recurse eder
    // (plain nested object'e DEĞİL — projenin paylaşılan helper davranışı, ürünler
    // fix'iyle aynı). PO lines[].notes (array) kapsanır; aşağıda doğrulanır.
});

// ── POST /api/purchase-orders/from-recommendations ────────────

describe("POST /api/purchase-orders/from-recommendations — notes validation parity", () => {
    const validBody = {
        vendor_id: VID,
        currency: "TRY",
        lines: [{ recommendation_id: REC_ID, quantity: 10, unit_price: 50 }],
    };

    it("10k+ header notes → 400, servis çağrılmaz", async () => {
        const res = await poFromRecsPost(poReq({ ...validBody, notes: LONG }));
        expect(res.status).toBe(400);
        expect(mockServiceCreatePO).not.toHaveBeenCalled();
    });

    it("nested lines[].notes 10k+ → 400 (recursive lock)", async () => {
        const res = await poFromRecsPost(
            poReq({ ...validBody, lines: [{ ...validBody.lines[0], notes: LONG }] }),
        );
        expect(res.status).toBe(400);
        expect(mockServiceCreatePO).not.toHaveBeenCalled();
    });

    it("normal kısa body → 201 + servis çağrılır", async () => {
        const res = await poFromRecsPost(poReq({ ...validBody, notes: "Acil sipariş" }));
        expect(res.status).toBe(201);
        expect(mockServiceCreatePO).toHaveBeenCalledTimes(1);
    });
});

