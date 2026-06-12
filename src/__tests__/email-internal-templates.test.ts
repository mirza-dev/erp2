import { describe, expect, it } from "vitest";
import {
    renderOrderNew,
    renderOrderPending,
    renderOrderShipped,
    renderStockCritical,
    renderSyncError,
} from "@/lib/email/templates";

describe("premium iç operasyon e-posta şablonları", () => {
    it("Roven markası, preheader ve tablo tabanlı layout kullanır", () => {
        const content = renderStockCritical({
            productId: "p-1",
            productName: "Küresel Vana",
            sku: "KV-1",
            available: 2,
            min: 10,
        });
        expect(content.subject).toBe("[Roven] Kritik stok · Küresel Vana");
        expect(content.html).toContain("Roven");
        expect(content.html).toContain("mso-hide:all");
        expect(content.html).toContain('role="presentation"');
        expect(content.html).not.toContain("display:flex");
    });

    it("stok CTA'sı doğrudan ürün detayına gider", () => {
        const content = renderStockCritical({
            productId: "p-42",
            productName: "Vana",
            sku: "V-1",
            available: 0,
            min: 4,
        });
        expect(content.html).toContain("/dashboard/products/p-42");
        expect(content.text).toContain("/dashboard/products/p-42");
    });

    it("sipariş bildirimlerinin tümü doğrudan sipariş detayına gider", () => {
        const common = {
            orderId: "o-7",
            orderNumber: "SIP-7",
            customerName: "Acme",
        };
        const contents = [
            renderOrderPending({ ...common, total: 100, currency: "TRY" }),
            renderOrderNew({ ...common, total: 100, currency: "TRY" }),
            renderOrderShipped(common),
        ];
        for (const content of contents) {
            expect(content.html).toContain("/dashboard/orders/o-7");
            expect(content.text).toContain("/dashboard/orders/o-7");
        }
    });

    it("Paraşüt ham hata ayrıntısını e-postaya sızdırmaz", () => {
        const secretDetail = "contact=ali@example.com token=secret-value";
        const content = renderSyncError({ entityName: "Cari #42", errorMessage: secretDetail });
        expect(content.subject).toBe("[Roven] Paraşüt senkronizasyon sorunu · Cari #42");
        expect(content.html).not.toContain(secretDetail);
        expect(content.text).not.toContain(secretDetail);
        expect(content.html).toContain("/dashboard/parasut");
    });

    it("kullanıcı kaynaklı alanları escape eder", () => {
        const content = renderStockCritical({
            productId: "p-1",
            productName: "<script>alert(1)</script>",
            sku: '"><img src=x onerror=alert(1)>',
            available: 0,
            min: 1,
        });
        expect(content.html).not.toContain("<script>");
        expect(content.html).not.toContain("<img src=x");
        expect(content.html).toContain("&lt;script&gt;");
    });

    it("bildirim tercihleri linki doğrudan Bildirimler sekmesini açar", () => {
        const content = renderOrderShipped({
            orderId: "o-1",
            orderNumber: "SIP-1",
            customerName: "Acme",
        });
        expect(content.html).toContain("/dashboard/settings?tab=bildirimler");
    });
});
