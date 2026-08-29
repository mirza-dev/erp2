/**
 * KOBİ simülasyonu — Tur 1 (kritik bulgular) regresyon testleri.
 *
 * Kaynak: docs/sim/2026-08-29-sim-bulgular.md
 *   K1/Y6 — teklif gönderiminde cari zorunluluğu + sipariş onarım yolu
 *   K2    — tedarikçi fatura künyesi (sessiz kayıp kapatıldı)
 *   K3    — fiziksel stok sayımı ucu
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    validateQuoteForSend,
    QUOTE_SEND_CUSTOMER_REQUIRED,
} from "@/lib/quote-validation";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

// ── K1 — gönderim öncesi cari zorunluluğu ────────────────────────────────

describe("K1 — teklif gönderiminde cari zorunluluğu", () => {
    const lines = [{ product_id: "p1", quantity: 1, unit_price: 100 }];

    it("customer_id yoksa gönderimi reddeder", () => {
        expect(validateQuoteForSend({ customer_address: "Adres", lines }))
            .toBe(QUOTE_SEND_CUSTOMER_REQUIRED);
    });

    it("customer_id boş string ise reddeder", () => {
        expect(validateQuoteForSend({ customer_id: "   ", customer_address: "Adres", lines }))
            .toBe(QUOTE_SEND_CUSTOMER_REQUIRED);
    });

    it("customer_id null ise reddeder", () => {
        expect(validateQuoteForSend({ customer_id: null, customer_address: "Adres", lines }))
            .toBe(QUOTE_SEND_CUSTOMER_REQUIRED);
    });

    it("cari bağlıysa geçer", () => {
        expect(validateQuoteForSend({ customer_id: "c1", customer_address: "Adres", lines }))
            .toBeNull();
    });

    it("cari kontrolü adres kontrolünden ÖNCE gelir (kök neden önce söylenir)", () => {
        // İkisi de eksikken kullanıcı asıl engeli (cari) görmeli.
        expect(validateQuoteForSend({ lines }))
            .toBe(QUOTE_SEND_CUSTOMER_REQUIRED);
    });

    it("kural gönderim yolunda (quote-service sent geçişi) çağrılıyor", () => {
        const svc = src("src/lib/services/quote-service.ts");
        expect(svc).toContain("validateQuoteForSend(quote)");
        expect(svc).toMatch(/target === "sent"/);
    });

    it("form ön-validasyonu customer_id geçiriyor (400 yenmeden engeller)", () => {
        const form = src("src/app/dashboard/quotes/_components/QuoteForm.tsx");
        expect(form).toContain("validateQuoteForSend({ customer_id: custId");
    });

    it("formda inline cari oluşturma yolu var", () => {
        const form = src("src/app/dashboard/quotes/_components/QuoteForm.tsx");
        expect(form).toContain("handleCreateCustomerInline");
        expect(form).toContain("Yeni cari oluştur");
    });

    it("inline cari ISO ülke KODU gönderir (kolon char(2))", () => {
        // Canlı onarım turunda yakalandı: "Türkiye" yazmak cari oluşturmayı
        // kırıyordu — `customers.country` char(2) (001_initial_schema) ve rota
        // 2 karakterden uzun değeri 400'le reddediyor. Testler bunu görmemişti;
        // gerçek veriye karşı koşmak yakaladı.
        const form = src("src/app/dashboard/quotes/_components/QuoteForm.tsx");
        expect(form).toContain('country:   "TR"');
        expect(form).not.toContain('country:   "Türkiye"');
    });

    it("addCustomer oluşan cariyi döndürür (id anında bağlanabilsin)", () => {
        const ctx = src("src/lib/data-context.tsx");
        expect(ctx).toContain("Promise<Customer | undefined>");
        expect(ctx).toContain("return created;");
    });
});

// ── K1 onarım yolu — serviceLinkOrderCustomer ────────────────────────────

const mockGetOrder = vi.fn();
const mockGetCustomer = vi.fn();
const mockLink = vi.fn();
const mockLog = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:            (...a: unknown[]) => mockGetOrder(...a),
    dbLinkOrderCustomer:       (...a: unknown[]) => mockLink(...a),
    dbLogOrderAction:          (...a: unknown[]) => mockLog(...a),
    dbListOrders:              vi.fn(),
    dbListOrdersPaged:         vi.fn(),
    dbCountOrdersByTab:        vi.fn(),
    dbCreateOrder:             vi.fn(),
    dbSubmitOrderForApproval:  vi.fn(),
    dbApproveOrder:            vi.fn(),
    dbShipOrderFull:           vi.fn(),
    dbCancelOrder:             vi.fn(),
    dbUpdateOrderQuoteDeadline: vi.fn(),
    dbUpdateOrderWithLines:    vi.fn(),
}));
vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...a: unknown[]) => mockGetCustomer(...a),
}));
vi.mock("@/lib/supabase/alerts", () => ({
    dbBatchResolveAlerts: vi.fn(),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: vi.fn(),
    dbTryResolveShortages: vi.fn(),
    dbGetOpenShortageProductIds: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/services/notification-outbox-service", () => ({
    enqueueInternalNotification: vi.fn(),
}));

describe("K1 onarım yolu — serviceLinkOrderCustomer", () => {
    beforeEach(() => {
        mockGetOrder.mockReset(); mockGetCustomer.mockReset();
        mockLink.mockReset(); mockLog.mockReset();
    });

    it("cari bağı olmayan siparişi bağlar ve snapshot'ı tazeler", async () => {
        const { serviceLinkOrderCustomer } = await import("@/lib/services/order-service");
        mockGetOrder.mockResolvedValue({ id: "o1", customer_id: null, customer_name: "SIM Akdeniz Enerji" });
        mockGetCustomer.mockResolvedValue({
            id: "c1", name: "Akdeniz Enerji A.Ş.", email: "a@example.com",
            country: "Türkiye", tax_office: "Kadıköy", tax_number: "1234567890",
            is_active: true,
        });

        const res = await serviceLinkOrderCustomer("o1", "c1", "mirza");
        expect(res.success).toBe(true);
        expect(mockLink).toHaveBeenCalledWith("o1", expect.objectContaining({
            id: "c1", name: "Akdeniz Enerji A.Ş.", tax_number: "1234567890",
        }));
    });

    it("audit kaydı actor ile yazılır", async () => {
        const { serviceLinkOrderCustomer } = await import("@/lib/services/order-service");
        mockGetOrder.mockResolvedValue({ id: "o1", customer_id: null, customer_name: "X" });
        mockGetCustomer.mockResolvedValue({ id: "c1", name: "Y", is_active: true });

        await serviceLinkOrderCustomer("o1", "c1", "mirza");
        expect(mockLog).toHaveBeenCalledWith(
            "o1", "order_customer_linked",
            expect.anything(), expect.anything(), "mirza",
        );
    });

    it("zaten cariye bağlı siparişi DEĞİŞTİRMEZ", async () => {
        const { serviceLinkOrderCustomer } = await import("@/lib/services/order-service");
        mockGetOrder.mockResolvedValue({ id: "o1", customer_id: "eski", customer_name: "X" });

        const res = await serviceLinkOrderCustomer("o1", "c1");
        expect(res.success).toBe(false);
        expect(mockLink).not.toHaveBeenCalled();
    });

    it("pasif cariye bağlamayı reddeder", async () => {
        const { serviceLinkOrderCustomer } = await import("@/lib/services/order-service");
        mockGetOrder.mockResolvedValue({ id: "o1", customer_id: null, customer_name: "X" });
        mockGetCustomer.mockResolvedValue({ id: "c1", name: "Y", is_active: false });

        const res = await serviceLinkOrderCustomer("o1", "c1");
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/[Pp]asif/);
        expect(mockLink).not.toHaveBeenCalled();
    });

    it("olmayan cariyi reddeder", async () => {
        const { serviceLinkOrderCustomer } = await import("@/lib/services/order-service");
        mockGetOrder.mockResolvedValue({ id: "o1", customer_id: null, customer_name: "X" });
        mockGetCustomer.mockResolvedValue(null);

        const res = await serviceLinkOrderCustomer("o1", "c1");
        expect(res.success).toBe(false);
        expect(mockLink).not.toHaveBeenCalled();
    });
});

// ── Y6 — cari linki ──────────────────────────────────────────────────────

describe("Y6 — sipariş detayında cari linki + onarım yolu", () => {
    const page = src("src/app/dashboard/orders/[id]/page.tsx");

    it("bağlı cari tıklanabilir link olur", () => {
        expect(page).toContain("/dashboard/customers?customer=${order.customerId}");
    });

    it("cari bağı yoksa uyarı + Cariye bağla aksiyonu görünür", () => {
        expect(page).toContain("Cari kaydına bağlı değil");
        expect(page).toContain("Cariye bağla");
        expect(page).toContain("handleLinkCustomer");
    });
});

// ── K2 — tedarikçi fatura künyesi ────────────────────────────────────────

describe("K2 — tedarikçi fatura künyesi ekranı", () => {
    it("mal kabul formu künye alanlarını gövdeye koyar", () => {
        const page = src("src/app/dashboard/purchase/orders/[id]/page.tsx");
        expect(page).toContain("vendor_invoice_no:   vendorInvoiceNo.trim()");
        expect(page).toContain("vendor_invoice_date: vendorInvoiceDate.trim()");
        expect(page).toContain("Tedarikçi Fatura No");
    });

    it("künye yazımı BAŞARISIZSA artık sessiz değil (invoiceWarning)", () => {
        const svc = src("src/lib/services/purchase-order-service.ts");
        expect(svc).toContain("invoiceWarning?: boolean");
        expect(svc).toContain("invoiceWarning = true");
        expect(svc).toContain("...(invoiceWarning ? { invoiceWarning: true } : {})");
    });

    it("UI uyarıyı kullanıcıya gösterir", () => {
        const page = src("src/app/dashboard/purchase/orders/[id]/page.tsx");
        expect(page).toContain("data?.invoiceWarning");
        expect(page).toMatch(/künyesi yazılamadı/);
    });

    it("tamamlanmış PO'da sonradan düzeltme yolu var (draft kısıtının dışında)", () => {
        const route = src("src/app/api/purchase-orders/[id]/route.ts");
        expect(route).toContain("touchesInvoice");
        expect(route).toContain("dbSetVendorInvoiceIdentity");
        // Künye dalı draft guard'ından ÖNCE olmalı — PO çoktan received.
        expect(route.indexOf("touchesInvoice"))
            .toBeLessThan(route.indexOf('sadece draft durumunda düzenlenebilir'));
    });

    it("iptal edilmiş PO'ya künye yazılmaz", () => {
        const route = src("src/app/api/purchase-orders/[id]/route.ts");
        expect(route).toContain('existing.status === "cancelled"');
    });
});

// ── K3 — stok sayımı ─────────────────────────────────────────────────────

describe("K3 — fiziksel stok sayımı ucu ve ekranı", () => {
    const route = src("src/app/api/inventory/recount/route.ts");

    it("recount ucu mevcut RPC sarmalayıcısını kullanır (yeni yol icat etmez)", () => {
        expect(route).toContain("dbRecountStock");
    });

    it("guard kardeş movements ucuyla aynı — üretim rolü sayım girebilir", () => {
        expect(route).toContain('["stock_adjust_general", "stock_adjust_sales_context"]');
    });

    it("actor sunucu-otoriter (istemci gövdesinden DEĞİL)", () => {
        expect(route).toContain("await getCurrentUserId()");
        expect(route).not.toContain("body.created_by");
        expect(route).not.toContain("body.actor");
    });

    it("negatif ve küsüratlı sayım reddedilir", () => {
        expect(route).toContain("Number.isInteger(counted)");
        expect(route).toContain("counted < 0");
    });

    it("ürün detayında sayım ekranı var", () => {
        const page = src("src/app/dashboard/products/[id]/page.tsx");
        expect(page).toContain("Sayım / Stok Düzelt");
        expect(page).toContain("handleSaveCount");
        expect(page).toContain("/api/inventory/recount");
    });

    it("üretim ekranı satılabilir stoğu artık doğru adlandırıyor", () => {
        const prod = src("src/app/dashboard/production/page.tsx");
        expect(prod).not.toContain("Mevcut stok:");
        expect(prod).toContain("Satılabilir:");
    });
});
