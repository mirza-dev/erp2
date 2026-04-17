"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useData, type CommercialStatus, type FulfillmentStatus } from "@/lib/data-context";
import { mapOrderSummary } from "@/lib/api-mappers";
import type { Order } from "@/lib/mock-data";
import Button from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/StateViews";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { dateDaysFromToday } from "@/lib/stock-utils";

const commercialStatusConfig: Record<CommercialStatus, { label: string; cls: string }> = {
    draft:            { label: "Taslak",      cls: "badge-neutral" },
    pending_approval: { label: "Bekliyor",    cls: "badge-warning" },
    approved:         { label: "Onaylı",      cls: "badge-accent"  },
    cancelled:        { label: "İptal",       cls: "badge-danger"  },
};

const fulfillmentStatusConfig: Record<FulfillmentStatus, { label: string; cls: string }> = {
    unallocated:         { label: "Rezervesiz",   cls: "badge-neutral"  },
    partially_allocated: { label: "Kısmi Rezerve", cls: "badge-warning"  },
    allocated:           { label: "Rezerveli",    cls: "badge-warning"  },
    partially_shipped:   { label: "Sevk Edildi",  cls: "badge-success"  },
    shipped:             { label: "Sevk Edildi",  cls: "badge-success"  },
};

// For filter tabs — combine commercial + fulfillment into user-facing buckets
type FilterTab = "ALL" | CommercialStatus | "shipped";

const filterTabs: { id: FilterTab; label: string }[] = [
    { id: "ALL",              label: "Tümü" },
    { id: "pending_approval", label: "Bekleyen" },
    { id: "approved",         label: "Onaylı" },
    { id: "shipped",          label: "Sevk Edildi" },
    { id: "cancelled",        label: "İptal" },
    { id: "draft",            label: "Taslak" },
];

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

function matchesTab(order: { commercial_status: CommercialStatus; fulfillment_status: FulfillmentStatus }, tab: FilterTab): boolean {
    if (tab === "ALL") return true;
    if (tab === "shipped") return order.fulfillment_status === "shipped";
    if (tab === "approved") return order.commercial_status === "approved" && order.fulfillment_status !== "shipped";
    return order.commercial_status === tab;
}

function OrdersList() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { orders: contextOrders } = useData();
    const [mockOrders, setMockOrders] = useState<Order[]>(contextOrders);
    const contextInitRef = useRef(contextOrders.length > 0);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState("");
    const [customerIdFilter, setCustomerIdFilter] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<FilterTab>("ALL");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [currencyFilter, setCurrencyFilter] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const filterAppliedRef = useRef(false);

    // Initialize from DataContext on first non-empty load (avoids redundant fetch after navigation)
    useEffect(() => {
        if (!contextInitRef.current && contextOrders.length > 0) {
            setMockOrders(contextOrders);
            contextInitRef.current = true;
        }
    }, [contextOrders]);

    const refetch = useCallback(async () => {
        const res = await fetch("/api/orders");
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) setMockOrders(data.map(mapOrderSummary));
        }
    }, []);

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try { await refetch(); } finally { setRefreshing(false); }
    };

    const handleDelete = async (e: React.MouseEvent, orderId: string) => {
        e.stopPropagation();
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (confirmId !== orderId) {
            setConfirmId(orderId);
            return;
        }
        setDeletingId(orderId);
        setConfirmId(null);
        try {
            const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                toast({ type: "error", message: errBody.error || `İşlem başarısız (${res.status})` });
                return;
            }
            await refetch();
        } finally {
            setDeletingId(null);
        }
    };

    // Apply URL filter params once — depends on `searchParams` so it re-fires
    // when Suspense resolves on cold/deep-link loads.
    // filterAppliedRef ensures the filter is applied at most once.
    useEffect(() => {
        if (filterAppliedRef.current) return;
        filterAppliedRef.current = true;
        const customerId = searchParams.get("customerId");
        const customer   = searchParams.get("customer"); // legacy name-based
        const tab        = searchParams.get("tab");
        const from       = searchParams.get("from");
        const to         = searchParams.get("to");
        const currency   = searchParams.get("currency");
        if (customerId) setCustomerIdFilter(customerId);
        else if (customer) setSearch(decodeURIComponent(customer));
        if (tab && filterTabs.some((t) => t.id === tab)) setActiveTab(tab as FilterTab);
        if (from) setDateFrom(from);
        if (to) setDateTo(to);
        if (currency) setCurrencyFilter(currency);
    }, [searchParams]);

    // URL'e filtre state'ini yaz (link paylaşımı için)
    useEffect(() => {
        if (!filterAppliedRef.current) return; // mount okuma tamamlanmadan yazma
        const params = new URLSearchParams();
        if (customerIdFilter) params.set("customerId", customerIdFilter);
        if (activeTab !== "ALL") params.set("tab", activeTab);
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);
        if (currencyFilter) params.set("currency", currencyFilter);
        router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
    }, [activeTab, customerIdFilter, dateFrom, dateTo, currencyFilter, router]);

    const filtered = useMemo(() => mockOrders.filter((o) => {
        if (customerIdFilter && o.customerId !== customerIdFilter) return false;
        const matchSearch =
            !search ||
            o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            o.customerName.toLowerCase().includes(search.toLowerCase());
        if (!matchSearch) return false;
        if (!matchesTab(o, activeTab)) return false;
        const orderDate = (o.createdAt ?? "").slice(0, 10);
        if (dateFrom && orderDate < dateFrom) return false;
        if (dateTo   && orderDate > dateTo)   return false;
        if (currencyFilter && o.currency !== currencyFilter) return false;
        return true;
    }), [mockOrders, search, customerIdFilter, activeTab, dateFrom, dateTo, currencyFilter]);

    const getCount = (tab: FilterTab) =>
        tab === "ALL" ? mockOrders.length : mockOrders.filter(o => matchesTab(o, tab)).length;

    const pendingCount = mockOrders.filter(o => o.commercial_status === "pending_approval").length;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Siparişler
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        {mockOrders.length} sipariş · {pendingCount} onay bekliyor
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
                    <Link href="/dashboard/orders/new">
                        <Button variant="primary">+ Yeni Sipariş</Button>
                    </Link>
                </div>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                {/* Tabs — bottom border style */}
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

                {/* Search + Gelişmiş Filtreler */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Sipariş no veya müşteri..."
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
                    {(dateFrom || dateTo || currencyFilter || customerIdFilter) && (
                        <button
                            onClick={() => {
                                setDateFrom("");
                                setDateTo("");
                                setCurrencyFilter("");
                                setCustomerIdFilter(null);
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
                            <th style={thStyle}>Sipariş No</th>
                            <th style={thStyle}>Müşteri</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Ticari Durum</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Lojistik</th>
                            <th style={thStyle}>Tarih</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Kalem</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                            <th style={{ ...thStyle, width: "32px" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ border: "none" }}>
                                    <EmptyState
                                        title={
                                            search
                                                ? `"${search}" ile eşleşen sipariş bulunamadı`
                                                : `${filterTabs.find(t => t.id === activeTab)?.label ?? ""} durumunda sipariş yok`
                                        }
                                        description="Arama terimini değiştirmeyi veya filtreleri temizlemeyi deneyin."
                                        action={{
                                            label: "Filtreleri Temizle",
                                            onClick: () => { setSearch(""); setActiveTab("ALL"); },
                                        }}
                                    />
                                </td>
                            </tr>
                        ) : (
                            filtered.map((order) => {
                                const commercial = commercialStatusConfig[order.commercial_status];
                                const fulfillment = fulfillmentStatusConfig[order.fulfillment_status];
                                return (
                                    <tr
                                        key={order.id}
                                        style={{ cursor: "pointer" }}
                                        onClick={() => router.push(`/dashboard/orders/${order.id}`)}
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
                                            if (confirmId === order.id) setConfirmId(null);
                                        }}
                                    >
                                        <td style={{ ...tdStyle, fontWeight: 500, borderLeft: "2px solid transparent" }}>
                                            {order.orderNumber}
                                        </td>
                                        <td style={tdStyle}>
                                            {order.customerName}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "center" }}>
                                            <span className={`badge ${commercial.cls}`}>{commercial.label}</span>
                                            {order.quoteValidUntil &&
                                             (order.commercial_status === "draft" || order.commercial_status === "pending_approval") && (() => {
                                                const daysLeft = dateDaysFromToday(order.quoteValidUntil!);
                                                const expired = daysLeft < 0;
                                                const urgent = !expired && daysLeft <= 3;
                                                return (
                                                    <span style={{
                                                        display: "inline-block",
                                                        fontSize: "9px", fontWeight: 700,
                                                        padding: "1px 5px", borderRadius: "3px",
                                                        background: expired ? "var(--danger-bg)" : urgent ? "var(--warning-bg)" : "var(--bg-tertiary)",
                                                        color: expired ? "var(--danger-text)" : urgent ? "var(--warning-text)" : "var(--text-secondary)",
                                                        border: `0.5px solid ${expired ? "var(--danger-border)" : urgent ? "var(--warning-border)" : "var(--border-secondary)"}`,
                                                        marginLeft: "4px",
                                                    }}>
                                                        {expired ? "Süresi Doldu" : `${daysLeft} gün kaldı`}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "center" }}>
                                            {order.fulfillment_status !== "unallocated" && (
                                                <span
                                                    className={`badge ${fulfillment.cls}`}
                                                    style={{ fontSize: "10px", padding: "2px 6px" }}
                                                >
                                                    {fulfillment.label}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                            {formatDate(order.createdAt)}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-secondary)" }}>
                                            {order.itemCount}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>
                                            {formatCurrency(order.grandTotal, order.currency)}
                                        </td>
                                        <td
                                            style={{ ...tdStyle, width: "64px", textAlign: "right", padding: "10px 8px" }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                                                {confirmId === order.id ? (
                                                    <button
                                                        onClick={(e) => handleDelete(e, order.id)}
                                                        disabled={deletingId === order.id}
                                                        style={{
                                                            fontSize: "11px", color: "var(--danger-text)",
                                                            background: "var(--danger-bg)", border: "0.5px solid var(--danger-border)",
                                                            borderRadius: "4px", padding: "2px 7px", cursor: "pointer",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        Evet, iptal et
                                                    </button>
                                                ) : (
                                                    <button
                                                        data-delete=""
                                                        onClick={(e) => handleDelete(e, order.id)}
                                                        disabled={isDemo || deletingId === order.id}
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

export default function OrdersPage() {
    return (
        <Suspense>
            <OrdersList />
        </Suspense>
    );
}
