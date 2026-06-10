"use client";

import Link from "next/link";
import OverviewPanel, { Dot } from "./OverviewPanel";
import Donut from "./charts/Donut";
import { toneVar } from "./charts/chart-utils";
import { formatReportingCompact } from "@/lib/dashboard-view-model";
import type {
    CategorySegment, ReorderRow, AlertRow, RecentOrderRow, Tone,
} from "@/lib/dashboard-view-model";

const TONE_BADGE: Record<Tone, string> = {
    danger: "badge-danger", warning: "badge-warning", info: "badge-info",
    success: "badge-success", accent: "badge-accent",
};

// ── Stok Dağılımı (tam genişlik: donut + paylı legend + özet istatistik) ──────
export interface StockPanelStats {
    /** Aktif ürün sayısı. */
    productCount: number;
    /** available_now ≤ min (kritik eşik altı) aktif ürün sayısı. */
    criticalCount: number;
    /** min < available_now ≤ ceil(min×1.5) (risk bandı) aktif ürün sayısı. */
    riskCount: number;
}

export function StockPanel({
    segments, currency, canView, stats,
}: { segments: CategorySegment[]; currency: string | null; canView: boolean; stats?: StockPanelStats }) {
    const totalValue = segments.reduce((sum, s) => sum + s.value, 0);
    const fmtValue = (v: number) =>
        currency
            ? formatReportingCompact(v, currency, true)
            : (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v)));

    return (
        <OverviewPanel
            title="Stok Dağılımı"
            sub={canView
                ? `Kategori bazında değer${currency ? ` (${currency})` : ""} · ${segments.length} kategori`
                : "Değer görüntüleme yetkisi yok"}
        >
            {!canView ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "32px 0" }}>
                    Stok değerini görüntüleme yetkiniz yok.
                </div>
            ) : segments.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "32px 0" }}>
                    Stok verisi yok.
                </div>
            ) : (
                <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "stretch" }}>
                    {/* Donut */}
                    <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 0" }}>
                        <Donut data={segments} size={188} stroke={23} currency={currency} />
                    </div>

                    {/* Legend — pay çubuklu */}
                    <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
                        {segments.map((c, i) => {
                            const pct = totalValue > 0 ? (c.value / totalValue) * 100 : 0;
                            return (
                                <div key={i}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
                                        <Dot tone={c.color} />
                                        <span style={{ flex: 1, color: "var(--text-secondary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                                        <span className="mono" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>%{pct.toFixed(1)}</span>
                                        <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmtValue(c.value)}</span>
                                    </div>
                                    <div aria-hidden style={{ height: 4, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
                                        <div style={{ width: `${pct}%`, height: "100%", background: c.color, borderRadius: 2, transition: "width .5s cubic-bezier(.4,0,.2,1)" }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Özet istatistik kolonu — eski Finansal Özet alanını karşılar */}
                    <div style={{
                        flex: "0 0 200px", display: "flex", flexDirection: "column", gap: 14, justifyContent: "center",
                        borderLeft: "1px solid var(--border-tertiary)", paddingLeft: 24,
                    }}>
                        <div>
                            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Toplam Stok Değeri</div>
                            <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}>
                                {fmtValue(totalValue)}
                            </div>
                        </div>
                        {stats && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <span style={{ color: "var(--text-tertiary)" }}>Aktif ürün</span>
                                    <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{stats.productCount}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <span style={{ color: "var(--text-tertiary)" }}>Kritik stok</span>
                                    <span className="mono" style={{ color: stats.criticalCount > 0 ? "var(--danger-text)" : "var(--text-primary)", fontWeight: 600 }}>{stats.criticalCount}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <span style={{ color: "var(--text-tertiary)" }}>Risk bandında</span>
                                    <span className="mono" style={{ color: stats.riskCount > 0 ? "var(--warning-text)" : "var(--text-primary)", fontWeight: 600 }}>{stats.riskCount}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </OverviewPanel>
    );
}

// ── Satın Alma Önerileri ────────────────────────────────────────
const URGENCY_BADGE: Record<ReorderRow["urgency"], string> = { danger: "badge-danger", warning: "badge-warning", info: "badge-info" };
const URGENCY_LABEL: Record<ReorderRow["urgency"], string> = { danger: "Acil", warning: "Yakında", info: "Planla" };

export function ReorderPanel({ rows }: { rows: ReorderRow[] }) {
    return (
        <OverviewPanel
            title="Satın Alma Önerileri"
            sub="Yeniden sipariş eşiği altında"
            collapsible
            defaultOpen={false}
            actions={<Link className="row-link" href="/dashboard/purchase/suggested">Tümü →</Link>}
        >
            {rows.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 0" }}>Öneri yok — stok seviyeleri yeterli.</div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {rows.map((r, i) => (
                        <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 10, paddingBottom: 9,
                            borderBottom: i < rows.length - 1 ? "1px solid var(--border-tertiary)" : "none",
                        }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                                <div className="mono" style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 1 }}>{r.code} · {r.vendor}</div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{r.need}</div>
                                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{r.unit}</div>
                            </div>
                            <span className={`badge ${URGENCY_BADGE[r.urgency]}`} style={{ fontSize: 10, flexShrink: 0 }}>{URGENCY_LABEL[r.urgency]}</span>
                        </div>
                    ))}
                </div>
            )}
        </OverviewPanel>
    );
}

// ── Kritik Uyarılar ─────────────────────────────────────────────
export function AlertsPanel({ rows, total }: { rows: AlertRow[]; total: number }) {
    const urgent = rows.filter((a) => a.tone === "danger").length;
    return (
        <OverviewPanel
            title="Kritik Uyarılar"
            sub={`${total} açık uyarı`}
            collapsible
            defaultOpen={false}
            actions={urgent > 0 ? <span className="badge badge-danger" style={{ fontSize: 10 }}>{urgent} acil</span> : undefined}
        >
            {rows.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 0" }}>Açık uyarı yok.</div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {rows.map((a, i) => (
                        <div key={a.id} style={{
                            display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0",
                            borderBottom: i < rows.length - 1 ? "1px solid var(--border-tertiary)" : "none",
                        }}>
                            <span style={{ marginTop: 5, flexShrink: 0 }}><Dot tone={toneVar(a.tone)} /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{a.title}</div>
                                {a.desc && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 1 }}>{a.desc}</div>}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0, whiteSpace: "nowrap" }}>{a.time}</div>
                        </div>
                    ))}
                    <Link className="row-link" href="/dashboard/alerts" style={{ marginTop: 8 }}>Tüm uyarılar →</Link>
                </div>
            )}
        </OverviewPanel>
    );
}

// ── Son Siparişler ──────────────────────────────────────────────
export function OrdersPanel({ rows }: { rows: RecentOrderRow[] }) {
    return (
        <OverviewPanel
            title="Son Siparişler"
            sub="Güncel satış siparişleri"
            pad={0}
            actions={<Link className="row-link" href="/dashboard/orders">Tümü →</Link>}
        >
            {rows.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "16px" }}>Sipariş yok.</div>
            ) : (
                <div>
                    {rows.map((o, i) => (
                        <Link key={o.id} href={`/dashboard/orders/${o.id}`} style={{ textDecoration: "none", display: "block" }}>
                            <div style={{
                                display: "flex", alignItems: "center", gap: 10, padding: "11px 16px",
                                borderBottom: i < rows.length - 1 ? "1px solid var(--border-tertiary)" : "none",
                            }}>
                                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-text)", flexShrink: 0 }}>{o.no}</span>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.customer}</span>
                                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}>{o.amount}</span>
                                <span className={`badge ${TONE_BADGE[o.tone]}`} style={{ fontSize: 10, flexShrink: 0, width: 92, justifyContent: "center" }}>{o.status}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </OverviewPanel>
    );
}
