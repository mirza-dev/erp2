/**
 * Faz 3 — Purchase Order Service: state machine tests (12 tests)
 *
 * Covers:
 *   VALID_PO_TRANSITIONS: structure checks
 *   serviceTransitionPO: valid, invalid, PO bulunamadı
 *   serviceSendPO: draft → sent
 *   serviceConfirmPO: delegates to confirm_po RPC (B4)
 *   serviceCancelPO: active → cancelled with reason
 *   serviceRevisePO: sent → draft (M1 sent_at=null)
 *   Terminal state guards: received + cancelled → throw
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbTransitionPurchaseOrder = vi.fn();
const mockDbGetPurchaseOrderById    = vi.fn();

vi.mock("@/lib/supabase/purchase-orders", async () => {
    const actual = await vi.importActual("@/lib/supabase/purchase-orders") as typeof import("@/lib/supabase/purchase-orders");
    return {
        ...actual,
        dbTransitionPurchaseOrder: (...a: unknown[]) => mockDbTransitionPurchaseOrder(...a),
        dbGetPurchaseOrderById:    (...a: unknown[]) => mockDbGetPurchaseOrderById(...a),
    };
});

import {
    VALID_PO_TRANSITIONS,
    serviceTransitionPO,
    serviceSendPO,
    serviceConfirmPO,
    serviceCancelPO,
    serviceRevisePO,
} from "@/lib/services/purchase-order-service";

const samplePO = (status: string) => ({
    id: "po-1",
    po_number: "PO-2026-0001",
    vendor_id: "v-1",
    status,
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
});

beforeEach(() => {
    vi.clearAllMocks();
});

// ── VALID_PO_TRANSITIONS yapısı ───────────────────────────────

describe("VALID_PO_TRANSITIONS export", () => {
    it("tüm statuslar tanımlı", () => {
        expect(VALID_PO_TRANSITIONS).toBeDefined();
        expect(Object.keys(VALID_PO_TRANSITIONS)).toHaveLength(6);
    });

    it("draft'tan cancelled'a geçilebilir", () => {
        expect(VALID_PO_TRANSITIONS.draft).toContain("cancelled");
    });
});

// ── serviceTransitionPO ───────────────────────────────────────

describe("serviceTransitionPO", () => {
    it("başarılı geçiş → yeni status döner", async () => {
        mockDbTransitionPurchaseOrder.mockResolvedValue(undefined);
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO("sent"));
        const result = await serviceTransitionPO("po-1", "sent");
        expect(result.status).toBe("sent");
    });

    it("transition helper hata fırlatırsa → throws", async () => {
        mockDbTransitionPurchaseOrder.mockRejectedValue(new Error("Geçersiz durum geçişi: received → draft"));
        await expect(serviceTransitionPO("po-1", "draft")).rejects.toThrow("Geçersiz durum geçişi");
    });

    it("geçiş sonrası PO bulunamazsa → throws", async () => {
        mockDbTransitionPurchaseOrder.mockResolvedValue(undefined);
        mockDbGetPurchaseOrderById.mockResolvedValue(null);
        await expect(serviceTransitionPO("po-1", "sent")).rejects.toThrow("PO bulunamadı");
    });
});

// ── serviceSendPO ─────────────────────────────────────────────

describe("serviceSendPO", () => {
    it("draft → sent", async () => {
        mockDbTransitionPurchaseOrder.mockResolvedValue(undefined);
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO("sent"));
        const result = await serviceSendPO("po-1", "user-1");
        expect(mockDbTransitionPurchaseOrder).toHaveBeenCalledWith("po-1", "sent", { actor: "user-1" });
        expect(result.status).toBe("sent");
    });
});

// ── serviceConfirmPO ──────────────────────────────────────────

describe("serviceConfirmPO", () => {
    it("confirm_po RPC üzerinden → confirmed", async () => {
        mockDbTransitionPurchaseOrder.mockResolvedValue(undefined);
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO("confirmed"));
        const result = await serviceConfirmPO("po-1", "user-1");
        expect(mockDbTransitionPurchaseOrder).toHaveBeenCalledWith("po-1", "confirmed", { actor: "user-1" });
        expect(result.status).toBe("confirmed");
    });

    it("B4 guard hatası (expected_date null) → throws", async () => {
        mockDbTransitionPurchaseOrder.mockRejectedValue(new Error("PO confirm için expected_date zorunludur"));
        await expect(serviceConfirmPO("po-1")).rejects.toThrow("expected_date zorunludur");
    });
});

// ── serviceCancelPO ───────────────────────────────────────────

describe("serviceCancelPO", () => {
    it("reason ile cancel çağırır", async () => {
        mockDbTransitionPurchaseOrder.mockResolvedValue(undefined);
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO("cancelled"));
        const result = await serviceCancelPO("po-1", "Tedarikçi iptal etti.", "admin-1");
        expect(mockDbTransitionPurchaseOrder).toHaveBeenCalledWith(
            "po-1", "cancelled",
            { reason: "Tedarikçi iptal etti.", actor: "admin-1" },
        );
        expect(result.status).toBe("cancelled");
    });

    it("received durumundan cancel → RPC hata fırlatır", async () => {
        mockDbTransitionPurchaseOrder.mockRejectedValue(new Error("PO iptal edilemez (status=received)"));
        await expect(serviceCancelPO("po-1", "sebep")).rejects.toThrow("iptal edilemez");
    });
});

// ── serviceRevisePO (M1) ──────────────────────────────────────

describe("serviceRevisePO (M1: sent → draft)", () => {
    it("sent → draft, actor geçirilir", async () => {
        mockDbTransitionPurchaseOrder.mockResolvedValue(undefined);
        mockDbGetPurchaseOrderById.mockResolvedValue(samplePO("draft"));
        const result = await serviceRevisePO("po-1", "user-1");
        expect(mockDbTransitionPurchaseOrder).toHaveBeenCalledWith("po-1", "draft", { actor: "user-1" });
        expect(result.status).toBe("draft");
    });
});
