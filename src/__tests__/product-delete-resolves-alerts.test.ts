/**
 * Sprint A G1 — Ürün silinince / deaktif edilince aktif uyarılar hemen resolve edilir.
 *
 * İleriye dönük fix: DELETE /api/products/[id] ve PATCH is_active=false artık
 * dbBatchResolveAlerts çağırarak ürüne bağlı stock_critical / stock_risk /
 * order_deadline / order_shortage / purchase_recommended uyarılarını kapatır.
 * Reason: "product_deleted_or_deactivated".
 *
 * NOT: Scan-tarafı geriye-dönük cleanup (alerts-cleanup-deleted-products.test.ts)
 * ile birlikte iki katmanlı korumayı tamamlar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: route'lara requirePermission guard eklendi → guard'ı allow'a mock'la.
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
}));
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDbGetProductById  = vi.fn();
const mockDbUpdateProduct   = vi.fn();
const mockDbDeleteProduct   = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById:  (...a: unknown[]) => mockDbGetProductById(...a),
    dbUpdateProduct:   (...a: unknown[]) => mockDbUpdateProduct(...a),
    dbDeleteProduct:   (...a: unknown[]) => mockDbDeleteProduct(...a),
}));

const mockDbBatchResolveAlerts = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbBatchResolveAlerts: (...a: unknown[]) => mockDbBatchResolveAlerts(...a),
}));

vi.mock("@/lib/api-error", () => ({
    handleApiError: (_err: unknown, msg: string) =>
        new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        }),
    safeParseJson: async (req: Request) => {
        try {
            const data = await req.json();
            return { ok: true, data };
        } catch {
            return {
                ok: false,
                response: new Response(JSON.stringify({ error: "bad json" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                }),
            };
        }
    },
}));

vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
}));

import { DELETE, PATCH } from "@/app/api/products/[id]/route";

const PARAMS = { params: Promise.resolve({ id: "prod-123" }) };

const PRODUCT_ALERT_TYPES = [
    "stock_critical", "stock_risk", "order_deadline", "order_shortage", "purchase_recommended",
];

beforeEach(() => {
    vi.clearAllMocks();
    mockDbDeleteProduct.mockResolvedValue(undefined);
    mockDbUpdateProduct.mockResolvedValue({ id: "prod-123", name: "Vana", is_active: false });
    mockDbBatchResolveAlerts.mockResolvedValue(0);
});

describe("DELETE /api/products/[id] — alert cleanup", () => {
    it("calls dbBatchResolveAlerts for all 5 product alert types after delete", async () => {
        const req = new NextRequest("http://localhost/api/products/prod-123", { method: "DELETE" });
        await DELETE(req, PARAMS);

        expect(mockDbBatchResolveAlerts).toHaveBeenCalledOnce();
        const entries: Array<{ type: string; entityId: string; reason: string }> =
            mockDbBatchResolveAlerts.mock.calls[0][0];
        expect(entries).toHaveLength(5);
        const types = entries.map(e => e.type);
        for (const t of PRODUCT_ALERT_TYPES) {
            expect(types).toContain(t);
        }
        expect(entries.every(e => e.entityId === "prod-123")).toBe(true);
        expect(entries.every(e => e.reason === "product_deleted")).toBe(true);
    });

    it("still returns 200 even if dbBatchResolveAlerts throws", async () => {
        mockDbBatchResolveAlerts.mockRejectedValue(new Error("db error"));
        const req = new NextRequest("http://localhost/api/products/prod-123", { method: "DELETE" });
        const res = await DELETE(req, PARAMS);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it("calls dbDeleteProduct with the correct id", async () => {
        const req = new NextRequest("http://localhost/api/products/prod-123", { method: "DELETE" });
        await DELETE(req, PARAMS);
        expect(mockDbDeleteProduct).toHaveBeenCalledWith("prod-123");
    });
});

describe("PATCH /api/products/[id] — alert cleanup on deactivation", () => {
    it("calls dbBatchResolveAlerts when is_active is set to false", async () => {
        const req = new NextRequest("http://localhost/api/products/prod-123", {
            method: "PATCH",
            body: JSON.stringify({ is_active: false }),
            headers: { "Content-Type": "application/json" },
        });
        await PATCH(req, PARAMS);

        expect(mockDbBatchResolveAlerts).toHaveBeenCalledOnce();
        const entries: Array<{ type: string; reason: string }> =
            mockDbBatchResolveAlerts.mock.calls[0][0];
        expect(entries.every(e => e.reason === "product_deactivated")).toBe(true);
    });

    it("does NOT call dbBatchResolveAlerts when is_active is not changed", async () => {
        mockDbUpdateProduct.mockResolvedValue({ id: "prod-123", name: "Yeni İsim", is_active: true });
        const req = new NextRequest("http://localhost/api/products/prod-123", {
            method: "PATCH",
            body: JSON.stringify({ name: "Yeni İsim" }),
            headers: { "Content-Type": "application/json" },
        });
        await PATCH(req, PARAMS);
        expect(mockDbBatchResolveAlerts).not.toHaveBeenCalled();
    });

    it("does NOT call dbBatchResolveAlerts when is_active is set to true", async () => {
        mockDbUpdateProduct.mockResolvedValue({ id: "prod-123", is_active: true });
        const req = new NextRequest("http://localhost/api/products/prod-123", {
            method: "PATCH",
            body: JSON.stringify({ is_active: true }),
            headers: { "Content-Type": "application/json" },
        });
        await PATCH(req, PARAMS);
        expect(mockDbBatchResolveAlerts).not.toHaveBeenCalled();
    });
});
