/**
 * DR-4 — Çift Eksen Bağımsızlığı
 * domain-rules.md §4: commercial_status + fulfillment_status bağımsız eksenlerdir.
 * domain-rules.md §4.3: İzin verilen commercial geçişler tablosu.
 * domain-rules.md §17: Dual-axis model özet.
 *
 * Kural: commercial_status değişikliği fulfillment_status'u ezmez (ve tersi).
 * Her eksen kendi RPC'sinde güncellenir; service layer bunları karıştırmaz.
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
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: vi.fn().mockResolvedValue(0),
}));

import { serviceTransitionOrder } from "@/lib/services/order-service";

// ── Fixtures ──────────────────────────────────────────────────

const PENDING_UNALLOCATED = {
    id: "order-1",
    commercial_status: "pending_approval",
    fulfillment_status: "unallocated",
};

const PENDING_PARTIALLY = {
    id: "order-1",
    commercial_status: "pending_approval",
    fulfillment_status: "partially_allocated",
};

const APPROVED_ALLOCATED = {
    id: "order-1",
    commercial_status: "approved",
    fulfillment_status: "allocated",
};

const DRAFT_ORDER = {
    id: "order-1",
    commercial_status: "draft",
    fulfillment_status: "unallocated",
};

const CANCELLED_ORDER = {
    id: "order-1",
    commercial_status: "cancelled",
    fulfillment_status: "unallocated",
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

describe("DR-4: approved geçişi fulfillment_status'u RPC'den alır, service override etmez", () => {
    it("kısmi stok senaryosu: fulfillment_status = 'partially_allocated' korunur", async () => {
        mockDbGetOrderById.mockResolvedValue(PENDING_UNALLOCATED);
        mockDbApproveOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "partially_allocated",
            shortages: [{ product_name: "Vana A", requested: 100, reserved: 60, shortage: 40 }],
        });

        const result = await serviceTransitionOrder("order-1", "approved");

        expect(result.success).toBe(true);
        // fulfillment_status RPC'nin döndürdüğü değerdir — service layer override etmez
        expect(result.fulfillment_status).toBe("partially_allocated");
        expect(result.shortages).toHaveLength(1);
    });

    it("tam stok senaryosu: fulfillment_status = 'allocated' korunur", async () => {
        mockDbGetOrderById.mockResolvedValue(PENDING_UNALLOCATED);
        mockDbApproveOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "allocated",
            shortages: [],
        });

        const result = await serviceTransitionOrder("order-1", "approved");

        expect(result.fulfillment_status).toBe("allocated");
        expect(result.shortages).toHaveLength(0);
    });

    it("pending_approval ile farklı fulfillment_status → onay sonucu fulfillment değişmez (RPC belirler)", async () => {
        mockDbGetOrderById.mockResolvedValue(PENDING_PARTIALLY);
        mockDbApproveOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "partially_allocated",
            shortages: [],
        });

        const result = await serviceTransitionOrder("order-1", "approved");

        // Başlangıçta partially_allocated, sonuç da partially_allocated — karıştırılmadı
        expect(result.fulfillment_status).toBe("partially_allocated");
    });
});

describe("DR-4: cancelled geçişi fulfillment eksenini service'te güncellemez", () => {
    it("cancelled dönüşünde fulfillment_status alanı gelmez (sadece RPC içinde temizlenir)", async () => {
        mockDbCancelOrder.mockResolvedValue({ success: true });

        const result = await serviceTransitionOrder("order-1", "cancelled");

        expect(result.success).toBe(true);
        // Service layer fulfillment_status dönmez — RPC'ye bırakır
        expect(result.fulfillment_status).toBeUndefined();
    });
});

describe("DR-4.3: Geçersiz commercial geçişler reddedilir", () => {
    it("approved → pending_approval geçersiz (§4.3 tablosu)", async () => {
        mockDbGetOrderById.mockResolvedValue(APPROVED_ALLOCATED);

        const result = await serviceTransitionOrder("order-1", "pending_approval");

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it("draft → approved geçersiz (pending_approval atlanamaz)", async () => {
        mockDbGetOrderById.mockResolvedValue(DRAFT_ORDER);

        const result = await serviceTransitionOrder("order-1", "approved");

        expect(result.success).toBe(false);
    });

    it("cancelled → approved geçersiz (iptal geri alınamaz)", async () => {
        mockDbGetOrderById.mockResolvedValue(CANCELLED_ORDER);

        const result = await serviceTransitionOrder("order-1", "approved");

        expect(result.success).toBe(false);
    });

    it("cancelled → shipped geçersiz (commercial_status 'approved' olmak zorunda)", async () => {
        mockDbGetOrderById.mockResolvedValue(CANCELLED_ORDER);

        const result = await serviceTransitionOrder("order-1", "shipped");

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });
});

describe("DR-4: approved → cancelled geçerli (sevk edilmemişse)", () => {
    it("approved sipariş iptal edilebilir", async () => {
        mockDbCancelOrder.mockResolvedValue({ success: true });

        const result = await serviceTransitionOrder("order-1", "cancelled");

        expect(result.success).toBe(true);
    });
});
