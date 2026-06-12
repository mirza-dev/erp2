/**
 * Faz 4 follow-up — audit-log helper + endpoint tests (4 tests)
 *
 * Covers:
 *   dbListAuditLog — Supabase chain doğru filter ile çağrılır + DB error → throws
 *   GET /api/audit-log — entity_type/entity_id eksikse 400, doluysa 200
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────

const mockFrom    = vi.fn();
const mockSelect  = vi.fn();
const mockEq      = vi.fn();
const mockOrder   = vi.fn();

let _terminalResult: { data: unknown; error: unknown } = { data: [], error: null };
function setTerminal(v: { data: unknown; error: unknown }) { _terminalResult = v; }

const makeChain = () => {
    const c: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(_terminalResult).then(resolve),
        catch: (reject: (e: unknown) => unknown) => Promise.resolve(_terminalResult).catch(reject),
    };
    c.select = (_v?: unknown) => { mockSelect(_v); return c; };
    c.eq     = (_k: unknown, _v: unknown) => { mockEq(_k, _v); return c; };
    c.order  = (_v: unknown, _o?: unknown) => { mockOrder(_v, _o); return c; };
    return c;
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: (table: string) => { mockFrom(table); return makeChain(); },
    }),
}));

// ── Role-guard mock (denetim K1: route artık oturum + entity-bazlı yetki ister) ──

const mockResolveAuthContext = vi.fn();
const mockRequirePermissionFor = vi.fn();
const mockRequireRoleFor = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: (...a: unknown[]) => mockResolveAuthContext(...a),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermissionFor(...a),
    requireRoleFor: (...a: unknown[]) => mockRequireRoleFor(...a),
}));

import { dbListAuditLog } from "@/lib/supabase/audit-log";
import { GET as auditGET } from "@/app/api/audit-log/route";
import { NextResponse } from "next/server";

beforeEach(() => {
    vi.clearAllMocks();
    setTerminal({ data: [], error: null });
    // default: yetkili kullanıcı (guard'lar geçer)
    mockResolveAuthContext.mockResolvedValue({
        user: { id: "u-1" }, userId: "u-1", roles: ["admin"],
        perms: new Set(["view_purchase_orders"]),
    });
    mockRequirePermissionFor.mockReturnValue(null);
    mockRequireRoleFor.mockReturnValue(null);
});

// ── dbListAuditLog ────────────────────────────────────────────

describe("dbListAuditLog", () => {
    it("doğru tablo + filter + order chain'i ile çağrılır", async () => {
        const entries = [
            { id: "1", action: "po_created", before_state: null, after_state: { status: "draft" }, actor: "u-1", occurred_at: "2026-05-12T10:00:00Z", source: "ui" },
        ];
        setTerminal({ data: entries, error: null });

        const result = await dbListAuditLog("purchase_order", "po-1");

        expect(mockFrom).toHaveBeenCalledWith("audit_log");
        expect(mockEq).toHaveBeenCalledWith("entity_type", "purchase_order");
        expect(mockEq).toHaveBeenCalledWith("entity_id", "po-1");
        expect(mockOrder).toHaveBeenCalledWith("occurred_at", { ascending: true });
        expect(result).toEqual(entries);
    });

    it("DB error → throws", async () => {
        setTerminal({ data: null, error: { message: "RLS denied" } });
        await expect(dbListAuditLog("purchase_order", "po-1")).rejects.toThrow("RLS denied");
    });
});

// ── GET /api/audit-log ────────────────────────────────────────

describe("GET /api/audit-log", () => {
    it("entity_type eksik → 400", async () => {
        const req = new Request("http://localhost/api/audit-log?entity_id=po-1");
        const res = await auditGET(req as unknown as Parameters<typeof auditGET>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/entity_type ve entity_id/i);
    });

    it("ikisi de varsa → 200 + array döner", async () => {
        const entries = [
            { id: "1", action: "po_created", before_state: null, after_state: { status: "draft" }, actor: "u-1", occurred_at: "2026-05-12T10:00:00Z", source: "ui" },
            { id: "2", action: "po_confirmed", before_state: null, after_state: { status: "confirmed" }, actor: "u-1", occurred_at: "2026-05-12T11:00:00Z", source: "ui" },
        ];
        setTerminal({ data: entries, error: null });

        const req = new Request("http://localhost/api/audit-log?entity_type=purchase_order&entity_id=po-1");
        const res = await auditGET(req as unknown as Parameters<typeof auditGET>[0]);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(2);
        expect(body[0].action).toBe("po_created");
    });

    // ── K1 RBAC guard'ları (2026-06 denetimi) ─────────────────

    it("oturumsuz → 401 (before_state PII'si anonim okunamaz)", async () => {
        mockResolveAuthContext.mockResolvedValue({
            user: null, userId: null, roles: ["viewer"], perms: new Set(),
        });
        const req = new Request("http://localhost/api/audit-log?entity_type=purchase_order&entity_id=po-1");
        const res = await auditGET(req as unknown as Parameters<typeof auditGET>[0]);
        expect(res.status).toBe(401);
    });

    it("purchase_order → view_purchase_orders yetkisi sorulur; yoksa 403", async () => {
        mockRequirePermissionFor.mockReturnValue(
            NextResponse.json({ error: "yetki yok" }, { status: 403 }),
        );
        const req = new Request("http://localhost/api/audit-log?entity_type=purchase_order&entity_id=po-1");
        const res = await auditGET(req as unknown as Parameters<typeof auditGET>[0]);
        expect(res.status).toBe(403);
        expect(mockRequirePermissionFor).toHaveBeenCalledWith(expect.anything(), "view_purchase_orders");
        expect(mockRequireRoleFor).not.toHaveBeenCalled();
    });

    it("haritada olmayan entity_type → yalnız admin (fail-closed)", async () => {
        mockRequireRoleFor.mockReturnValue(
            NextResponse.json({ error: "yetki yok" }, { status: 403 }),
        );
        const req = new Request("http://localhost/api/audit-log?entity_type=customer&entity_id=c-1");
        const res = await auditGET(req as unknown as Parameters<typeof auditGET>[0]);
        expect(res.status).toBe(403);
        expect(mockRequireRoleFor).toHaveBeenCalledWith(expect.anything(), ["admin"]);
        expect(mockRequirePermissionFor).not.toHaveBeenCalled();
    });
});
