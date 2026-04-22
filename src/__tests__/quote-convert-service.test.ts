/**
 * Tests for serviceConvertQuoteToOrder — Faz 8.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mocks ─────────────────────────────────────────────────────────────────

const mockDbGetQuote            = vi.fn();
const mockDbFindOrderByQuoteId  = vi.fn();
const mockDbGetProductById      = vi.fn();
const mockDbGetCustomerById     = vi.fn();
const mockDbCreateOrder         = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbGetQuote:          (...args: unknown[]) => mockDbGetQuote(...args),
    dbUpdateQuoteStatus: vi.fn(),
    dbListExpiredQuotes: vi.fn(),
    dbListQuotes:        vi.fn(),
    dbCreateQuote:       vi.fn(),
    dbUpdateQuote:       vi.fn(),
    dbDeleteQuote:       vi.fn(),
    dbFindQuoteByNumber: vi.fn(),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByQuoteId: (...args: unknown[]) => mockDbFindOrderByQuoteId(...args),
    dbCreateOrder:        (...args: unknown[]) => mockDbCreateOrder(...args),
    dbGetOrderById:       vi.fn(),
    dbListOrders:         vi.fn(),
    dbUpdateOrderStatus:  vi.fn(),
    dbLogOrderAction:     vi.fn(),
    dbApproveOrder:       vi.fn(),
    dbShipOrderFull:      vi.fn(),
    dbCancelOrder:        vi.fn(),
    dbListExpiredQuotes:  vi.fn(),
    dbUpdateOrderQuoteDeadline: vi.fn(),
    dbFindOrderByQuoteId: (...args: unknown[]) => mockDbFindOrderByQuoteId(...args),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: (...args: unknown[]) => mockDbGetProductById(...args),
    dbFindProductBySku: vi.fn(),
    dbListProducts: vi.fn(),
}));

vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...args: unknown[]) => mockDbGetCustomerById(...args),
    dbListCustomers: vi.fn(),
    dbDeleteCustomer: vi.fn(),
    dbFindCustomerByCode: vi.fn(),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert:        vi.fn(),
    dbListActiveAlerts:   vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: vi.fn(),
    dbListAlerts:         vi.fn(),
}));

import { serviceConvertQuoteToOrder } from "@/lib/services/quote-service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const QUOTE_ID    = "quote-uuid-1";
const CUSTOMER_ID = "customer-uuid-1";
const ORDER_ID    = "order-uuid-1";

const stubLine = (position: number, productId: string | null = `prod-${position}`) => ({
    id: `line-${position}`,
    quote_id: QUOTE_ID,
    position,
    product_id: productId,
    product_code: `CODE-${position}`,
    lead_time: null,
    description: `Ürün ${position}`,
    quantity: 2,
    unit_price: 100,
    line_total: 200,
    hs_code: null,
    weight_kg: null,
    created_at: "2026-04-21T10:00:00Z",
});

const stubQuote = (status: string, lines = [stubLine(1), stubLine(2)]) => ({
    id: QUOTE_ID,
    quote_number: "TKL-2026-001",
    status,
    customer_id: CUSTOMER_ID,
    customer_name: "Acme Ltd",
    customer_email: "acme@example.com",
    customer_contact: null,
    customer_phone: null,
    sales_rep: null,
    sales_phone: null,
    sales_email: null,
    currency: "USD",
    vat_rate: 20,
    subtotal: 400,
    vat_total: 80,
    grand_total: 480,
    notes: "Test notu",
    sig_prepared: null,
    sig_approved: null,
    sig_manager: null,
    quote_date: null,
    valid_until: "2026-05-01",
    created_at: "2026-04-21T10:00:00Z",
    updated_at: "2026-04-21T10:00:00Z",
    lines,
});

const stubProduct = (id: string) => ({
    id,
    name: `Ürün ${id}`,
    sku: `SKU-${id}`,
    unit: "adet",
    on_hand: 100,
    reserved: 0,
    available_now: 100,
});

const stubCustomer = () => ({
    id: CUSTOMER_ID,
    name: "Acme Ltd",
    email: "acme@example.com",
    country: "Turkey",
    tax_office: "Kadıköy",
    tax_number: "1234567890",
    phone: null,
    address: null,
    currency: "USD",
    is_active: true,
    total_orders: 0,
    total_revenue: 0,
    last_order_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    payment_terms_days: null,
    notes: null,
    tax_number_type: null,
    customer_code: null,
    default_incoterm: null,
});

const stubCreatedOrder = () => ({
    id: ORDER_ID,
    order_number: "SIP-2026-001",
    commercial_status: "draft",
    fulfillment_status: "unallocated",
    quote_id: QUOTE_ID,
    customer_name: "Acme Ltd",
    currency: "USD",
    subtotal: 400,
    vat_total: 80,
    grand_total: 480,
    item_count: 2,
    created_at: "2026-04-22T10:00:00Z",
    updated_at: "2026-04-22T10:00:00Z",
    customer_id: CUSTOMER_ID,
    customer_email: "acme@example.com",
    customer_country: "Turkey",
    customer_tax_office: "Kadıköy",
    customer_tax_number: "1234567890",
    notes: "Test notu",
    quote_valid_until: "2026-05-01",
    created_by: null,
    incoterm: null,
    planned_shipment_date: null,
    original_order_number: null,
    parasut_invoice_id: null,
    parasut_sent_at: null,
    parasut_error: null,
    ai_confidence: null,
    ai_reason: null,
    ai_model_version: null,
    ai_risk_level: null,
});

beforeEach(() => {
    vi.clearAllMocks();
    mockDbGetQuote.mockResolvedValue(null);
    mockDbFindOrderByQuoteId.mockResolvedValue(null);
    mockDbGetProductById.mockImplementation((id: string) => Promise.resolve(stubProduct(id)));
    mockDbGetCustomerById.mockResolvedValue(stubCustomer());
    mockDbCreateOrder.mockResolvedValue(stubCreatedOrder());
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("serviceConvertQuoteToOrder", () => {
    // ── Happy paths ──

    it("T01: accepted teklif → sipariş oluşturulur (full)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("accepted"));
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(true);
        expect(result.orderId).toBe(ORDER_ID);
        expect(result.orderNumber).toBe("SIP-2026-001");
        expect(result.warnings).toBeUndefined();
        // dbCreateOrder çağrıldı ve quote_id var
        expect(mockDbCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                quote_id: QUOTE_ID,
                quote_valid_until: "2026-05-01",
                commercial_status: "draft",
                fulfillment_status: "unallocated",
                customer_country: "Turkey",
                customer_tax_office: "Kadıköy",
                customer_tax_number: "1234567890",
            })
        );
    });

    it("T02: customer_id null → müşteri zenginleştirmesi atlanır, sipariş yine oluşur", async () => {
        const quote = { ...stubQuote("accepted"), customer_id: null };
        mockDbGetQuote.mockResolvedValue(quote);
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(true);
        expect(mockDbGetCustomerById).not.toHaveBeenCalled();
        expect(mockDbCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                customer_id: undefined,
                customer_country: undefined,
                customer_tax_office: undefined,
                customer_tax_number: undefined,
            })
        );
    });

    // ── Yanlış durum ──

    it("T03: draft → dönüştürülemez", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("draft"));
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(false);
        expect(result.error).toContain("dönüştürülemez");
        expect(mockDbCreateOrder).not.toHaveBeenCalled();
    });

    it("T04: sent → dönüştürülemez", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("sent"));
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(false);
        expect(result.error).toContain("dönüştürülemez");
    });

    it("T05: rejected → dönüştürülemez", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("rejected"));
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(false);
        expect(result.error).toContain("dönüştürülemez");
    });

    it("T06: expired → dönüştürülemez", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("expired"));
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(false);
        expect(result.error).toContain("dönüştürülemez");
    });

    // ── Bulunamadı ──

    it("T07: teklif bulunamadı → notFound: true", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(false);
        expect(result.notFound).toBe(true);
        expect(result.error).toContain("bulunamadı");
        expect(mockDbCreateOrder).not.toHaveBeenCalled();
    });

    // ── Zaten dönüştürüldü ──

    it("T08: zaten dönüştürüldü → alreadyConverted: true + existingOrderId", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("accepted"));
        mockDbFindOrderByQuoteId.mockResolvedValue({
            id: "existing-order-id",
            order_number: "SIP-2026-000",
        });
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(false);
        expect(result.alreadyConverted).toBe(true);
        expect(result.existingOrderId).toBe("existing-order-id");
        expect(result.existingOrderNumber).toBe("SIP-2026-000");
        expect(mockDbCreateOrder).not.toHaveBeenCalled();
    });

    // ── Satır sorunları ──

    it("T09: tüm satırlarda product_id null → hata, sipariş oluşturulmaz", async () => {
        mockDbGetQuote.mockResolvedValue(
            stubQuote("accepted", [stubLine(1, null), stubLine(2, null)])
        );
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(false);
        expect(result.error).toContain("ürün eşleşmesi yok");
        expect(mockDbCreateOrder).not.toHaveBeenCalled();
    });

    it("T10: bazı satırlarda product_id null → warnings ile devam, valid satırlardan sipariş oluşur", async () => {
        const lines = [stubLine(1), stubLine(2), stubLine(3, null)];
        mockDbGetQuote.mockResolvedValue(stubQuote("accepted", lines));
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings![0]).toContain("Satır 3");
        // Sadece 2 ürün lookup edilmeli
        expect(mockDbGetProductById).toHaveBeenCalledTimes(2);
    });

    it("T11: ürün silinmiş (dbGetProductById null) → hata mesajı", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("accepted"));
        mockDbGetProductById.mockResolvedValue(null);
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Ürün bulunamadı");
        expect(result.error).toContain("satır");
        expect(mockDbCreateOrder).not.toHaveBeenCalled();
    });

    it("T12: müşteri silinmiş → devam et, warning ekle, country/tax boş", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("accepted"));
        mockDbGetCustomerById.mockResolvedValue(null);
        const result = await serviceConvertQuoteToOrder(QUOTE_ID);
        expect(result.success).toBe(true);
        expect(result.warnings).toBeDefined();
        expect(result.warnings!.some(w => w.includes("Müşteri kaydı bulunamadı"))).toBe(true);
        expect(mockDbCreateOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                customer_country: undefined,
                customer_tax_office: undefined,
                customer_tax_number: undefined,
            })
        );
    });

    it("T13: serviceCreateOrder fırlatırsa → hata propagate edilir", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote("accepted"));
        mockDbCreateOrder.mockRejectedValue(new Error("DB bağlantı hatası"));
        await expect(serviceConvertQuoteToOrder(QUOTE_ID)).rejects.toThrow("DB bağlantı hatası");
    });

    it("T14: finansal yeniden hesaplama — 1 satır atlanınca valid satırlardan hesaplanır", async () => {
        // 3 satır: line_total 200+200+200=600, ama 3. satır null → 2 satır: 200+200=400
        const lines = [stubLine(1), stubLine(2), stubLine(3, null)];
        mockDbGetQuote.mockResolvedValue(stubQuote("accepted", lines));
        await serviceConvertQuoteToOrder(QUOTE_ID);
        const callArg = mockDbCreateOrder.mock.calls[0][0];
        // subtotal = 200 + 200 = 400 (satır 3 atlandı)
        expect(callArg.subtotal).toBe(400);
        // vat_total = 400 * 20% = 80
        expect(callArg.vat_total).toBe(80);
        // grand_total = 400 + 80 = 480
        expect(callArg.grand_total).toBe(480);
    });
});
