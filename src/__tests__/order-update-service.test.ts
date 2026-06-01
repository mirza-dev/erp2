/**
 * serviceUpdateOrderLines + validateOrderUpdate (Faz 2 — taslak düzenleme).
 * Pre-check (bulunamadı / taslak değil / validation) + happy path RPC çağrısı.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbGetOrderById = vi.fn();
const mockDbUpdateOrderWithLines = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:        (...a: unknown[]) => mockDbGetOrderById(...a),
    dbUpdateOrderWithLines:(...a: unknown[]) => mockDbUpdateOrderWithLines(...a),
    dbListOrders: vi.fn().mockResolvedValue([]),
    dbCreateOrder: vi.fn(),
    dbUpdateOrderStatus: vi.fn(),
    dbLogOrderAction: vi.fn(),
    dbApproveOrder: vi.fn(),
    dbShipOrderFull: vi.fn(),
    dbCancelOrder: vi.fn(),
    dbListExpiredQuotes: vi.fn(),
    dbUpdateOrderQuoteDeadline: vi.fn(),
}));
vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: vi.fn(), dbListActiveAlerts: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: vi.fn(),
}));
vi.mock("@/lib/supabase/customers", () => ({ dbGetCustomerById: vi.fn() }));
vi.mock("@/lib/supabase/products", () => ({ dbGetProductById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/services/email-service", () => ({ notifyUsersByEmail: vi.fn() }));

import { serviceUpdateOrderLines, validateOrderUpdate } from "@/lib/services/order-service";
import type { UpdateOrderInput } from "@/lib/supabase/orders";

const VALID: UpdateOrderInput = {
    customer_id: "c1", customer_name: "Test AŞ", currency: "TRY",
    lines: [{ product_id: "p1", product_name: "Vana", product_sku: "V1", unit: "adet", quantity: 2, unit_price: 100, discount_pct: 0, line_total: 200 }],
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdateOrderWithLines.mockResolvedValue({ id: "o1" });
});

describe("validateOrderUpdate", () => {
    it("geçerli input → valid", () => {
        expect(validateOrderUpdate(VALID).valid).toBe(true);
    });
    it("müşteri adı boş → invalid", () => {
        expect(validateOrderUpdate({ ...VALID, customer_name: "" }).valid).toBe(false);
    });
    it("satır yok → invalid", () => {
        expect(validateOrderUpdate({ ...VALID, lines: [] }).valid).toBe(false);
    });
    it("geçmiş teklif tarihi → invalid", () => {
        const r = validateOrderUpdate({ ...VALID, quote_valid_until: "2000-01-01" });
        expect(r.valid).toBe(false);
        expect(r.errors.join(" ")).toMatch(/Teklif geçerlilik/);
    });
    it("miktar 0 / negatif fiyat → invalid", () => {
        expect(validateOrderUpdate({ ...VALID, lines: [{ ...VALID.lines[0], quantity: 0 }] }).valid).toBe(false);
        expect(validateOrderUpdate({ ...VALID, lines: [{ ...VALID.lines[0], unit_price: -5 }] }).valid).toBe(false);
    });
});

describe("serviceUpdateOrderLines", () => {
    it("sipariş yok → throw bulunamadı (RPC çağrılmaz)", async () => {
        mockDbGetOrderById.mockResolvedValue(null);
        await expect(serviceUpdateOrderLines("o1", VALID)).rejects.toThrow(/bulunamadı/);
        expect(mockDbUpdateOrderWithLines).not.toHaveBeenCalled();
    });
    it("taslak değil → throw (RPC çağrılmaz)", async () => {
        mockDbGetOrderById.mockResolvedValue({ commercial_status: "approved" });
        await expect(serviceUpdateOrderLines("o1", VALID)).rejects.toThrow(/taslak/);
        expect(mockDbUpdateOrderWithLines).not.toHaveBeenCalled();
    });
    it("validation fail → throw (RPC çağrılmaz)", async () => {
        mockDbGetOrderById.mockResolvedValue({ commercial_status: "draft" });
        await expect(serviceUpdateOrderLines("o1", { ...VALID, lines: [] })).rejects.toThrow();
        expect(mockDbUpdateOrderWithLines).not.toHaveBeenCalled();
    });
    it("draft + geçerli → dbUpdateOrderWithLines çağrılır (actor geçilir)", async () => {
        mockDbGetOrderById.mockResolvedValue({ commercial_status: "draft" });
        await serviceUpdateOrderLines("o1", VALID, "user-7");
        expect(mockDbUpdateOrderWithLines).toHaveBeenCalledWith("o1", VALID, "user-7");
    });
});
