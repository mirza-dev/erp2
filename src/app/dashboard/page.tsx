"use client";

import { useMemo, useState, useEffect } from "react";
import { useData } from "@/lib/data-context";
import { usePermissions } from "@/lib/auth/use-permissions";
import KpiCard from "@/components/dashboard/overview/KpiCard";
import OverviewPanel, { Dot } from "@/components/dashboard/overview/OverviewPanel";
import TrendChart from "@/components/dashboard/overview/charts/TrendChart";
import ProductionPanel from "@/components/dashboard/overview/ProductionPanel";
import AiPanel from "@/components/dashboard/overview/AiPanel";
import { StockPanel, ReorderPanel, AlertsPanel, OrdersPanel, type StockPanelStats } from "@/components/dashboard/overview/RealPanels";
import DashboardReport from "@/components/dashboard/overview/DashboardReport";
import {
    buildKpis, periodModel, revenueByPeriod, orderCountsByPeriod, cogsByPeriod,
    stockValueByCategoryReporting, productionDailySeries,
    reorderView, alertsView, recentOrdersView, listUnconvertibleCurrencies,
    type ExchangeRates, type CogsRow, type RangeKey,
    type QuotePipelineInput, type IncomingPoInput,
} from "@/lib/dashboard-view-model";

interface FinanceData {
    reportingCurrency: string;
    canViewCosts: boolean;
    cogs: CogsRow[] | null;
}

const RANGES: RangeKey[] = ["Bugün", "Hafta", "Ay", "Çeyrek"];

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
    const { canViewSalesPrices, canViewPurchaseCosts } = usePermissions();

    const [range, setRange] = useState<RangeKey>("Ay");
    const [finance, setFinance] = useState<FinanceData>({ reportingCurrency: "USD", canViewCosts: false, cogs: null });
    const [rates, setRates] = useState<ExchangeRates | null>(null);
    // Kur fetch'i sonuçlandı mı? Uyarı satırı yükleme yarışında FLASH etmesin
    // diye yalnız fetch settle olduktan sonra değerlendirilir.
    const [ratesResolved, setRatesResolved] = useState(false);
    const [preparedBy, setPreparedBy] = useState<string | null>(null);
    // null = yüklenmedi/başarısız/yetkisiz → ilgili KPI kartı hiç üretilmez (fail-soft).
    const [quotes, setQuotes] = useState<QuotePipelineInput[] | null>(null);
    const [purchaseOrders, setPurchaseOrders] = useState<IncomingPoInput[] | null>(null);

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
            } catch { /* defansif: kur yok → dönüştürülemeyen tutarlar hariç + uyarı */ }
            finally { if (alive) setRatesResolved(true); }
        })();
        (async () => {
            try {
                const r = await fetch("/api/quotes");
                if (r.ok && alive) {
                    const d = await r.json();
                    if (Array.isArray(d)) setQuotes(d as QuotePipelineInput[]);
                }
            } catch { /* defansif: Teklif Hattı kartı üretilmez */ }
        })();
        (async () => {
            try {
                // view_purchase_orders olmayan rolde 403 → kart hiç görünmez (RBAC fail-soft).
                const r = await fetch("/api/purchase-orders");
                if (r.ok && alive) {
                    const d = await r.json();
                    if (Array.isArray(d)) setPurchaseOrders(d as IncomingPoInput[]);
                }
            } catch { /* defansif: Yoldaki Mal kartı üretilmez */ }
        })();
        (async () => {
            try {
                const r = await fetch("/api/settings/user/profile");
                if (r.ok && alive) {
                    const d = await r.json() as { fullName?: string | null; email?: string | null };
                    setPreparedBy(d.fullName || d.email || null);
                }
            } catch { /* defansif: hazırlayan satırı gizlenir */ }
        })();
        return () => { alive = false; };
    }, []);

    const now = useMemo(() => new Date(), []);
    const reporting = finance.reportingCurrency;
    const period = useMemo(() => periodModel(range, now), [range, now]);

    const kpis = useMemo(
        () => buildKpis(
            { products, orders, uretimKayitlari, openAlerts, reporting, rates, quotes, purchaseOrders },
            { canViewSalesPrices },
            now,
            period,
        ),
        [products, orders, uretimKayitlari, openAlerts, reporting, rates, quotes, purchaseOrders, canViewSalesPrices, now, period],
    );

    // Kur çözülemeyen para birimleri → toplamların dışında kaldılar; görünür uyarı.
    const unconvertible = useMemo(() => {
        if (!ratesResolved) return [];
        const curs = new Set<string>();
        for (const o of orders) curs.add(o.currency);
        for (const p of products) if (p.isActive) curs.add(p.currency);
        for (const q of quotes ?? []) curs.add(q.currency);
        for (const po of purchaseOrders ?? []) curs.add(po.currency);
        return listUnconvertibleCurrencies(curs, reporting, rates);
    }, [ratesResolved, orders, products, quotes, purchaseOrders, reporting, rates]);

    // ── Trend (ciro + maliyet + sipariş) — seçili döneme göre ──
    const revenueSeries = useMemo(
        () => (canViewSalesPrices ? revenueByPeriod(orders, reporting, rates, period) : null),
        [orders, reporting, rates, canViewSalesPrices, period],
    );
    const costSeries = useMemo(
        () => (canViewPurchaseCosts && finance.cogs ? cogsByPeriod(finance.cogs, reporting, rates, period) : null),
        [finance.cogs, reporting, rates, canViewPurchaseCosts, period],
    );
    const orderCounts = useMemo(() => orderCountsByPeriod(orders, period), [orders, period]);
    const trendEmpty = useMemo(() => orderCounts.reduce((a, b) => a + b, 0) === 0, [orderCounts]);
    // Maliyet bu dönemde kovalanamıyorsa (Hafta/Bugün) — veri-bug değil, granülerlik sınırı.
    const costGranularityNote = useMemo(
        () => (canViewSalesPrices && canViewPurchaseCosts && !!finance.cogs && !period.monthAligned
            ? "Maliyet aylık/çeyreklik bazda gösterilir" : undefined),
        [canViewSalesPrices, canViewPurchaseCosts, finance.cogs, period],
    );

    // ── Stok donut + özet istatistikler (eski Finansal Özet alanını karşılar) ──
    const stock = useMemo(
        () => stockValueByCategoryReporting(products, reporting, rates),
        [products, reporting, rates],
    );
    const stockStats = useMemo<StockPanelStats>(() => {
        const active = products.filter((p) => p.isActive);
        let criticalCount = 0;
        let riskCount = 0;
        for (const p of active) {
            const a = p.available_now ?? 0;
            const m = p.minStockLevel ?? 0;
            if (a <= m) criticalCount++;
            else if (a <= Math.ceil(m * 1.5)) riskCount++;
        }
        return { productCount: active.length, criticalCount, riskCount };
    }, [products]);

    // ── Üretim good/scrap ──
    const production = useMemo(() => productionDailySeries(uretimKayitlari, now, 14), [uretimKayitlari, now]);

    // ── Sağ kolon ──
    const reorderRows = useMemo(() => reorderView(reorderSuggestions), [reorderSuggestions]);
    const alertRows = useMemo(() => alertsView(openAlerts, 5, now), [openAlerts, now]);
    const orderRows = useMemo(
        () => recentOrdersView(orders, reporting, rates, canViewSalesPrices),
        [orders, reporting, rates, canViewSalesPrices],
    );
    // Rapor: ekran panelleri top-5; rapor TÜM uyarı + ilk 10 sipariş taşır.
    const reportAlertRows = useMemo(() => alertsView(openAlerts, openAlerts.length, now), [openAlerts, now]);
    const reportOrderRows = useMemo(
        () => recentOrdersView(orders, reporting, rates, canViewSalesPrices, 10),
        [orders, reporting, rates, canViewSalesPrices],
    );

    const dateStr = useMemo(
        () => new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now),
        [now],
    );

    const gap = 16;

    return (
        <div>
        <div className="dashboard-screen-only">
            {/* PageHeader */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 19, fontWeight: 650, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>Genel Bakış</h1>
                    <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 3 }}>{dateStr} · PMT Endüstriyel</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div className="seg" role="group" aria-label="Dönem aralığı">
                        {RANGES.map((r) => (
                            <button key={r} className={range === r ? "is-active" : ""} aria-pressed={range === r} onClick={() => setRange(r)} type="button">{r}</button>
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
            <div className="kpi-strip" style={{ marginBottom: unconvertible.length > 0 ? 8 : gap }}>
                {kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
            </div>
            {unconvertible.length > 0 && (
                <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--warning-text)", marginBottom: gap }}>
                    <span aria-hidden="true">⚠</span>
                    Kur verisi alınamadı — {unconvertible.join(", ")} tutarları toplamlara dahil edilemedi.
                </div>
            )}

            {/* Ciro & Maliyet Trendi */}
            <OverviewPanel
                title="Ciro & Maliyet Trendi"
                sub={`${period.trendSub} · ${reporting}`}
                style={{ marginBottom: gap }}
                actions={TrendLegend}
            >
                {!revenueSeries ? (
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "40px 0" }}>
                        Ciro görüntüleme yetkiniz yok.
                    </div>
                ) : trendEmpty ? (
                    <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", textAlign: "center", padding: "48px 0" }}>
                        Bu dönemde sipariş yok.
                    </div>
                ) : (
                    <>
                        <TrendChart
                            months={period.labels}
                            revenue={revenueSeries}
                            cost={costSeries ?? []}
                            orders={orderCounts}
                            currency={reporting}
                            showCost={!!costSeries}
                        />
                        {/* Maliyet granülerlik notu (eskiden Finansal Özet panelindeydi) */}
                        {costGranularityNote && (
                            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 8 }}>{costGranularityNote}</div>
                        )}
                    </>
                )}
            </OverviewPanel>

            {/* Satır 1: Stok Dağılımı — tam genişlik (Finansal Özet paneli kaldırıldı) */}
            <div style={{ marginBottom: gap }}>
                <StockPanel segments={stock.segments} currency={reporting} canView={canViewSalesPrices} stats={stockStats} />
            </div>

            {/* Satır 2: Üretim + Son Siparişler */}
            <div className="overview-grid-1-1" style={{ marginBottom: gap }}>
                <ProductionPanel days={production.days} good={production.good} scrap={production.scrap} />
                <OrdersPanel rows={orderRows} />
            </div>

            {/* Alt alta tam genişlik: Satın Alma Önerileri · Kritik Uyarılar · AI Önerileri */}
            <div style={{ display: "flex", flexDirection: "column", gap }}>
                <ReorderPanel rows={reorderRows} />
                <AlertsPanel rows={alertRows} total={openAlerts.length} />
                <AiPanel />
            </div>
        </div>

        {/* Yazdırılabilir rapor — ekranda gizli, yalnız baskıda (Rapor indir → PDF) */}
        <DashboardReport
            range={range}
            dateStr={dateStr}
            reporting={reporting}
            preparedBy={preparedBy}
            kpis={kpis}
            trendSub={period.trendSub}
            labels={period.labels}
            revenue={revenueSeries}
            cost={costSeries ?? null}
            counts={orderCounts}
            trendEmpty={trendEmpty}
            stockSegments={stock.segments}
            stockStats={stockStats}
            orderRows={reportOrderRows}
            alertRows={reportAlertRows}
            canViewPrices={canViewSalesPrices}
        />
        </div>
    );
}
