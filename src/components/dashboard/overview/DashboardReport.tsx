"use client";

/**
 * Genel Bakış — yazdırılabilir rapor (ekran görüntüsü DEĞİL).
 *
 * Ekranda gizli (`.dashboard-print-report` → screen `display:none`), yalnız baskıda
 * (`@media print` → block) görünür. page.tsx'te ZATEN hesaplanmış view-model
 * çıktılarıyla beslenir → sayılar ekranla birebir + RBAC maskeli. Saf sunum.
 */
import RovenLogo from "@/components/layout/RovenLogo";
import type { StockPanelStats } from "@/components/dashboard/overview/RealPanels";
import {
    formatReportingCompact, currencySymbol,
    type DashboardKpi, type CategorySegment,
    type RecentOrderRow, type AlertRow, type RangeKey,
} from "@/lib/dashboard-view-model";

interface DashboardReportProps {
    range: RangeKey;
    dateStr: string;
    reporting: string;
    /** Raporu hazırlayan kullanıcı (fullName || email); yoksa satır gizlenir. */
    preparedBy?: string | null;
    kpis: DashboardKpi[];
    trendSub: string;
    labels: string[];
    revenue: number[] | null;
    cost: number[] | null;
    counts: number[];
    trendEmpty: boolean;
    stockSegments: CategorySegment[];
    /** Stok özet istatistikleri (aktif/kritik/risk) — ekran paneliyle aynı kaynak. */
    stockStats?: StockPanelStats;
    orderRows: RecentOrderRow[];
    alertRows: AlertRow[];
    canViewPrices: boolean;
}

const th: React.CSSProperties = { textAlign: "left", fontWeight: 700, padding: "4px 6px", borderBottom: "1px solid #999" };
const td: React.CSSProperties = { padding: "4px 6px", borderBottom: "0.5px solid #ccc" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: "16px 0 6px" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h2 style={h2}>{title}</h2>
            {children}
        </section>
    );
}

export default function DashboardReport({
    range, dateStr, reporting, preparedBy, kpis, trendSub, labels, revenue, cost, counts, trendEmpty,
    stockSegments, stockStats, orderRows, alertRows, canViewPrices,
}: DashboardReportProps) {
    const fmt = (v: number, can = canViewPrices) => formatReportingCompact(v, reporting, can);
    const sym = currencySymbol(reporting);

    return (
        <div className="dashboard-print-report" aria-hidden="true">
            {/* Künye (zengin başlık) */}
            <header style={{ borderBottom: "2px solid #111", paddingBottom: 10, marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <RovenLogo size={22} wordmarkSize={17} />
                    <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>· Genel Bakış Raporu</span>
                </div>
                <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
                    {dateStr} · Dönem: <b>{range}</b> · PMT Endüstriyel · Para birimi: {reporting}
                </div>
                {preparedBy && (
                    <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>Hazırlayan: <b>{preparedBy}</b></div>
                )}
            </header>

            {/* KPI özeti */}
            <Section title="Özet Göstergeler">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>Gösterge</th><th style={th}>Değer</th><th style={th}>Açıklama</th></tr></thead>
                    <tbody>
                        {kpis.map((k) => (
                            <tr key={k.id}>
                                <td style={td}>{k.label}</td>
                                <td style={{ ...td, fontWeight: 700 }}>{k.value}</td>
                                <td style={td}>{k.sub ?? ""}{k.delta ? ` · ${k.delta}` : ""}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            {/* Ciro & Maliyet trendi */}
            <Section title={`Ciro & Maliyet · ${trendSub}`}>
                {trendEmpty || !revenue ? (
                    <div style={{ fontSize: 11, color: "#444" }}>
                        {revenue ? "Bu dönemde sipariş yok." : "Ciro görüntüleme yetkiniz yok."}
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr>
                            <th style={th}>Dönem</th><th style={{ ...th, textAlign: "right" }}>Ciro</th>
                            <th style={{ ...th, textAlign: "right" }}>Maliyet</th><th style={{ ...th, textAlign: "right" }}>Sipariş</th>
                        </tr></thead>
                        <tbody>
                            {labels.map((lbl, i) => (
                                <tr key={`${lbl}-${i}`}>
                                    <td style={td}>{lbl}</td>
                                    <td style={tdR}>{fmt(revenue[i] ?? 0)}</td>
                                    <td style={tdR}>{cost ? fmt(cost[i] ?? 0, canViewPrices) : "—"}</td>
                                    <td style={tdR}>{counts[i] ?? 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Section>

            {/* Stok dağılımı — pay yüzdesi + özet istatistik (eski Finansal Özet'in yerini alan ana bölüm) */}
            <Section title="Stok Dağılımı (kategori)">
                {stockSegments.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#444" }}>Kayıt yok.</div>
                ) : (
                    <>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>
                                <th style={th}>Kategori</th>
                                <th style={{ ...th, textAlign: "right" }}>Pay</th>
                                <th style={{ ...th, textAlign: "right" }}>Değer</th>
                            </tr></thead>
                            <tbody>
                                {(() => {
                                    const total = stockSegments.reduce((sum, s) => sum + s.value, 0);
                                    return (
                                        <>
                                            {stockSegments.map((s) => (
                                                <tr key={s.name}>
                                                    <td style={td}>{s.name}</td>
                                                    <td style={tdR}>%{total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}</td>
                                                    <td style={tdR}>{fmt(s.value)}</td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <td style={{ ...td, fontWeight: 700 }}>Toplam</td>
                                                <td style={{ ...tdR, fontWeight: 700 }}>%100</td>
                                                <td style={{ ...tdR, fontWeight: 700 }}>{fmt(total)}</td>
                                            </tr>
                                        </>
                                    );
                                })()}
                            </tbody>
                        </table>
                        {stockStats && (
                            <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
                                Aktif ürün: <b>{stockStats.productCount}</b> · Kritik stok: <b>{stockStats.criticalCount}</b> · Risk bandında: <b>{stockStats.riskCount}</b>
                            </div>
                        )}
                    </>
                )}
            </Section>

            {/* Son siparişler */}
            <Section title="Son Siparişler">
                {orderRows.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#444" }}>Sipariş yok.</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr>
                            <th style={th}>No</th><th style={th}>Müşteri</th>
                            <th style={th}>Durum</th><th style={{ ...th, textAlign: "right" }}>Tutar</th>
                        </tr></thead>
                        <tbody>
                            {orderRows.map((o) => (
                                <tr key={o.id}>
                                    <td style={td}>{o.no}</td><td style={td}>{o.customer}</td>
                                    <td style={td}>{o.status}</td><td style={tdR}>{o.amount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Section>

            {/* Kritik uyarılar */}
            <Section title="Kritik Uyarılar">
                {alertRows.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#444" }}>Acil uyarı yok.</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr><th style={th}>Uyarı</th><th style={th}>Açıklama</th><th style={th}>Zaman</th></tr></thead>
                        <tbody>
                            {alertRows.map((a) => (
                                <tr key={a.id}><td style={td}>{a.title}</td><td style={td}>{a.desc}</td><td style={td}>{a.time}</td></tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Section>

            <footer style={{ fontSize: 9, color: "#888", marginTop: 16, borderTop: "0.5px solid #ccc", paddingTop: 6 }}>
                Roven ERP · {sym}{reporting} raporlama para birimi · Anlık göstergeler rapor anına aittir.
            </footer>
        </div>
    );
}
