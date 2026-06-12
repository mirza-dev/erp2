/**
 * Tests for GET /api/import/[batchId]/drafts
 * (POST handler 2026-06-10 sadeleştirmesinde kaldırıldı — UI tüketicisi yoktu.)
 * DB functions are mocked — no real Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: import route'larına requirePermission(manage_import) eklendi → allow.
// Denetim Y1 (2026-06): GET artık resolveAuthContext + requirePermissionFor(view_import).
const mockResolveAuthContext = vi.fn();
const mockRequirePermissionFor = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(new Set(["manage_import"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
    resolveAuthContext: (...a: unknown[]) => mockResolveAuthContext(...a),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermissionFor(...a),
}));
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListDrafts = vi.fn();

vi.mock("@/lib/supabase/import", () => ({
    dbListDrafts: (...args: unknown[]) => mockDbListDrafts(...args),
}));

import { GET } from "@/app/api/import/[batchId]/drafts/route";

// ── Helpers ───────────────────────────────────────────────────

const BATCH_ID = "batch-drafts-1";

function makeGetReq(): NextRequest {
    return new NextRequest(`http://localhost/api/import/${BATCH_ID}/drafts`, { method: "GET" });
}

function makeCtx(batchId = BATCH_ID) {
    return { params: Promise.resolve({ batchId }) };
}

function makeDraft(id: string) {
    return {
        id,
        batch_id: BATCH_ID,
        entity_type: "product",
        status: "pending",
        confidence: 0.9,
        parsed_data: { sku: "P001", name: "Vana" },
        raw_data: { SKU: "P001", "Ürün Adı": "Vana" },
    };
}

// ── Tests ─────────────────────────────────────────────────────

describe("GET /api/import/[batchId]/drafts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveAuthContext.mockResolvedValue({
            user: { id: "u-1" }, userId: "u-1", roles: ["admin"], perms: new Set(["view_import"]),
        });
        mockRequirePermissionFor.mockReturnValue(null);
        mockDbListDrafts.mockResolvedValue([makeDraft("d1"), makeDraft("d2")]);
    });

    it("returns list of drafts with 200", async () => {
        const res = await GET(makeGetReq(), makeCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(2);
        expect(body[0].id).toBe("d1");
    });

    it("calls dbListDrafts with the correct batchId", async () => {
        await GET(makeGetReq(), makeCtx());
        expect(mockDbListDrafts).toHaveBeenCalledWith(BATCH_ID);
    });

    it("returns empty array when no drafts exist", async () => {
        mockDbListDrafts.mockResolvedValue([]);
        const res = await GET(makeGetReq(), makeCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual([]);
    });
});

describe("drafts route POST kaldırıldı (regression-lock)", () => {
    it("route artık POST export etmez", async () => {
        const mod = await import("@/app/api/import/[batchId]/drafts/route");
        expect("POST" in mod).toBe(false);
    });
});

describe("Y1 RBAC guard", () => {
    it("izin yoksa 403 döner ve DB'ye inmez", async () => {
        vi.clearAllMocks(); // describe-dışı: önceki testlerin sayaçları taşınmasın
        mockResolveAuthContext.mockResolvedValue({
            user: { id: "u-1" }, userId: "u-1", roles: ["viewer"], perms: new Set(),
        });
        mockRequirePermissionFor.mockReturnValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await GET(makeGetReq(), makeCtx());
        expect(res.status).toBe(403);
        expect(mockDbListDrafts).not.toHaveBeenCalled();
    });
});
