/**
 * A3 (2026-08-24) — Tedarikçi detay görünümü.
 *
 * Tedarikçiler sayfası yalnız bir iletişim listesiydi; satırın hiçbir detayı
 * yoktu. Oysa satın alma kararının dayanağı olan veri tabloda ZATEN duruyordu:
 * `product_vendor_links` (hangi ürün, tedarikçi SKU'su, temin süresi, MOQ,
 * RFQ'nin yazdığı son birim fiyat) ve `purchase_orders` (kaç PO, ne tutarda,
 * ne zaman). "Bu vanayı kimden, kaça alıyoruz?" sorusunun cevabı vardı ama
 * sorulacak yer yoktu.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
    summarizeVendorPurchases,
    sortVendorProducts,
    emptyVendorPurchaseSummary,
    VENDOR_PO_EXCLUDED_STATUS,
    type VendorPoSource,
    type VendorSuppliedProduct,
} from "@/lib/vendor-detail";

const root = process.cwd();
const ROUTE_SRC = readFileSync(join(root, "src/app/api/vendors/[id]/detail/route.ts"), "utf8");
const PANEL_SRC = readFileSync(join(root, "src/components/vendors/VendorDetailPanel.tsx"), "utf8");
const LIST_SRC = readFileSync(join(root, "src/app/dashboard/vendors/VendorsClient.tsx"), "utf8");

function po(p: Partial<VendorPoSource> = {}): VendorPoSource {
    return { status: "confirmed", currency: "USD", grand_total: 100, order_date: "2026-01-01", ...p };
}

describe("summarizeVendorPurchases", () => {
    it("iptal edilmiş PO sayılmaz", () => {
        const s = summarizeVendorPurchases([po(), po({ status: "cancelled", grand_total: 9999 })]);
        expect(s.poCount).toBe(1);
        expect(s.totalByCurrency).toEqual({ USD: 100 });
        expect(VENDOR_PO_EXCLUDED_STATUS).toBe("cancelled");
    });

    it("para birimleri ASLA toplanmaz (cariler ile aynı kural)", () => {
        const s = summarizeVendorPurchases([
            po({ currency: "EUR", grand_total: 504 }),
            po({ currency: "USD", grand_total: 2640 }),
            po({ currency: "EUR", grand_total: 100 }),
        ]);
        expect(s.totalByCurrency).toEqual({ EUR: 604, USD: 2640 });
        expect(s.poCount).toBe(3);
    });

    it("son sipariş tarihi en büyüğü; iptal onu ileri taşımaz", () => {
        const s = summarizeVendorPurchases([
            po({ order_date: "2026-03-01" }),
            po({ order_date: "2026-07-28" }),
            po({ order_date: "2026-12-31", status: "cancelled" }),
        ]);
        expect(s.lastOrderDate).toBe("2026-07-28");
    });

    it("numeric string tutarı sayıya çevirir (PostgREST davranışı)", () => {
        expect(summarizeVendorPurchases([po({ grand_total: "54.00" })]).totalByCurrency).toEqual({ USD: 54 });
    });

    it("redakte edilmiş (null) tutar toplamı kirletmez ama PO sayılır", () => {
        // view_purchase_costs yoksa grand_total null gelir.
        const s = summarizeVendorPurchases([po({ grand_total: null })]);
        expect(s.poCount).toBe(1);
        expect(s.totalByCurrency).toEqual({});
    });

    it("boş listede sıfır durumu", () => {
        expect(summarizeVendorPurchases([])).toEqual(emptyVendorPurchaseSummary());
    });
});

describe("sortVendorProducts", () => {
    const p = (over: Partial<VendorSuppliedProduct>): VendorSuppliedProduct => ({
        productId: "1", sku: "S", name: "A", unit: "adet", vendorSku: null,
        leadTimeDays: null, moq: null, isPreferred: false,
        lastUnitPrice: null, lastPriceCurrency: null, lastPriceAt: null, ...over,
    });

    it("tercih edilenler önce, sonra ada göre (tr sıralaması)", () => {
        const out = sortVendorProducts([
            p({ productId: "1", name: "Zeta" }),
            p({ productId: "2", name: "Çelik", isPreferred: true }),
            p({ productId: "3", name: "Alfa" }),
        ]);
        expect(out.map(x => x.name)).toEqual(["Çelik", "Alfa", "Zeta"]);
    });

    it("fiyatsız ürün elenmez (bilgi olarak değerli)", () => {
        const out = sortVendorProducts([p({ productId: "1", lastUnitPrice: null })]);
        expect(out).toHaveLength(1);
    });

    it("girdiyi mutasyona uğratmaz", () => {
        const input = [p({ productId: "1", name: "B" }), p({ productId: "2", name: "A" })];
        sortVendorProducts(input);
        expect(input.map(x => x.name)).toEqual(["B", "A"]);
    });
});

describe("detail ucu", () => {
    it("view_vendors guard'lı", () => {
        expect(ROUTE_SRC).toMatch(/requirePermissionFor\(ctx, "view_vendors"\)/);
    });

    it("fiyatlar redaction'dan geçer (link + PO)", () => {
        expect(ROUTE_SRC).toMatch(/redactVendorLinksForPerms\(links, ctx\.perms\)/);
        expect(ROUTE_SRC).toMatch(/redactPurchaseOrdersForPerms\(purchaseOrders, ctx\.perms\)/);
    });

    it("ürün adları tek batch ile çözülür (N+1 yok)", () => {
        expect(ROUTE_SRC).toMatch(/dbGetProductRefsByIds\(links\.map\(l => l\.product_id\)\)/);
    });

    it("yetim link (silinmiş ürün) satırı sessizce atlanır", () => {
        expect(ROUTE_SRC).toMatch(/if \(!p\) return \[\];/);
    });

    it("olmayan tedarikçi 404", () => {
        expect(ROUTE_SRC).toMatch(/Tedarikçi bulunamadı[\s\S]{0,40}status: 404/);
    });
});

describe("liste + panel bağlantısı", () => {
    it("satır tıklaması paneli açar, klavye erişimi DataTable'dan gelir", () => {
        expect(LIST_SRC).toMatch(/onRowClick=\{v => setSelectedVendor\(v\)\}/);
        expect(LIST_SRC).toMatch(/rowAriaLabel=\{v => `\$\{v\.name\} detayını gör`\}/);
    });

    it("aksiyon butonları tıklamayı satıra sızdırmaz", () => {
        const actions = LIST_SRC.slice(LIST_SRC.indexOf('key: "actions"'));
        expect(actions).toMatch(/onClick=\{e => e\.stopPropagation\(\)\}/);
    });

    it("panel yükleme/hata/boş durumlarını ayrı ayrı gösterir", () => {
        expect(PANEL_SRC).toContain("Yükleniyor…");
        expect(PANEL_SRC).toContain("Detay yüklenemedi.");
        expect(PANEL_SRC).toMatch(/Bu tedarikçiye bağlı ürün yok/);
    });

    it("redakte fiyat '—' gösterir, sayı uydurmaz", () => {
        expect(PANEL_SRC).toMatch(/p\.lastUnitPrice != null && p\.lastPriceCurrency\s*\n?\s*\? formatCurrency/);
    });

    it("unmount sonrası setState yapmaz (alive guard)", () => {
        expect(PANEL_SRC).toMatch(/return \(\) => \{ alive = false; \};/);
    });
});
