/**
 * DR-5.1 — Stok Rezervasyon İnvariantı
 * domain-rules.md §5.1: Rezervasyon SADECE onaylı (approved) siparişlerde oluşur.
 * domain-rules.md §5.5: İptal veya sevkiyatta rezervasyon serbest bırakılır.
 *
 * Service layer'ın doğru Postgres RPC'yi çağırdığını doğrular.
 * Gerçek rezervasyon mutasyonları RPC içinde atomik olarak gerçekleşir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ───────────────────────────────────────────

const mockDbGetOrderById      = vi.fn();
const mockDbApproveOrder      = vi.fn();
const mockDbShipOrderFull     = vi.fn();
const mockDbCancelOrder       = vi.fn();
const mockDbUpdateOrderStatus = vi.fn();
const mockDbLogOrderAction    = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:             (...args: unknown[]) => mockDbGetOrderById(...args),
    dbApproveOrder:             (...args: unknown[]) => mockDbApproveOrder(...args),
    dbShipOrderFull:            (...args: unknown[]) => mockDbShipOrderFull(...args),
    dbCancelOrder:              (...args: unknown[]) => mockDbCancelOrder(...args),
    dbUpdateOrderStatus:        (...args: unknown[]) => mockDbUpdateOrderStatus(...args),
    dbLogOrderAction:           (...args: unknown[]) => mockDbLogOrderAction(...args),
    dbListExpiredQuotes:        vi.fn(),
    dbUpdateOrderQuoteDeadline: vi.fn(),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert:        vi.fn(),
    dbListActiveAlerts:   vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: vi.fn().mockResolvedValue(0),
}));

import { serviceTransitionOrder } from "@/lib/services/order-service";

// ── Fixtures ──────────────────────────────────────────────────

const DRAFT_ORDER = {
    id: "order-1",
    commercial_status: "draft",
    fulfillment_status: "unallocated",
};

const PENDING_ORDER = {
    id: "order-1",
    commercial_status: "pending_approval",
    fulfillment_status: "unallocated",
};

const APPROVED_ORDER = {
    id: "order-1",
    commercial_status: "approved",
    fulfillment_status: "allocated",
};

beforeEach(() => {
    mockDbGetOrderById.mockReset();
    mockDbApproveOrder.mockReset();
    mockDbShipOrderFull.mockReset();
    mockDbCancelOrder.mockReset();
    mockDbUpdateOrderStatus.mockReset();
    mockDbLogOrderAction.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────

describe("DR-5.1: Rezervasyon SADECE approved geçişte tetiklenir", () => {
    it("approved geçişi → approve_order_with_allocation RPC çağrılır", async () => {
        mockDbGetOrderById.mockResolvedValue(PENDING_ORDER);
        mockDbApproveOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "allocated",
            shortages: [],
        });

        await serviceTransitionOrder("order-1", "approved");

        expect(mockDbApproveOrder).toHaveBeenCalledTimes(1);
        expect(mockDbApproveOrder).toHaveBeenCalledWith("order-1");
    });

    it("pending_approval geçişi → rezervasyon RPC çağrılmaz, sadece status güncellenir", async () => {
        mockDbGetOrderById.mockResolvedValue(DRAFT_ORDER);
        mockDbUpdateOrderStatus.mockResolvedValue({});
        mockDbLogOrderAction.mockResolvedValue({});

        await serviceTransitionOrder("order-1", "pending_approval");

        expect(mockDbApproveOrder).not.toHaveBeenCalled();
        expect(mockDbShipOrderFull).not.toHaveBeenCalled();
        expect(mockDbUpdateOrderStatus).toHaveBeenCalledTimes(1);
    });
});

describe("DR-5.5: Sevkiyatta on_hand düşer, reserved sıfırlanır", () => {
    it("shipped geçişi → ship_order_full RPC çağrılır (on_hand azaltır + reserved serbest bırakır)", async () => {
        mockDbGetOrderById.mockResolvedValue(APPROVED_ORDER);
        mockDbShipOrderFull.mockResolvedValue({ success: true });

        await serviceTransitionOrder("order-1", "shipped");

        expect(mockDbShipOrderFull).toHaveBeenCalledTimes(1);
        expect(mockDbShipOrderFull).toHaveBeenCalledWith("order-1");
        expect(mockDbApproveOrder).not.toHaveBeenCalled();
    });

    it("shipped sonrası success:true döner", async () => {
        mockDbGetOrderById.mockResolvedValue(APPROVED_ORDER);
        mockDbShipOrderFull.mockResolvedValue({ success: true });

        const result = await serviceTransitionOrder("order-1", "shipped");

        expect(result.success).toBe(true);
    });
});

describe("DR-5.5: İptalde rezervasyon serbest bırakılır", () => {
    it("cancelled geçişi → cancel_order RPC çağrılır (rezervasyonu serbest bırakır)", async () => {
        mockDbCancelOrder.mockResolvedValue({ success: true });

        await serviceTransitionOrder("order-1", "cancelled");

        expect(mockDbCancelOrder).toHaveBeenCalledTimes(1);
        expect(mockDbCancelOrder).toHaveBeenCalledWith("order-1");
        expect(mockDbApproveOrder).not.toHaveBeenCalled();
        expect(mockDbShipOrderFull).not.toHaveBeenCalled();
    });

    it("cancelled sonucu başarılı döner", async () => {
        mockDbCancelOrder.mockResolvedValue({ success: true });

        const result = await serviceTransitionOrder("order-1", "cancelled");

        expect(result.success).toBe(true);
    });

    it("cancel RPC başarısız olursa hata iletilir", async () => {
        mockDbCancelOrder.mockResolvedValue({
            success: false,
            error: "Sipariş zaten iptal edilmiş.",
        });

        const result = await serviceTransitionOrder("order-1", "cancelled");

        expect(result.success).toBe(false);
        expect(result.error).toContain("iptal");
    });
});
