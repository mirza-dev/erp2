"use client";

import { useMemo, useState, useEffect } from "react";
import { useData } from "@/lib/data-context";
import { usePermissions } from "@/lib/auth/use-permissions";
import KpiCard from "@/components/dashboard/overview/KpiCard";
import OverviewPanel, { Dot } from "@/components/dashboard/overview/OverviewPanel";
import TrendChart from "@/components/dashboard/overview/charts/TrendChart";
import FinancePanel from "@/components/dashboard/overview/FinancePanel";
import ProductionPanel from "@/components/dashboard/overview/ProductionPanel";
import AiPanel from "@/components/dashboard/overview/AiPanel";
import { StockPanel, ReorderPanel, AlertsPanel, OrdersPanel } from "@/components/dashboard/overview/RealPanels";
import {
    buildKpis, monthLabels, monthlyRevenueReporting, monthlyOrderCounts, cogsToReporting,
    stockValueByCategoryReporting, receivablesAging, financeSummary, grossToNetRevenue, productionDailySeries,
    reorderView, alertsView, recentOrdersView,
    type ExchangeRates, type CogsRow,
} from "@/lib/dashboard-view-model";

interface FinanceData {
    reportingCurrency: string;
    canViewCosts: boolean;
    cogs: CogsRow[] | null;
}

const RANGES = ["Bugün", "Hafta", "Ay", "Çeyrek"] as const;

/** Ciro / Maliyet legend (trend paneli aksiyonu). */
const TrendLegend = (
    <div style={{ display: "flex", gap: 12, fontSize: 10.5, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-tertiary)" }}><Dot tone="var(--accent)" /> Ciro</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-tertiary)" }}>
            <span style={{ width: 10, height: 2, background: "var(--text-tertiary)", borderRadius: 2 }} /> Maliyet
        </span>
    </div>
);

export default function DashboardPage() {
    const { products, orders, uretimKayitlari, openAlerts, reorderSuggestions } = useData();
    const { canViewSalesPrices, canViewPurchaseCosts, canViewFinancialSummary } = usePermissions();

    const [range, setRange] = useState<(typeof RANGES)[number]>("Ay");
    const [finance, setFinance] = useState<FinanceData>({ reportingCurrency: "USD", canViewCosts: false, cogs: null });
    const [rates, setRates] = useState<ExchangeRates | null>(null);

    // Maliyet + raporlama para birimi + döviz kurları (mount'ta bir kez)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await fetch("/api/dashboard/finance");
                if (r.ok && alive) setFinance(await r.json());
            } catch { /* defansif: USD + maliyet yok */ }
        })();
        (async () => {
            try {
                const r = await fetch("/api/exchange-rates");
                if (r.ok && alive) setRates(await r.json());
            } catch { /* defansif: TRY=1, diğerleri dönüştürülmez */ }
        })();
        return () => { alive = false; };
    }, []);

    const now = useMemo(() => new Date(), []);
    const reporting = finance.reportingCurrency;

    const kpis = useMemo(
        () => buildKpis(
            { products, orders, uretimKayitlari, openAlerts, reporting, rates },
            { canViewSalesPrices, canViewFinancialSummary },
            now,
        ),
        [products, orders, uretimKayitlari, openAlerts, reporting, rates, canViewSalesPrices, canViewFinancialSummary, now],
    );

    // ── Trend (ciro + maliyet + sipariş) ──
    const months = useMemo(() => monthLabels(now), [now]);
    const revenueSeries = useMemo(
        () => (canViewSalesPrices ? monthlyRevenueReporting(orders, reporting, rates, now) : null),
        [orders, reporting, rates, canViewSalesPrices, now],
    );
    const costSeries = useMemo(
        () => (canViewPurchaseCosts && finance.cogs ? cogsToReporting(finance.cogs, reporting, rates, now) : null),
        [finance.cogs, reporting, rates, canViewPurchaseCosts, now],
    );
    const orderCounts = useMemo(() => monthlyOrderCounts(orders, now), [orders, now]);

    // ── Stok donut ──
    const stock = useMemo(
        () => stockValueByCategoryReporting(products, reporting, rates),
        [products, reporting, rates],
    );

    // ── Finansal özet + alacak ──
    const financePanel = useMemo(() => {
        if (!(canViewSalesPrices && canViewPurchaseCosts) || !revenueSeries || !costSeries) return null;
        // Ciro grandTotal (KDV dahil), COGS vergisiz → kâr/marj NET ciro tabanında hesaplanır.
        return financeSummary(grossToNetRevenue(revenueSeries[11] ?? 0), costSeries[11] ?? 0);
    }, [canViewSalesPrices, canViewPurchaseCosts, revenueSeries, costSeries]);
    const receivables = useMemo(
        () => (canViewFinancialSummary ? receivablesAging(orders, reporting, rates, now) : null),
        [orders, reporting, rates, canViewFinancialSummary, now],
    );

    // ── Üretim good/scrap ──
    const production = useMemo(() => productionDailySeries(uretimKayitlari, now, 14), [uretimKayitlari, now]);

    // ── Sağ kolon ──
    const reorderRows = useMemo(() => reorderView(reorderSuggestions), [reorderSuggestions]);
    const alertRows = useMemo(() => alertsView(openAlerts, 5, now), [openAlerts, now]);
    const orderRows = useMemo(
        () => recentOrdersView(orders, reporting, rates, canViewSalesPrices),
        [orders, reporting, rates, canViewSalesPrices],
    );

    const dateStr = useMemo(
        () => new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now),
        [now],
    );
    const monthLabel = useMemo(
        () => new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(now),
        [now],
    );

    const gap = 16;

    return (
        <div>
            {/* PageHeader */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 19, fontWeight: 650, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>Genel Bakış</h1>
                    <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 3 }}>{dateStr} · PMT Endüstriyel</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div className="seg" role="group" aria-label="Dönem aralığı">
                        {RANGES.map((r) => (
                            <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)} type="button">{r}</button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                            padding: "6px 12px", borderRadius: 7, cursor: "pointer", color: "#fff",
                            background: "var(--accent)", border: "1px solid var(--accent-border)",
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M8 2v7m0 0L5 6m3 3l3-3M3 12v2h10v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Rapor indir
                    </button>
                </div>
            </div>

            {/* KPI şeridi */}
            <div className="kpi-strip" style={{ marginBottom: gap }}>
                {kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
            </div>

            {/* Ciro & Maliyet Trendi */}
            <OverviewPanel
                title="Ciro & Maliyet Trendi"
                sub={`Son 12 ay · ${reporting}`}
                style={{ marginBottom: gap }}
                actions={TrendLegend}
            >
                {revenueSeries ? (
                    <TrendChart
                        months={months}
                        revenue={revenueSeries}
                        cost={costSeries ?? []}
                        orders={orderCounts}
                        currency={reporting}
                        showCost={!!costSeries}
                    />
                ) : (
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "40px 0" }}>
                        Ciro görüntüleme yetkiniz yok.
                    </div>
                )}
            </OverviewPanel>

            {/* İki kolon */}
            <div className="overview-grid-1-1" style={{ marginBottom: gap }}>
                <div style={{ display: "flex", flexDirection: "column", gap }}>
                    <FinancePanel reporting={reporting} monthLabel={monthLabel} finance={financePanel} canViewCosts={canViewSalesPrices && canViewPurchaseCosts} receivables={receivables} />
                    <ProductionPanel days={production.days} good={production.good} scrap={production.scrap} />
                    <OrdersPanel rows={orderRows} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap }}>
                    <StockPanel segments={stock.segments} currency={reporting} canView={canViewSalesPrices} />
                    <ReorderPanel rows={reorderRows} />
                    <AlertsPanel rows={alertRows} total={openAlerts.length} />
                </div>
            </div>

            {/* AI Operasyon Özeti */}
            <AiPanel />
        </div>
    );
}
