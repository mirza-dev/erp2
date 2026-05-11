/**
 * Faz 3 — Purchase Orders: helper + DB layer tests (18 tests)
 *
 * Covers:
 *   VALID_PO_TRANSITIONS: terminal states + M1 revize + all keys present
 *   dbCreatePurchaseOrder: vendor pasif error, empty lines error, başarılı → {id, po_number}
 *   dbGetPurchaseOrderById: yok → null, var → po + lines
 *   dbListPurchaseOrders: returns array, filter
 *   dbReplacePurchaseOrderLines: error propagation, başarılı
 *   dbTransitionPurchaseOrder: invalid transition error, sent→draft sent_at=null
 *   dbPatchPurchaseOrder: updates & returns row
 *   dbGetIncomingQuantities (B1): uses quantity - received_qty, not raw quantity
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────

const mockRpc    = vi.fn();
const mockFrom   = vi.fn();
const mockSelect = vi.fn();
const mockEq     = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSingle = vi.fn();
const mockOrder  = vi.fn();

// Pending query result — set before each list-style query test
let _pendingResult: { data: unknown; error: unknown } = { data: [], error: null };
function setListResult(v: { data: unknown; error: unknown }) { _pendingResult = v; }

const makeChain = () => {
    // The chain is thenable so `await chain` resolves from `_pendingResult`
    const c: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(_pendingResult).then(resolve),
        catch: (reject: (e: unknown) => unknown) => Promise.resolve(_pendingResult).catch(reject),
    };
    c.select  = (_v?: unknown) => { mockSelect(_v); return c; };
    c.eq      = (_k: unknown, _v: unknown) => { mockEq(_k, _v); return c; };
    c.update  = (_v: unknown) => { mockUpdate(_v); return c; };
    c.insert  = (_v: unknown) => { mockInsert(_v); return c; };
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

import {
    VALID_PO_TRANSITIONS,
    dbListPurchaseOrders,
    dbGetPurchaseOrderById,
    dbCreatePurchaseOrder,
    dbReplacePurchaseOrderLines,
    dbTransitionPurchaseOrder,
    dbPatchPurchaseOrder,
} from "@/lib/supabase/purchase-orders";

import { dbGetIncomingQuantities } from "@/lib/supabase/purchase-commitments";

// ── Fixtures ──────────────────────────────────────────────────

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
};

const sampleLine = {
    id: "line-1",
    po_id: "po-1",
    product_id: "p-1",
    quantity: 10,
    unit_price: 100,
    discount_pct: 0,
    line_total: 1000,
    received_qty: 0,
    notes: null,
};

beforeEach(() => {
    vi.clearAllMocks();
});

// ── VALID_PO_TRANSITIONS ──────────────────────────────────────

describe("VALID_PO_TRANSITIONS", () => {
    it("tüm statuslar key olarak mevcut", () => {
        const keys = Object.keys(VALID_PO_TRANSITIONS);
        expect(keys).toContain("draft");
        expect(keys).toContain("sent");
        expect(keys).toContain("confirmed");
        expect(keys).toContain("partially_received");
        expect(keys).toContain("received");
        expect(keys).toContain("cancelled");
    });

    it("received ve cancelled terminal — boş dizi", () => {
        expect(VALID_PO_TRANSITIONS.received).toHaveLength(0);
        expect(VALID_PO_TRANSITIONS.cancelled).toHaveLength(0);
    });

    it("M1: sent → draft izinli (revize)", () => {
        expect(VALID_PO_TRANSITIONS.sent).toContain("draft");
    });

    it("draft → confirmed doğrudan izinli (sent atlayarak)", () => {
        expect(VALID_PO_TRANSITIONS.draft).toContain("confirmed");
    });
});

// ── dbListPurchaseOrders ──────────────────────────────────────

describe("dbListPurchaseOrders", () => {
    it("liste döner", async () => {
        setListResult({ data: [samplePO], error: null });
        const result = await dbListPurchaseOrders();
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe("po-1");
    });

    it("DB error → throws", async () => {
        setListResult({ data: null, error: { message: "DB error" } });
        await expect(dbListPurchaseOrders()).rejects.toThrow("DB error");
    });
});

// ── dbGetPurchaseOrderById ────────────────────────────────────

describe("dbGetPurchaseOrderById", () => {
    it("PO yok → null", async () => {
        mockSingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
        const result = await dbGetPurchaseOrderById("po-99");
        expect(result).toBeNull();
    });

    it("PO var → po + lines", async () => {
        mockSingle.mockResolvedValueOnce({ data: samplePO, error: null });
        setListResult({ data: [sampleLine], error: null });
        const result = await dbGetPurchaseOrderById("po-1");
        expect(result?.id).toBe("po-1");
        expect(result?.lines).toHaveLength(1);
    });
});

// ── dbCreatePurchaseOrder ─────────────────────────────────────

describe("dbCreatePurchaseOrder", () => {
    it("vendor pasif RPC error → throws", async () => {
        mockRpc.mockResolvedValueOnce({
            data: null,
            error: { message: "PO oluşturulamadı: vendor pasif veya bulunamadı" },
        });
        await expect(dbCreatePurchaseOrder({
            vendorId: "v-inactive",
            currency: "TRY",
            lines: [{ product_id: "p-1", quantity: 1, unit_price: 100 }],
        })).rejects.toThrow("vendor pasif");
    });

    it("başarılı → {id, po_number}", async () => {
        mockRpc.mockResolvedValueOnce({
            data: [{ po_id: "po-new", po_number: "PO-2026-0001" }],
            error: null,
        });
        const result = await dbCreatePurchaseOrder({
            vendorId: "v-1",
            currency: "TRY",
            lines: [{ product_id: "p-1", quantity: 5, unit_price: 200 }],
        });
        expect(result.id).toBe("po-new");
        expect(result.po_number).toBe("PO-2026-0001");
    });

    it("data boş → throws", async () => {
        mockRpc.mockResolvedValueOnce({ data: [], error: null });
        await expect(dbCreatePurchaseOrder({
            vendorId: "v-1",
            currency: "TRY",
            lines: [{ product_id: "p-1", quantity: 1, unit_price: 50 }],
        })).rejects.toThrow("PO oluşturulamadı");
    });
});

// ── dbReplacePurchaseOrderLines ───────────────────────────────

describe("dbReplacePurchaseOrderLines", () => {
    it("RPC error → throws", async () => {
        mockRpc.mockResolvedValueOnce({ error: { message: "PO line replace edilemez" } });
        await expect(dbReplacePurchaseOrderLines("po-1", [], "user-1"))
            .rejects.toThrow("PO line replace edilemez");
    });

    it("başarılı → resolve", async () => {
        mockRpc.mockResolvedValueOnce({ error: null });
        await expect(dbReplacePurchaseOrderLines("po-1", [
            { product_id: "p-1", quantity: 2, unit_price: 50 },
        ], "user-1")).resolves.toBeUndefined();
    });
});

// ── dbTransitionPurchaseOrder ─────────────────────────────────

describe("dbTransitionPurchaseOrder", () => {
    it("geçersiz geçiş → throws", async () => {
        mockSingle.mockResolvedValueOnce({ data: { status: "received" }, error: null });
        await expect(dbTransitionPurchaseOrder("po-1", "draft"))
            .rejects.toThrow("Geçersiz durum geçişi");
    });

    it("PO bulunamadı → throws", async () => {
        mockSingle.mockResolvedValueOnce({ data: null, error: null });
        await expect(dbTransitionPurchaseOrder("po-99", "sent"))
            .rejects.toThrow("bulunamadı");
    });
});

// ── dbPatchPurchaseOrder ──────────────────────────────────────

describe("dbPatchPurchaseOrder", () => {
    it("güncelleme döner", async () => {
        mockSingle.mockResolvedValueOnce({ data: { ...samplePO, notes: "updated" }, error: null });
        const result = await dbPatchPurchaseOrder("po-1", { notes: "updated" });
        expect(result.notes).toBe("updated");
    });
});

// ── dbGetIncomingQuantities (B1) ──────────────────────────────

describe("dbGetIncomingQuantities — B1 partial receive fix", () => {
    it("quantity - received_qty kullanır (kısmi kabul sonrası doğru incoming)", async () => {
        // qty=10, received=5 → incoming 5 olmalı (10 değil)
        setListResult({
            data: [
                { product_id: "p-1", quantity: 10, received_qty: 5 },
                { product_id: "p-2", quantity: 20, received_qty: 0 },
            ],
            error: null,
        });
        const result = await dbGetIncomingQuantities();
        expect(result.get("p-1")).toBe(5);    // 10 - 5 = 5
        expect(result.get("p-2")).toBe(20);   // 20 - 0 = 20
    });

    it("tam kabul (received_qty = quantity) → incoming 0", async () => {
        setListResult({
            data: [{ product_id: "p-1", quantity: 10, received_qty: 10 }],
            error: null,
        });
        const result = await dbGetIncomingQuantities();
        expect(result.get("p-1")).toBeUndefined();  // 0 remaining → map'te yok
    });
});
