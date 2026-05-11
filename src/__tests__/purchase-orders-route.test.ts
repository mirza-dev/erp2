/**
 * Faz 3 — Purchase Orders: API route tests (14 tests)
 *
 * Covers:
 *   GET    /api/purchase-orders              → 200 list
 *   POST   /api/purchase-orders              → 400 (vendor_id eksik), 400 (lines eksik), 400 (vendor pasif), 201 başarılı
 *   GET    /api/purchase-orders/[id]         → 404, 200
 *   PATCH  /api/purchase-orders/[id]         → 404, 409 (not draft), 200
 *   PUT    /api/purchase-orders/[id]/lines   → 404, 409 (not draft), 200
 *   POST   /api/purchase-orders/[id]/send    → 404, 200
 *   POST   /api/purchase-orders/[id]/confirm → 404, 409 (B4 guard), 200
 *   POST   /api/purchase-orders/[id]/cancel  → 403 (no admin), 400 (no reason), 200
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListPurchaseOrders   = vi.fn();
const mockDbCreatePurchaseOrder  = vi.fn();
const mockDbGetPurchaseOrderById = vi.fn();
const mockDbPatchPurchaseOrder   = vi.fn();
const mockDbReplacePurchaseOrderLines = vi.fn();

vi.mock("@/lib/supabase/purchase-orders", async () => {
    const actual = await vi.importActual("@/lib/supabase/purchase-orders") as typeof import("@/lib/supabase/purchase-orders");
    return {
        ...actual,
        dbListPurchaseOrders:        (...a: unknown[]) => mockDbListPurchaseOrders(...a),
        dbCreatePurchaseOrder:       (...a: unknown[]) => mockDbCreatePurchaseOrder(...a),
        dbGetPurchaseOrderById:      (...a: unknown[]) => mockDbGetPurchaseOrderById(...a),
        dbPatchPurchaseOrder:        (...a: unknown[]) => mockDbPatchPurchaseOrder(...a),
        dbReplacePurchaseOrderLines: (...a: unknown[]) => mockDbReplacePurchaseOrderLines(...a),
    };
});

const mockServiceSendPO    = vi.fn();
const mockServiceConfirmPO = vi.fn();
const mockServiceCancelPO  = vi.fn();

vi.mock("@/lib/services/purchase-order-service", async () => {
    const actual = await vi.importActual("@/lib/services/purchase-order-service") as typeof import("@/lib/services/purchase-order-service");
    return {
        ...actual,
        serviceSendPO:    (...a: unknown[]) => mockServiceSendPO(...a),
        serviceConfirmPO: (...a: unknown[]) => mockServiceConfirmPO(...a),
        serviceCancelPO:  (...a: unknown[]) => mockServiceCancelPO(...a),
    };
});

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (_fn: () => unknown) => _fn,
}));

import { GET as listGET, POST as listPOST } from "@/app/api/purchase-orders/route";
import {
    GET  as detailGET,
    PATCH as detailPATCH,
} from "@/app/api/purchase-orders/[id]/route";
import { PUT as linesPUT } from "@/app/api/purchase-orders/[id]/lines/route";
import { POST as sendPOST } from "@/app/api/purchase-orders/[id]/send/route";
import { POST as confirmPOST } from "@/app/api/purchase-orders/[id]/confirm/route";
import { POST as cancelPOST } from "@/app/api/purchase-orders/[id]/cancel/route";

// ── Helpers ────────────────────────────────────────────────────

function makeReq(body?: unknown, url = "http://localhost/api/purchase-orders"): Request {
    if (body === undefined) return new Request(url);
    return new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

const samplePO = {
    id: "po-1",
    po_number: "PO-2026-0001",
    vendor_id: "v-1",
    status: "draft" as const,
    order_date: "2026-01-01",
    expected_date: "2026-02-01",
    currency: "TRY",
    subtotal: 0,
    vat_rate: 0.20,
    vat_total: 0,
    grand_total: 0,
    notes: null,
    sent_at: null,
    confirmed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    lines: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(null);  // admin by default
});

// ── GET /api/purchase-orders ──────────────────────────────────

describe("GET /api/purchase-orders", () => {
    it("200 + liste döner", async () => {
        mockDbListPurchaseOrders.mockResolvedValue([samplePO]);
        const res = await listGET(makeReq() as unknown as Parameters<typeof listGET>[0]);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
    });
});

// ── POST /api/purchase-orders ─────────────────────────────────

describe("POST /api/purchase-orders", () => {
    it("vendor_id eksik → 400", async () => {
        const res = await listPOST(makeReq({ lines: [{}] }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/vendor_id/i);
    });

    it("lines eksik → 400", async () => {
        const res = await listPOST(makeReq({ vendor_id: "v-1", currency: "TRY", lines: [] }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
    });

    it("vendor pasif → 400", async () => {
        mockDbCreatePurchaseOrder.mockRejectedValue(new Error("PO oluşturulamadı: vendor pasif veya bulunamadı"));
        const res = await listPOST(makeReq({
            vendor_id: "v-inactive",
            currency: "TRY",
            lines: [{ product_id: "p-1", quantity: 1, unit_price: 100 }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/vendor pasif/i);
    });

    it("başarılı → 201", async () => {
        mockDbCreatePurchaseOrder.mockResolvedValue({ id: "po-new", po_number: "PO-2026-0001" });
        const res = await listPOST(makeReq({
            vendor_id: "v-1",
            currency: "TRY",
            lines: [{ product_id: "p-1", quantity: 2, unit_price: 100 }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.id).toBe("po-new");
    });
});

// ── GET /api/purchase-orders/[id] ────────────────────────────

describe("GET /api/purchase-orders/[id]", () => {
    it("PO yok → 404", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(null);
        const res = await detailGET(makeReq() as unknown as Parameters<typeof detailGET>[0], makeParams("po-99"));
        expect(res.status).toBe(404);
    });

    it("PO var → 200", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        const res = await detailGET(makeReq() as unknown as Parameters<typeof detailGET>[0], makeParams("po-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe("po-1");
    });
});

// ── PATCH /api/purchase-orders/[id] ──────────────────────────

describe("PATCH /api/purchase-orders/[id]", () => {
    it("PO yok → 404", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(null);
        const res = await detailPATCH(
            makeReq({ notes: "x" }) as unknown as Parameters<typeof detailPATCH>[0],
            makeParams("po-99"),
        );
        expect(res.status).toBe(404);
    });

    it("draft değil → 409", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue({ ...samplePO, status: "confirmed" });
        const res = await detailPATCH(
            makeReq({ notes: "x" }) as unknown as Parameters<typeof detailPATCH>[0],
            makeParams("po-1"),
        );
        expect(res.status).toBe(409);
    });

    it("başarılı → 200", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        mockDbPatchPurchaseOrder.mockResolvedValue({ ...samplePO, notes: "updated" });
        const res = await detailPATCH(
            makeReq({ notes: "updated" }) as unknown as Parameters<typeof detailPATCH>[0],
            makeParams("po-1"),
        );
        expect(res.status).toBe(200);
    });
});

// ── PUT /api/purchase-orders/[id]/lines ──────────────────────

describe("PUT /api/purchase-orders/[id]/lines", () => {
    it("PO yok → 404", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(null);
        const res = await linesPUT(
            makeReq({ lines: [{ product_id: "p-1", quantity: 1, unit_price: 50 }] }) as unknown as Parameters<typeof linesPUT>[0],
            makeParams("po-99"),
        );
        expect(res.status).toBe(404);
    });

    it("draft değil → 409", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue({ ...samplePO, status: "sent" });
        const res = await linesPUT(
            makeReq({ lines: [{ product_id: "p-1", quantity: 1, unit_price: 50 }] }) as unknown as Parameters<typeof linesPUT>[0],
            makeParams("po-1"),
        );
        expect(res.status).toBe(409);
    });

    it("başarılı → 200", async () => {
        mockDbGetPurchaseOrderById
            .mockResolvedValueOnce(samplePO)
            .mockResolvedValueOnce(samplePO);
        mockDbReplacePurchaseOrderLines.mockResolvedValue(undefined);
        const res = await linesPUT(
            makeReq({ lines: [{ product_id: "p-1", quantity: 2, unit_price: 100 }] }) as unknown as Parameters<typeof linesPUT>[0],
            makeParams("po-1"),
        );
        expect(res.status).toBe(200);
    });
});

// ── POST /api/purchase-orders/[id]/send ──────────────────────

describe("POST /api/purchase-orders/[id]/send", () => {
    it("PO yok → 404", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(null);
        const res = await sendPOST(makeReq() as unknown as Parameters<typeof sendPOST>[0], makeParams("po-99"));
        expect(res.status).toBe(404);
    });

    it("başarılı → 200", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        mockServiceSendPO.mockResolvedValue({ id: "po-1", status: "sent" });
        const res = await sendPOST(makeReq({}) as unknown as Parameters<typeof sendPOST>[0], makeParams("po-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("sent");
    });
});

// ── POST /api/purchase-orders/[id]/confirm ───────────────────

describe("POST /api/purchase-orders/[id]/confirm", () => {
    it("PO yok → 404", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(null);
        const res = await confirmPOST(makeReq() as unknown as Parameters<typeof confirmPOST>[0], makeParams("po-99"));
        expect(res.status).toBe(404);
    });

    it("B4 guard hatası → 409", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        mockServiceConfirmPO.mockRejectedValue(new Error("expected_date zorunludur"));
        const res = await confirmPOST(makeReq({}) as unknown as Parameters<typeof confirmPOST>[0], makeParams("po-1"));
        expect(res.status).toBe(409);
    });

    it("başarılı → 200", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        mockServiceConfirmPO.mockResolvedValue({ id: "po-1", status: "confirmed" });
        const res = await confirmPOST(makeReq({}) as unknown as Parameters<typeof confirmPOST>[0], makeParams("po-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("confirmed");
    });
});

// ── POST /api/purchase-orders/[id]/cancel ────────────────────

describe("POST /api/purchase-orders/[id]/cancel", () => {
    it("admin değil → 403", async () => {
        mockRequireRole.mockResolvedValue(
            new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }),
        );
        const res = await cancelPOST(makeReq({ reason: "test" }) as unknown as Parameters<typeof cancelPOST>[0], makeParams("po-1"));
        expect(res.status).toBe(403);
    });

    it("reason eksik → 400", async () => {
        mockRequireRole.mockResolvedValue(null);
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        const res = await cancelPOST(makeReq({ reason: "" }) as unknown as Parameters<typeof cancelPOST>[0], makeParams("po-1"));
        expect(res.status).toBe(400);
    });

    it("başarılı → 200", async () => {
        mockRequireRole.mockResolvedValue(null);
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        mockServiceCancelPO.mockResolvedValue({ id: "po-1", status: "cancelled" });
        const res = await cancelPOST(
            makeReq({ reason: "Tedarikçi iptal etti." }) as unknown as Parameters<typeof cancelPOST>[0],
            makeParams("po-1"),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("cancelled");
    });
});
