/**
 * Sprint A G6 — Drawer içi "Süreyi Uzat" akışı: serviceUpdateQuoteDeadline
 *
 * Plan kriteri: "drawer içi süre uzatma akışı; serviceUpdateQuoteDeadline çağrılıyor"
 * PATCH /api/orders/[id] body {quote_valid_until} → serviceUpdateQuoteDeadline çağrısı →
 * geçerli tarihse quote_expired alert resolve edilir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: route'lara requirePermission guard eklendi → bu test guard'ı allow'a
// mock'lar (gerçek guard logic role-guard.test.ts + page-access.test.ts'te test edilir).
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

const mockServiceUpdateQuoteDeadline = vi.fn();
const mockServiceTransitionOrder     = vi.fn();
const mockServiceGetOrder            = vi.fn();
const mockServiceSyncOrderToParasut  = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceUpdateQuoteDeadline:   (...a: unknown[]) => mockServiceUpdateQuoteDeadline(...a),
    serviceTransitionOrder:       (...a: unknown[]) => mockServiceTransitionOrder(...a),
    serviceGetOrder:              (...a: unknown[]) => mockServiceGetOrder(...a),
    serviceSyncOrderToParasut:    (...a: unknown[]) => mockServiceSyncOrderToParasut(...a),
}));

vi.mock("@/lib/api-error", () => ({
    handleApiError: (_err: unknown, msg: string) =>
        new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        }),
    safeParseJson: async (req: Request) => {
        const data = await req.json();
        return { ok: true, data };
    },
}));

vi.mock("next/cache", () => ({
    unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) =>
        (...args: Parameters<T>) => fn(...args),
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
}));

import { PATCH } from "@/app/api/orders/[id]/route";

const PARAMS = { params: Promise.resolve({ id: "order-456" }) };

beforeEach(() => {
    vi.clearAllMocks();
    mockServiceUpdateQuoteDeadline.mockResolvedValue(undefined);
});

describe("PATCH /api/orders/[id] — quote_valid_until (Süreyi Uzat akışı)", () => {
    it("quote_valid_until body varsa serviceUpdateQuoteDeadline çağrılır", async () => {
        const req = new NextRequest("http://localhost/api/orders/order-456", {
            method: "PATCH",
            body: JSON.stringify({ quote_valid_until: "2026-12-31" }),
            headers: { "Content-Type": "application/json" },
        });
        const res = await PATCH(req, PARAMS);

        expect(mockServiceUpdateQuoteDeadline).toHaveBeenCalledOnce();
        expect(mockServiceUpdateQuoteDeadline).toHaveBeenCalledWith("order-456", "2026-12-31");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it("quote_valid_until null değeri de geçirilir (sonsuz süre)", async () => {
        const req = new NextRequest("http://localhost/api/orders/order-456", {
            method: "PATCH",
            body: JSON.stringify({ quote_valid_until: null }),
            headers: { "Content-Type": "application/json" },
        });
        await PATCH(req, PARAMS);

        expect(mockServiceUpdateQuoteDeadline).toHaveBeenCalledWith("order-456", null);
    });

    it("quote_valid_until yoksa serviceUpdateQuoteDeadline çağrılmaz", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: true, shortages: [] });
        mockServiceGetOrder.mockResolvedValue({ id: "order-456" });
        const req = new NextRequest("http://localhost/api/orders/order-456", {
            method: "PATCH",
            body: JSON.stringify({ transition: "pending_approval" }),
            headers: { "Content-Type": "application/json" },
        });
        await PATCH(req, PARAMS);

        expect(mockServiceUpdateQuoteDeadline).not.toHaveBeenCalled();
    });

    it("serviceUpdateQuoteDeadline throw ederse 500 döner", async () => {
        mockServiceUpdateQuoteDeadline.mockRejectedValue(new Error("db error"));
        const req = new NextRequest("http://localhost/api/orders/order-456", {
            method: "PATCH",
            body: JSON.stringify({ quote_valid_until: "2026-12-31" }),
            headers: { "Content-Type": "application/json" },
        });
        const res = await PATCH(req, PARAMS);
        expect(res.status).toBe(500);
    });
});
