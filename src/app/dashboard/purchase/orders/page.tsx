"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import type { PurchaseOrderRow, PurchaseOrderStatus, VendorRow } from "@/lib/database.types";

const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "10px 14px", fontSize: "12px", fontWeight: 500,
    color: "var(--text-secondary)", borderBottom: "0.5px solid var(--border-tertiary)",
};
const tdStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: "13px", borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)", lineHeight: 1.4,
};

type StatusFilter = PurchaseOrderStatus | "all";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "draft", label: "Taslak" },
    { key: "sent", label: "Gönderildi" },
    { key: "confirmed", label: "Onaylandı" },
    { key: "partially_received", label: "Kısmi Kabul" },
    { key: "received", label: "Tamamlandı" },
    { key: "cancelled", label: "İptal" },
];

const STATUS_BG: Record<PurchaseOrderStatus, { bg: string; text: string }> = {
    draft:              { bg: "var(--bg-tertiary)",     text: "var(--text-secondary)" },
    sent:               { bg: "var(--accent-bg)",       text: "var(--accent-text)" },
    confirmed:          { bg: "var(--success-bg)",      text: "var(--success-text)" },
    partially_received: { bg: "var(--warning-bg)",      text: "var(--warning-text)" },
    received:           { bg: "var(--success-bg)",      text: "var(--success-text)" },
    cancelled:          { bg: "var(--danger-bg)",       text: "var(--danger-text)" },
};

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
    draft: "Taslak", sent: "Gönderildi", confirmed: "Onaylandı",
    partially_received: "Kısmi Kabul", received: "Tamamlandı", cancelled: "İptal",
};

function formatCurrency(amount: number, currency: string): string {
    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
    return `${sym}${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchaseOrdersPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
    const [vendorMap, setVendorMap] = useState<Map<string, string>>(new Map());
    const [activeTab, setActiveTab] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const loadOrders = useCallback(async () => {
        setLoading(true);
        try {
            const url = activeTab === "all"
                ? "/api/purchase-orders"
                : `/api/purchase-orders?status=${encodeURIComponent(activeTab)}`;
            const [ordersRes, vendorsRes] = await Promise.all([
                fetch(url),
                fetch("/api/vendors?all=1"),
            ]);
            if (ordersRes.ok) {
                const data = await ordersRes.json();
                setOrders(Array.isArray(data) ? data : []);
            }
            if (vendorsRes.ok) {
                const vendors: VendorRow[] = await vendorsRes.json();
                const m = new Map<string, string>();
                for (const v of vendors) m.set(v.id, v.name);
                setVendorMap(m);
            }
        } catch {
            toast({ type: "error", message: "Siparişler yüklenemedi." });
        } finally {
            setLoading(false);
        }
    }, [activeTab, toast]);

    useEffect(() => { void loadOrders(); }, [loadOrders]);

    const filtered = useMemo(() => {
        if (!search.trim()) return orders;
        const q = search.toLowerCase();
        return orders.filter(o =>
            o.po_number.toLowerCase().includes(q) ||
            (vendorMap.get(o.vendor_id) ?? "").toLowerCase().includes(q),
        );
    }, [orders, search, vendorMap]);

    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <div>
                    <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Satın Alma Siparişleri
                    </h1>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: "4px 0 0" }}>
                        {filtered.length} sipariş
                    </p>
                </div>
                <Link
                    href="/dashboard/purchase/orders/new"
                    style={{
                        padding: "8px 16px", fontSize: "13px",
                        background: isDemo ? "var(--bg-tertiary)" : "var(--accent)",
                        color: isDemo ? "var(--text-tertiary)" : "#fff",
                        border: "none", borderRadius: "6px",
                        cursor: isDemo ? "not-allowed" : "pointer",
                        fontWeight: 500, textDecoration: "none", pointerEvents: isDemo ? "none" : "auto",
                    }}
                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    aria-disabled={isDemo}
                >
                    + Yeni Sipariş
                </Link>
            </div>

            {/* Status tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "16px", flexWrap: "wrap" }} role="tablist">
                {STATUS_TABS.map(tab => {
                    const active = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            role="tab"
                            aria-selected={active}
                            style={{
                                padding: "6px 14px", fontSize: "13px",
                                background: active ? "var(--accent-bg)" : "transparent",
                                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                                border: `0.5px solid ${active ? "var(--accent-border)" : "var(--border-tertiary)"}`,
                                borderRadius: "6px", cursor: "pointer",
                                fontWeight: active ? 500 : 400,
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div style={{ marginBottom: "16px" }}>
                <input
                    type="text"
                    placeholder="PO numarası veya tedarikçi ara..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Sipariş ara"
                    style={{
                        fontSize: "13px", padding: "6px 10px",
                        border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                        background: "var(--bg-tertiary)", color: "var(--text-primary)",
                        outline: "none", maxWidth: "320px", width: "100%",
                    }}
                />
            </div>

            {/* Table */}
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                {loading ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                        Yükleniyor...
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                        {search ? "Arama kriterine uyan sipariş bulunamadı." : "Henüz sipariş yok."}
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={thStyle}>PO No</th>
                                <th style={thStyle}>Tedarikçi</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Beklenen Tarih</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Toplam</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Oluşturulma</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(o => (
                                <tr key={o.id}
                                    style={{ transition: "background 0.08s", cursor: "pointer" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-secondary)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    onClick={() => { window.location.href = `/dashboard/purchase/orders/${o.id}`; }}
                                >
                                    <td style={tdStyle}>
                                        <Link
                                            href={`/dashboard/purchase/orders/${o.id}`}
                                            style={{ color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {o.po_number}
                                        </Link>
                                    </td>
                                    <td style={tdStyle}>{vendorMap.get(o.vendor_id) ?? "—"}</td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>
                                        <span style={{
                                            fontSize: "11px", padding: "2px 8px", borderRadius: "5px",
                                            background: STATUS_BG[o.status].bg, color: STATUS_BG[o.status].text,
                                            fontWeight: 500,
                                        }}>
                                            {STATUS_LABEL[o.status]}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-secondary)" }}>
                                        {o.expected_date ?? "—"}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                        {formatCurrency(o.grand_total, o.currency)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-tertiary)", fontSize: "12px" }}>
                                        {new Date(o.created_at).toLocaleDateString("tr-TR")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
