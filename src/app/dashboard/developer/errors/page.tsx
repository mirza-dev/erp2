"use client";

import { useMemo, useState } from "react";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { useDebouncedSearch } from "@/hooks/useListUrlState";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import Input, { Select } from "@/components/ui/Input";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { jsonFetcher, SWR_DEFAULTS } from "@/lib/swr-config";
import { DEFAULT_TIME_RANGE, type TimeRange } from "@/lib/telemetry/health";
import { SEVERITIES, type CursorPage } from "@/lib/telemetry/console-types";
import type { SystemErrorGroupRow, TelemetrySeverity } from "@/lib/database.types";
import {
    Mono,
    RangePicker,
    SeverityBadge,
} from "@/components/developer/ConsoleWidgets";
import {
    SEVERITY_LABELS,
    formatDateTime,
    formatRelative,
} from "@/components/developer/console-format";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "", label: "Tüm durumlar" },
    { value: "open", label: "Açık" },
    { value: "investigating", label: "İnceleniyor" },
    { value: "ignored", label: "Yok sayıldı" },
    { value: "resolved", label: "Çözüldü" },
];

interface ErrorPage extends CursorPage<SystemErrorGroupRow> {
    range: TimeRange;
}

export default function DeveloperErrorsPage() {
    const { push } = useRouter();
    /**
     * A4: filtreler URL'de. Varsayılan `status: "open"` — "Tüm durumlar" seçmek
     * `?status=` yazar; hook'un "yok = varsayılan, VAR (boşsa bile) = o değer"
     * sözleşmesi olmadan bu seçim hiç ifade edilemezdi.
     */
    const { values, set } = useUrlFilters({
        range: DEFAULT_TIME_RANGE as string,
        severity: "",
        status: "open",
        module: "",
        search: "",
    });
    const { severity, status, module, search } = values;
    const range = values.range as TimeRange;

    /**
     * Yüklenmiş sayfaların imleçleri — "Daha fazla" her seferinde bir sayfa ekler.
     * URL'e YAZILMAZ: biriken sayfa yığını bir filtre değil, oturum içi bir
     * gezinme durumu; linki açan kişide yeniden kurulamaz.
     */
    const [cursors, setCursors] = useState<string[]>([]);

    /** Filtre değişimi biriken sayfaları geçersiz kılar. */
    const setFilter = (partial: Partial<typeof values>) => {
        setCursors([]);
        set(partial);
    };

    // Metin alanları yazarken duyarlı, duraklayınca URL'e yazar. Yan kazanç:
    // eskiden her tuş vuruşu yeni bir SWR anahtarı (yani yeni istek) üretiyordu.
    const moduleInput = useDebouncedSearch(module, v => setFilter({ module: v }));
    const searchInput = useDebouncedSearch(search, v => setFilter({ search: v }));

    const query = useMemo(() => {
        const q = new URLSearchParams({ range });
        if (severity) q.set("severity", severity);
        if (status) q.set("status", status);
        if (module.trim()) q.set("module", module.trim());
        if (search.trim()) q.set("search", search.trim());
        return q;
    }, [range, severity, status, module, search]);

    const key = `/api/developer/errors?${query}`;
    const { data, error, isLoading, isValidating, mutate } = useSWR<ErrorPage>(
        key, jsonFetcher, { ...SWR_DEFAULTS, refreshInterval: 30_000 },
    );

    // Ek sayfalar ayrı SWR anahtarlarıyla çekilir; filtre değişince sıfırlanır.
    const extraKeys = cursors.map(c => `${key}&before=${encodeURIComponent(c)}`);
    const { data: extraPages } = useSWR<ErrorPage[]>(
        extraKeys.length > 0 ? ["errors-extra", ...extraKeys] : null,
        async () => Promise.all(extraKeys.map(k => jsonFetcher<ErrorPage>(k))),
        SWR_DEFAULTS,
    );

    const rows = useMemo(() => {
        const all = [...(data?.rows ?? []), ...(extraPages ?? []).flatMap(p => p.rows)];
        // Aynı grup iki sayfada görünebilir (arada yeni oluşum gelirse) — tekille.
        const seen = new Set<string>();
        return all.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    }, [data, extraPages]);

    const lastCursor = (extraPages ?? []).at(-1)?.nextCursor ?? data?.nextCursor ?? null;

    const columns: DataTableColumn<SystemErrorGroupRow>[] = [
        {
            key: "severity",
            header: "Ciddiyet",
            width: "94px",
            cell: row => <SeverityBadge severity={row.severity} />,
        },
        {
            key: "title",
            header: "Hata",
            cell: row => (
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                        {row.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        {row.module ?? "—"}
                        {row.endpoint ? <> · <Mono>{row.endpoint}</Mono></> : null}
                    </div>
                </div>
            ),
        },
        {
            key: "count",
            header: "Tekrar",
            align: "right",
            width: "80px",
            cell: row => (
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {row.occurrence_count}
                </span>
            ),
        },
        {
            key: "first",
            header: "İlk görülme",
            width: "140px",
            cell: row => (
                <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>
                    {formatDateTime(row.first_seen_at)}
                </span>
            ),
        },
        {
            key: "last",
            header: "Son görülme",
            width: "120px",
            cell: row => (
                <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                    {formatRelative(row.last_seen_at)}
                </span>
            ),
        },
        {
            key: "status",
            header: "Durum",
            width: "96px",
            cell: row => (
                <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>
                    {STATUS_OPTIONS.find(s => s.value === row.status)?.label ?? row.status}
                </span>
            ),
        },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <PageHeader
                title="Hatalar"
                subtitle={
                    <>
                        Aynı kusurun tüm oluşumları tek satırda gruplanır.
                        {/* Veri gelmeden sayı BASILMAZ: gövde "yükleniyor" derken
                            üst satırın "0 grup" demesi çelişkili bir durum gösteriyordu. */}
                        {isLoading && !data ? null : <> <strong>{rows.length}</strong> grup gösteriliyor.</>}
                    </>
                }
                onRefresh={() => void mutate()}
                refreshing={isValidating}
                refreshAriaLabel="Hataları yenile"
                actions={<RangePicker value={range} onChange={r => setFilter({ range: r })} />}
            />

            <Card>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <Select
                        inputSize="sm"
                        aria-label="Ciddiyet filtresi"
                        value={severity}
                        onChange={e => setFilter({ severity: e.target.value })}
                        style={{ width: "auto", minWidth: "130px" }}
                    >
                        <option value="">Tüm ciddiyetler</option>
                        {SEVERITIES.map(s => (
                            <option key={s} value={s}>{SEVERITY_LABELS[s as TelemetrySeverity]}</option>
                        ))}
                    </Select>
                    <Select
                        inputSize="sm"
                        aria-label="Durum filtresi"
                        value={status}
                        onChange={e => setFilter({ status: e.target.value })}
                        style={{ width: "auto", minWidth: "130px" }}
                    >
                        {STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </Select>
                    <Input
                        inputSize="sm"
                        aria-label="Modül filtresi"
                        placeholder="Modül (örn. quotes)"
                        value={moduleInput.value}
                        onChange={e => moduleInput.setValue(e.target.value)}
                        style={{ width: "auto", minWidth: "150px" }}
                    />
                    <Input
                        inputSize="sm"
                        type="search"
                        aria-label="Hata ara"
                        placeholder="Mesaj / endpoint ara"
                        value={searchInput.value}
                        onChange={e => searchInput.setValue(e.target.value)}
                        style={{ width: "auto", minWidth: "200px", flex: 1 }}
                    />
                </div>
            </Card>

            {isLoading && !data ? (
                <LoadingState message="Hatalar yükleniyor…" />
            ) : error && !data ? (
                <ErrorState message="Hatalar yüklenemedi." onRetry={() => void mutate()} />
            ) : rows.length === 0 ? (
                <Card>
                    <EmptyState
                        title="Hata yok"
                        description="Bu aralıkta ve bu filtrelerde kayıtlı hata bulunmuyor. Sistem normal çalışıyor."
                    />
                </Card>
            ) : (
                <>
                    <DataTable
                        columns={columns}
                        rows={rows}
                        rowKey={row => row.id}
                        minWidth="880px"
                        onRowClick={row => push(`/dashboard/developer/errors/${row.id}`)}
                        rowAriaLabel={row => `${row.title} hatasının detayını gör`}
                    />
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
