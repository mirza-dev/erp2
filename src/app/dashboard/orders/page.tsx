"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useData } from "@/lib/data-context";
import type { CommercialStatus, FulfillmentStatus } from "@/lib/data-context";
import Button from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/StateViews";

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
    partially_shipped:   { label: "Kısmi Sevk",   cls: "badge-accent"   },
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
    const { orders: mockOrders } = useData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState<FilterTab>("ALL");

    useEffect(() => {
        const customer = searchParams.get("customer");
        if (customer) setSearch(decodeURIComponent(customer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtered = mockOrders.filter((o) => {
        const matchSearch =
            o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            o.customerName.toLowerCase().includes(search.toLowerCase());
        return matchSearch && matchesTab(o, activeTab);
    });

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
                <Link href="/dashboard/orders/new">
                    <Button variant="primary">+ Yeni Sipariş</Button>
                </Link>
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

                {/* Search */}
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
                        width: "220px",
                        outline: "none",
                    }}
                />
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
                                        }}
                                        onMouseLeave={(e) => {
                                            const tds = e.currentTarget.querySelectorAll("td");
                                            tds.forEach((td, i) => {
                                                td.style.background = "transparent";
                                                if (i === 0) td.style.borderLeft = "2px solid transparent";
                                            });
                                            const chevron = e.currentTarget.querySelector("[data-chevron]") as HTMLElement;
                                            if (chevron) chevron.style.opacity = "0";
                                        }}
                                    >
                                        <td style={{ ...tdStyle, fontWeight: 500, borderLeft: "2px solid transparent" }}>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                                {order.orderNumber}
                                                {order.aiRiskLevel && order.aiConfidence != null && order.aiConfidence > 0 && (
                                                    <span
                                                        title={
                                                            order.aiRiskLevel === "high" ? "AI Risk: Yüksek"
                                                            : order.aiRiskLevel === "medium" ? "AI Risk: Orta"
                                                            : "AI Risk: Düşük"
                                                        }
                                                        style={{
                                                            display: "inline-block",
                                                            width: "7px",
                                                            height: "7px",
                                                            borderRadius: "50%",
                                                            flexShrink: 0,
                                                            background:
                                                                order.aiRiskLevel === "high" ? "var(--danger)"
                                                                : order.aiRiskLevel === "medium" ? "var(--warning)"
                                                                : "var(--success)",
                                                        }}
                                                    />
                                                )}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            {order.customerName}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "center" }}>
                                            <span className={`badge ${commercial.cls}`}>{commercial.label}</span>
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
                                        <td style={{ ...tdStyle, width: "32px", textAlign: "center", padding: "10px 8px" }}>
                                            <span data-chevron="" style={{ opacity: 0, color: "var(--text-tertiary)", fontSize: "12px" }}>
                                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </span>
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
