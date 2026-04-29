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

const mockDbCreateOrder = vi.fn();
const mockDbUpdateOrderQuoteDeadline = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:      (...args: unknown[]) => mockDbGetOrderById(...args),
    dbApproveOrder:      (...args: unknown[]) => mockDbApproveOrder(...args),
    dbShipOrderFull:     (...args: unknown[]) => mockDbShipOrderFull(...args),
    dbCancelOrder:       (...args: unknown[]) => mockDbCancelOrder(...args),
    dbUpdateOrderStatus: (...args: unknown[]) => mockDbUpdateOrderStatus(...args),
    dbLogOrderAction:    (...args: unknown[]) => mockDbLogOrderAction(...args),
    dbCreateOrder:       (...args: unknown[]) => mockDbCreateOrder(...args),
    dbListOrders:                 vi.fn().mockResolvedValue([]),
    dbListExpiredQuotes:          vi.fn(),
    dbUpdateOrderQuoteDeadline:   (...args: unknown[]) => mockDbUpdateOrderQuoteDeadline(...args),
}));

const mockDbBatchResolveAlerts = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert:        vi.fn(),
    dbListActiveAlerts:   vi.fn().mockResolvedValue([]),
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: (...args: unknown[]) => mockDbBatchResolveAlerts(...args),
}));

// Faz 11.1 preflight için müşteri/ürün lookup'ları default success
vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: vi.fn().mockResolvedValue({ id: "cust-1", tax_number: "1234567890" }),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: vi.fn().mockResolvedValue({ id: "prod-1", name: "Vana", sku: "VAN-001" }),
}));

const mockParasutUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockParasutUpdate   = vi.fn(() => ({ eq: mockParasutUpdateEq }));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: () => ({ update: mockParasutUpdate }) }),
}));

import { serviceTransitionOrder, validateOrderCreate, serviceListOrders, serviceGetOrder, serviceCreateOrder, serviceUpdateQuoteDeadline } from "@/lib/services/order-service";
import type { CreateOrderInput } from "@/lib/supabase/orders";

// ── Fixtures ──────────────────────────────────────────────────

const PENDING_ORDER = {
    id: "order-1",
    order_number: "ORD-2026-0001",
    customer_id: "cust-1",
    commercial_status: "pending_approval",
    fulfillment_status: "unallocated",
    lines: [],
};

const APPROVED_ORDER = {
    id: "order-1",
    order_number: "ORD-2026-0001",
    customer_id: "cust-1",
    commercial_status: "approved",
    fulfillment_status: "allocated",
    lines: [{ product_id: "prod-1", product_name: "Vana", quantity: 1 }],
};

const DRAFT_ORDER = {
    id: "order-1",
    order_number: "ORD-2026-0001",
    customer_id: "cust-1",
    commercial_status: "draft",
    fulfillment_status: "unallocated",
    lines: [],
};

// ── beforeEach ────────────────────────────────────────────────

beforeEach(() => {
    mockDbGetOrderById.mockReset();
    mockDbApproveOrder.mockReset();
    mockDbShipOrderFull.mockReset();
    mockDbCancelOrder.mockReset();
    mockDbUpdateOrderStatus.mockReset().mockResolvedValue(undefined);
    mockDbLogOrderAction.mockReset().mockResolvedValue(undefined);
    mockParasutUpdate.mockClear();
    mockParasutUpdateEq.mockClear();
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

    it("PARASUT_ENABLED=true + başarılı sevk → shipped_at + parasut_step='contact' DB'ye yazılır", async () => {
        const saved = process.env.PARASUT_ENABLED;
        process.env.PARASUT_ENABLED = "true";
        try {
            mockDbGetOrderById.mockResolvedValue(APPROVED_ORDER);
            mockDbShipOrderFull.mockResolvedValue({ success: true });
            await serviceTransitionOrder("order-1", "shipped");
            expect(mockParasutUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ parasut_step: "contact", shipped_at: expect.any(String) }),
            );
            expect(mockParasutUpdateEq).toHaveBeenCalledWith("id", "order-1");
        } finally {
            process.env.PARASUT_ENABLED = saved;
        }
    });

    it("PARASUT_ENABLED kapalıyken sevk → shipped_at yazılır, parasut_step yazılmaz (Faz 11.1)", async () => {
        const saved = process.env.PARASUT_ENABLED;
        process.env.PARASUT_ENABLED = "false";
        try {
            mockDbGetOrderById.mockResolvedValue(APPROVED_ORDER);
            mockDbShipOrderFull.mockResolvedValue({ success: true });
            await serviceTransitionOrder("order-1", "shipped");
            expect(mockParasutUpdate).toHaveBeenCalledTimes(1);
            const patch = mockParasutUpdate.mock.calls[0][0] as Record<string, unknown>;
            expect(patch.shipped_at).toBeTruthy();
            expect(patch).not.toHaveProperty("parasut_step");
        } finally {
            process.env.PARASUT_ENABLED = saved;
        }
    });

    it("PARASUT_ENABLED=true + sevk başarısız → parasut_step güncellenmez", async () => {
        const saved = process.env.PARASUT_ENABLED;
        process.env.PARASUT_ENABLED = "true";
        try {
            mockDbGetOrderById.mockResolvedValue(APPROVED_ORDER);
            mockDbShipOrderFull.mockResolvedValue({ success: false, error: "Stok yetersiz" });
            await serviceTransitionOrder("order-1", "shipped");
            expect(mockParasutUpdate).not.toHaveBeenCalled();
        } finally {
            process.env.PARASUT_ENABLED = saved;
        }
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

// ── serviceCreateOrder — invalid status guard ─────────────────

const validLine = { product_id: "prod-1", product_name: "Vana", quantity: 1, unit_price: 100, unit: "adet", line_total: 100 };
const validOrderInput = { customer_name: "Acme", lines: [validLine], grand_total: 120, commercial_status: "draft" as const };

describe("serviceCreateOrder — invalid commercial_status throws", () => {
    it("'approved' başlangıç statüsü → hata fırlatır (domain-rules §4.1)", async () => {
        await expect(
            serviceCreateOrder({ ...validOrderInput, commercial_status: "approved" as "draft" })
        ).rejects.toThrow(/Geçersiz başlangıç/i);
    });

    it("'draft' → dbCreateOrder çağrılır ve fulfillment_status eklenir", async () => {
        mockDbCreateOrder.mockResolvedValue({ id: "o-new", order_number: "ORD-001" });
        const result = await serviceCreateOrder(validOrderInput);
        expect(mockDbCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({ commercial_status: "draft", fulfillment_status: "unallocated" })
        );
        expect(result).toEqual({ id: "o-new", order_number: "ORD-001" });
    });
});

// ── serviceUpdateQuoteDeadline — alert resolve branch ────────

describe("serviceUpdateQuoteDeadline — quote_valid_until dalları", () => {
    beforeEach(() => {
        mockDbUpdateOrderQuoteDeadline.mockResolvedValue(undefined);
        mockDbBatchResolveAlerts.mockClear();
        mockDbBatchResolveAlerts.mockResolvedValue(0);
    });

    it("geçerli tarih (bugün veya ileri) → resolveQuoteExpiredAlerts çağrılır", async () => {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        await serviceUpdateQuoteDeadline("order-1", tomorrow);
        expect(mockDbBatchResolveAlerts).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: "quote_expired" })])
        );
    });

    it("geçmiş tarih → resolveQuoteExpiredAlerts çağrılmaz", async () => {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        await serviceUpdateQuoteDeadline("order-1", yesterday);
        expect(mockDbBatchResolveAlerts).not.toHaveBeenCalled();
    });

    it("null tarih → resolveQuoteExpiredAlerts çağrılmaz", async () => {
        await serviceUpdateQuoteDeadline("order-1", null);
        expect(mockDbBatchResolveAlerts).not.toHaveBeenCalled();
    });
});
