"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { QuoteSummary } from "@/lib/mock-data";
import Button from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/StateViews";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { getValidUntilBadge, canDeleteQuote } from "./_utils/quote-display";

type QuoteStatus = QuoteSummary["status"];
type FilterTab = "ALL" | QuoteStatus;

const filterTabs: { id: FilterTab; label: string }[] = [
    { id: "ALL",      label: "Tümü" },
    { id: "draft",    label: "Taslak" },
    { id: "sent",     label: "Gönderildi" },
    { id: "accepted", label: "Kabul Edildi" },
    { id: "rejected", label: "Reddedildi" },
    { id: "expired",  label: "Süresi Doldu" },
];

const quoteStatusConfig: Record<QuoteStatus, { label: string; cls: string }> = {
    draft:    { label: "Taslak",       cls: "badge-neutral" },
    sent:     { label: "Gönderildi",   cls: "badge-accent"  },
    accepted: { label: "Kabul Edildi", cls: "badge-success" },
    rejected: { label: "Reddedildi",  cls: "badge-danger"  },
    expired:  { label: "Süresi Doldu", cls: "badge-warning" },
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

function QuotesList() {
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<FilterTab>("ALL");
    const [search, setSearch] = useState("");
    const [currencyFilter, setCurrencyFilter] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const fetchQuotes = async () => {
        try {
            const res = await fetch("/api/quotes");
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setQuotes(data);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchQuotes(); }, []);

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try { await fetchQuotes(); } finally { setRefreshing(false); }
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
            setQuotes(prev => prev.filter(q => q.id !== quoteId));
        } finally {
            setDeletingId(null);
        }
    };

    const filtered = useMemo(() => quotes.filter(q => {
        if (activeTab !== "ALL" && q.status !== activeTab) return false;
        const matchSearch = !search ||
            q.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
            q.customerName.toLowerCase().includes(search.toLowerCase());
        if (!matchSearch) return false;
        if (currencyFilter && q.currency !== currencyFilter) return false;
        const d = (q.createdAt ?? "").slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
    }), [quotes, activeTab, search, currencyFilter, dateFrom, dateTo]);

    const getCount = (tab: FilterTab) =>
        tab === "ALL" ? quotes.length : quotes.filter(q => q.status === tab).length;

    const draftCount = quotes.filter(q => q.status === "draft").length;

    if (loading) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Teklifler yükleniyor...
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Teklifler
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        {quotes.length} teklif{draftCount > 0 ? ` · ${draftCount} taslak` : ""}
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        style={{
                            fontSize: "12px",
                            padding: "6px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: refreshing ? "not-allowed" : "pointer",
                            opacity: refreshing ? 0.5 : 1,
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M10 6A4 4 0 1 1 6 2a4 4 0 0 1 3.5 2M10 2v2.5H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {refreshing ? "Yenileniyor…" : "Yenile"}
                    </button>
                    <Link href="/dashboard/quotes/new">
                        <Button variant="primary">+ Yeni Teklif</Button>
                    </Link>
                </div>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                {/* Tabs */}
                <div style={{ display: "flex", gap: "0px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                    {filterTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                fontSize: "12px",
                                fontWeight: activeTab === tab.id ? 600 : 400,
                                padding: "8px 14px",
                                border: "none",
                                borderBottom: activeTab === tab.id
                                    ? "2px solid var(--accent)"
                                    : "2px solid transparent",
                                background: "transparent",
                                color: activeTab === tab.id
                                    ? "var(--accent-text)"
                                    : "var(--text-tertiary)",
                                cursor: "pointer",
                                marginBottom: "-0.5px",
                            }}
                        >
                            {tab.label} ({getCount(tab.id)})
                        </button>
                    ))}
                </div>

                {/* Search + Filters */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Teklif no veya müşteri..."
                        style={{
                            fontSize: "12px",
                            padding: "6px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "var(--bg-primary)",
                            color: "var(--text-primary)",
                            width: "200px",
                            outline: "none",
                        }}
                    />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        title="Başlangıç tarihi"
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `0.5px solid ${dateFrom ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--bg-primary)",
                            color: dateFrom ? "var(--text-primary)" : "var(--text-tertiary)",
                            outline: "none",
                            cursor: "pointer",
                        }}
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>—</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        title="Bitiş tarihi"
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `0.5px solid ${dateTo ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--bg-primary)",
                            color: dateTo ? "var(--text-primary)" : "var(--text-tertiary)",
                            outline: "none",
                            cursor: "pointer",
                        }}
                    />
                    <select
                        value={currencyFilter}
                        onChange={(e) => setCurrencyFilter(e.target.value)}
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `0.5px solid ${currencyFilter ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--bg-primary)",
                            color: currencyFilter ? "var(--text-primary)" : "var(--text-tertiary)",
                            outline: "none",
                            cursor: "pointer",
                        }}
                    >
                        <option value="">Tüm Para Birimleri</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="TRY">TRY</option>
                    </select>
                    {(dateFrom || dateTo || currencyFilter) && (
                        <button
                            onClick={() => {
                                setDateFrom("");
                                setDateTo("");
                                setCurrencyFilter("");
                            }}
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
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ border: "none" }}>
                                    <EmptyState
                                        title={
                                            search
                                                ? `"${search}" ile eşleşen teklif bulunamadı`
                                                : `${filterTabs.find(t => t.id === activeTab)?.label ?? ""} durumunda teklif yok`
                                        }
                                        description="Arama terimini değiştirmeyi veya filtreleri temizlemeyi deneyin."
                                        action={{
                                            label: "Filtreleri Temizle",
                                            onClick: () => { setSearch(""); setActiveTab("ALL"); setCurrencyFilter(""); setDateFrom(""); setDateTo(""); },
                                        }}
                                    />
                                </td>
                            </tr>
                        ) : (
                            filtered.map((q) => {
                                const statusCfg = quoteStatusConfig[q.status];
                                const badge = (q.status === "draft" || q.status === "sent")
                                    ? getValidUntilBadge(q.validUntil)
                                    : null;
                                const deletable = canDeleteQuote(q.status);

                                return (
                                    <tr
                                        key={q.id}
                                        style={{ cursor: "pointer" }}
                                        onClick={() => router.push(`/dashboard/quotes/${q.id}`)}
                                        onMouseEnter={(e) => {
                                            const tds = e.currentTarget.querySelectorAll("td");
                                            tds.forEach((td, i) => {
                                                td.style.background = "var(--bg-secondary)";
                                                if (i === 0) td.style.borderLeft = "2px solid var(--accent)";
                                            });
                                            const chevron = e.currentTarget.querySelector("[data-chevron]") as HTMLElement;
                                            if (chevron) chevron.style.opacity = "1";
                                            const deleteBtn = e.currentTarget.querySelector("[data-delete]") as HTMLElement;
                                            if (deleteBtn) deleteBtn.style.opacity = "1";
                                        }}
                                        onMouseLeave={(e) => {
                                            const tds = e.currentTarget.querySelectorAll("td");
                                            tds.forEach((td, i) => {
                                                td.style.background = "transparent";
                                                if (i === 0) td.style.borderLeft = "2px solid transparent";
                                            });
                                            const chevron = e.currentTarget.querySelector("[data-chevron]") as HTMLElement;
                                            if (chevron) chevron.style.opacity = "0";
                                            const deleteBtn = e.currentTarget.querySelector("[data-delete]") as HTMLElement;
                                            if (deleteBtn) deleteBtn.style.opacity = "0";
                                            if (confirmId === q.id) setConfirmId(null);
                                        }}
                                    >
                                        <td style={{ ...tdStyle, fontWeight: 500, borderLeft: "2px solid transparent" }}>
                                            {q.quoteNumber}
                                        </td>
                                        <td style={tdStyle}>
                                            {q.customerName}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "center" }}>
                                            <span className={`badge ${statusCfg.cls}`}>{statusCfg.label}</span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "center" }}>
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
                                        <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                            {formatDate(q.createdAt)}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>
                                            {formatCurrency(q.grandTotal, q.currency)}
                                        </td>
                                        <td
                                            style={{ ...tdStyle, width: "64px", textAlign: "right", padding: "10px 8px" }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                                                {deletable && (
                                                    confirmId === q.id ? (
                                                        <button
                                                            onClick={(e) => handleDelete(e, q.id)}
                                                            disabled={deletingId === q.id}
                                                            style={{
                                                                fontSize: "11px", color: "var(--danger-text)",
                                                                background: "var(--danger-bg)", border: "0.5px solid var(--danger-border)",
                                                                borderRadius: "4px", padding: "2px 7px", cursor: "pointer",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            Evet, sil
                                                        </button>
                                                    ) : (
                                                        <button
                                                            data-delete=""
                                                            onClick={(e) => handleDelete(e, q.id)}
                                                            disabled={isDemo || deletingId === q.id}
                                                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                                            style={{
                                                                opacity: 0, background: "transparent", border: "none",
                                                                cursor: isDemo ? "not-allowed" : "pointer", color: "var(--text-tertiary)",
                                                                padding: "2px 4px", borderRadius: "3px",
                                                                display: "flex", alignItems: "center",
                                                                transition: "opacity 0.1s, color 0.1s",
                                                            }}
                                                        >
                                                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                                                <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5.5 6v3.5M7.5 6v3.5M3 3.5l.5 7a.5.5 0 00.5.5h5a.5.5 0 00.5-.5l.5-7"
                                                                    stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                                                            </svg>
                                                        </button>
                                                    )
                                                )}
                                                <span data-chevron="" style={{ opacity: 0, color: "var(--text-tertiary)" }}>
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
            </div>
        </div>
    );
}

export default function QuotesPage() {
    return (
        <Suspense>
            <QuotesList />
        </Suspense>
    );
}
