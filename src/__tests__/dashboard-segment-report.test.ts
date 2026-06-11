/**
 * Source-regression: Genel Bakış işlevsel dönem segmenti + yazdırılabilir rapor.
 *
 *  - Segment aktif sınıfı `is-active` (eski `"on"` bug'ı düzeltildi → globals.css .seg button.is-active).
 *  - `range` → `periodModel` → buildKpis + trend (revenue/orderCounts/cogs ByPeriod) sürer.
 *  - Trend boş-durum ("Bu dönemde sipariş yok") düz-sıfır eksen yerine.
 *  - Rapor: ekran sarmalı `dashboard-screen-only` + `<DashboardReport>` mount; .seg active CSS mevcut.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");
const PAGE = read("src/app/dashboard/page.tsx");
const CSS = read("src/app/globals.css");

describe("page.tsx — işlevsel dönem segmenti", () => {
    it("aktif buton sınıfı 'is-active' (eski 'on' değil)", () => {
        expect(PAGE).toMatch(/range === r \? "is-active" : ""/);
        expect(PAGE).not.toMatch(/range === r \? "on" : ""/);
    });

    it("globals.css .seg button.is-active kuralı var", () => {
        expect(CSS).toMatch(/\.seg button\.is-active/);
    });

    it("periodModel range'i sürer ve buildKpis'e period geçer", () => {
        expect(PAGE).toMatch(/periodModel\(range, now\)/);
        expect(PAGE).toMatch(/buildKpis\(\s*[\s\S]*?period,\s*\)/);
    });

    it("trend seçili dönem helper'larıyla beslenir", () => {
        expect(PAGE).toMatch(/revenueByPeriod\(orders, reporting, rates, period\)/);
        expect(PAGE).toMatch(/orderCountsByPeriod\(orders, period\)/);
        expect(PAGE).toMatch(/cogsByPeriod\(finance\.cogs, reporting, rates, period\)/);
        expect(PAGE).toMatch(/months=\{period\.labels\}/);
        expect(PAGE).toMatch(/period\.trendSub/);
    });

    it("trend boş-durum metni (düz-sıfır eksen yerine)", () => {
        expect(PAGE).toMatch(/trendEmpty/);
        expect(PAGE).toMatch(/Bu dönemde sipariş yok/);
    });

    it("Hafta/Bugün maliyet granülerlik notu trend panelinde gösterilir (Finansal Özet kaldırıldı)", () => {
        expect(PAGE).toMatch(/costGranularityNote &&/);
        expect(PAGE).toMatch(/Maliyet aylık\/çeyreklik bazda gösterilir/);
        expect(PAGE).not.toMatch(/<FinancePanel/);
    });
});

describe("page.tsx — yazdırılabilir rapor (ekran görüntüsü değil)", () => {
    it("ekran içeriği dashboard-screen-only sarmalında", () => {
        expect(PAGE).toMatch(/className="dashboard-screen-only"/);
    });

    it("DashboardReport mount edilir (seçili range ile)", () => {
        expect(PAGE).toMatch(/<DashboardReport/);
        expect(PAGE).toMatch(/range=\{range\}/);
    });

    it("zengin künye: hazırlayan kullanıcı paylaşılan profil hook'undan gelir (perf Faz 4)", () => {
        // Eski: sayfa kendi /api/settings/user/profile fetch'ini atıyordu (Topbar
        // ile duplicate). Yeni: useUserProfile — Topbar avatarıyla TEK istek.
        expect(PAGE).toMatch(/useUserProfile\(\)/);
        expect(PAGE).not.toMatch(/fetch\("\/api\/settings\/user\/profile"\)/);
        expect(PAGE).toMatch(/preparedBy = profile\?\.fullName \|\| profile\?\.email \|\| null/);
        expect(PAGE).toMatch(/preparedBy=\{preparedBy\}/);
    });

    it("rapor TÜM uyarı + ilk 10 sipariş taşır (ekran panelleri top-5 kalır)", () => {
        expect(PAGE).toMatch(/alertsView\(openAlerts, openAlerts\.length, now\)/);
        expect(PAGE).toMatch(/recentOrdersView\(orders, reporting, rates, canViewSalesPrices, 10\)/);
        expect(PAGE).toMatch(/alertRows=\{reportAlertRows\}/);
        expect(PAGE).toMatch(/orderRows=\{reportOrderRows\}/);
    });

    it("Rapor indir butonu window.print çağırır (artık rapor basılır)", () => {
        expect(PAGE).toMatch(/onClick=\{\(\) => window\.print\(\)\}/);
        expect(PAGE).toMatch(/Rapor indir/);
    });
});

describe("globals.css — rapor baskı kuralları", () => {
    it("ekranda gizli, baskıda görünür + 9px global override'ı ezer", () => {
        expect(CSS).toMatch(/\.dashboard-print-report \{ display: none; \}/);
        expect(CSS).toMatch(/\.dashboard-screen-only \{ display: none !important; \}/);
        expect(CSS).toMatch(/\.dashboard-print-report \{[\s\S]*?font-size: 11px !important/);
    });
});
