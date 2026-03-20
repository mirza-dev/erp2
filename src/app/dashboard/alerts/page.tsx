"use client";

import { useState } from "react";
import Link from "next/link";
import { mockProducts } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import DemoBanner from "@/components/ui/DemoBanner";

type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "stock" | "order" | "ai";

interface Alert {
    id: string;
    severity: AlertSeverity;
    category: AlertCategory;
    title: string;
    description: string;
    meta?: string;
    actionLabel?: string;
    actionHref?: string;
    dismissible: boolean;
    createdAt: string;
}

const initialAlerts: Alert[] = [
    // Critical stock alerts — derived from mockProducts (availableStock < minStockLevel)
    {
        id: "a1",
        severity: "critical",
        category: "stock",
        title: "Kritik Stok: Wafer Tip Kelebek Vana DN150",
        description: "Mevcut stok (20 adet) minimum stok seviyesinin (50 adet) altına düştü. %60 açık.",
        meta: "KB-WT-DN150 · Kelebek Vanalar",
        actionLabel: "Satın Alma Emri",
        dismissible: false,
        createdAt: "2026-03-17T08:14:00",
    },
    {
        id: "a2",
        severity: "critical",
        category: "stock",
        title: "Kritik Stok: Çift Klapeli Çek Valf DN200",
        description: "Mevcut stok (5 adet) minimum stok seviyesinin (15 adet) altına düştü. %67 açık. Aktif siparişlerin %92'si tahsis edilmiş durumda.",
        meta: "CV-CK-DN200 · Çek Valfler",
        actionLabel: "Satın Alma Emri",
        dismissible: false,
        createdAt: "2026-03-17T07:52:00",
    },
    // Warning alerts
    {
        id: "a3",
        severity: "warning",
        category: "order",
        title: "Sipariş Onay Bekliyor: ORD-0003",
        description: "ADNOC Offshore siparişi (ORD-0003) 5 gündür PENDING durumunda. Onay süreci tamamlanmadı.",
        meta: "ADNOC Offshore · $18,750",
        actionLabel: "Siparişe Git",
        actionHref: "/dashboard/orders/3",
        dismissible: true,
        createdAt: "2026-03-12T09:00:00",
    },
    {
        id: "a4",
        severity: "warning",
        category: "order",
        title: "Sevkiyat Tarihi Belirtilmedi: ORD-0005",
        description: "Petronas siparişi (ORD-0005) APPROVED durumunda ancak 4 gündür sevkiyat tarihi girilmedi.",
        meta: "Petronas Lubricants · $45,200",
        actionLabel: "Siparişe Git",
        actionHref: "/dashboard/orders/5",
        dismissible: true,
        createdAt: "2026-03-13T11:30:00",
    },
    {
        id: "a5",
        severity: "warning",
        category: "stock",
        title: "Yüksek Tahsisat: 2 Parçalı Küresel Vana DN50",
        description: "Toplam stoğun %37.5'i aktif siparişlere tahsis edilmiş. Yeni gelen siparişler stok yetersizliğine yol açabilir.",
        meta: "KV-2P-DN50 · Küresel Vanalar · 300/800 tahsis",
        actionLabel: "Ürüne Git",
        actionHref: "/dashboard/products",
        dismissible: true,
        createdAt: "2026-03-16T14:20:00",
    },
    // AI recommendations
    {
        id: "a6",
        severity: "info",
        category: "ai",
        title: "AI Öneri: KV-2P-DN50 için yeniden sipariş",
        description: "Son 90 günlük satış trendine göre 2 Parçalı Küresel Vana DN50, 6 hafta içinde minimum stok seviyesine ulaşacak. 200 adet sipariş öneriliyor.",
        meta: "Önerilen miktar: 200 adet · Tahmini maliyet: $136,000",
        actionLabel: "Sipariş Oluştur",
        dismissible: true,
        createdAt: "2026-03-17T06:00:00",
    },
    {
        id: "a7",
        severity: "info",
        category: "ai",
        title: "AI Öneri: Mevsimsel talep artışı bekleniyor",
        description: "Q2 başında (Nisan–Mayıs) Küresel Vana kategorisinde geçen yıla oranla %35 sipariş artışı öngörülüyor. Erken stok hazırlığı yapılması önerilir.",
        meta: "Etkilenen kategori: Küresel Vanalar · 3 ürün",
        dismissible: true,
        createdAt: "2026-03-17T06:00:00",
    },
];

const severityColors: Record<AlertSeverity, { dot: string; bg: string; border: string; text: string; badge: string }> = {
    critical: {
        dot: "var(--danger)",
        bg: "var(--danger-bg)",
        border: "var(--danger-border)",
        text: "var(--danger-text)",
        badge: "KRİTİK",
    },
    warning: {
        dot: "var(--warning)",
        bg: "var(--warning-bg)",
        border: "var(--warning-border)",
        text: "var(--warning-text)",
        badge: "UYARI",
    },
    info: {
        dot: "var(--accent)",
        bg: "var(--accent-bg)",
        border: "var(--accent-border)",
        text: "var(--accent-text)",
        badge: "AI ÖNERİ",
    },
};

function formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor(diff / 60000);
    if (hours >= 24) return `${Math.floor(hours / 24)} gün önce`;
    if (hours >= 1) return `${hours} saat önce`;
    if (minutes >= 1) return `${minutes} dk önce`;
    return "az önce";
}

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
    const [filter, setFilter] = useState<"all" | AlertCategory>("all");
    const [lastRefreshed, setLastRefreshed] = useState("az önce");

    const dismiss = (id: string) => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
    };

    const handleRefresh = () => {
        setLastRefreshed("az önce");
    };

    const filtered = filter === "all" ? alerts : alerts.filter((a) => a.category === filter);

    const criticalCount = alerts.filter((a) => a.severity === "critical").length;
    const warningCount = alerts.filter((a) => a.severity === "warning").length;
    const infoCount = alerts.filter((a) => a.severity === "info").length;

    // Low stock products for the sidebar panel
    const lowStockProducts = mockProducts.filter(
        (p) => p.availableStock < p.minStockLevel
    );

    return (
        <div style={{ padding: "0" }}>
            <DemoBanner storageKey="alerts-demo">
                Uyarılar demo verileriyle çalışmaktadır. Gerçek zamanlı stok takibi yakında aktif olacak.
            </DemoBanner>
            {/* Page Header */}
            <div
                style={{
                    padding: "20px 24px 16px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <div>
                    <h1
                        style={{
                            fontSize: "16px",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            margin: 0,
                        }}
                    >
                        Üretim & Stok Uyarıları
                    </h1>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        Son güncelleme: {lastRefreshed}
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    style={{
                        fontSize: "12px",
                        padding: "6px 14px",
                        border: "0.5px solid var(--border-secondary)",
                        borderRadius: "6px",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                    }}
                >
                    ↻ Yenile
                </button>
            </div>

            {/* Summary Badges */}
            <div
                style={{
                    display: "flex",
                    gap: "8px",
                    padding: "14px 24px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                }}
            >
                {[
                    { label: "Kritik", count: criticalCount, severity: "critical" as AlertSeverity },
                    { label: "Uyarı", count: warningCount, severity: "warning" as AlertSeverity },
                    { label: "AI Öneri", count: infoCount, severity: "info" as AlertSeverity },
                ].map(({ label, count, severity }) => (
                    <div
                        key={severity}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 14px",
                            background: severityColors[severity].bg,
                            border: `0.5px solid ${severityColors[severity].border}`,
                            borderRadius: "6px",
                            cursor: "pointer",
                            opacity: filter !== "all" && filter !== "stock" && filter !== "order" && filter !== "ai" ? 0.6 : 1,
                        }}
                        onClick={() => setFilter("all")}
                    >
                        <div
                            style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                background: severityColors[severity].dot,
                                flexShrink: 0,
                            }}
                        />
                        <span style={{ fontSize: "13px", fontWeight: 600, color: severityColors[severity].text }}>
                            {count}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{label}</span>
                    </div>
                ))}
            </div>

            {/* Main layout: alerts list + stock sidebar */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 280px",
                    gap: "0",
                    minHeight: "calc(100vh - 200px)",
                }}
            >
                {/* Left: Alert List */}
                <div style={{ borderRight: "0.5px solid var(--border-tertiary)" }}>
                    {/* Category Filter Tabs */}
                    <div
                        style={{
                            display: "flex",
                            gap: "0",
                            borderBottom: "0.5px solid var(--border-tertiary)",
                            padding: "0 24px",
                        }}
                    >
                        {(
                            [
                                { key: "all", label: "Tümü", count: alerts.length },
                                { key: "stock", label: "Stok", count: alerts.filter((a) => a.category === "stock").length },
                                { key: "order", label: "Sipariş", count: alerts.filter((a) => a.category === "order").length },
                                { key: "ai", label: "AI Önerileri", count: alerts.filter((a) => a.category === "ai").length },
                            ] as { key: "all" | AlertCategory; label: string; count: number }[]
                        ).map(({ key, label, count }) => (
                            <button
                                key={key}
                                onClick={() => setFilter(key)}
                                style={{
                                    fontSize: "12px",
                                    padding: "10px 14px",
                                    border: "none",
                                    borderBottom: filter === key ? "2px solid var(--accent)" : "2px solid transparent",
                                    background: "transparent",
                                    color: filter === key ? "var(--accent-text)" : "var(--text-secondary)",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    fontWeight: filter === key ? 500 : 400,
                                    transition: "color 0.15s",
                                }}
                            >
                                {label}
                                {count > 0 && (
                                    <span
                                        style={{
                                            fontSize: "10px",
                                            padding: "1px 5px",
                                            borderRadius: "10px",
                                            background: filter === key ? "var(--accent-bg)" : "var(--bg-tertiary)",
                                            color: filter === key ? "var(--accent-text)" : "var(--text-tertiary)",
                                            fontWeight: 500,
                                        }}
                                    >
                                        {count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Alert Items */}
                    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {filtered.length === 0 && (
                            <div
                                style={{
                                    padding: "40px",
                                    textAlign: "center",
                                    color: "var(--text-tertiary)",
                                    fontSize: "13px",
                                }}
                            >
                                Bu kategoride uyarı yok.
                            </div>
                        )}
                        {filtered.map((alert) => {
                            const colors = severityColors[alert.severity];
                            return (
                                <div
                                    key={alert.id}
                                    style={{
                                        background: "var(--bg-secondary)",
                                        border: `0.5px solid var(--border-tertiary)`,
                                        borderLeft: `3px solid ${colors.dot}`,
                                        borderRadius: "6px",
                                        padding: "14px 16px",
                                        display: "flex",
                                        gap: "14px",
                                        alignItems: "flex-start",
                                    }}
                                >
                                    {/* Severity dot */}
                                    <div
                                        style={{
                                            marginTop: "3px",
                                            width: "8px",
                                            height: "8px",
                                            borderRadius: "50%",
                                            background: colors.dot,
                                            flexShrink: 0,
                                        }}
                                    />

                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "flex-start",
                                                justifyContent: "space-between",
                                                gap: "12px",
                                                marginBottom: "4px",
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                                <span
                                                    style={{
                                                        fontSize: "9px",
                                                        fontWeight: 600,
                                                        letterSpacing: "0.08em",
                                                        padding: "2px 6px",
                                                        borderRadius: "4px",
                                                        background: colors.bg,
                                                        color: colors.text,
                                                        border: `0.5px solid ${colors.border}`,
                                                    }}
                                                >
                                                    {colors.badge}
                                                </span>
                                                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                                                    {alert.title}
                                                </span>
                                            </div>
                                            <span
                                                style={{
                                                    fontSize: "11px",
                                                    color: "var(--text-tertiary)",
                                                    whiteSpace: "nowrap",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {formatRelativeTime(alert.createdAt)}
                                            </span>
                                        </div>

                                        <p
                                            style={{
                                                margin: "0 0 8px",
                                                fontSize: "12px",
                                                color: "var(--text-secondary)",
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            {alert.description}
                                        </p>

                                        {alert.meta && (
                                            <div
                                                style={{
                                                    fontSize: "11px",
                                                    color: "var(--text-tertiary)",
                                                    fontFamily: "monospace",
                                                    marginBottom: "10px",
                                                }}
                                            >
                                                {alert.meta}
                                            </div>
                                        )}

                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                            {alert.actionLabel && (
                                                alert.actionHref ? (
                                                    <Link
                                                        href={alert.actionHref}
                                                        style={{
                                                            fontSize: "12px",
                                                            padding: "5px 12px",
                                                            borderRadius: "6px",
                                                            background: colors.bg,
                                                            border: `0.5px solid ${colors.border}`,
                                                            color: colors.text,
                                                            textDecoration: "none",
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        {alert.actionLabel} →
                                                    </Link>
                                                ) : (
                                                    <button
                                                        style={{
                                                            fontSize: "12px",
                                                            padding: "5px 12px",
                                                            borderRadius: "6px",
                                                            background: colors.bg,
                                                            border: `0.5px solid ${colors.border}`,
                                                            color: colors.text,
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        {alert.actionLabel} →
                                                    </button>
                                                )
                                            )}
                                            {alert.dismissible && (
                                                <button
                                                    onClick={() => dismiss(alert.id)}
                                                    style={{
                                                        fontSize: "11px",
                                                        padding: "5px 10px",
                                                        borderRadius: "6px",
                                                        background: "transparent",
                                                        border: "0.5px solid var(--border-secondary)",
                                                        color: "var(--text-tertiary)",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    Kapat
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Stock Level Sidebar */}
                <div style={{ padding: "16px" }}>
                    <div
                        style={{
                            fontSize: "11px",
                            color: "var(--text-tertiary)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            marginBottom: "12px",
                            padding: "0 2px",
                        }}
                    >
                        Stok Durumu
                    </div>

                    {/* All products stock bars */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {mockProducts.map((product) => {
                            const pct = Math.round((product.availableStock / product.totalStock) * 100);
                            const isCritical = product.availableStock < product.minStockLevel;
                            const isWarning = !isCritical && product.availableStock < product.minStockLevel * 1.5;
                            const barColor = isCritical
                                ? "var(--danger)"
                                : isWarning
                                ? "var(--warning)"
                                : "var(--success)";

                            return (
                                <div key={product.id}>
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: "4px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: "12px",
                                                color: isCritical ? "var(--danger-text)" : "var(--text-primary)",
                                                fontWeight: isCritical ? 500 : 400,
                                                flex: 1,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                marginRight: "8px",
                                            }}
                                            title={product.name}
                                        >
                                            {product.name}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: "11px",
                                                color: isCritical
                                                    ? "var(--danger-text)"
                                                    : isWarning
                                                    ? "var(--warning-text)"
                                                    : "var(--text-tertiary)",
                                                fontWeight: isCritical || isWarning ? 500 : 400,
                                                flexShrink: 0,
                                            }}
                                        >
                                            {product.availableStock.toLocaleString()}
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            height: "4px",
                                            borderRadius: "2px",
                                            background: "var(--bg-tertiary)",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <div
                                            style={{
                                                height: "100%",
                                                width: `${Math.min(pct, 100)}%`,
                                                background: barColor,
                                                borderRadius: "2px",
                                                transition: "width 0.3s ease",
                                            }}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            marginTop: "2px",
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: "10px",
                                                color: "var(--text-tertiary)",
                                                fontFamily: "monospace",
                                            }}
                                        >
                                            {product.sku}
                                        </span>
                                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                            min {product.minStockLevel.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Critical products highlight */}
                    {lowStockProducts.length > 0 && (
                        <div
                            style={{
                                marginTop: "20px",
                                padding: "10px 12px",
                                background: "var(--danger-bg)",
                                border: "0.5px solid var(--danger-border)",
                                borderRadius: "6px",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "11px",
                                    color: "var(--danger-text)",
                                    fontWeight: 600,
                                    marginBottom: "6px",
                                }}
                            >
                                {lowStockProducts.length} ürün kritik seviyenin altında
                            </div>
                            {lowStockProducts.map((p) => (
                                <div
                                    key={p.id}
                                    style={{
                                        fontSize: "11px",
                                        color: "var(--text-secondary)",
                                        marginBottom: "2px",
                                    }}
                                >
                                    · {p.sku}: {p.availableStock}/{p.minStockLevel} adet
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
