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
const mockServiceRevisePO  = vi.fn();

vi.mock("@/lib/services/purchase-order-service", async () => {
    const actual = await vi.importActual("@/lib/services/purchase-order-service") as typeof import("@/lib/services/purchase-order-service");
    return {
        ...actual,
        serviceSendPO:    (...a: unknown[]) => mockServiceSendPO(...a),
        serviceConfirmPO: (...a: unknown[]) => mockServiceConfirmPO(...a),
        serviceCancelPO:  (...a: unknown[]) => mockServiceCancelPO(...a),
        serviceRevisePO:  (...a: unknown[]) => mockServiceRevisePO(...a),
    };
});

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
    // RBAC R1/R2: PO route'larına requirePermission guard eklendi → allow.
    requirePermission: vi.fn().mockResolvedValue(null),
    // Faz 4 R3: GET redaction view_purchase_costs okur → tam veri için sete eklenir (no-op).
    getCurrentUserPermissions: vi.fn().mockResolvedValue(new Set(["view_purchase_orders", "manage_purchase_orders", "view_purchase_costs"])),
    // O1: actor/createdBy sunucu-otoriter — route getCurrentUserId() ile oturum kullanıcısını alır.
    getCurrentUserId: vi.fn().mockResolvedValue("session-user-id"),
}));

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
    revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
    unstable_cache: (_fn: () => unknown) => _fn,
}));

import { GET as listGET, POST as listPOST } from "@/app/api/purchase-orders/route";
import {
    GET  as detailGET,
    PATCH as detailPATCH,
} from "@/app/api/purchase-orders/[id]/route";
import { PUT as linesPUT } from "@/app/api/purchase-orders/[id]/lines/route";
import { POST as sendPOST } from "@/app/api/purchase-orders/[id]/send/route";
import { POST as revisePOST } from "@/app/api/purchase-orders/[id]/revise/route";
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

// Valid UUID fixture (validatePoLines artık UUID format kontrol ediyor — P2 fix)
const PID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(null);  // admin by default
    mockRevalidateTag.mockReset();
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
            lines: [{ product_id: PID, quantity: 1, unit_price: 100 }],
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
            lines: [{ product_id: PID, quantity: 2, unit_price: 100 }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.id).toBe("po-new");
    });
});

// ── POST /api/purchase-orders — line validation (P2.2 advisor fix) ──

describe("POST /api/purchase-orders — line validation", () => {
    const baseBody = (lineOverride: Record<string, unknown>) => ({
        vendor_id: "v-1",
        currency: "TRY",
        lines: [{ product_id: PID, quantity: 5, unit_price: 100, ...lineOverride }],
    });

    it("quantity=0 → 400 'pozitif tam sayı'", async () => {
        const res = await listPOST(makeReq(baseBody({ quantity: 0 })) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/pozitif tam sayı/i);
    });

    it("unit_price=-1 → 400 'birim fiyat negatif'", async () => {
        const res = await listPOST(makeReq(baseBody({ unit_price: -1 })) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/birim fiyat.*negatif/i);
    });

    it("discount_pct=150 → 400 'iskonto 0-100'", async () => {
        const res = await listPOST(makeReq(baseBody({ discount_pct: 150 })) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/iskonto/i);
    });

    it("product_id eksik → 400 'product_id zorunludur'", async () => {
        const res = await listPOST(makeReq({
            vendor_id: "v-1",
            currency: "TRY",
            lines: [{ quantity: 5, unit_price: 100 }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/product_id zorunludur/i);
    });

    // P2 follow-up — Number(null)/Number("") silent 0 tuzakları + UUID + currency

    it("unit_price=null → 400 'zorunludur' (Number(null)=0 silent fail kapatıldı)", async () => {
        const res = await listPOST(makeReq(baseBody({ unit_price: null })) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/birim fiyat zorunludur/i);
    });

    it("unit_price='' (empty string) → 400 'zorunludur' (Number('')=0 silent fail kapatıldı)", async () => {
        const res = await listPOST(makeReq(baseBody({ unit_price: "" })) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/birim fiyat zorunludur/i);
    });

    it("product_id geçersiz UUID → 400 'geçerli UUID' (DB cast 500'e düşmesin)", async () => {
        const res = await listPOST(makeReq({
            vendor_id: "v-1",
            currency: "TRY",
            lines: [{ product_id: "not-a-uuid", quantity: 1, unit_price: 100 }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/geçerli UUID/i);
    });

    it("currency='GBP' (whitelist dışı) → 400 'Geçersiz para birimi'", async () => {
        const res = await listPOST(makeReq({
            vendor_id: "v-1",
            currency: "GBP",
            lines: [{ product_id: PID, quantity: 1, unit_price: 100 }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/Geçersiz para birimi/i);
    });

    it("source_recommendation_ids array değil → 400", async () => {
        const res = await listPOST(makeReq(baseBody({ source_recommendation_ids: "not-array" })) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/array olmalıdır/i);
    });

    it("source_recommendation_ids geçersiz UUID → 400", async () => {
        const res = await listPOST(makeReq(baseBody({
            source_recommendation_ids: ["00000000-0000-4000-8000-000000000001", "bad-uuid"],
        })) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/source_recommendation_ids\[1\] geçerli UUID/i);
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

    it("currency='GBP' (whitelist dışı) → 400", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        const res = await detailPATCH(
            makeReq({ currency: "GBP" }) as unknown as Parameters<typeof detailPATCH>[0],
            makeParams("po-1"),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/Geçersiz para birimi/i);
    });
});

// ── PUT /api/purchase-orders/[id]/lines ──────────────────────

describe("PUT /api/purchase-orders/[id]/lines", () => {
    it("PO yok → 404", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(null);
        const res = await linesPUT(
            makeReq({ lines: [{ product_id: PID, quantity: 1, unit_price: 50 }] }) as unknown as Parameters<typeof linesPUT>[0],
            makeParams("po-99"),
        );
        expect(res.status).toBe(404);
    });

    it("draft değil → 409", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue({ ...samplePO, status: "sent" });
        const res = await linesPUT(
            makeReq({ lines: [{ product_id: PID, quantity: 1, unit_price: 50 }] }) as unknown as Parameters<typeof linesPUT>[0],
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
            makeReq({ lines: [{ product_id: PID, quantity: 2, unit_price: 100 }] }) as unknown as Parameters<typeof linesPUT>[0],
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

    it("başarılı → 200 + products cache invalidate (P3 regression)", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO);
        mockServiceConfirmPO.mockResolvedValue({ id: "po-1", status: "confirmed" });
        const res = await confirmPOST(makeReq({}) as unknown as Parameters<typeof confirmPOST>[0], makeParams("po-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("confirmed");
        // confirm_po commitment seed eder → incoming/forecasted etkilenir
        expect(mockRevalidateTag).toHaveBeenCalledWith("purchase-orders", "max");
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
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

    it("başarılı → 200 + products cache invalidate (P3 regression)", async () => {
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
        // cancel_po pending commitment cancel → incoming etkilenir
        expect(mockRevalidateTag).toHaveBeenCalledWith("purchase-orders", "max");
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });
});

// ── POST /api/purchase-orders/[id]/revise — M1 (Faz 4 follow-up) ──────

describe("POST /api/purchase-orders/[id]/revise", () => {
    it("PO yok → 404", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(null);
        const res = await revisePOST(makeReq() as unknown as Parameters<typeof revisePOST>[0], makeParams("po-99"));
        expect(res.status).toBe(404);
    });

    it("confirmed PO → 409 'Geçersiz durum geçişi'", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue({ ...samplePO, status: "confirmed" });
        mockServiceRevisePO.mockRejectedValue(new Error("Geçersiz durum geçişi: confirmed → draft"));
        const res = await revisePOST(makeReq({}) as unknown as Parameters<typeof revisePOST>[0], makeParams("po-1"));
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toMatch(/Geçersiz durum geçişi/i);
    });

    it("başarılı (sent → draft) → 200 + revalidate", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue({ ...samplePO, status: "sent" });
        mockServiceRevisePO.mockResolvedValue({ id: "po-1", status: "draft" });
        const res = await revisePOST(makeReq({}) as unknown as Parameters<typeof revisePOST>[0], makeParams("po-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("draft");
        expect(mockRevalidateTag).toHaveBeenCalledWith("purchase-orders", "max");
    });
});

// ── validateStringLengths parity (öneriler turu paritesi) ─────
// `validateStringLengths` mock'lanmıyor → gerçek recursive helper çalışır
// (top-level notes + lines[].notes array-of-objects kapsanır).

describe("validateStringLengths parity — POST/PATCH/PUT-lines", () => {
    const LONG = "a".repeat(10_001);

    it("POST: 10k+ üst-seviye notes → 400, dbCreatePurchaseOrder ÇAĞRILMAZ", async () => {
        const res = await listPOST(makeReq({
            vendor_id: "v-1",
            currency: "TRY",
            notes: LONG,
            lines: [{ product_id: PID, quantity: 2, unit_price: 100 }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        expect(mockDbCreatePurchaseOrder).not.toHaveBeenCalled();
    });

    it("POST: nested lines[].notes 10k+ → 400 (recursive lock), dbCreate ÇAĞRILMAZ", async () => {
        const res = await listPOST(makeReq({
            vendor_id: "v-1",
            currency: "TRY",
            lines: [{ product_id: PID, quantity: 2, unit_price: 100, notes: LONG }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(400);
        expect(mockDbCreatePurchaseOrder).not.toHaveBeenCalled();
    });

    it("POST: normal kısa notes → 201 (guard regresyon yapmaz)", async () => {
        mockDbCreatePurchaseOrder.mockResolvedValue({ id: "po-new", po_number: "PO-2026-0009" });
        const res = await listPOST(makeReq({
            vendor_id: "v-1",
            currency: "TRY",
            notes: "Acil — kalan stok için.",
            lines: [{ product_id: PID, quantity: 2, unit_price: 100, notes: "öncelikli" }],
        }) as unknown as Parameters<typeof listPOST>[0]);
        expect(res.status).toBe(201);
        expect(mockDbCreatePurchaseOrder).toHaveBeenCalledTimes(1);
    });

    it("PATCH: 10k+ notes → 400, dbPatchPurchaseOrder ÇAĞRILMAZ (draft PO)", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO); // draft
        const res = await detailPATCH(
            makeReq({ notes: LONG }) as unknown as Parameters<typeof detailPATCH>[0],
            makeParams("po-1"),
        );
        expect(res.status).toBe(400);
        expect(mockDbPatchPurchaseOrder).not.toHaveBeenCalled();
    });

    it("PUT lines: nested lines[].notes 10k+ → 400, dbReplacePurchaseOrderLines ÇAĞRILMAZ (draft PO)", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO); // draft
        const res = await linesPUT(
            makeReq({ lines: [{ product_id: PID, quantity: 1, unit_price: 50, notes: LONG }] }) as unknown as Parameters<typeof linesPUT>[0],
            makeParams("po-1"),
        );
        expect(res.status).toBe(400);
        expect(mockDbReplacePurchaseOrderLines).not.toHaveBeenCalled();
    });
});
