"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input, { Select } from "@/components/ui/Input";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { jsonFetcher, SWR_DEFAULTS } from "@/lib/swr-config";
import { DEFAULT_TIME_RANGE, type TimeRange } from "@/lib/telemetry/health";
import {
    SEVERITIES,
    FEED_SOURCES,
    FEED_SOURCE_LABELS,
    type FeedPage,
    type FeedSource,
} from "@/lib/telemetry/console-types";
import type { TelemetrySeverity } from "@/lib/database.types";
import {
    Mono,
    RangePicker,
    SeverityBadge,
} from "@/components/developer/ConsoleWidgets";
import {
    SEVERITY_LABELS,
    formatDateTime,
} from "@/components/developer/console-format";

/**
 * Kayıt / olay görüntüleyici (§9).
 *
 * Kaynak filtresi kasıtlı olarak görünür: bu akış ALTI ayrı gerçek kaynağın
 * birleşimi (telemetri · hata · denetim · entegrasyon · e-posta · arıza) ve
 * kullanıcı hangi kaynağa baktığını bilmeli.
 */
export default function DeveloperLogsPage() {
    const [range, setRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
    const [level, setLevel] = useState("");
    const [sources, setSources] = useState<FeedSource[]>([]);
    const [requestId, setRequestId] = useState("");
    const [search, setSearch] = useState("");
    const [cursors, setCursors] = useState<string[]>([]);

    const query = useMemo(() => {
        const q = new URLSearchParams({ range });
        if (level) q.set("level", level);
        if (sources.length > 0) q.set("sources", sources.join(","));
        if (requestId.trim()) q.set("requestId", requestId.trim());
        if (search.trim()) q.set("search", search.trim());
        return q;
    }, [range, level, sources, requestId, search]);

    const key = `/api/developer/logs?${query}`;
    const { data, error, isLoading, isValidating, mutate } = useSWR<FeedPage>(
        key, jsonFetcher, { ...SWR_DEFAULTS, refreshInterval: 30_000 },
    );

    const extraKeys = cursors.map(c => `${key}&before=${encodeURIComponent(c)}`);
    const { data: extraPages } = useSWR<FeedPage[]>(
        extraKeys.length > 0 ? ["logs-extra", ...extraKeys] : null,
        async () => Promise.all(extraKeys.map(k => jsonFetcher<FeedPage>(k))),
        SWR_DEFAULTS,
    );

    const entries = useMemo(() => {
        const all = [...(data?.entries ?? []), ...(extraPages ?? []).flatMap(p => p.entries)];
        const seen = new Set<string>();
        return all.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));
    }, [data, extraPages]);

    const lastCursor = (extraPages ?? []).at(-1)?.nextCursor ?? data?.nextCursor ?? null;
    // Tüm sayfalardaki okunamayan kaynakların birleşimi.
    const unavailable = [...new Set([
        ...(data?.unavailableSources ?? []),
        ...(extraPages ?? []).flatMap(p => p.unavailableSources ?? []),
    ])];

    const reset = <T,>(setter: (v: T) => void) => (value: T) => {
        setCursors([]);
        setter(value);
    };

    const toggleSource = (source: FeedSource) => {
        setCursors([]);
        setSources(prev =>
            prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source],
        );
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <PageHeader
                title="Kayıtlar"
                subtitle={
                    <>
                        ERP&apos;nin gerçek olay kaynakları birleştirilir — ayrı bir log
                        borusu yoktur. <strong>{entries.length}</strong> kayıt gösteriliyor.
                    </>
                }
                onRefresh={() => void mutate()}
                refreshing={isValidating}
                refreshAriaLabel="Kayıtları yenile"
                actions={<RangePicker value={range} onChange={reset(setRange)} />}
            />

            <Card>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <Select
                        inputSize="sm"
                        aria-label="Seviye filtresi"
                        value={level}
                        onChange={e => reset(setLevel)(e.target.value)}
                        style={{ width: "auto", minWidth: "130px" }}
                    >
                        <option value="">Tüm seviyeler</option>
                        {SEVERITIES.map(s => (
                            <option key={s} value={s}>{SEVERITY_LABELS[s as TelemetrySeverity]}</option>
                        ))}
                    </Select>
                    <Input
                        inputSize="sm"
                        aria-label="Request ID filtresi"
                        placeholder="Request ID"
                        value={requestId}
                        onChange={e => reset(setRequestId)(e.target.value)}
                        style={{ width: "auto", minWidth: "170px" }}
                    />
                    <Input
                        inputSize="sm"
                        type="search"
                        aria-label="Kayıtlarda ara"
                        placeholder="Mesajda ara"
                        value={search}
                        onChange={e => reset(setSearch)(e.target.value)}
                        style={{ width: "auto", minWidth: "200px", flex: 1 }}
                    />
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "9px" }}>
                    {FEED_SOURCES.map(source => {
                        const active = sources.includes(source);
                        return (
                            <button
                                key={source}
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleSource(source)}
                                style={{
                                    fontSize: "11.5px",
                                    padding: "4px 10px",
                                    borderRadius: "999px",
                                    cursor: "pointer",
                                    border: `0.5px solid ${active ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                    background: active ? "var(--accent-bg)" : "transparent",
                                    color: active ? "var(--accent-text)" : "var(--text-tertiary)",
                                }}
                            >
                                {FEED_SOURCE_LABELS[source]}
                            </button>
                        );
                    })}
                    {sources.length > 0 && (
                        <button
                            type="button"
                            onClick={() => { setCursors([]); setSources([]); }}
                            style={{
                                fontSize: "11.5px", padding: "4px 8px", border: "none",
                                background: "transparent", color: "var(--text-tertiary)",
                                cursor: "pointer", textDecoration: "underline",
                            }}
                        >
                            temizle
                        </button>
                    )}
                </div>
            </Card>

            {/* 2026-08 O7: altı kaynağın hepsi hatayı sessizce yutup boş dönüyordu
                → "olay yok" ile "kaynak okunamıyor" ayırt edilemiyordu ve ekran
                arızayı normal sayıyordu. Artık okunamayan kaynak adıyla yazılır. */}
            {unavailable.length > 0 && (
                <div role="status" style={warnStripStyle}>
                    <strong>Okunamayan kaynak:</strong>{" "}
                    {unavailable.map(s => FEED_SOURCE_LABELS[s]).join(", ")} — bu kaynakların
                    olayları aşağıdaki listede YOK. Liste eksiktir; &quot;olay yok&quot; demek değildir.
                </div>
            )}

            {isLoading && !data ? (
                <LoadingState message="Kayıtlar yükleniyor…" />
            ) : error && !data ? (
                <ErrorState message="Kayıtlar yüklenemedi." onRetry={() => void mutate()} />
            ) : entries.length === 0 ? (
                <Card>
                    <EmptyState
                        title={unavailable.length > 0 ? "Liste okunamadı" : "Kayıt yok"}
                        description={unavailable.length > 0
                            ? "Seçili kaynaklar okunamadığı için sonuç gösterilemiyor."
                            : "Bu aralıkta ve bu filtrelerde olay bulunmuyor."}
                    />
                </Card>
            ) : (
                <>
                    <Card>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            {entries.map(entry => (
                                <div
                                    key={entry.id}
                                    style={{
                                        display: "flex",
                                        gap: "10px",
                                        alignItems: "baseline",
                                        padding: "8px 0",
                                        borderBottom: "0.5px solid var(--border-secondary)",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <Mono>{formatDateTime(entry.occurredAt)}</Mono>
                                    <SeverityBadge severity={entry.level} />
                                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "72px" }}>
                                        {FEED_SOURCE_LABELS[entry.source]}
                                    </span>
                                    <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", flex: 1, minWidth: "220px" }}>
                                        {entry.errorGroupId ? (
                                            <Link
                                                href={`/dashboard/developer/errors/${entry.errorGroupId}`}
                                                style={{ color: "var(--accent-text)", textDecoration: "none" }}
                                            >
                                                {entry.message}
                                            </Link>
                                        ) : entry.message}
                                    </span>
                                    {entry.module && (
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                            {entry.module}
                                        </span>
                                    )}
                                    {entry.requestId && (
                                        <button
                                            type="button"
                                            onClick={() => reset(setRequestId)(entry.requestId!)}
                                            title="Bu isteğin tüm olaylarını göster"
                                            style={{
                                                border: "none", background: "transparent", cursor: "pointer",
                                                padding: 0, color: "var(--accent-text)",
                                            }}
                                        >
                                            <Mono>{entry.requestId}</Mono>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                    {lastCursor && (
                        <div style={{ display: "flex", justifyContent: "center" }}>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setCursors(prev => [...prev, lastCursor])}
                            >
                                Daha fazla yükle
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

const warnStripStyle: React.CSSProperties = {
    fontSize: "12px",
    lineHeight: 1.6,
    color: "var(--warning-text)",
    background: "var(--warning-bg)",
    border: "0.5px solid var(--warning-border)",
    borderRadius: "8px",
    padding: "9px 12px",
};
