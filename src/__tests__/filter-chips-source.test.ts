import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const CUSTOMERS = read("src/app/dashboard/customers/CustomersClient.tsx");
const PURCHASE_ORDERS = read("src/app/dashboard/purchase/orders/PurchaseOrdersClient.tsx");
const PRODUCTS = read("src/app/dashboard/products/page.tsx");
const NOTE_TEMPLATES = read("src/components/settings/NoteTemplatesTab.tsx");
const QUOTES = read("src/app/dashboard/quotes/QuotesClient.tsx");
const ORDERS = read("src/app/dashboard/orders/OrdersClient.tsx");
const ALERTS = read("src/app/dashboard/alerts/page.tsx");
const SUGGESTED = read("src/app/dashboard/purchase/suggested/page.tsx");

/**
 * 2026-08-31: bu dosya `underlined-filter-tabs-source.test.ts`'in yerine geçti.
 *
 * Önceki tur hap çiplerini alt çizgili sekmelere ÇEVİRMİŞTİ ve bu testin eski
 * hali hap çiplerini yasaklıyordu. Kullanıcı tersini istedi: "kategoriler
 * butonlar falan beyaz olsun, mavi olması gerekenler mavi olsun". Alt çizgili
 * sekmenin dolgusu olamayacağı için tek çip diline geçildi.
 *
 * Kaybolan okunurluk yok: pasif çip artık `--text-primary` (secondary buton
 * metni), eski pasif sekmenin `--text-interactive-muted`'ından daha koyu.
 */
describe("FilterChips sayfa benimsemesi", () => {
    const ALL = { CUSTOMERS, PURCHASE_ORDERS, PRODUCTS, NOTE_TEMPLATES, QUOTES, ORDERS, ALERTS, SUGGESTED };

    it("kategori sekmesi olan her sayfa ortak bileşeni kullanır", () => {
        for (const [name, source] of Object.entries(ALL)) {
            expect(source, name).toContain("FilterChips");
        }
    });

    it("liste sayfaları erişilebilir filtre adını korur", () => {
        expect(QUOTES).toContain('ariaLabel="Teklif durumu filtresi"');
        expect(ORDERS).toContain('ariaLabel="Sipariş durumu filtresi"');
        expect(PURCHASE_ORDERS).toContain('ariaLabel="Satın alma siparişi durumu filtresi"');
        expect(PRODUCTS).toContain('ariaLabel="Ürün sinyal filtresi"');
        expect(ALERTS).toContain('ariaLabel="Uyarı kategorileri"');
        expect(SUGGESTED).toContain('ariaLabel="Öneri türü filtresi"');
    });

    it("sayaçlı sekmeler sayacını vermeye devam eder", () => {
        expect(CUSTOMERS).toContain('{ key: "all", label: "Tümü", count: displayCounts.all }');
        expect(CUSTOMERS).toContain('{ key: "active", label: "Aktif", count: displayCounts.active }');
        expect(NOTE_TEMPLATES).toContain('{ key: "all", label: "Tümü", count: templates.length }');
        expect(NOTE_TEMPLATES).toContain("count: kindCounts[kind]");
        expect(PURCHASE_ORDERS).toContain("displayCounts[t.key]");
    });

    it("satın alma A1 kazanımı korunur (sunucu sayfalama, bellekte filtre yok)", () => {
        expect(PURCHASE_ORDERS).not.toContain('fetch("/api/purchase-orders")');
        expect(PURCHASE_ORDERS).not.toContain("orders.filter((o) => o.status === activeTab)");
    });

    it("stok sayfası yalnız Sinyal filtresini çipe taşır, kategori/tip kontrolleri kalır", () => {
        expect(PRODUCTS).toContain("setCategoryDropdownOpen");
        expect(PRODUCTS).toContain("setFilterManufactured");
        expect(PRODUCTS).toContain("setFilterCommercial");
    });

    it("tek-seçimli kategori sekmesini kimse elle örmez", () => {
        // Kural KAVRAMI hedefler: `role="tab"` = tek-seçimli kategori sekmesi.
        // Çoklu seçim kutucukları (stok sayfasındaki İmalat/Ticari) bilerek
        // DIŞARIDA — onlar sekme değil, kendi işaretli/işaretsiz durumu olan
        // ayrı bir kontrol. Yüzeyleri yine de beyaza hizalandı; aşağıda kilitli.
        for (const [name, source] of Object.entries(ALL)) {
            expect(source, name).not.toContain('role="tab"');
        }
    });

    it("stok sayfasının çoklu seçim kutucukları da dolgusuz kalmaz", () => {
        expect(PRODUCTS).toContain('background: active ? "var(--accent-bg)" : "var(--surface-raised)"');
    });

    it("yerine geçilen iki bileşen artık yok", () => {
        // Aksi halde iki rakip çip dili kalır ve zamanla ayrışır.
        for (const gone of [
            "src/components/ui/UnderlinedFilterTabs.tsx",
            "src/components/alerts/ClassificationTabs.tsx",
        ]) {
            expect(() => read(gone), gone).toThrow();
        }
    });
});
