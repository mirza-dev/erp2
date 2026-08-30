/**
 * Genel Bakış — TAM-SADIK yeniden kurulum: koruma/regresyon kilidi (feedback_no_silent_deletes).
 *  - Faz 1'in "Stok Envanteri / Veri Aktarımı" link kartları tasarımda yok → kaldırıldı.
 *    İŞLEV KAYBI DEĞİL: Sidebar'da "Stok & Ürünler" + "Veri Aktarım Merkezi" linkleri korunur.
 *  - StatsCards/StockDataGrid/AIAlerts/RecentOrders/AISummaryCard dosyaları repoda KALIR.
 *  - Sayfa tüm tasarım panellerini (Finance/Production/Orders/Stock/Reorder/Alerts/AI) render eder.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const PAGE = readFileSync(join(root, "src/app/dashboard/page.tsx"), "utf8");
const SIDEBAR = readFileSync(join(root, "src/components/layout/Sidebar.tsx"), "utf8");
const GLOBALS = readFileSync(join(root, "src/app/globals.css"), "utf8");
const KPI_CARD = readFileSync(join(root, "src/components/dashboard/overview/KpiCard.tsx"), "utf8");

describe("işlev kaybı yok — link kartları Sidebar'da korunur", () => {
    it("Sidebar Stok & Ürünler → /dashboard/products", () => {
        expect(SIDEBAR).toMatch(/href:\s*"\/dashboard\/products"/);
    });
    it("Sidebar Veri Aktarım Merkezi → /dashboard/import", () => {
        expect(SIDEBAR).toMatch(/href:\s*"\/dashboard\/import"/);
    });
    it("sayfa tasarım dışı link kartlarını içermez (sadakat)", () => {
        expect(PAGE).not.toMatch(/Stok Envanteri/);
        expect(PAGE).not.toMatch(/Veri Aktarımı/);
    });
});

describe("değiştirme — sessiz silme değil", () => {
    it("sayfa StatsCards / StockDataGrid / AISummaryCard mount etmez", () => {
        expect(PAGE).not.toMatch(/<StatsCards/);
        expect(PAGE).not.toMatch(/<StockDataGrid/);
        expect(PAGE).not.toMatch(/<AISummaryCard/);
    });
    it("bileşen dosyaları repoda kalır (silinmedi)", () => {
        for (const f of ["StatsCards", "StockDataGrid", "AIAlerts", "RecentOrders", "AISummaryCard"]) {
            expect(existsSync(join(root, `src/components/dashboard/${f}.tsx`))).toBe(true);
        }
    });
});

describe("view-model normalizasyon fonksiyonları import edilir", () => {
    it("buildKpis + revenue/cost + stock + production + reorder/alerts/orders", () => {
        for (const fn of [
            "buildKpis", "revenueByPeriod", "cogsByPeriod",
            "stockValueByCategoryReporting",
            "productionDailySeries", "reorderView", "alertsView", "recentOrdersView",
            "QuotePipelineInput", "IncomingPoInput",
        ]) {
            expect(PAGE).toMatch(new RegExp(fn));
        }
        // Alacak Yaşlandırma ekrandan VE rapordan kaldırıldı — page artık
        // receivablesAging çağırmaz (Açık Alacak KPI'ı buildKpis içinde hesaplar).
        expect(PAGE).not.toMatch(/receivablesAging/);
    });
});

describe("tasarım panelleri render edilir (DashDetailed)", () => {
    it("kpi-strip + trend + 6 panel + AI", () => {
        expect(PAGE).toMatch(/className="kpi-strip"/);
        expect(PAGE).toMatch(/aria-label="Temel performans göstergeleri"/);
        expect(PAGE).toMatch(/<TrendChart/);
        expect(PAGE).toMatch(/<ProductionPanel/);
        expect(PAGE).toMatch(/<OrdersPanel/);
        expect(PAGE).toMatch(/<StockPanel/);
        expect(PAGE).toMatch(/<ReorderPanel/);
        expect(PAGE).toMatch(/<AlertsPanel/);
        expect(PAGE).toMatch(/<AiPanel/);
        expect(PAGE).toMatch(/overview-grid-1-1/);
    });
    it("PageHeader segment + Raporu yazdır (dekoratif)", () => {
        expect(PAGE).toMatch(/className="seg"/);
        // KOBİ-sim O7: etiket "Rapor indir" → "Raporu yazdır / PDF"
        // (düğme dosya indirmiyor, window.print() açıyor).
        expect(PAGE).toMatch(/Raporu yazdır \/ PDF/);
        expect(PAGE).toMatch(/window\.print\(\)/);
    });
});

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    // Satır yorumları ÖNCE ayıklanır: bir `//` yorumunun içindeki `/**`
    // (ör. "// /dashboard/** erişimi") aksi hâlde blok yorum başlangıcı
    // sanılıp sonraki `*/`e kadar GERÇEK KODU yutuyordu (2026-08).
    return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Tek bir CSS kuralının gövdesini çeker.
 *
 * NEDEN yardımcı: eski kilit `/\.kpi-strip\s*\{[\s\S]*overflow-x:\s*auto/`
 * kalıbını kullanıyordu — `[\s\S]*` açgözlü olduğu için dosyanın İLERİSİNDEKİ
 * herhangi bir `overflow-x: auto` da eşleşiyordu. Yani iddia `.kpi-strip`
 * hakkında değil, "globals.css'te bir yerde" hakkındaydı. Kural gövdesini
 * ayırarak iddiaları gerçekten kapsama bağlıyoruz.
 */
function ruleBody(css: string, selector: string): string {
    const at = css.indexOf(`${selector} {`);
    if (at === -1) return "";
    const open = css.indexOf("{", at);
    return css.slice(open + 1, css.indexOf("}", open));
}

describe("executive KPI şeridi yerleşim kilidi", () => {
    /* 2026-08-29 — ESKİ KİLİT DÜŞTÜ, yerine bu geldi.
       Eski sözleşme: `repeat(7, minmax(182px, 1fr))` + `overflow-x: auto` +
       `scroll-snap-type: x proximity` + açık bir `auto-fit` yasağı; yani
       "yedi kolon tek satır, dar ekranda yatay kaydır".
       Neden düştü: mig.108 uygulanınca /api/parasut/receivables 500 yerine 200
       dönmeye başladı → "Açık Alacak" 8. kart doğdu → 7 sabiti taşıp kartı
       ikinci satırda ÖKSÜZ bıraktı. Kart sayısı role ve fetch başarısına göre
       5-8 arasında değiştiği için HİÇBİR sabit sayı doğru değil.
       Yeni sözleşme: sarmalayan ızgara, kolon sayısı `data-kpi-count`ten türer. */

    // Yorumsuz sürüm: bu bloğun CSS yorumları da `scroll-snap-type: x mandatory`
    // gibi ifadeleri metin olarak taşıyor — iddia yalnız gerçek kurallara baksın.
    const CSS = code(GLOBALS);
    const strip = ruleBody(CSS, ".kpi-strip");
    const card = ruleBody(CSS, ".kpi-card");

    it("şerit sarmalayan ızgaradır — yatay kaydırma/snap YOK", () => {
        expect(strip).toMatch(/display:\s*grid/);
        expect(strip).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
        expect(strip).not.toMatch(/overflow-x/);
        expect(strip).not.toMatch(/scroll-snap-type/);
        expect(strip).not.toMatch(/repeat\(7,/);
    });

    it("kolon sayısı kart sayısına bağlıdır — 5-6 kart 3'lü olur", () => {
        // Sayfa sayıyı DOM'a taşımazsa CSS kuralı ölü kalır: iki uç birlikte kilitli.
        expect(PAGE).toMatch(/data-kpi-count=\{kpis\.length\}/);
        expect(CSS).toMatch(
            /\.kpi-strip\[data-kpi-count="5"\],\s*\n\s*\.kpi-strip\[data-kpi-count="6"\]\s*\{\s*\n\s*grid-template-columns:\s*repeat\(3,/,
        );
    });

    it("dar görünümde kolon sayısı düşer (wrap yerine kaydırma değil)", () => {
        expect(CSS).toMatch(/@media \(max-width: 1400px\)[\s\S]{0,220}repeat\(3,/);
        expect(CSS).toMatch(/@media \(max-width: 1080px\)[\s\S]{0,220}repeat\(2,/);
        // Eski mobil karusel geri gelmesin.
        expect(CSS).not.toMatch(/scroll-snap-type:\s*x mandatory/);
    });

    it("kart yüksekliği kararlı; min-width ızgarayı taşırmaz; hover React state kullanmaz", () => {
        expect(card).toMatch(/height:\s*138px/);
        // 182px, 2 kolonlu dar ekranda taşmaya yol açardı — yatay scroll kalkınca
        // taşmayı yakalayacak bir emniyet de kalmadı.
        expect(card).toMatch(/min-width:\s*0/);
        expect(card).not.toMatch(/scroll-snap-align/);
        expect(KPI_CARD).not.toMatch(/useState|onMouseEnter|onMouseLeave/);
        // Izgara viewport'tan uzun olabilir → klavye odağı hâlâ görünüre kaymalı.
        expect(KPI_CARD).toMatch(/scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
        expect(KPI_CARD).not.toMatch(/KPI_ICONS|data-kpi-icon|CircleDollarSign|TriangleAlert/);
    });
});

describe("panel yerleşimi — yeni diziliş (Stok tam-genişlik / Üretim|Sipariş / alt alta)", () => {
    it("tek overview-grid-1-1 satırı kaldı (Üretim|Sipariş); Stok tam genişlik", () => {
        const matches = PAGE.match(/className="overview-grid-1-1"/g) ?? [];
        expect(matches.length).toBe(1);
    });
    it("Finansal Özet paneli kaldırıldı; StockPanel stats alır (özet kolonu)", () => {
        expect(PAGE).not.toMatch(/<FinancePanel/);
        expect(PAGE).toMatch(/<StockPanel[\s\S]{0,200}stats=\{stockStats\}/);
    });
    it("Satır 2: ProductionPanel, OrdersPanel'den önce", () => {
        expect(PAGE.indexOf("<ProductionPanel")).toBeLessThan(PAGE.indexOf("<OrdersPanel"));
    });
    it("ProductionPanel fire serisini tüketmez; gerçek scrap view-model'de korunur", () => {
        expect(PAGE).toMatch(/<ProductionPanel days=\{production\.days\} values=\{production\.good\} \/>/);
        expect(PAGE).not.toMatch(/<ProductionPanel[^>]*scrap=/);
    });
    it("AiPanel alt alta blokta — Reorder/Alerts ile birlikte ve hepsinden sonra", () => {
        expect(PAGE.indexOf("<ReorderPanel")).toBeLessThan(PAGE.indexOf("<AlertsPanel"));
        expect(PAGE.indexOf("<AlertsPanel")).toBeLessThan(PAGE.indexOf("<AiPanel"));
        // AiPanel artık panellerin sonunda (en son render edilen panel)
        expect(PAGE.indexOf("<AiPanel")).toBeGreaterThan(PAGE.indexOf("<OrdersPanel"));
    });
});

describe("RBAC finansal gating", () => {
    it("sales/cost yetkileri kullanılır; financial_summary KALKTI (tek tüketicisi Açık Alacak kartıydı)", () => {
        expect(PAGE).toMatch(/canViewSalesPrices/);
        expect(PAGE).toMatch(/canViewPurchaseCosts/);
        expect(PAGE).not.toMatch(/canViewFinancialSummary/);
    });
});

describe("Açık Alacak — proxy hesap kilidi (Faz 14'te kart geri geldi)", () => {
    // Kart 2026-06'da kaldırılmıştı; sebep kartın varlığı DEĞİL, siparişten
    // türetilen güvenilmez proxy hesaptı. Faz 14'te Paraşüt'ün gerçek tahsilat
    // verisiyle geri geldi → kilit artık proxy'yi hedefler.
    it("proxy hesap (receivablesAging) page'de geri gelmez", () => {
        expect(PAGE).not.toContain("receivablesAging");
    });

    it("kur-uyarı satırı korunuyor", () => {
        expect(PAGE).toMatch(/listUnconvertibleCurrencies/);
        expect(PAGE).toContain("Kur verisi alınamadı");
    });
});

describe("Finansal Özet kaldırma kilidi", () => {
    it("financeSummary/grossToNetRevenue çağrısı geri gelmez (panel silindi)", () => {
        expect(PAGE).not.toMatch(/financeSummary\(/);
        expect(PAGE).not.toMatch(/grossToNetRevenue\(/);
    });
    it("maliyet granülerlik notu trend paneline taşındı", () => {
        expect(PAGE).toMatch(/costGranularityNote &&/);
    });
});
