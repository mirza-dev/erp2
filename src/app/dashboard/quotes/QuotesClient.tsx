"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useListUrlState, useDebouncedSearch } from "@/hooks/useListUrlState";
import { maskCurrency, formatDate } from "@/lib/utils";
import type { QuoteSummary } from "@/lib/mock-data";
import { usePermissions } from "@/lib/auth/use-permissions";
import { decrementCount, patchCountRecord, removeByIds, successfulResponseIds } from "@/lib/fast-mutation";
import Button, { ButtonLink } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/StateViews";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { computeTotalPages } from "@/hooks/usePagination";
import Pagination from "@/components/ui/Pagination";
import { useSelection } from "@/hooks/useSelection";
import { getValidUntilBadge, canDeleteQuote } from "./_utils/quote-display";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import UnderlinedFilterTabs from "@/components/ui/UnderlinedFilterTabs";
import type { QuoteTab } from "@/lib/supabase/quotes";

type QuoteStatus = QuoteSummary["status"];

const filterTabs: { id: QuoteTab; label: string }[] = [
    { id: "ALL",      label: "Tümü" },
    { id: "draft",    label: "Taslak" },
    { id: "sent",     label: "Gönderildi" },
    { id: "accepted", label: "Kabul Edildi" },
    { id: "rejected", label: "Reddedildi" },
    { id: "expired",  label: "Süresi Doldu" },
    { id: "revised",  label: "Revize Edildi" },
];

const quoteStatusConfig: Record<QuoteStatus, { label: string; cls: string }> = {
    draft:    { label: "Taslak",       cls: "badge-neutral" },
    sent:     { label: "Gönderildi",   cls: "badge-accent"  },
    accepted: { label: "Kabul Edildi", cls: "badge-success" },
    rejected: { label: "Reddedildi",  cls: "badge-danger"  },
    expired:  { label: "Süresi Doldu", cls: "badge-warning" },
    revised:  { label: "Revize Edildi", cls: "badge-neutral" },
};

const badgeColors = {
    expired: { bg: "var(--danger-bg)", color: "var(--danger-text)", border: "var(--danger-border)" },
    urgent:  { bg: "var(--warning-bg)", color: "var(--warning-text)", border: "var(--warning-border)" },
    ok:      { bg: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "var(--border-secondary)" },
};

export interface QuotesClientProps {
    quotes: QuoteSummary[];                 // YALNIZ geçerli sayfa
    total: number;
    counts: Record<QuoteTab, number>;
    page: number;
    pageSize: number;
    tab: QuoteTab;
    search: string;
    currency: string;
    dateFrom: string;
    dateTo: string;
}

interface FilterState {
    tab: QuoteTab;
    search: string;
    currency: string;
    dateFrom: string;
    dateTo: string;
    page: number;
}

export default function QuotesClient(props: QuotesClientProps) {
    const { quotes, total, counts, page, pageSize, tab, search, currency, dateFrom, dateTo } = props;
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { has, canViewSalesPrices } = usePermissions();

    const [displayQuotes, setDisplayQuotes] = useState<QuoteSummary[]>(quotes);
    const [displayCounts, setDisplayCounts] = useState<Record<QuoteTab, number>>(counts);
    const [displayTotal, setDisplayTotal] = useState(total);
    const [refreshing, setRefreshing] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => { document.title = "Teklifler · Roven"; }, []);

    useEffect(() => {
        setDisplayQuotes(quotes);
        setDisplayCounts(counts);
        setDisplayTotal(total);
    }, [quotes, counts, total]);

    const serialize = (p: FilterState) => {
        const params = new URLSearchParams();
        if (p.tab && p.tab !== "ALL") params.set("tab", p.tab);
        if (p.search) params.set("search", p.search);
        if (p.currency) params.set("currency", p.currency);
        if (p.dateFrom) params.set("from", p.dateFrom);
        if (p.dateTo) params.set("to", p.dateTo);
        if (p.page > 1) params.set("page", String(p.page));
        return params;
    };
    const { navigate, isPending } = useListUrlState<FilterState>(
        { tab, search, currency, dateFrom, dateTo, page },
        serialize,
    );
    const { value: searchText, setValue: setSearchText } = useDebouncedSearch(
        search,
        (v) => navigate({ search: v, page: 1 }),
    );

    const handleRefresh = () => {
        if (refreshing || isPending) return;
        setRefreshing(true);
        router.refresh();
        setTimeout(() => setRefreshing(false), 500);
    };

    const handleDelete = async (e: React.MouseEvent, quoteId: string) => {
        e.stopPropagation();
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (confirmId !== quoteId) { setConfirmId(quoteId); return; }
        setDeletingId(quoteId);
        setConfirmId(null);
        try {
            const res = await fetch(`/api/quotes/${quoteId}`, { method: "DELETE" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast({ type: "error", message: err.error || `İşlem başarısız (${res.status})` });
                return;
            }
            applyDeletedQuotes([quoteId]);
        } finally {
            setDeletingId(null);
        }
    };

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${tab}|${search}|${currency}|${dateFrom}|${dateTo}|${page}`);
    // Seçim yalnız silinebilir (draft) satırlarla sınırlı (canDeleteQuote ile tutarlı).
    const canDeleteQuotes = has("delete_quotes");
    const deletablePageIds = canDeleteQuotes ? displayQuotes.filter(q => canDeleteQuote(q.status)).map(q => q.id) : [];

    const applyDeletedQuotes = (ids: string[]) => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        const previous = displayQuotes.filter(quote => idSet.has(quote.id));
        setDisplayQuotes(prev => removeByIds(prev, idSet));
        setDisplayCounts(prev => {
            const patches: Partial<Record<QuoteTab, number>> = { ALL: -ids.length };
            for (const quote of previous) {
                patches[quote.status] = (patches[quote.status] ?? 0) - 1;
            }
            return patchCountRecord(prev, patches);
        });
        setDisplayTotal(prev => decrementCount(prev, ids.length));
    };

    const handleBulkDelete = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBulkDeleting(true);
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/quotes/${id}`, { method: "DELETE" })),
        );
        // YALNIZ başarılı id'ler sayılır (409 sent / network fail ekranda kalır).
        const succeededIds = successfulResponseIds(ids, results);
        const failed = ids.length - succeededIds.length;
        if (succeededIds.length > 0) toast({ type: "success", message: `${succeededIds.length} teklif silindi.` });
        if (failed > 0) toast({ type: "error", message: `${failed} teklif silinemedi.` });
        clearAll();
        setBulkDeleteConfirm(false);
        setBulkDeleting(false);
        applyDeletedQuotes(succeededIds);
    };

    const totalPages = computeTotalPages(displayTotal, pageSize);
    const draftCount = displayCounts.draft;

    const columns: DataTableColumn<QuoteSummary>[] = [
        {
            key: "select",
            width: "36px",
            headerStyle: { padding: "10px 8px 10px 14px" },
            cellStyle: { padding: "10px 8px 10px 14px" },
            header: canDeleteQuotes ? (
                <input
                    type="checkbox"
                    checked={isPageAllSelected(deletablePageIds)}
                    ref={el => { if (el) el.indeterminate = isPageIndeterminate(deletablePageIds); }}
                    onChange={() => toggleAll(deletablePageIds)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                    aria-label="Sayfadaki tüm teklifleri seç"
                />
            ) : null,
            // Yalnız silinebilir (draft) satırlar seçilebilir.
            cell: q => (canDeleteQuote(q.status) && canDeleteQuotes) ? (
                <span onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={selectedIds.has(q.id)}
                        onChange={() => toggleOne(q.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                        aria-label={`${q.quoteNumber} seç`}
                    />
                </span>
            ) : null,
        },
        {
            key: "quoteNumber",
            header: "Teklif No",
            cellStyle: { fontWeight: 500 },
            cell: q => q.quoteNumber,
        },
        {
            key: "customerName",
            header: "Müşteri",
            cell: q => q.customerName,
        },
        {
            key: "status",
            header: "Durum",
            align: "center",
            cell: q => {
                const statusCfg = quoteStatusConfig[q.status];
                return <span className={`badge ${statusCfg.cls}`}>{statusCfg.label}</span>;
            },
        },
        {
            key: "validity",
            header: "Geçerlilik",
            align: "center",
            cell: q => {
                const badge = (q.status === "draft" || q.status === "sent")
                    ? getValidUntilBadge(q.validUntil)
                    : null;
                if (!badge) return null;
                return (
                    <span style={{
                        display: "inline-block",
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: badgeColors[badge.type].bg,
                        color: badgeColors[badge.type].color,
                        border: `0.5px solid ${badgeColors[badge.type].border}`,
                    }}>
                        {badge.text}
                    </span>
                );
            },
        },
        {
            key: "createdAt",
            header: "Tarih",
            cellStyle: { color: "var(--text-secondary)" },
            cell: q => formatDate(q.createdAt),
        },
        {
            key: "grandTotal",
            header: "Tutar",
            align: "right",
            cellStyle: { fontWeight: 500 },
            cell: q => maskCurrency(q.grandTotal, q.currency, canViewSalesPrices),
        },
        {
            key: "action",
            header: "",
            align: "right",
            width: "64px",
            cellStyle: { padding: "10px 8px" },
            cell: q => {
                const deletable = canDeleteQuote(q.status);
                return (
                    <div
                        style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}
                        onClick={e => e.stopPropagation()}
                    >
                        {deletable && canDeleteQuotes && (
                            confirmId === q.id ? (
                                <Button
                                    variant="danger"
                                    size="xs"
                                    leftIcon={<Trash2 size={13} />}
                                    onClick={(e) => handleDelete(e, q.id)}
                                    disabled={deletingId === q.id}
                                >
                                    Evet, sil
                                </Button>
                            ) : (
                                <span className="row-reveal">
                                    <Button
                                        variant="dangerSoft"
                                        size="xs"
                                        iconOnly
                                        onClick={(e) => handleDelete(e, q.id)}
                                        disabled={isDemo || deletingId === q.id}
                                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                        aria-label="Teklifi sil"
                                        leftIcon={<Trash2 size={13} />}
                                    />
                                </span>
                            )
                        )}
                        <span className="row-reveal" aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                    </div>
                );
            },
        },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", opacity: isPending ? 0.7 : 1, transition: "opacity 0.12s" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Teklifler
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        {displayCounts.ALL} teklif{draftCount > 0 ? ` · ${draftCount} taslak` : ""}
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Button
                        variant="toolbar"
                        size="md"
                        onClick={handleRefresh}
                        disabled={refreshing || isPending}
                        aria-label="Teklifleri yenile"
                        leftIcon={<RefreshCw size={15} />}
                    >
                        {refreshing || isPending ? "Yenileniyor…" : "Yenile"}
                    </Button>
                    {has("manage_quotes") && (
                        <ButtonLink
                            href="/dashboard/quotes/new"
                            size="cta"
                            leftIcon={<Plus size={15} />}
                        >
                            Yeni Teklif
                        </ButtonLink>
                    )}
                </div>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <UnderlinedFilterTabs
                    ariaLabel="Teklif durumu filtresi"
                    items={filterTabs.map((t) => ({ key: t.id, label: t.label, count: displayCounts[t.id] }))}
                    activeKey={tab}
                    onChange={(key) => navigate({ tab: key, page: 1 })}
                />

                {/* Search + Filters */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <input
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Teklif no veya müşteri..."
                        aria-label="Teklif ara"
                        style={{
                            fontSize: "12px",
                            padding: "6px 12px",
                            border: "var(--line-width) solid var(--input-border)",
                            borderRadius: "6px",
                            background: "var(--input-bg)",
                            color: "var(--text-primary)",
                            width: "200px",
                        }}
                    />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => navigate({ dateFrom: e.target.value, page: 1 })}
                        title="Başlangıç tarihi"
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `var(--line-width) solid ${dateFrom ? "var(--accent-border)" : "var(--input-border)"}`,
                            borderRadius: "6px",
                            background: "var(--input-bg)",
                            color: dateFrom ? "var(--text-primary)" : "var(--text-tertiary)",
                            cursor: "pointer",
                        }}
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>—</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => navigate({ dateTo: e.target.value, page: 1 })}
                        title="Bitiş tarihi"
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `var(--line-width) solid ${dateTo ? "var(--accent-border)" : "var(--input-border)"}`,
                            borderRadius: "6px",
                            background: "var(--input-bg)",
                            color: dateTo ? "var(--text-primary)" : "var(--text-tertiary)",
                            cursor: "pointer",
                        }}
                    />
                    <select
                        value={currency}
                        onChange={(e) => navigate({ currency: e.target.value, page: 1 })}
                        aria-label="Para birimi filtresi"
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `var(--line-width) solid ${currency ? "var(--accent-border)" : "var(--input-border)"}`,
                            borderRadius: "6px",
                            background: "var(--input-bg)",
                            color: currency ? "var(--text-primary)" : "var(--text-tertiary)",
                            cursor: "pointer",
                        }}
                    >
                        <option value="">Tüm Para Birimleri</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="TRY">TRY</option>
                    </select>
                    {(dateFrom || dateTo || currency) && (
                        <button
                            type="button"
                            onClick={() => navigate({ dateFrom: "", dateTo: "", currency: "", page: 1 })}
                            style={{
                                fontSize: "11px",
                                padding: "5px 10px",
                                border: "var(--line-width) solid var(--border-secondary)",
                                borderRadius: "6px",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            × Filtreleri Temizle
                        </button>
                    )}
                </div>
            </div>

            {/* Bulk action bar */}
            {canDeleteQuotes && selectedIds.size > 0 && (
                <div style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px",
                    background: "var(--accent-bg)",
                    border: "0.5px solid var(--accent-border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                }}>
                    <span style={{ color: "var(--accent-text)", fontWeight: 500 }}>
                        {selectedIds.size} teklif seçildi
                    </span>
                    <Button
                        variant="dangerSoft"
                        size="sm"
                        leftIcon={<Trash2 size={14} />}
                        onClick={() => setBulkDeleteConfirm(true)}
                        disabled={bulkDeleting}
                    >
                        {bulkDeleting ? "Siliniyor…" : "Sil"}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAll}
                    >
                        Seçimi Temizle
                    </Button>
                </div>
            )}

            {/* Table */}
            <Card>
                <DataTable
                    columns={columns}
                    rows={displayQuotes}
                    rowKey={q => q.id}
                    onRowClick={q => router.push(`/dashboard/quotes/${q.id}`)}
                    minWidth="740px"
                    emptyMessage={
                        <EmptyState
                            title={
                                search
                                    ? `"${search}" ile eşleşen teklif bulunamadı`
                                    : `${filterTabs.find(t => t.id === tab)?.label ?? ""} durumunda teklif yok`
                            }
                            description="Arama terimini değiştirmeyi veya filtreleri temizlemeyi deneyin."
                            action={{
                                label: "Filtreleri Temizle",
                                onClick: () => navigate({ search: "", tab: "ALL", currency: "", dateFrom: "", dateTo: "", page: 1 }),
                            }}
                        />
                    }
                    footer={displayTotal > 0 ? (
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            totalItems={displayTotal}
                            pageSize={pageSize}
                            onPageChange={(p) => navigate({ page: p })}
                            itemLabel="teklif"
                        />
                    ) : null}
                />
            </Card>

            {/* Bulk delete confirm modal */}
            {bulkDeleteConfirm && (
                <>
                    <div
                        onClick={() => !bulkDeleting && setBulkDeleteConfirm(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)" }}
                    />
                    <div style={{
                        position: "fixed", top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)", zIndex: 101,
                        background: "var(--surface-raised)", border: "var(--line-width) solid var(--surface-border)",
                        borderRadius: "8px", padding: "24px", width: "380px", maxWidth: "90vw",
                        boxShadow: "var(--surface-shadow)",
                    }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            {selectedIds.size} teklifi sil
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                            Seçili teklifleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <Button
                                variant="secondary"
                                onClick={() => setBulkDeleteConfirm(false)}
                                disabled={bulkDeleting}
                            >
                                İptal
                            </Button>
                            <Button
                                variant="danger"
                                leftIcon={<Trash2 size={14} />}
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                            >
                                {bulkDeleting ? "Siliniyor…" : "Sil"}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
