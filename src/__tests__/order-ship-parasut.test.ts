/**
 * Tests for PATCH /api/orders/[id] — "shipped" transition + Paraşüt sync.
 *
 * Regression guard for:
 *   - successful ship + successful sync → response includes parasut_invoice_id
 *   - successful ship + failed sync → response includes parasut_error
 *   - failed transition → serviceSyncOrderToParasut never called
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

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockServiceTransitionOrder = vi.fn();
const mockServiceGetOrder = vi.fn();
const mockServiceSyncOrderToParasut = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceTransitionOrder: (...args: unknown[]) => mockServiceTransitionOrder(...args),
    serviceGetOrder: (...args: unknown[]) => mockServiceGetOrder(...args),
}));

vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncOrderToParasut: (...args: unknown[]) => mockServiceSyncOrderToParasut(...args),
}));

vi.mock("@/lib/services/email-service", () => ({
    notifyUsersByEmail: vi.fn(() => Promise.resolve({ sent: 0, skipped: 0, failed: 0 })),
}));

// /ship route dbBatchResolveAlerts kullanır (PATCH route kullanmaz) — F3a testi için mock'la.
vi.mock("@/lib/supabase/alerts", () => ({
    dbBatchResolveAlerts: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH } from "@/app/api/orders/[id]/route";
import { POST as shipPost } from "@/app/api/orders/[id]/ship/route";
import { getCurrentUserPermissions } from "@/lib/auth/role-guard";
import type { Permission } from "@/lib/auth/permissions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORDER_ID = "ord-ship-1";

function makeRequest(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

function makeParams(id = ORDER_ID): { params: Promise<{ id: string }> } {
    return { params: Promise.resolve({ id }) };
}

const stubOrderBase = {
    id: ORDER_ID,
    commercial_status: "approved",
    fulfillment_status: "shipped",
    order_number: "SIP-0042",
    customer_name: "Acme Vana",
    grand_total: 12000,
    currency: "TRY",
    lines: [],
};

const stubTransitionSuccess = {
    success: true,
    fulfillment_status: "shipped",
    shortages: [],
};

// ─── Successful ship + successful sync ────────────────────────────────────────

describe("PATCH /api/orders/[id] ship — successful sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceTransitionOrder.mockResolvedValue(stubTransitionSuccess);
        mockServiceSyncOrderToParasut.mockResolvedValue({
            success: true,
            invoice_id: "INV-123",
            sent_at: "2026-04-05T10:00:00Z",
        });
        mockServiceGetOrder.mockResolvedValue({
            ...stubOrderBase,
            parasut_invoice_id: "INV-123",
            parasut_sent_at: "2026-04-05T10:00:00Z",
            parasut_error: null,
        });
    });

    it("returns 200", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(res.status).toBe(200);
    });

    it("response contains parasut_invoice_id", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        const body = await res.json();
        expect(body.parasut_invoice_id).toBe("INV-123");
    });

    it("serviceSyncOrderToParasut called with orderId", async () => {
        await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(mockServiceSyncOrderToParasut).toHaveBeenCalledWith(ORDER_ID);
    });
});

// ─── Successful ship + failed sync ────────────────────────────────────────────

describe("PATCH /api/orders/[id] ship — failed sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceTransitionOrder.mockResolvedValue(stubTransitionSuccess);
        mockServiceSyncOrderToParasut.mockResolvedValue({
            success: false,
            error: "Paraşüt API hatası",
        });
        mockServiceGetOrder.mockResolvedValue({
            ...stubOrderBase,
            parasut_invoice_id: null,
            parasut_sent_at: null,
            parasut_error: "Paraşüt API hatası",
        });
    });

    it("returns 200 (ship succeeded even if sync failed)", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(res.status).toBe(200);
    });

    it("response contains parasut_error", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        const body = await res.json();
        expect(body.parasut_error).toBe("Paraşüt API hatası");
    });

    it("serviceSyncOrderToParasut still called", async () => {
        await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(mockServiceSyncOrderToParasut).toHaveBeenCalledWith(ORDER_ID);
    });
});

// ─── Failed transition → sync never called ────────────────────────────────────

describe("PATCH /api/orders/[id] ship — failed transition", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceTransitionOrder.mockResolvedValue({
            success: false,
            error: "Stok yetersiz.",
        });
    });

    it("returns 400", async () => {
        const res = await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(res.status).toBe(400);
    });

    it("serviceSyncOrderToParasut never called", async () => {
        await PATCH(makeRequest({ transition: "shipped" }), makeParams());
        expect(mockServiceSyncOrderToParasut).not.toHaveBeenCalled();
    });
});

// ─── F3 — ship response redaction (production: ship_sales_orders, view_sales_prices YOK) ───
// F4 production'a PATCH/ship sevk yolunu açtı; production view_sales_prices tutmaz.
// redactOrderForPerms response'taki satış finansallarını null'lamalı. Bu testler
// silinirse (redaction kaldırılırsa) leak geri döner → diskriminatif kilit (advisor).
describe("F3 — ship response redaction (no view_sales_prices)", () => {
    const PROD_PERMS = new Set<Permission>(["ship_sales_orders", "view_sales_orders"]);
    const stubWithFinancials = {
        ...stubOrderBase,
        grand_total: 12000,
        subtotal: 10000,
        vat_total: 2000,
        lines: [{ id: "l1", product_id: "p1", quantity: 2, unit_price: 5000, line_total: 10000 }],
        parasut_invoice_id: null, parasut_sent_at: null, parasut_error: null,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockServiceTransitionOrder.mockResolvedValue(stubTransitionSuccess);
        mockServiceSyncOrderToParasut.mockResolvedValue({ success: true, invoice_id: null, sent_at: null });
        mockServiceGetOrder.mockResolvedValue(stubWithFinancials);
    });

    it("PATCH (F3b): production → grand_total + satır fiyatları null, qty korunur", async () => {
        vi.mocked(getCurrentUserPermissions).mockResolvedValueOnce(PROD_PERMS);
        const body = await (await PATCH(makeRequest({ transition: "shipped" }), makeParams())).json();
        expect(body.grand_total).toBeNull();
        expect(body.subtotal).toBeNull();
        expect(body.vat_total).toBeNull();
        expect(body.lines[0].unit_price).toBeNull();
        expect(body.lines[0].line_total).toBeNull();
        expect(body.lines[0].quantity).toBe(2); // operasyonel alan sızıntı değil
    });

    it("PATCH: view_sales_prices olan rol → grand_total + satır fiyatı görünür (diskriminatif)", async () => {
        vi.mocked(getCurrentUserPermissions).mockResolvedValueOnce(
            new Set<Permission>(["ship_sales_orders", "view_sales_prices"]));
        const body = await (await PATCH(makeRequest({ transition: "shipped" }), makeParams())).json();
        expect(body.grand_total).toBe(12000);
        expect(body.lines[0].unit_price).toBe(5000);
    });

    it("POST /ship (F3a): production → grand_total + satır fiyatları null", async () => {
        vi.mocked(getCurrentUserPermissions).mockResolvedValueOnce(PROD_PERMS);
        const req = new NextRequest(`http://localhost/api/orders/${ORDER_ID}/ship`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shipDate: "2026-06-01" }),
        });
        const body = await (await shipPost(req, makeParams())).json();
        expect(body.grand_total).toBeNull();
        expect(body.lines[0].unit_price).toBeNull();
    });
});
