"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useData } from "@/lib/data-context";

const statusConfig: Record<string, { label: string; cls: string }> = {
    DRAFT:     { label: "Taslak",      cls: "badge-neutral" },
    PENDING:   { label: "Bekliyor",    cls: "badge-warning" },
    APPROVED:  { label: "Onaylı",      cls: "badge-accent"  },
    SHIPPED:   { label: "Sevk Edildi", cls: "badge-success" },
    CANCELLED: { label: "İptal",       cls: "badge-danger"  },
};

const filterTabs = [
    { id: "ALL",       label: "Tümü" },
    { id: "PENDING",   label: "Bekleyen" },
    { id: "APPROVED",  label: "Onaylı" },
    { id: "SHIPPED",   label: "Sevk Edildi" },
    { id: "CANCELLED", label: "İptal" },
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

function OrdersList() {
    const { orders: mockOrders } = useData();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState("ALL");

    useEffect(() => {
        const customer = searchParams.get("customer");
        if (customer) setSearch(decodeURIComponent(customer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtered = mockOrders.filter((o) => {
        const matchSearch =
            o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            o.customerName.toLowerCase().includes(search.toLowerCase());
        const matchStatus = activeTab === "ALL" || o.status === activeTab;
        return matchSearch && matchStatus;
    });

    const getCount = (id: string) =>
        id === "ALL" ? mockOrders.length : mockOrders.filter(o => o.status === id).length;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Siparişler
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        {mockOrders.length} sipariş · {mockOrders.filter(o => o.status === "PENDING").length} onay bekliyor
                    </div>
                </div>
                <Link href="/dashboard/orders/new">
                    <button
                        style={{
                            fontSize: "12px",
                            padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)",
                            borderRadius: "6px",
                            background: "var(--accent-bg)",
                            color: "var(--accent-text)",
                            cursor: "pointer",
                        }}
                    >
                        + Yeni Sipariş
                    </button>
                </Link>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                {/* Tabs */}
                <div style={{ display: "flex", gap: "4px" }}>
                    {filterTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                fontSize: "12px",
                                padding: "6px 12px",
                                border: "0.5px solid var(--border-secondary)",
                                borderRadius: "6px",
                                background: activeTab === tab.id ? "var(--accent-bg)" : "transparent",
                                color: activeTab === tab.id ? "var(--accent-text)" : "var(--text-secondary)",
                                cursor: "pointer",
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
                    overflow: "hidden",
                }}
            >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-secondary)" }}>
                            <th style={thStyle}>Sipariş No</th>
                            <th style={thStyle}>Müşteri</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                            <th style={thStyle}>Tarih</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Kalem</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((order) => {
                            const status = statusConfig[order.status];
                            return (
                                <tr
                                    key={order.id}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "var(--bg-secondary)"));
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "transparent"));
                                    }}
                                >
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                                        {order.orderNumber}
                                    </td>
                                    <td style={tdStyle}>
                                        {order.customerName}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>
                                        <span className={`badge ${status.cls}`}>{status.label}</span>
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
                                </tr>
                            );
                        })}
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
