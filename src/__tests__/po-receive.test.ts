/**
 * Faz 5 — PO Mal Kabul: helper + API route + B1 tests (11 tests)
 *
 * Covers:
 *   dbReceivePurchaseOrderLines: RPC'ye doğru argümanlar geçer, hata propagation
 *   POST /api/purchase-orders/[id]/receive:
 *     - viewer → 403
 *     - PO bulunamazsa → 404
 *     - PO status draft iken → 409
 *     - qty=0 → 400
 *     - geçersiz UUID line_id → 400
 *     - purchaser → 200
 *     - revalidateTag çağrılır
 *   B1: dbGetIncomingQuantities — received_qty'den çıkarılır (çift sayım yok)
 *
 * Not: serviceReceivePOLines route düzeyinde mock edilmektedir; helper+RPC ise
 * `dbReceivePurchaseOrderLines` testleriyle ayrıca cover edilir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock (helper layer) ──────────────────────────────

const mockRpc    = vi.fn();
const mockFrom   = vi.fn();
const mockSelect = vi.fn();
const mockEq     = vi.fn();
const mockOrder  = vi.fn();
const mockSingle = vi.fn();

let _pendingResult: { data: unknown; error: unknown } = { data: [], error: null };
function setListResult(v: { data: unknown; error: unknown }) { _pendingResult = v; }

const makeChain = () => {
    const c: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(_pendingResult).then(resolve),
        catch: (reject: (e: unknown) => unknown) => Promise.resolve(_pendingResult).catch(reject),
    };
    c.select  = (_v?: unknown) => { mockSelect(_v); return c; };
    c.eq      = (_k: unknown, _v: unknown) => { mockEq(_k, _v); return c; };
    c.order   = (_v: unknown, _o?: unknown) => { mockOrder(_v, _o); return c; };
    c.single  = () => mockSingle();
    return c;
};

const mockSupabase = {
    from: (table: string) => { mockFrom(table); return makeChain(); },
    rpc:  (...args: unknown[]) => mockRpc(...args),
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => mockSupabase,
}));

// ── Route-level mocks (mock module interfaces, not raw Supabase) ──

const mockDbGetPurchaseOrderById = vi.fn();
const mockServiceReceivePOLines  = vi.fn();

vi.mock("@/lib/supabase/purchase-orders", async () => {
    const actual = await vi.importActual("@/lib/supabase/purchase-orders") as typeof import("@/lib/supabase/purchase-orders");
    return {
        ...actual,
        dbGetPurchaseOrderById: (...a: unknown[]) => mockDbGetPurchaseOrderById(...a),
    };
});

vi.mock("@/lib/services/purchase-order-service", async () => {
    const actual = await vi.importActual("@/lib/services/purchase-order-service") as typeof import("@/lib/services/purchase-order-service");
    return {
        ...actual,
        serviceReceivePOLines: (...a: unknown[]) => mockServiceReceivePOLines(...a),
    };
});

// ── Role guard mock ───────────────────────────────────────────

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    getCurrentUserRole: vi.fn().mockResolvedValue("purchaser"),
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

// ── Next.js mocks ─────────────────────────────────────────────

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
    revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
    unstable_cache: (_fn: () => unknown) => _fn,
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

// ── fetch mock (alert scan) ───────────────────────────────────

global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

// ── Imports ───────────────────────────────────────────────────

import { dbReceivePurchaseOrderLines } from "@/lib/supabase/purchase-orders";
import { POST } from "@/app/api/purchase-orders/[id]/receive/route";
import { NextRequest } from "next/server";
import { dbGetIncomingQuantities } from "@/lib/supabase/purchase-commitments";

// ── Fixtures ──────────────────────────────────────────────────

const VALID_PO_ID   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VALID_LINE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makePO(status = "confirmed") {
    return {
        id: VALID_PO_ID,
        po_number: "PO-2026-0001",
        vendor_id: "vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv",
        status,
        currency: "TRY",
        subtotal: 100,
        vat_rate: 0.2,
        vat_total: 20,
        grand_total: 120,
        notes: null,
        order_date: "2026-05-16",
        expected_date: "2026-06-01",
        sent_at: null,
        confirmed_at: null,
        cancelled_at: null,
        cancel_reason: null,
        created_by: null,
        created_at: "2026-05-16T00:00:00Z",
        updated_at: "2026-05-16T00:00:00Z",
        lines: [{ id: VALID_LINE_ID, po_id: VALID_PO_ID, product_id: "pppppppp-pppp-4ppp-8ppp-pppppppppppp", quantity: 10, received_qty: 0, unit_price: 10, discount_pct: 0, line_total: 100, notes: null }],
    };
}

function makeRequest(body: unknown) {
    return new NextRequest(`http://localhost/api/purchase-orders/${VALID_PO_ID}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function makeParams() {
    return { params: Promise.resolve({ id: VALID_PO_ID }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    _pendingResult = { data: [], error: null };
    // Varsayılan: purchaser yetkili
    mockRequireRole.mockResolvedValue(null);
    // Varsayılan: RPC başarılı
    mockRpc.mockResolvedValue({ error: null });
});

// ── Helper layer tests ────────────────────────────────────────

describe("dbReceivePurchaseOrderLines", () => {
    it("RPC'yi doğru argümanlarla çağırır", async () => {
        mockRpc.mockResolvedValueOnce({ error: null });
        await dbReceivePurchaseOrderLines(VALID_PO_ID, [{ line_id: VALID_LINE_ID, qty: 5 }], "test-user");
        expect(mockRpc).toHaveBeenCalledWith("receive_po_lines", {
            p_po_id: VALID_PO_ID,
            p_lines: [{ line_id: VALID_LINE_ID, qty: 5 }],
            p_actor: "test-user",
        });
    });

    it("RPC hatası throw olur", async () => {
        mockRpc.mockResolvedValueOnce({ error: { message: "Aşırı kabul" } });
        await expect(dbReceivePurchaseOrderLines(VALID_PO_ID, [{ line_id: VALID_LINE_ID, qty: 999 }], "test"))
            .rejects.toThrow("Aşırı kabul");
    });
});

// ── API route tests ───────────────────────────────────────────

describe("POST /api/purchase-orders/[id]/receive", () => {
    it("viewer → 403", async () => {
        const { NextResponse } = await import("next/server");
        mockRequireRole.mockResolvedValueOnce(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await POST(makeRequest({ lines: [{ line_id: VALID_LINE_ID, qty: 5 }] }), makeParams());
        expect(res.status).toBe(403);
    });

    it("PO bulunamazsa → 404", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValueOnce(null);
        const res = await POST(makeRequest({ lines: [{ line_id: VALID_LINE_ID, qty: 5 }] }), makeParams());
        expect(res.status).toBe(404);
    });

    it("PO status draft iken → 409", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValueOnce(makePO("draft"));
        const res = await POST(makeRequest({ lines: [{ line_id: VALID_LINE_ID, qty: 5 }] }), makeParams());
        expect(res.status).toBe(409);
    });

    it("qty=0 olan satır → 400", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValueOnce(makePO("confirmed"));
        const res = await POST(makeRequest({ lines: [{ line_id: VALID_LINE_ID, qty: 0 }] }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/pozitif/);
    });

    it("geçersiz UUID line_id → 400", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValueOnce(makePO("confirmed"));
        const res = await POST(makeRequest({ lines: [{ line_id: "not-a-uuid", qty: 5 }] }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/UUID/);
    });

    it("purchaser → 200 (başarılı kabul)", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValueOnce(makePO("confirmed"));
        mockServiceReceivePOLines.mockResolvedValueOnce({ id: VALID_PO_ID, status: "partially_received" });
        const res = await POST(makeRequest({ lines: [{ line_id: VALID_LINE_ID, qty: 5 }] }), makeParams());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("partially_received");
    });

    it("başarılı kabul sonrası revalidateTag çağrılır", async () => {
        mockDbGetPurchaseOrderById.mockResolvedValueOnce(makePO("confirmed"));
        mockServiceReceivePOLines.mockResolvedValueOnce({ id: VALID_PO_ID, status: "received" });
        await POST(makeRequest({ lines: [{ line_id: VALID_LINE_ID, qty: 10 }] }), makeParams());
        expect(mockRevalidateTag).toHaveBeenCalledWith("purchase-orders", "max");
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });
});

// ── B1: incoming çift sayım önleme ───────────────────────────

describe("B1 — dbGetIncomingQuantities çift sayım önleme", () => {
    it("received_qty=5 olan pending commitment → incoming=5 (10 değil)", async () => {
        setListResult({
            data: [
                { product_id: "prod-1", quantity: 10, received_qty: 5 },
            ],
            error: null,
        });
        const map = await dbGetIncomingQuantities();
        expect(map.get("prod-1")).toBe(5);
    });

    it("received_qty=quantity ise remaining=0 → map'e eklenmez", async () => {
        setListResult({
            data: [
                { product_id: "prod-2", quantity: 10, received_qty: 10 },
            ],
            error: null,
        });
        const map = await dbGetIncomingQuantities();
        expect(map.has("prod-2")).toBe(false);
    });
});
