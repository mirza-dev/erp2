/**
 * Tests for serviceTransitionOrder and validateOrderCreate
 * (src/lib/services/order-service.ts).
 *
 * All Supabase DB calls are mocked at the orders module boundary.
 * Covers service-layer handling of 007 RPC response shapes:
 *   - approve_order_with_allocation: full / partial / zero-stock
 *   - ship_order_full: success / RPC error
 *   - cancel_order: success / RPC error
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ───────────────────────────────────────────

const mockDbGetOrderById    = vi.fn();
const mockDbApproveOrder    = vi.fn();
const mockDbShipOrderFull   = vi.fn();
const mockDbCancelOrder     = vi.fn();
const mockDbUpdateOrderStatus = vi.fn();
const mockDbLogOrderAction  = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:      (...args: unknown[]) => mockDbGetOrderById(...args),
    dbApproveOrder:      (...args: unknown[]) => mockDbApproveOrder(...args),
    dbShipOrderFull:     (...args: unknown[]) => mockDbShipOrderFull(...args),
    dbCancelOrder:       (...args: unknown[]) => mockDbCancelOrder(...args),
    dbUpdateOrderStatus: (...args: unknown[]) => mockDbUpdateOrderStatus(...args),
    dbLogOrderAction:    (...args: unknown[]) => mockDbLogOrderAction(...args),
    dbListOrders:                 vi.fn().mockResolvedValue([]),
    dbListExpiredQuotes:          vi.fn(),
    dbUpdateOrderQuoteDeadline:   vi.fn(),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert:        vi.fn(),
    dbListActiveAlerts:   vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: vi.fn().mockResolvedValue(0),
}));

import { serviceTransitionOrder, validateOrderCreate, serviceListOrders, serviceGetOrder } from "@/lib/services/order-service";
import type { CreateOrderInput } from "@/lib/supabase/orders";

// ── Fixtures ──────────────────────────────────────────────────

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

const DRAFT_ORDER = {
    id: "order-1",
    commercial_status: "draft",
    fulfillment_status: "unallocated",
};

// ── beforeEach ────────────────────────────────────────────────

beforeEach(() => {
    mockDbGetOrderById.mockReset();
    mockDbApproveOrder.mockReset();
    mockDbShipOrderFull.mockReset();
    mockDbCancelOrder.mockReset();
    mockDbUpdateOrderStatus.mockReset().mockResolvedValue(undefined);
    mockDbLogOrderAction.mockReset().mockResolvedValue(undefined);
});

// ── approve — 007 RPC response shapes ────────────────────────

describe("serviceTransitionOrder — approve (007 RPC davranışı)", () => {
    beforeEach(() => {
        mockDbGetOrderById.mockResolvedValue(PENDING_ORDER);
    });

    it("tam stok: RPC başarılı → success:true, fulfillment_status:'allocated'", async () => {
        mockDbApproveOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "allocated",
            shortages: [],
        });
        const result = await serviceTransitionOrder("order-1", "approved");
        expect(result.success).toBe(true);
        expect(result.fulfillment_status).toBe("allocated");
        expect(result.shortages).toEqual([]);
    });

    it("kısmi stok: RPC → success:true, fulfillment_status:'partially_allocated', shortages dolu", async () => {
        const shortages = [{ product_name: "Vana DN25", requested: 10, reserved: 3, shortage: 7 }];
        mockDbApproveOrder.mockResolvedValue({
            success: true,
            fulfillment_status: "partially_allocated",
            shortages,
        });
        const result = await serviceTransitionOrder("order-1", "approved");
        expect(result.success).toBe(true);
        expect(result.fulfillment_status).toBe("partially_allocated");
        expect(result.shortages).toHaveLength(1);
        expect(result.shortages![0].product_name).toBe("Vana DN25");
    });

    it("zero-stock guard (007): RPC → success:false, error iletilir", async () => {
        mockDbApproveOrder.mockResolvedValue({
            success: false,
            error: "Hiç stok rezerve edilemedi. Sipariş onaylanamaz.",
        });
        const result = await serviceTransitionOrder("order-1", "approved");
        expect(result.success).toBe(false);
        expect(result.error).toContain("rezerve");
    });

    it("sipariş bulunamadı → success:false", async () => {
        mockDbGetOrderById.mockResolvedValue(null);
        const result = await serviceTransitionOrder("order-1", "approved");
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it("draft sipariş onaylanamaz — service pre-check, dbApproveOrder çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(DRAFT_ORDER);
        const result = await serviceTransitionOrder("order-1", "approved");
        expect(result.success).toBe(false);
        expect(mockDbApproveOrder).not.toHaveBeenCalled();
    });
});

// ── ship — 007 fulfillment guard ─────────────────────────────

describe("serviceTransitionOrder — ship (007 fulfillment guard)", () => {
    it("onaylı sipariş → dbShipOrderFull çağrılır, success:true", async () => {
        mockDbGetOrderById.mockResolvedValue(APPROVED_ORDER);
        mockDbShipOrderFull.mockResolvedValue({ success: true });
        const result = await serviceTransitionOrder("order-1", "shipped");
        expect(mockDbShipOrderFull).toHaveBeenCalledWith("order-1");
        expect(result.success).toBe(true);
    });

    it("RPC hata dönerse (kısmi stok, fully_allocated değil) → success:false, error iletilir", async () => {
        mockDbGetOrderById.mockResolvedValue(APPROVED_ORDER);
        mockDbShipOrderFull.mockResolvedValue({
            success: false,
            error: "Sipariş tam olarak ayrılmamış. Sevk edilemez.",
        });
        const result = await serviceTransitionOrder("order-1", "shipped");
        expect(result.success).toBe(false);
        expect(result.error).toContain("Sevk");
    });

    it("onaylı olmayan sipariş → service pre-check, dbShipOrderFull çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(DRAFT_ORDER);
        const result = await serviceTransitionOrder("order-1", "shipped");
        expect(result.success).toBe(false);
        expect(mockDbShipOrderFull).not.toHaveBeenCalled();
    });
});

// ── cancel — 007 cancel guard ─────────────────────────────────

describe("serviceTransitionOrder — cancel (007 cancel guard)", () => {
    it("RPC başarılı → success:true", async () => {
        mockDbCancelOrder.mockResolvedValue({ success: true });
        const result = await serviceTransitionOrder("order-1", "cancelled");
        expect(result.success).toBe(true);
    });

    it("RPC hata dönerse (already shipped) → success:false, error iletilir", async () => {
        mockDbCancelOrder.mockResolvedValue({
            success: false,
            error: "Sevk edilmiş sipariş iptal edilemez.",
        });
        const result = await serviceTransitionOrder("order-1", "cancelled");
        expect(result.success).toBe(false);
        expect(result.error).toContain("iptal");
    });
});

// ── unknown transition ────────────────────────────────────────

describe("serviceTransitionOrder — bilinmeyen geçiş", () => {
    it("geçersiz transition → success:false, error mesajı", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await serviceTransitionOrder("order-1", "unknown_state" as any);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Bilinmeyen");
    });
});

// ── validateOrderCreate — pure function ───────────────────────

describe("validateOrderCreate", () => {
    const validInput: CreateOrderInput = {
        customer_id: "c1",
        customer_name: "Acme Ltd",
        currency: "USD",
        commercial_status: "draft",
        fulfillment_status: "unallocated",
        subtotal: 1000,
        vat_total: 200,
        grand_total: 1200,
        lines: [{
            product_id: "p1",
            product_name: "Vana DN25",
            product_sku: "VD-25",
            unit: "adet",
            quantity: 5,
            unit_price: 200,
            discount_pct: 0,
            line_total: 1000,
        }],
    };

    it("tüm alanlar geçerli → { valid: true, errors: [] }", () => {
        const result = validateOrderCreate(validInput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("müşteri adı boş → hata", () => {
        const result = validateOrderCreate({ ...validInput, customer_name: "" });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("Müşteri"))).toBe(true);
    });

    it("lines boş → hata", () => {
        const result = validateOrderCreate({ ...validInput, lines: [] });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("satır"))).toBe(true);
    });

    it("grand_total ≤ 0 → hata", () => {
        const result = validateOrderCreate({ ...validInput, grand_total: 0 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("tutar"))).toBe(true);
    });

    it("satırda quantity ≤ 0 → hata", () => {
        const badLine = { ...validInput.lines[0], quantity: 0 };
        const result = validateOrderCreate({ ...validInput, lines: [badLine] });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("Miktar"))).toBe(true);
    });

    it("birden fazla hata → tümü errors dizisinde birikir", () => {
        const result = validateOrderCreate({
            ...validInput,
            customer_name: "",
            lines: [],
            grand_total: -1,
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it("quote_valid_until geçmiş tarih → hata", () => {
        const result = validateOrderCreate({ ...validInput, quote_valid_until: "2020-01-01" });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("geçerlilik tarihi"))).toBe(true);
    });

    it("quote_valid_until bugün veya gelecek → geçerli", () => {
        const today = new Date().toISOString().slice(0, 10);
        const result = validateOrderCreate({ ...validInput, quote_valid_until: today });
        expect(result.valid).toBe(true);
    });

    it("quote_valid_until yok → geçerli (süresiz teklif)", () => {
        const result = validateOrderCreate({ ...validInput, quote_valid_until: undefined });
        expect(result.valid).toBe(true);
    });
});

// ── CRUD passthroughs ─────────────────────────────────────────

describe("serviceListOrders — passthrough to dbListOrders", () => {
    it("filtre ile çağrıldığında dizi döner", async () => {
        const result = await serviceListOrders({ commercial_status: "approved" });
        expect(Array.isArray(result)).toBe(true);
    });
});

describe("serviceGetOrder — passthrough to dbGetOrderById", () => {
    it("id ile çağrıldığında dbGetOrderById sonucunu döner", async () => {
        const order = { id: "o1", commercial_status: "draft" };
        mockDbGetOrderById.mockResolvedValue(order);

        const result = await serviceGetOrder("o1");

        expect(mockDbGetOrderById).toHaveBeenCalledWith("o1");
        expect(result).toEqual(order);
    });
});
