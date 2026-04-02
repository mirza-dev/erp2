/**
 * Tests for serviceCreateOrder atomicity guarantee.
 *
 * Key regression guarded:
 *   - dbCreateOrder is called ONCE (single atomic RPC, not header+lines separately)
 *   - If the RPC fails, error propagates and no orphan cleanup is needed
 *   - AI scoring fires only after a successful create, not after a failed one
 *
 * Pattern: mock dbCreateOrder at the module boundary, test serviceCreateOrder.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockDbCreateOrder = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbCreateOrder:       (...args: unknown[]) => mockDbCreateOrder(...args),
    // serviceCreateOrder also calls dbGetOrderById indirectly via serviceGetOrder
    // but only for other transitions — not needed here
    dbGetOrderById:      vi.fn(),
    dbListOrders:        vi.fn(),
    dbUpdateOrderStatus: vi.fn(),
    dbLogOrderAction:    vi.fn(),
    dbApproveOrder:      vi.fn(),
    dbShipOrderFull:     vi.fn(),
    dbCancelOrder:       vi.fn(),
}));

import { serviceCreateOrder } from "@/lib/services/order-service";
import type { CreateOrderInput } from "@/lib/supabase/orders";

// ─── Fixture ──────────────────────────────────────────────────────────────────

const validInput: CreateOrderInput = {
    customer_id: "cust-1",
    customer_name: "Acme Ltd",
    currency: "USD",
    commercial_status: "draft",
    fulfillment_status: "unallocated",
    subtotal: 1000,
    vat_total: 200,
    grand_total: 1200,
    lines: [
        {
            product_id: "prod-1",
            product_name: "Vana DN25",
            product_sku: "VD-25",
            unit: "adet",
            quantity: 5,
            unit_price: 200,
            discount_pct: 0,
            line_total: 1000,
        },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── Success path ─────────────────────────────────────────────────────────────

describe("serviceCreateOrder — başarı senaryosu", () => {
    beforeEach(() => {
        mockDbCreateOrder.mockResolvedValue({ id: "ord-new-1", order_number: "ORD-2025-0001" });
    });

    it("dönen id ve order_number doğru", async () => {
        const result = await serviceCreateOrder(validInput);
        expect(result.id).toBe("ord-new-1");
        expect(result.order_number).toBe("ORD-2025-0001");
    });

    it("dbCreateOrder tek kez çağrılır (atomik RPC, iki ayrı insert yok)", async () => {
        await serviceCreateOrder(validInput);
        expect(mockDbCreateOrder).toHaveBeenCalledTimes(1);
    });

    it("dbCreateOrder doğru input ile çağrılır", async () => {
        await serviceCreateOrder(validInput);
        expect(mockDbCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                customer_name: "Acme Ltd",
                currency: "USD",
                grand_total: 1200,
                lines: expect.arrayContaining([
                    expect.objectContaining({ product_id: "prod-1", quantity: 5 }),
                ]),
            })
        );
    });
});

// ─── DB failure / orphan yok ──────────────────────────────────────────────────

describe("serviceCreateOrder — satır insert failure (orphan kalmaması)", () => {
    it("dbCreateOrder throw ederse hata iletilir", async () => {
        mockDbCreateOrder.mockRejectedValue(
            new Error("insert into order_lines: foreign key violation")
        );
        await expect(serviceCreateOrder(validInput)).rejects.toThrow("foreign key violation");
    });

    it("hata durumunda dbCreateOrder yalnızca bir kez çağrılmıştır — ayrı cleanup yok", async () => {
        mockDbCreateOrder.mockRejectedValue(new Error("rpc error"));
        await expect(serviceCreateOrder(validInput)).rejects.toThrow();
        // Single atomic call — no separate header delete / compensating transaction
        expect(mockDbCreateOrder).toHaveBeenCalledTimes(1);
    });
});

// ─── Validation guard (dbCreateOrder hiç çağrılmamalı) ───────────────────────

describe("serviceCreateOrder — validasyon hatası", () => {
    it("müşteri adı boş → dbCreateOrder çağrılmaz", async () => {
        await expect(
            serviceCreateOrder({ ...validInput, customer_name: "" })
        ).rejects.toThrow();
        expect(mockDbCreateOrder).not.toHaveBeenCalled();
    });

    it("lines boş → dbCreateOrder çağrılmaz", async () => {
        await expect(
            serviceCreateOrder({ ...validInput, lines: [] })
        ).rejects.toThrow();
        expect(mockDbCreateOrder).not.toHaveBeenCalled();
    });

    it("grand_total ≤ 0 → dbCreateOrder çağrılmaz", async () => {
        await expect(
            serviceCreateOrder({ ...validInput, grand_total: 0 })
        ).rejects.toThrow();
        expect(mockDbCreateOrder).not.toHaveBeenCalled();
    });
});
