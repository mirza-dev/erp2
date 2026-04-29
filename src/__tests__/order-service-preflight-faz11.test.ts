/**
 * Faz 11.1 — Sevk preflight regresyon testi
 * serviceTransitionOrder('shipped') öncesi:
 *   - customer_id NULL → reddet
 *   - Paraşüt enabled + tax_number NULL → reddet
 *   - Paraşüt enabled + product SKU boş → reddet
 *   - Paraşüt enabled + order_number format yanlış → reddet
 * Başarı:
 *   - shipped_at her zaman yazılır
 *   - parasut_step='contact' yalnızca Paraşüt enabled iken
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDbGetOrderById = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbGetProductById = vi.fn();
const mockDbShipOrderFull = vi.fn();
const mockDbApproveOrder = vi.fn();
const mockDbCancelOrder = vi.fn();
const mockDbUpdateOrderStatus = vi.fn();
const mockDbLogOrderAction = vi.fn();
const mockDbListExpiredQuotes = vi.fn();
const mockDbUpdateOrderQuoteDeadline = vi.fn();
const mockDbCreateOrder = vi.fn();
const mockDbListOrders = vi.fn();

const updateCalls: Array<Record<string, unknown>> = [];
const pendingUpdateResults: Array<{ error: { message: string } | null }> = [];
function chainProxy(): unknown {
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === "eq" || prop === "neq") return () => chainProxy();
            if (prop === "then") {
                const next = pendingUpdateResults.shift() ?? { error: null };
                const p = Promise.resolve(next);
                return p.then.bind(p);
            }
            return undefined;
        },
    });
}
const mockUpdate = vi.fn((patch: Record<string, unknown>) => {
    updateCalls.push(patch);
    return { eq: () => chainProxy() };
});

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:                (...a: unknown[]) => mockDbGetOrderById(...a),
    dbListOrders:                  (...a: unknown[]) => mockDbListOrders(...a),
    dbCreateOrder:                 (...a: unknown[]) => mockDbCreateOrder(...a),
    dbUpdateOrderStatus:           (...a: unknown[]) => mockDbUpdateOrderStatus(...a),
    dbLogOrderAction:              (...a: unknown[]) => mockDbLogOrderAction(...a),
    dbApproveOrder:                (...a: unknown[]) => mockDbApproveOrder(...a),
    dbShipOrderFull:               (...a: unknown[]) => mockDbShipOrderFull(...a),
    dbCancelOrder:                 (...a: unknown[]) => mockDbCancelOrder(...a),
    dbListExpiredQuotes:           (...a: unknown[]) => mockDbListExpiredQuotes(...a),
    dbUpdateOrderQuoteDeadline:    (...a: unknown[]) => mockDbUpdateOrderQuoteDeadline(...a),
}));

vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...a: unknown[]) => mockDbGetCustomerById(...a),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: (...a: unknown[]) => mockDbGetProductById(...a),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert:        vi.fn(),
    dbListActiveAlerts:   vi.fn().mockResolvedValue([]),
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: () => ({ update: mockUpdate }) }),
}));

import { serviceTransitionOrder, preflightShipment } from "@/lib/services/order-service";

const saved: Record<string, string | undefined> = {};
const ORDER_ID = "ord-1";

const baseOrder = {
    id:                ORDER_ID,
    order_number:      "ORD-2026-0042",
    commercial_status: "approved",
    fulfillment_status:"allocated",
    customer_id:       "cust-1",
    customer_name:     "Test Müşteri",
    grand_total:       1000,
    currency:          "USD",
    parasut_step:      null,
    parasut_retry_count: 0,
    lines: [
        { id: "ol-1", product_id: "prod-1", product_name: "Vana A", quantity: 1, unit_price: 100, line_total: 100 },
    ],
};

const baseCustomer = {
    id:                "cust-1",
    name:              "Test Müşteri",
    tax_number:        "1234567890",
    parasut_contact_id: null,
};

const baseProduct = {
    id:                "prod-1",
    name:              "Vana A",
    sku:               "VAN-001",
    parasut_product_id: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    pendingUpdateResults.length = 0;
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    mockDbShipOrderFull.mockResolvedValue({ success: true });
    mockDbGetOrderById.mockResolvedValue(baseOrder);
    mockDbGetCustomerById.mockResolvedValue(baseCustomer);
    mockDbGetProductById.mockResolvedValue(baseProduct);
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

describe("Faz 11.1 — preflightShipment", () => {
    it("customer_id NULL → reddet", async () => {
        process.env.PARASUT_ENABLED = "false";
        const r = await preflightShipment({ ...baseOrder, customer_id: null } as never);
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/müşterisiz/i);
    });

    it("Paraşüt off + customer_id var → kabul (tax_number bakılmaz)", async () => {
        process.env.PARASUT_ENABLED = "false";
        const r = await preflightShipment({ ...baseOrder, customer_id: "x" } as never);
        expect(r.valid).toBe(true);
    });

    it("Paraşüt on + tax_number NULL → reddet", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, tax_number: null });
        const r = await preflightShipment(baseOrder as never);
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/tax_number|vergi numarası/i);
    });

    it("Paraşüt on + tax_number boş string → reddet", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, tax_number: "   " });
        const r = await preflightShipment(baseOrder as never);
        expect(r.valid).toBe(false);
    });

    it("Paraşüt on + customer kaydı yok → reddet", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbGetCustomerById.mockResolvedValue(null);
        const r = await preflightShipment(baseOrder as never);
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/müşteri kaydı/i);
    });

    it("Paraşüt on + product SKU boş → reddet", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbGetProductById.mockResolvedValue({ ...baseProduct, sku: "" });
        const r = await preflightShipment(baseOrder as never);
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/SKU/);
    });

    it("Paraşüt on + product NULL → reddet", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbGetProductById.mockResolvedValue(null);
        const r = await preflightShipment(baseOrder as never);
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/ürün bulunamadı/i);
    });

    it("Paraşüt on + order_number format yanlış → reddet", async () => {
        process.env.PARASUT_ENABLED = "true";
        const bad = { ...baseOrder, order_number: "SIPARIS-99" };
        const r = await preflightShipment(bad as never);
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/ORD-YYYY-NNNN/);
    });

    it("Paraşüt on + tüm zorunlular dolu → kabul", async () => {
        process.env.PARASUT_ENABLED = "true";
        const r = await preflightShipment(baseOrder as never);
        expect(r.valid).toBe(true);
    });

    it("Paraşüt on + lines'te product_id null olan satırı atlar", async () => {
        process.env.PARASUT_ENABLED = "true";
        const order = { ...baseOrder, lines: [{ ...baseOrder.lines[0], product_id: null }] };
        const r = await preflightShipment(order as never);
        expect(r.valid).toBe(true);
        expect(mockDbGetProductById).not.toHaveBeenCalled();
    });
});

describe("Faz 11.1 — serviceTransitionOrder('shipped') sonrası DB yazımı", () => {
    it("başarılı sevk + Paraşüt off → shipped_at yazılır, parasut_step yazılmaz", async () => {
        process.env.PARASUT_ENABLED = "false";
        const r = await serviceTransitionOrder(ORDER_ID, "shipped");
        expect(r.success).toBe(true);
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0]).toHaveProperty("shipped_at");
        expect(updateCalls[0]).not.toHaveProperty("parasut_step");
    });

    it("başarılı sevk + Paraşüt on → shipped_at + parasut_step='contact' yazılır", async () => {
        process.env.PARASUT_ENABLED = "true";
        const r = await serviceTransitionOrder(ORDER_ID, "shipped");
        expect(r.success).toBe(true);
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0]).toHaveProperty("shipped_at");
        expect(updateCalls[0].parasut_step).toBe("contact");
    });

    it("preflight fail (tax_number NULL, Paraşüt on) → dbShipOrderFull çağrılmaz, DB update yok", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbGetCustomerById.mockResolvedValue({ ...baseCustomer, tax_number: null });
        const r = await serviceTransitionOrder(ORDER_ID, "shipped");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/tax_number|vergi/i);
        expect(mockDbShipOrderFull).not.toHaveBeenCalled();
        expect(updateCalls).toHaveLength(0);
    });

    it("preflight pass + dbShipOrderFull fail → patch yazılmaz", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbShipOrderFull.mockResolvedValue({ success: false, error: "Stok yetersiz" });
        const r = await serviceTransitionOrder(ORDER_ID, "shipped");
        expect(r.success).toBe(false);
        expect(updateCalls).toHaveLength(0);
    });

    it("commercial_status approved değil → preflight çağrılmaz, ship çağrılmaz", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbGetOrderById.mockResolvedValue({ ...baseOrder, commercial_status: "draft" });
        const r = await serviceTransitionOrder(ORDER_ID, "shipped");
        expect(r.success).toBe(false);
        expect(mockDbGetCustomerById).not.toHaveBeenCalled();
        expect(mockDbShipOrderFull).not.toHaveBeenCalled();
    });
});

// M1 (bulgu fix) — post-ship update hatası
describe("M1 fix — post-ship shipped_at/parasut_step update hatası yutulmuyor", () => {
    it("Paraşüt on + DB update fail → success:false + açıklayıcı error", async () => {
        process.env.PARASUT_ENABLED = "true";
        pendingUpdateResults.push({ error: { message: "DB connection lost" } });
        const r = await serviceTransitionOrder(ORDER_ID, "shipped");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/shipped_at\/parasut_step yazılamadı/);
        expect(r.error).toMatch(/DB connection lost/);
    });

    it("Paraşüt off + DB update fail → success:false (shipped_at yazımı kanonik)", async () => {
        process.env.PARASUT_ENABLED = "false";
        pendingUpdateResults.push({ error: { message: "fk violation" } });
        const r = await serviceTransitionOrder(ORDER_ID, "shipped");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/shipped_at/);
    });

    it("DB update başarılı → success:true (regresyon)", async () => {
        process.env.PARASUT_ENABLED = "true";
        // pendingUpdateResults boş → default { error: null }
        const r = await serviceTransitionOrder(ORDER_ID, "shipped");
        expect(r.success).toBe(true);
    });
});
