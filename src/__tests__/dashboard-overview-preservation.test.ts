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
        expect(PAGE).toMatch(/<TrendChart/);
        expect(PAGE).toMatch(/<ProductionPanel/);
        expect(PAGE).toMatch(/<OrdersPanel/);
        expect(PAGE).toMatch(/<StockPanel/);
        expect(PAGE).toMatch(/<ReorderPanel/);
        expect(PAGE).toMatch(/<AlertsPanel/);
        expect(PAGE).toMatch(/<AiPanel/);
        expect(PAGE).toMatch(/overview-grid-1-1/);
    });
    it("PageHeader segment + Rapor indir (dekoratif)", () => {
        expect(PAGE).toMatch(/className="seg"/);
        expect(PAGE).toMatch(/Rapor indir/);
        expect(PAGE).toMatch(/window\.print\(\)/);
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
    it("AiPanel alt alta blokta — Reorder/Alerts ile birlikte ve hepsinden sonra", () => {
        expect(PAGE.indexOf("<ReorderPanel")).toBeLessThan(PAGE.indexOf("<AlertsPanel"));
        expect(PAGE.indexOf("<AlertsPanel")).toBeLessThan(PAGE.indexOf("<AiPanel"));
        // AiPanel artık panellerin sonunda (en son render edilen panel)
        expect(PAGE.indexOf("<AiPanel")).toBeGreaterThan(PAGE.indexOf("<OrdersPanel"));
    });
});

describe("RBAC finansal gating", () => {
    it("sales/cost/financial_summary yetkileri kullanılır", () => {
        expect(PAGE).toMatch(/canViewSalesPrices/);
        expect(PAGE).toMatch(/canViewPurchaseCosts/);
        expect(PAGE).toMatch(/canViewFinancialSummary/);
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
