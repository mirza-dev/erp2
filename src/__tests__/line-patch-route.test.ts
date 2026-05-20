/**
 * Faz 3b — PATCH /api/import/document-lines/[id] tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockGetLine = vi.fn();
const mockUpdateLine = vi.fn();
const mockGetProductById = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

vi.mock("@/lib/supabase/import-document-lines", async () => {
    const actual = await vi.importActual<typeof import("@/lib/supabase/import-document-lines")>("@/lib/supabase/import-document-lines");
    return {
        ...actual,
        dbGetLine: (...a: unknown[]) => mockGetLine(...a),
        dbUpdateLineMatch: (...a: unknown[]) => mockUpdateLine(...a),
    };
});

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: (...a: unknown[]) => mockGetProductById(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    }),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { NextRequest } from "next/server";

beforeEach(() => {
    mockRequireRole.mockReset();
    mockGetLine.mockReset();
    mockUpdateLine.mockReset();
    mockGetProductById.mockReset();
});

// Valid UUID for happy paths
const PID = "00000000-0000-4000-8000-000000000001";

function makeReq(id: string, body: Record<string, unknown>): NextRequest {
    return new NextRequest(new URL(`http://localhost/api/import/document-lines/${id}`), {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

async function callPATCH(id: string, body: Record<string, unknown>) {
    const { PATCH } = await import("@/app/api/import/document-lines/[id]/route");
    return PATCH(makeReq(id, body), { params: Promise.resolve({ id }) });
}

describe("PATCH /api/import/document-lines/[id]", () => {
    it("403 for viewer (requireRole)", async () => {
        mockRequireRole.mockResolvedValueOnce(new Response(null, { status: 403 }));
        const res = await callPATCH("l-1", { match_action: "matched", matched_product_id: "p-1" });
        expect(res.status).toBe(403);
    });

    it("404 when line not found", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce(null);
        const res = await callPATCH("l-x", { match_action: "skipped" });
        expect(res.status).toBe(404);
    });

    it("400 for invalid match_action", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        const res = await callPATCH("l-1", { match_action: "garbage" });
        expect(res.status).toBe(400);
    });

    it("400 when matched action without matched_product_id", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        const res = await callPATCH("l-1", { match_action: "matched" });
        expect(res.status).toBe(400);
    });

    it("happy: matched action with product_id → 200", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        mockGetProductById.mockResolvedValueOnce({ id: PID, is_active: true });
        mockUpdateLine.mockResolvedValueOnce({ id: "l-1", match_action: "matched" });
        const res = await callPATCH("l-1", { match_action: "matched", matched_product_id: PID, match_confidence: 95 });
        expect(res.status).toBe(200);
        expect(mockUpdateLine).toHaveBeenCalledTimes(1);
        const args = mockUpdateLine.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(args.matched_product_id).toBe(PID);
        expect(args.match_action).toBe("matched");
        expect(args.reviewed_by).toBe("user-1");
    });

    // ── Review 3b P3-F: validation hardening ──
    it("invalid UUID → 400 (DB cast hatasına düşmez)", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        const res = await callPATCH("l-1", { match_action: "matched", matched_product_id: "not-a-uuid" });
        expect(res.status).toBe(400);
        expect(mockGetProductById).not.toHaveBeenCalled();
        expect(mockUpdateLine).not.toHaveBeenCalled();
    });

    it("matched action + ürün bulunamadı → 400", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        mockGetProductById.mockResolvedValueOnce(null);
        const res = await callPATCH("l-1", { match_action: "matched", matched_product_id: PID });
        expect(res.status).toBe(400);
        expect(mockUpdateLine).not.toHaveBeenCalled();
    });

    it("matched action + ürün pasif → 400", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        mockGetProductById.mockResolvedValueOnce({ id: PID, is_active: false });
        const res = await callPATCH("l-1", { match_action: "matched", matched_product_id: PID });
        expect(res.status).toBe(400);
        expect(mockUpdateLine).not.toHaveBeenCalled();
    });

    it("match_confidence > 100 → 400", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        const res = await callPATCH("l-1", { match_action: "skipped", match_confidence: 150 });
        expect(res.status).toBe(400);
        expect(mockUpdateLine).not.toHaveBeenCalled();
    });

    it("match_confidence < 0 → 400", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        const res = await callPATCH("l-1", { match_action: "skipped", match_confidence: -10 });
        expect(res.status).toBe(400);
    });

    it("match_confidence non-number → 400", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        const res = await callPATCH("l-1", { match_action: "skipped", match_confidence: "high" });
        expect(res.status).toBe(400);
    });

    it("happy: skipped action (no product_id needed) → 200", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        mockUpdateLine.mockResolvedValueOnce({ id: "l-1", match_action: "skipped" });
        const res = await callPATCH("l-1", { match_action: "skipped" });
        expect(res.status).toBe(200);
    });

    it("happy: new_product action → 200", async () => {
        mockRequireRole.mockResolvedValueOnce(null);
        mockGetLine.mockResolvedValueOnce({ id: "l-1" });
        mockUpdateLine.mockResolvedValueOnce({ id: "l-1", match_action: "new_product" });
        const res = await callPATCH("l-1", { match_action: "new_product" });
        expect(res.status).toBe(200);
    });
});
