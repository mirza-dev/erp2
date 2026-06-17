"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useListUrlState, useDebouncedSearch } from "@/hooks/useListUrlState";
import { maskCurrency, formatDate } from "@/lib/utils";
import type { QuoteSummary } from "@/lib/mock-data";
import { usePermissions } from "@/lib/auth/use-permissions";
import Button, { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/StateViews";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { computeTotalPages } from "@/hooks/usePagination";
import Pagination from "@/components/ui/Pagination";
import { useSelection } from "@/hooks/useSelection";
import { getValidUntilBadge, canDeleteQuote, pickSucceededIds } from "./_utils/quote-display";
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

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "13px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
    lineHeight: 1.4,
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

    const [refreshing, setRefreshing] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => { document.title = "Teklifler · Roven"; }, []);

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
            router.refresh();
        } finally {
            setDeletingId(null);
        }
    };

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${tab}|${search}|${currency}|${dateFrom}|${dateTo}|${page}`);
    // Seçim yalnız silinebilir (draft) satırlarla sınırlı (canDeleteQuote ile tutarlı).
    const canDeleteQuotes = has("delete_quotes");
    const deletablePageIds = canDeleteQuotes ? quotes.filter(q => canDeleteQuote(q.status)).map(q => q.id) : [];

    const handleBulkDelete = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBulkDeleting(true);
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/quotes/${id}`, { method: "DELETE" })),
        );
        // YALNIZ başarılı id'ler sayılır (409 sent / network fail ekranda kalır).
        const succeededIds = pickSucceededIds(ids, results);
        const failed = ids.length - succeededIds.length;
        if (succeededIds.length > 0) toast({ type: "success", message: `${succeededIds.length} teklif silindi.` });
        if (failed > 0) toast({ type: "error", message: `${failed} teklif silinemedi.` });
        clearAll();
        setBulkDeleteConfirm(false);
        setBulkDeleting(false);
        router.refresh();
    };

    const totalPages = computeTotalPages(total, pageSize);
    const draftCount = counts.draft;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", opacity: isPending ? 0.7 : 1, transition: "opacity 0.12s" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Teklifler
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        {counts.ALL} teklif{draftCount > 0 ? ` · ${draftCount} taslak` : ""}
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
                    items={filterTabs.map((t) => ({ key: t.id, label: t.label, count: counts[t.id] }))}
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
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "var(--bg-primary)",
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
                            border: `0.5px solid ${dateFrom ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--bg-primary)",
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
                            border: `0.5px solid ${dateTo ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--bg-primary)",
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
                            border: `0.5px solid ${currency ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--bg-primary)",
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
                                border: "0.5px solid var(--border-secondary)",
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
            <div
                style={{
                    background: "var(--bg-primary)",
                    border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "6px",
                    overflowX: "auto",
                }}
            >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "740px" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-secondary)" }}>
                            <th style={{ ...thStyle, width: "36px", padding: "10px 8px 10px 14px" }}>
                                {canDeleteQuotes && (
                                    <input
                                        type="checkbox"
                                        checked={isPageAllSelected(deletablePageIds)}
                                        ref={el => { if (el) el.indeterminate = isPageIndeterminate(deletablePageIds); }}
                                        onChange={() => toggleAll(deletablePageIds)}
                                        onClick={e => e.stopPropagation()}
                                        style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                        aria-label="Sayfadaki tüm teklifleri seç"
                                    />
                                )}
                            </th>
                            <th style={thStyle}>Teklif No</th>
                            <th style={thStyle}>Müşteri</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Geçerlilik</th>
                            <th style={thStyle}>Tarih</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                            <th style={{ ...thStyle, width: "32px" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotes.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ border: "none" }}>
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
                                </td>
                            </tr>
                        ) : (
                            quotes.map((q) => {
                                const statusCfg = quoteStatusConfig[q.status];
                                const badge = (q.status === "draft" || q.status === "sent")
                                    ? getValidUntilBadge(q.validUntil)
                                    : null;
                                const deletable = canDeleteQuote(q.status);

                                const isHovered = hoveredId === q.id;
                                const rowBg = isHovered ? "var(--bg-secondary)" : "transparent";
                                return (
                                    <tr
                                        key={q.id}
                                        style={{ cursor: "pointer" }}
                                        onClick={() => router.push(`/dashboard/quotes/${q.id}`)}
                                        onMouseEnter={() => setHoveredId(q.id)}
                                        onMouseLeave={() => setHoveredId(null)}
                                    >
                                        <td
                                            style={{ ...tdStyle, width: "36px", padding: "10px 8px 10px 14px", background: rowBg }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {/* Yalnız silinebilir (draft) satırlar seçilebilir. */}
                                            {deletable && canDeleteQuotes && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(q.id)}
                                                    onChange={() => toggleOne(q.id)}
                                                    onClick={e => e.stopPropagation()}
                                                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                                    aria-label={`${q.quoteNumber} seç`}
                                                />
                                            )}
                                        </td>
                                        <td style={{
                                            ...tdStyle,
                                            fontWeight: 500,
                                            background: rowBg,
                                            borderLeft: isHovered ? "2px solid var(--accent)" : "2px solid transparent",
                                        }}>
                                            {q.quoteNumber}
                                        </td>
                                        <td style={{ ...tdStyle, background: rowBg }}>
                                            {q.customerName}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "center", background: rowBg }}>
                                            <span className={`badge ${statusCfg.cls}`}>{statusCfg.label}</span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "center", background: rowBg }}>
                                            {badge && (
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
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, color: "var(--text-secondary)", background: rowBg }}>
                                            {formatDate(q.createdAt)}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500, background: rowBg }}>
                                            {maskCurrency(q.grandTotal, q.currency, canViewSalesPrices)}
                                        </td>
                                        <td
                                            style={{ ...tdStyle, width: "64px", textAlign: "right", padding: "10px 8px", background: rowBg }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
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
                                                        <Button
                                                            variant="dangerSoft"
                                                            size="xs"
                                                            iconOnly
                                                            onClick={(e) => handleDelete(e, q.id)}
                                                            disabled={isDemo || deletingId === q.id}
                                                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                                            aria-label="Teklifi sil"
                                                            leftIcon={<Trash2 size={13} />}
                                                            style={{ opacity: isHovered ? 1 : 0 }}
                                                        />
                                                    )
                                                )}
                                                <span aria-hidden="true" style={{ opacity: isHovered ? 1 : 0, color: "var(--text-tertiary)" }}>
                                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                                        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
                {total > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        totalItems={total}
                        pageSize={pageSize}
                        onPageChange={(p) => navigate({ page: p })}
                        itemLabel="teklif"
                    />
                )}
            </div>

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
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-primary)",
                        borderRadius: "8px", padding: "24px", width: "380px", maxWidth: "90vw",
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
