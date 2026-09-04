"use client";

import { useMemo, useState } from "react";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { useDebouncedSearch } from "@/hooks/useListUrlState";
import Link from "next/link";
import useSWR from "swr";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input, { Select } from "@/components/ui/Input";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { jsonFetcher, SWR_DEFAULTS } from "@/lib/swr-config";
import { DEFAULT_TIME_RANGE, type TimeRange } from "@/lib/telemetry/health";
import { CONSOLE_GUTTER, consoleRow } from "../console-ui";
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
    /**
     * A4: filtreler URL'de. Kaynak seçimi ÇOK SEÇİMLİ ama URL'de virgüllü tek
     * değer — `URLSearchParams`'ın gerçeği bu, ve `?sources=audit,email` linki
     * insan tarafından da okunur. Asıl kazanç burada: "şu request-id'nin tüm
     * olayları" artık paylaşılabilir bir adres.
     */
    const { values, set } = useUrlFilters({
        range: DEFAULT_TIME_RANGE as string,
        level: "",
        sources: "",
        requestId: "",
        search: "",
    });
    const { level, requestId, search } = values;
    const range = values.range as TimeRange;
    const sources = useMemo(
        () => (values.sources ? values.sources.split(",").filter(Boolean) as FeedSource[] : []),
        [values.sources],
    );

    /** Biriken sayfa imleçleri — filtre değil, URL'e yazılmaz. */
    const [cursors, setCursors] = useState<string[]>([]);

    const setFilter = (partial: Partial<typeof values>) => {
        setCursors([]);
        set(partial);
    };

    const requestIdInput = useDebouncedSearch(requestId, v => setFilter({ requestId: v }));
    const searchInput = useDebouncedSearch(search, v => setFilter({ search: v }));

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

    const toggleSource = (source: FeedSource) => {
        const next = sources.includes(source)
            ? sources.filter(s => s !== source)
            : [...sources, source];
        setFilter({ sources: next.join(",") });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <PageHeader
                title="Kayıtlar"
                subtitle={
                    <>
                        ERP&apos;nin gerçek olay kaynakları birleştirilir — ayrı bir log
                        borusu yoktur.
                        {/* Veri gelmeden sayı BASILMAZ — bkz. Hatalar ekranındaki aynı kusur. */}
                        {isLoading && !data ? null : <> <strong>{entries.length}</strong> kayıt gösteriliyor.</>}
                    </>
                }
                onRefresh={() => void mutate()}
                refreshing={isValidating}
                refreshAriaLabel="Kayıtları yenile"
                actions={<RangePicker value={range} onChange={r => setFilter({ range: r })} />}
            />

            <Card>
                <div style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    alignItems: "center",
                    padding: `${CONSOLE_GUTTER} ${CONSOLE_GUTTER} 0`,
                }}>
                    <Select
                        inputSize="sm"
                        aria-label="Seviye filtresi"
                        value={level}
                        onChange={e => setFilter({ level: e.target.value })}
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
                        value={requestIdInput.value}
                        onChange={e => requestIdInput.setValue(e.target.value)}
                        style={{ width: "auto", minWidth: "170px" }}
                    />
                    <Input
                        inputSize="sm"
                        type="search"
                        aria-label="Kayıtlarda ara"
                        placeholder="Mesajda ara"
                        value={searchInput.value}
                        onChange={e => searchInput.setValue(e.target.value)}
                        style={{ width: "auto", minWidth: "200px", flex: 1 }}
                    />
                </div>
                <div style={{
                    display: "flex",
                    gap: "6px",
                    flexWrap: "wrap",
                    marginTop: "9px",
                    padding: `0 ${CONSOLE_GUTTER} ${CONSOLE_GUTTER}`,
                }}>
                    {FEED_SOURCES.map(source => {
                        const active = sources.includes(source);
                        return (
                            /* ÇOK SEÇİMLİ — `FilterChips` DEĞİL. O bileşen tek
                               seçimli bir tablist üretir (`activeKey`); burada
                               kaynaklar bağımsız açılıp kapanıyor, doğru
                               semantik `aria-pressed`. Yüzey yine de tek
                               paletten: aktif mavi, pasif beyaz. */
                            <Button
                                key={source}
                                type="button"
                                variant={active ? "primary" : "secondary"}
                                size="xs"
                                aria-pressed={active}
                                onClick={() => toggleSource(source)}
                            >
                                {FEED_SOURCE_LABELS[source]}
                            </Button>
                        );
                    })}
                    {sources.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setFilter({ sources: "" })}
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
                                        ...consoleRow("8px"),
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
                                            onClick={() => setFilter({ requestId: entry.requestId! })}
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
