"use client";

import { useState } from "react";
import useSWR from "swr";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { jsonFetcher, SWR_DEFAULTS } from "@/lib/swr-config";
import { DEFAULT_TIME_RANGE, type TimeRange } from "@/lib/telemetry/health";
import type { EndpointPerformance, PerformanceResponse } from "@/lib/telemetry/console-types";
import {
    MetricCard,
    MetricGrid,
    Mono,
    RangePicker,
} from "@/components/developer/ConsoleWidgets";
import {
    formatMs,
    formatPercent,
    latencyTone,
} from "@/components/developer/console-format";

export default function DeveloperPerformancePage() {
    const [range, setRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
    const { data, error, isLoading, isValidating, mutate } = useSWR<PerformanceResponse>(
        `/api/developer/performance?range=${range}`,
        jsonFetcher,
        { ...SWR_DEFAULTS, refreshInterval: 30_000 },
    );

    const columns: DataTableColumn<EndpointPerformance>[] = [
        {
            key: "method",
            header: "Method",
            width: "78px",
            cell: row => <Mono>{row.method}</Mono>,
        },
        {
            key: "endpoint",
            header: "Endpoint",
            cell: row => <Mono>{row.endpoint}</Mono>,
        },
        {
            key: "count",
            header: "İstek",
            align: "right",
            width: "78px",
            cell: row => <Numeric>{row.count}</Numeric>,
        },
        {
            key: "avg",
            header: "Ortalama",
            align: "right",
            width: "92px",
            cell: row => <Numeric tone={latencyTone(row.avgMs)}>{formatMs(row.avgMs)}</Numeric>,
        },
        {
            key: "p50",
            header: "P50",
            align: "right",
            width: "84px",
            cell: row => <Numeric>{formatMs(row.p50Ms)}</Numeric>,
        },
        {
            key: "p95",
            header: "P95",
            align: "right",
            width: "84px",
            // Taşma kovasında değer ALT sınırdır → "> 12,8 sn" (O1).
            cell: row => (
                <Numeric tone={latencyTone(row.p95Ms)}>
                    {row.p95Overflow ? `> ${formatMs(row.p95Ms)}` : formatMs(row.p95Ms)}
                </Numeric>
            ),
        },
        {
            key: "p99",
            header: "P99",
            align: "right",
            width: "84px",
            cell: row => (
                <Numeric tone={latencyTone(row.p99Ms)}>
                    {row.p99Overflow ? `> ${formatMs(row.p99Ms)}` : formatMs(row.p99Ms)}
                </Numeric>
            ),
        },
        {
            key: "errors",
            header: "4xx / 5xx",
            align: "right",
            width: "104px",
            cell: row => (
                <span style={{ fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: row.status4xx > 0 ? "var(--warning-text)" : "var(--text-tertiary)" }}>
                        {row.status4xx}
                    </span>
                    <span style={{ color: "var(--text-tertiary)" }}> / </span>
                    <span style={{ color: row.status5xx > 0 ? "var(--danger-text)" : "var(--text-tertiary)" }}>
                        {row.status5xx}
                    </span>
                </span>
            ),
        },
        {
            key: "rate",
            header: "Hata oranı",
            align: "right",
            width: "94px",
            // errorRate null = bu uçta örnek yok → "—" (ölçülmüş %0 değil, D2).
            cell: row => (
                <Badge tone={row.errorRate === null
                    ? "neutral"
                    : row.errorRate >= 0.05 ? "danger" : row.errorRate > 0 ? "warning" : "neutral"}>
                    {row.errorRate === null ? "—" : formatPercent(row.errorRate)}
                </Badge>
            ),
        },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <PageHeader
                title="Performans"
                subtitle="En yavaş uç en üstte (P95'e göre)."
                onRefresh={() => void mutate()}
                refreshing={isValidating}
                refreshAriaLabel="Performans verilerini yenile"
                actions={<RangePicker value={range} onChange={setRange} />}
            />

            {/* Ölçümün NE OLDUĞU ekranda yazılı — rakamlar "sunucu süresi" sanılmasın. */}
            <div
                style={{
                    fontSize: "12px",
                    color: "var(--text-tertiary)",
                    background: "var(--bg-tertiary)",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    lineHeight: 1.6,
                }}
            >
                <strong style={{ color: "var(--text-secondary)" }}>Ölçüm: istemci gözlemli (RUM).</strong>{" "}
                Süreler ağ gecikmesini de içerir ve yalnız arayüzün çağırdığı uçları kapsar;
                cron ve sunucudan-sunucuya istekler bu tabloda yoktur. Next.js middleware
                yanıtı göremediği için saf sunucu süresi 148 route&apos;a dokunmadan ölçülemiyor.
                Yüzdelikler kova üst sınırıdır; &quot;&gt;&quot; işaretli değerler son kovaya
                taştı ve ALT sınırdır.
            </div>

            {isLoading && !data ? (
                <LoadingState message="Performans verileri yükleniyor…" />
            ) : error && !data ? (
                <ErrorState message="Performans verileri yüklenemedi." onRetry={() => void mutate()} />
            ) : !data ? null : (
                <>
                    <MetricGrid>
                        <MetricCard
                            label="Toplam istek"
                            value={data.totalRequests > 0 ? data.totalRequests : null}
                        />
                        <MetricCard
                            label="Ortalama yanıt"
                            value={data.overall.avgMs === null ? null : formatMs(data.overall.avgMs)}
                        />
                        <MetricCard
                            label="P95 yanıt"
                            hint={data.overall.p95Overflow ? "Kova taştı — alt sınır" : "Kova üst sınırı"}
                            value={data.overall.p95Ms === null
                                ? null
                                : data.overall.p95Overflow
                                    ? `> ${formatMs(data.overall.p95Ms)}`
                                    : formatMs(data.overall.p95Ms)}
                            tone={latencyTone(data.overall.p95Ms) === "default" ? "default" : "warning"}
                        />
                        <MetricCard
                            label="Hatalı yanıt"
                            value={data.totalRequests > 0 ? data.totalErrors : null}
                            tone={data.totalErrors > 0 ? "danger" : "success"}
                        />
                        <MetricCard
                            label="Ölçülen uç"
                            value={data.endpoints.length}
                        />
                    </MetricGrid>

                    {data.truncated && (
                        <div role="status" style={warnStripStyle}>
                            Tarama tavanına dayanıldı — toplamlar ve yüzdelikler bu aralık için
                            ALT SINIRDIR (≥). Daha dar bir zaman aralığı seçin.
                        </div>
                    )}

                    {data.endpoints.length === 0 ? (
                        <Card>
                            <EmptyState
                                title="Henüz ölçüm yok"
                                description="Bu aralıkta istemciden metrik gelmedi. Panelde birkaç sayfa gezindikten sonra veriler burada belirir."
                            />
                        </Card>
                    ) : (
                        <DataTable
                            columns={columns}
                            rows={data.endpoints}
                            rowKey={row => `${row.method} ${row.endpoint}`}
                            minWidth="960px"
                        />
                    )}
                </>
            )}
        </div>
    );
}

function Numeric({
    children,
    tone = "default",
}: {
    children: React.ReactNode;
    tone?: "default" | "warning" | "danger";
}) {
    const color = tone === "danger"
        ? "var(--danger-text)"
        : tone === "warning" ? "var(--warning-text)" : "var(--text-secondary)";
    return (
        <span style={{ fontSize: "12px", fontVariantNumeric: "tabular-nums", color }}>
            {children}
        </span>
    );
}

/** Uyarı şeridi — Kayıtlar ve Genel Bakış ekranlarıyla aynı görünüm.
 *  `role="status"` KORUNUR: ARIA canlı bölgesidir, semantik HTML karşılığı
 *  yoktur; ekran okuyucu uyarıyı bu sayede duyurur. */
const warnStripStyle: React.CSSProperties = {
    fontSize: "12px",
    lineHeight: 1.6,
    color: "var(--warning-text)",
    background: "var(--warning-bg)",
    border: "0.5px solid var(--warning-border)",
    borderRadius: "8px",
    padding: "9px 12px",
};
