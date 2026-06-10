"use client";

import OverviewPanel from "./OverviewPanel";
import AgingBars from "./charts/AgingBars";
import {
    formatReportingM, formatReportingCompact, currencySymbol,
    type FinanceSummary, type ReceivablesView,
} from "@/lib/dashboard-view-model";

interface FinancePanelProps {
    reporting: string;
    monthLabel: string;
    /** ciro − COGS özeti; veri yoksa null (yetki ayrı: canViewCosts). */
    finance: FinanceSummary | null;
    /** maliyet/kâr görüntüleme yetkisi (sales+cost). false → "yetki yok"; true+finance null → "veri hazır değil". */
    canViewCosts: boolean;
    /** alacak yaşlandırma; view_financial_summary yoksa null. */
    receivables: ReceivablesView | null;
    /** Maliyet bu dönemde kovalanamıyorsa (Hafta/Bugün) granülerlik notu — veri-bug değil. */
    costGranularityNote?: string;
}

/** Finansal Özet — brüt kâr hero + money-flow bar + alacak yaşlandırma. */
export default function FinancePanel({ reporting, monthLabel, finance, canViewCosts, receivables, costGranularityNote }: FinancePanelProps) {
    const sym = currencySymbol(reporting);
    const marjBadge = finance
        ? <span className="badge badge-success" style={{ fontSize: 10 }}>%{finance.marginPct.toFixed(0)} marj</span>
        : undefined;

    return (
        <OverviewPanel title="Finansal Özet" sub={monthLabel} actions={marjBadge}>
            {finance ? (
                <>
                    {/* hero: brüt kâr + ciro */}
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
                        <div>
                            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Brüt Kâr</div>
                            <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: "var(--success-text)", lineHeight: 1 }}>
                                {formatReportingM(finance.grossProfit, reporting, true)}
                            </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }} title="KDV hariç — kâr hesabı tabanı">Net Ciro</div>
                            <div className="mono" style={{ fontSize: 16, fontWeight: 650, color: "var(--text-primary)", lineHeight: 1.1 }}>
                                {formatReportingM(finance.revenue, reporting, true)}
                            </div>
                        </div>
                    </div>
                    {/* money-flow bar: maliyet ciroyu yer, kâr kalan */}
                    <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", marginBottom: 8, border: "1px solid var(--border-tertiary)" }}>
                        <div style={{
                            width: `${Math.min(Math.max(finance.costPct, 0), 100)}%`,
                            background: "color-mix(in srgb, var(--text-tertiary) 38%, transparent)",
                            display: "flex", alignItems: "center", paddingLeft: 9, transition: "width .5s cubic-bezier(.4,0,.2,1)",
                        }}>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                Maliyet {finance.costPct.toFixed(0)}%
                            </span>
                        </div>
                        <div style={{
                            flex: 1, background: "color-mix(in srgb, var(--success) 26%, transparent)",
                            borderLeft: "2px solid var(--success)", display: "flex", alignItems: "center",
                            justifyContent: "flex-end", paddingRight: 9,
                        }}>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--success-text)", whiteSpace: "nowrap" }}>
                                Kâr {finance.marginPct.toFixed(0)}%
                            </span>
                        </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)", marginBottom: receivables ? 18 : 0 }}>
                        <span style={{ whiteSpace: "nowrap" }}>Maliyet <span className="mono" style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{formatReportingM(finance.cost, reporting, true)}</span></span>
                        <span style={{ whiteSpace: "nowrap" }}>Brüt Kâr <span className="mono" style={{ color: "var(--success-text)", fontWeight: 600 }}>{formatReportingM(finance.grossProfit, reporting, true)}</span></span>
                    </div>
                </>
            ) : (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 0", marginBottom: receivables ? 14 : 0 }}>
                    {canViewCosts
                        ? (costGranularityNote ?? "Maliyet verisi henüz hazır değil.")
                        : "Maliyet/kâr görüntüleme yetkiniz yok."}
                </div>
            )}

            {/* Alacak yaşlandırma */}
            {receivables ? (
                <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Alacak Yaşlandırma</span>
                        <span className="mono" style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap" }}>
                            Toplam {formatReportingCompact(receivables.total, reporting, true)}
                        </span>
                    </div>
                    <AgingBars data={receivables.buckets} symbol={sym} />
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 10 }}>
                        Faturalanan siparişlerden tahmini · ödeme entegrasyonu beklemede
                    </div>
                </>
            ) : (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 0" }}>
                    Alacak özeti görüntüleme yetkiniz yok.
                </div>
            )}
        </OverviewPanel>
    );
}
