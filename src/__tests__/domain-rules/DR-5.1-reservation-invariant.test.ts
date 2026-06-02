/**
 * DR-5.1 — Stok Rezervasyon İnvariantı (migration 082)
 * domain-rules.md §5.1: Hard reservation "Onaya Gönder" (draft → pending_approval)
 * geçişinde oluşur ve sonrasında korunur. (Eski sürümde yalnız approved'daydı.)
 * domain-rules.md §5.4/§5.5: İptal veya sevkiyatta rezervasyon serbest bırakılır.
 *
 * Service layer'ın doğru Postgres RPC'yi çağırdığını doğrular.
 * Gerçek rezervasyon mutasyonları RPC içinde atomik olarak gerçekleşir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ───────────────────────────────────────────

const mockDbGetOrderById      = vi.fn();
const mockDbSubmitOrderForApproval = vi.fn();
const mockDbApproveOrder      = vi.fn();
const mockDbShipOrderFull     = vi.fn();
const mockDbCancelOrder       = vi.fn();
const mockDbUpdateOrderStatus = vi.fn();
const mockDbLogOrderAction    = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:             (...args: unknown[]) => mockDbGetOrderById(...args),
    dbSubmitOrderForApproval:   (...args: unknown[]) => mockDbSubmitOrderForApproval(...args),
    dbApproveOrder:             (...args: unknown[]) => mockDbApproveOrder(...args),
    dbShipOrderFull:            (...args: unknown[]) => mockDbShipOrderFull(...args),
    dbCancelOrder:              (...args: unknown[]) => mockDbCancelOrder(...args),
    dbUpdateOrderStatus:        (...args: unknown[]) => mockDbUpdateOrderStatus(...args),
    dbLogOrderAction:           (...args: unknown[]) => mockDbLogOrderAction(...args),
    dbListExpiredQuotes:        vi.fn(),
    dbUpdateOrderQuoteDeadline: vi.fn(),
}));

// Fire-and-forget e-posta — gerçek çağrı yapma
vi.mock("@/lib/services/email-service", () => ({
    notifyUsersByEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert:        vi.fn(),
    dbListActiveAlerts:   vi.fn().mockResolvedValue([]),
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: vi.fn().mockResolvedValue(0),
}));

// Faz 11.1 preflight için müşteri/ürün lookup'ları (Paraşüt off → bunlar çağrılmaz; on senaryosu için default success)
vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: vi.fn().mockResolvedValue({ id: "cust-1", tax_number: "1234567890" }),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: vi.fn().mockResolvedValue({ id: "prod-1", name: "Vana", sku: "VAN-001" }),
}));

// Service client (parasut_step yazımı için)
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({ update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }),
    }),
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
    order_number: "ORD-2026-0001",
    customer_id: "cust-1",
    commercial_status: "approved",
    fulfillment_status: "allocated",
    lines: [{ product_id: "prod-1", product_name: "Vana", quantity: 1 }],
};

beforeEach(() => {
    mockDbGetOrderById.mockReset();
    mockDbSubmitOrderForApproval.mockReset();
    mockDbApproveOrder.mockReset();
    mockDbShipOrderFull.mockReset();
    mockDbCancelOrder.mockReset();
    mockDbUpdateOrderStatus.mockReset();
    mockDbLogOrderAction.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────

describe("DR-5.1: Rezervasyon 'Onaya Gönder' (draft→pending_approval) geçişinde tetiklenir", () => {
    it("pending_approval geçişi → submit_order_for_approval RPC (HARD rezervasyon)", async () => {
        mockDbGetOrderById.mockResolvedValue(DRAFT_ORDER);
        mockDbSubmitOrderForApproval.mockResolvedValue({
            success: true,
            fulfillment_status: "allocated",
            shortages: [],
        });

        await serviceTransitionOrder("order-1", "pending_approval");

        expect(mockDbSubmitOrderForApproval).toHaveBeenCalledTimes(1);
        expect(mockDbSubmitOrderForApproval).toHaveBeenCalledWith("order-1");
        expect(mockDbApproveOrder).not.toHaveBeenCalled();
    });

    it("approved geçişi → light approve_order RPC (rezervasyon zaten yapıldı)", async () => {
        mockDbGetOrderById.mockResolvedValue(PENDING_ORDER);
        mockDbApproveOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "allocated",
            shortages: [],
        });

        await serviceTransitionOrder("order-1", "approved");

        expect(mockDbApproveOrder).toHaveBeenCalledTimes(1);
        expect(mockDbApproveOrder).toHaveBeenCalledWith("order-1");
        expect(mockDbSubmitOrderForApproval).not.toHaveBeenCalled();
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
