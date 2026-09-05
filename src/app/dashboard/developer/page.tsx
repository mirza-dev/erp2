"use client";

import { useUrlFilters } from "@/hooks/useUrlFilters";
import Link from "next/link";
import useSWR from "swr";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { jsonFetcher, SWR_DEFAULTS } from "@/lib/swr-config";
import { DEFAULT_TIME_RANGE, type TimeRange } from "@/lib/telemetry/health";
import type { OverviewPayload } from "@/lib/telemetry/console-types";
import { FEED_SOURCE_LABELS } from "@/lib/telemetry/console-types";
import { CONSOLE_GUTTER, consoleRow, sectionTitlePad } from "./console-ui";
import {
    HealthDot,
    HealthPill,
    MetricCard,
    MetricGrid,
    Mono,
    RangePicker,
    SeverityBadge,
} from "@/components/developer/ConsoleWidgets";
import {
    HEALTH_LABELS,
    formatMs,
    formatPercent,
    formatRelative,
    formatTime,
} from "@/components/developer/console-format";
import { formatUptime } from "@/lib/telemetry/service-health";
import SectionHeader from "@/components/ui/SectionHeader";

/** Panel 30 sn'de bir kendini tazeler (§17 — WebSocket/SSE kurulmadı). */
const REFRESH_MS = 30_000;

export default function DeveloperOverviewPage() {
    // A4: aralık URL'de — paylaşılan link aynı pencereyi açar.
    const { values, set } = useUrlFilters({ range: DEFAULT_TIME_RANGE });
    const range = values.range as TimeRange;
    const { data, error, isLoading, isValidating, mutate } = useSWR<OverviewPayload>(
        `/api/developer/overview?range=${range}`,
        jsonFetcher,
        { ...SWR_DEFAULTS, refreshInterval: REFRESH_MS },
    );

    if (isLoading && !data) return <LoadingState message="Sistem durumu okunuyor…" />;
    if (error && !data) {
        return <ErrorState message="Genel bakış yüklenemedi." onRetry={() => void mutate()} />;
    }
    if (!data) return null;

    const { metrics, health, recentActivity } = data;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <PageHeader
                title="Developer Console"
                subtitle={
                    <>
                        Ortam: <strong>{data.environment}</strong> · Son güncelleme{" "}
                        {formatTime(data.generatedAt)} · {REFRESH_MS / 1000} sn&apos;de bir yenilenir
                    </>
                }
                onRefresh={() => void mutate()}
                refreshing={isValidating}
                refreshAriaLabel="Sistem durumunu yenile"
                actions={<RangePicker value={range} onChange={r => set({ range: r })} />}
            />

            {/* ── Genel sağlık ────────────────────────────────────────────── */}
            <Card>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <HealthDot status={health.overall.status} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "17px", fontWeight: 650, color: "var(--text-primary)" }}>
                            {HEALTH_LABELS[health.overall.status]}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            {health.overall.reason}
                        </div>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                        Karar penceresi: son {health.windowMinutes} dk
                    </span>
                </div>
            </Card>

            {/* ── Metrikler ───────────────────────────────────────────────── */}
            <MetricGrid>
                {/* `null` = ölçülemedi → MetricCard "Ölçülmüyor" yazar ve tonu
                    nötr kalır. Sıfırı yeşil göstermek, sonda patladığında paneli
                    yalancı yapıyordu (2026-08 Y4). */}
                <MetricCard
                    label="Hata olayı"
                    value={metrics.sampledErrorEvents}
                    hint="Kaydedilen oluşum — grup başına saatte en çok 20 örneklenir"
                    tone={(metrics.sampledErrorEvents ?? 0) > 0 ? "warning" : "default"}
                />
                <MetricCard
                    label="Kritik hata"
                    value={metrics.criticalErrors}
                    tone={metrics.criticalErrors === null
                        ? "default"
                        : metrics.criticalErrors > 0 ? "danger" : "success"}
                />
                <MetricCard
                    label="Uyarı"
                    value={metrics.warnings}
                    tone={(metrics.warnings ?? 0) > 0 ? "warning" : "default"}
                />
                <MetricCard
                    label="Aktif hata grubu"
                    value={metrics.activeErrorGroups}
                    hint="Bu aralıkta en az bir kez görülen"
                />
                <MetricCard
                    label="İstek"
                    value={metrics.requests}
                    hint="İstemci ölçümü (RUM)"
                />
                <MetricCard
                    label="Hata oranı"
                    value={metrics.errorRate === null ? null : formatPercent(metrics.errorRate)}
                    hint="4xx + 5xx — istemci hataları dahil"
                    tone={metrics.errorRate !== null && metrics.errorRate >= 0.05 ? "warning" : "default"}
                />
                <MetricCard
                    label="Ortalama yanıt"
                    value={metrics.avgResponseMs === null ? null : formatMs(metrics.avgResponseMs)}
                    hint="Ağ süresi dahil"
                />
                <MetricCard
                    label="P95 yanıt"
                    value={metrics.p95ResponseMs === null ? null : formatMs(metrics.p95ResponseMs)}
                    hint="Kova üst sınırı"
                />
                <MetricCard
                    label="Sunucu hatası oranı"
                    value={metrics.serverErrorRate === null ? null : formatPercent(metrics.serverErrorRate)}
                    hint="Sağlık kararı bunu kullanır (yalnız 5xx)"
                    tone={metrics.serverErrorRate !== null && metrics.serverErrorRate >= 0.05 ? "danger" : "default"}
                />
                <MetricCard
                    label="Aktif kullanıcı"
                    value={metrics.activeUsers}
                    hint="Aralıkta denetim izi bırakan"
                />
                <MetricCard
                    label="Çalışma süresi"
                    value={formatUptime(metrics.uptimeSeconds)}
                    hint="Bu sunucu süreci"
                />
                <MetricCard
                    label="Açık bug"
                    value={metrics.openBugs}
                    tone={(metrics.openBugs ?? 0) > 0 ? "warning" : "default"}
                />
            </MetricGrid>

            {(data.truncatedMetrics.length > 0 || data.unavailableSources.length > 0) && (
                <div role="status" style={noticeStyle}>
                    {data.unavailableSources.length > 0 && (
                        <div>
                            <strong>Okunamayan kaynak:</strong>{" "}
                            {data.unavailableSources.map(s => FEED_SOURCE_LABELS[s]).join(", ")}
                            {" "}— bu kaynakların olayları listede YOK; &quot;olay yok&quot; anlamına gelmez.
                        </div>
                    )}
                    {data.truncatedMetrics.length > 0 && (
                        <div>
                            <strong>Tarama tavanına dayanıldı:</strong>{" "}
                            {data.truncatedMetrics.join(", ")} — gösterilen değerler ALT SINIRDIR (≥).
                        </div>
                    )}
                </div>
            )}

            {/* ── Servis sağlığı ──────────────────────────────────────────── */}
            <Card>
                <SectionHeader variant="title" style={sectionTitlePad}>Servis Durumu</SectionHeader>
                <div style={{ display: "flex", flexDirection: "column" }}>
                    {health.services.map(service => (
                        <div
                            key={service.key}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                ...consoleRow("9px"),
                                flexWrap: "wrap",
                            }}
                        >
                            <span style={{ minWidth: "170px", fontSize: "13px", color: "var(--text-primary)" }}>
                                {service.label}
                            </span>
                            <HealthPill status={service.status} />
                            <span style={{ fontSize: "12px", color: "var(--text-tertiary)", flex: 1, minWidth: 0 }}>
                                {service.detail ?? "—"}
                            </span>
                        </div>
                    ))}
                </div>
            </Card>

            {/* ── Son aktivite ────────────────────────────────────────────── */}
            <Card>
                {/* Başlık yanında eylem taşıyan tek bölüm: yatay boşluk sarmalayıcıya
                    verilir, yoksa "Tümü →" kartın kenarlığına yapışır. */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: `0 ${CONSOLE_GUTTER}`,
                }}>
                    <SectionHeader variant="title" style={{ padding: "12px 0 8px" }}>Son Olaylar</SectionHeader>
                    <Link href="/dashboard/developer/logs" style={linkStyle}>Tümü →</Link>
                </div>
                {recentActivity.length === 0 ? (
                    <EmptyState
                        title="Kayıt yok"
                        description="Bu aralıkta hiçbir sistem olayı üretilmedi."
                    />
                ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {recentActivity.map(entry => (
                            <div
                                key={entry.id}
                                style={{
                                    display: "flex",
                                    gap: "10px",
                                    alignItems: "baseline",
                                    ...consoleRow("7px"),
                                    flexWrap: "wrap",
                                }}
                            >
                                <Mono>{formatTime(entry.occurredAt)}</Mono>
                                <SeverityBadge severity={entry.level} />
                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "76px" }}>
                                    {FEED_SOURCE_LABELS[entry.source]}
                                </span>
                                <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", flex: 1, minWidth: "200px" }}>
                                    {entry.errorGroupId ? (
                                        <Link href={`/dashboard/developer/errors/${entry.errorGroupId}`} style={linkStyle}>
                                            {entry.message}
                                        </Link>
                                    ) : entry.message}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                    {formatRelative(entry.occurredAt)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}

const noticeStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "12px",
    lineHeight: 1.6,
    color: "var(--warning-text)",
    background: "var(--warning-bg)",
    border: "0.5px solid var(--warning-border)",
    borderRadius: "8px",
    padding: "9px 12px",
};

const linkStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--accent-text)",
    textDecoration: "none",
};
