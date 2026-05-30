/**
 * Tests for quote deadline update via PATCH /api/orders/[id]
 * Body: { quote_valid_until: "YYYY-MM-DD" | null }
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

// ── Mocks ─────────────────────────────────────────────────────

const mockServiceUpdateQuoteDeadline = vi.fn();
const mockServiceGetOrder            = vi.fn();
const mockServiceTransitionOrder     = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceUpdateQuoteDeadline: (...args: unknown[]) => mockServiceUpdateQuoteDeadline(...args),
    serviceGetOrder:            (...args: unknown[]) => mockServiceGetOrder(...args),
    serviceTransitionOrder:     (...args: unknown[]) => mockServiceTransitionOrder(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:   vi.fn(),
    dbHardDeleteOrder: vi.fn(),
}));

vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncOrderToParasut: vi.fn(),
}));

import { PATCH } from "@/app/api/orders/[id]/route";

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/orders/order-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

// ── Tests ─────────────────────────────────────────────────────

describe("PATCH /api/orders/[id] — quote_valid_until update", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceUpdateQuoteDeadline.mockResolvedValue(undefined);
    });

    it("1. geçerli tarih → serviceUpdateQuoteDeadline çağrılır, 200 { ok: true }", async () => {
        const req = makeRequest({ quote_valid_until: "2026-05-01" });
        const res = await PATCH(req, makeParams("order-1"));
        const body = await res.json();

        expect(mockServiceUpdateQuoteDeadline).toHaveBeenCalledWith("order-1", "2026-05-01");
        expect(mockServiceTransitionOrder).not.toHaveBeenCalled();
        expect(res.status).toBe(200);
        expect(body).toEqual({ ok: true });
    });

    it("2. null tarih → serviceUpdateQuoteDeadline(id, null), 200 { ok: true }", async () => {
        const req = makeRequest({ quote_valid_until: null });
        const res = await PATCH(req, makeParams("order-1"));
        const body = await res.json();

        expect(mockServiceUpdateQuoteDeadline).toHaveBeenCalledWith("order-1", null);
        expect(res.status).toBe(200);
        expect(body).toEqual({ ok: true });
    });

    it("3. service hata fırlatırsa → 500", async () => {
        mockServiceUpdateQuoteDeadline.mockRejectedValue(new Error("DB error"));

        const req = makeRequest({ quote_valid_until: "2026-05-01" });
        const res = await PATCH(req, makeParams("order-1"));

        expect(res.status).toBe(500);
    });
});
