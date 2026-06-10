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

// ── Stok Dağılımı (Donut) ──────────────────────────────────────
export function StockPanel({
    segments, currency, canView,
}: { segments: CategorySegment[]; currency: string | null; canView: boolean }) {
    return (
        <OverviewPanel fill title="Stok Dağılımı" sub={canView ? `Kategori bazında değer${currency ? ` (${currency})` : ""}` : "Değer görüntüleme yetkisi yok"}>
            {!canView ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
                    Stok değerini görüntüleme yetkiniz yok.
                </div>
            ) : segments.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
                    Stok verisi yok.
                </div>
            ) : (
                <>
                    {/* Donut kalan alanı dikey ortalar → eş-yükseklik kartta alttaki ölü alan dağılır */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, padding: "8px 0 16px" }}>
                        <Donut data={segments} size={172} stroke={21} currency={currency} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {segments.map((c, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                                <Dot tone={c.color} />
                                <span style={{ flex: 1, color: "var(--text-secondary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                                <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                                    {currency
                                        ? formatReportingCompact(c.value, currency, true)
                                        : (c.value >= 1e6 ? `${(c.value / 1e6).toFixed(2)}M` : c.value >= 1e3 ? `${Math.round(c.value / 1e3)}K` : Math.round(c.value))}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
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
