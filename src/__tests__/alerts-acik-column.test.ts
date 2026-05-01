/**
 * Sprint A G4 — "Açık Sipariş" kolonu: dbGetOpenOrderCountByProduct
 * onaylı + sevk edilmemiş sipariş sayısını ürün başına doğru sayıyor.
 *
 * Plan kriteri: "onaylı + sevk edilmemiş sipariş sayısı" (birim değil sayı).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockNot = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: mockFrom,
    }),
}));

import { dbGetOpenOrderCountByProduct } from "@/lib/supabase/orders";

function setupChain(data: unknown[], error: null | { message: string } = null) {
    mockNot.mockResolvedValue({ data, error });
    mockEq.mockReturnValue({ not: mockNot });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("dbGetOpenOrderCountByProduct — distinct sipariş sayısı", () => {
    it("sipariş olmadığında boş Map döner", async () => {
        setupChain([]);
        const result = await dbGetOpenOrderCountByProduct();
        expect(result.size).toBe(0);
    });

    it("aynı ürün için birden fazla order_line tek order sayılır", async () => {
        setupChain([
            { product_id: "prod-1", order_id: "order-A", sales_orders: { commercial_status: "approved", fulfillment_status: "allocated" } },
            { product_id: "prod-1", order_id: "order-A", sales_orders: { commercial_status: "approved", fulfillment_status: "allocated" } },
        ]);
        const result = await dbGetOpenOrderCountByProduct();
        expect(result.get("prod-1")).toBe(1);
    });

    it("aynı ürün için farklı orderlarda 2 olarak sayılır", async () => {
        setupChain([
            { product_id: "prod-1", order_id: "order-A", sales_orders: { commercial_status: "approved", fulfillment_status: "allocated" } },
            { product_id: "prod-1", order_id: "order-B", sales_orders: { commercial_status: "approved", fulfillment_status: "allocated" } },
        ]);
        const result = await dbGetOpenOrderCountByProduct();
        expect(result.get("prod-1")).toBe(2);
    });

    it("farklı ürünlerin sayıları birbirini etkilemez", async () => {
        setupChain([
            { product_id: "prod-1", order_id: "order-A", sales_orders: { commercial_status: "approved", fulfillment_status: "allocated" } },
            { product_id: "prod-2", order_id: "order-A", sales_orders: { commercial_status: "approved", fulfillment_status: "allocated" } },
            { product_id: "prod-2", order_id: "order-B", sales_orders: { commercial_status: "approved", fulfillment_status: "allocated" } },
        ]);
        const result = await dbGetOpenOrderCountByProduct();
        expect(result.get("prod-1")).toBe(1);
        expect(result.get("prod-2")).toBe(2);
    });

    it("DB hatası throw eder", async () => {
        mockNot.mockResolvedValue({ data: null, error: { message: "db error" } });
        mockEq.mockReturnValue({ not: mockNot });
        mockSelect.mockReturnValue({ eq: mockEq });
        mockFrom.mockReturnValue({ select: mockSelect });

        await expect(dbGetOpenOrderCountByProduct()).rejects.toThrow("db error");
    });

    it("doğru filtrelerle sorgu çağrılır (approved + not shipped)", async () => {
        setupChain([]);
        await dbGetOpenOrderCountByProduct();

        expect(mockFrom).toHaveBeenCalledWith("order_lines");
        expect(mockEq).toHaveBeenCalledWith("sales_orders.commercial_status", "approved");
        expect(mockNot).toHaveBeenCalledWith("sales_orders.fulfillment_status", "eq", "shipped");
    });
});
