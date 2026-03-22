"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import { useToast } from "@/components/ui/Toast";
import { computeCoverageDays, daysColor } from "@/lib/stock-utils";
import type { AlertRow } from "@/lib/database.types";

type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "stock" | "order" | "ai";

interface Alert {
    id: string;
    severity: AlertSeverity;
    category: AlertCategory;
    source: "system" | "ai" | "ui";
    title: string;
    description: string;
    meta?: string;
    actionLabel?: string;
    actionHref?: string;
    actionRouteTo?: string;
    actionToastMsg?: string;
    dismissible: boolean;
    createdAt: string;
    aiConfidence?: number;
}

const severityColors: Record<AlertSeverity, { dot: string; bg: string; border: string; text: string; badge: string }> = {
    critical: {
        dot: "var(--danger)",
        bg: "var(--danger-bg)",
        border: "var(--danger-border)",
        text: "var(--danger-text)",
        badge: "KR\u0130T\u0130K",
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
        badge: "AI \u00d6NER\u0130",
    },
};

function mapAlertRow(row: AlertRow): Alert {
    const category: AlertCategory =
        row.source === "ai" ? "ai"
        : row.type.includes("stock") || row.type === "purchase_recommended" ? "stock"
        : row.type.includes("order") || row.type.includes("shortage") ? "order"
        : "stock";
    return {
        id: row.id,
        severity: row.severity,
        category,
        source: row.source,
        title: row.title,
        description: row.description ?? "",
        meta: row.entity_id ?? undefined,
        dismissible: row.status === "open",
        createdAt: row.created_at,
        aiConfidence: row.ai_confidence ?? undefined,
    };
}

function formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor(diff / 60000);
    if (hours >= 24) return `${Math.floor(hours / 24)} g\u00fcn \u00f6nce`;
    if (hours >= 1) return `${hours} saat \u00f6nce`;
    if (minutes >= 1) return `${minutes} dk \u00f6nce`;
    return "az \u00f6nce";
}

export default function AlertsPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { products } = useData();
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [filter, setFilter] = useState<"all" | AlertCategory>("all");
    const [lastRefreshed, setLastRefreshed] = useState("az \u00f6nce");
    const [refreshing, setRefreshing] = useState(false);

    // Fetch alerts from API on mount
    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const res = await fetch("/api/alerts");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setAlerts(data.map(mapAlertRow));
                    }
                }
            } catch (err) {
                console.error("Failed to fetch alerts:", err);
            }
        };
        fetchAlerts();
    }, []);

    const dismiss = async (id: string) => {
        try {
            await fetch(`/api/alerts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "dismissed" }),
            });
        } catch { /* optimistic — ignore */ }
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        toast({ type: "info", message: "Uyar\u0131 kapat\u0131ld\u0131" });
    };

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            const res = await fetch("/api/alerts/scan", { method: "POST" });
            if (res.ok) {
                // Refetch alerts
                const alertsRes = await fetch("/api/alerts");
                if (alertsRes.ok) {
                    const data = await alertsRes.json();
                    if (Array.isArray(data)) {
                        setAlerts(data.map(mapAlertRow));
                    }
                }
            }
        } catch (err) {
            console.error("Refresh failed:", err);
        } finally {
            setRefreshing(false);
            setLastRefreshed(
                new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
            );
            toast({ type: "success", message: "Uyar\u0131lar g\u00fcncellendi" });
        }
    };

    const filtered = filter === "all" ? alerts : alerts.filter((a) => a.category === filter);

    const criticalCount = alerts.filter((a) => a.severity === "critical").length;
    const warningCount = alerts.filter((a) => a.severity === "warning").length;
    const infoCount = alerts.filter((a) => a.severity === "info").length;

    // Low stock products for the sidebar panel
    const lowStockProducts = products.filter(
        (p) => p.available_now < p.minStockLevel
    );

    return (
        <div style={{ padding: "0" }}>
            {/* Page Header */}
            <div
                style={{
                    padding: "20px 24px 16px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "8px",
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
                        \u00dcretim & Stok Uyar\u0131lar\u0131
                    </h1>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        Son g\u00fcncelleme: {lastRefreshed}
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    style={{
                        fontSize: "12px",
                        padding: "6px 14px",
                        border: "0.5px solid var(--border-secondary)",
                        borderRadius: "6px",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        cursor: refreshing ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        opacity: refreshing ? 0.6 : 1,
                    }}
                >
                    {refreshing ? "Y\u00fckleniyor..." : "\u21bb Yenile"}
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
                    { label: "Uyar\u0131", count: warningCount, severity: "warning" as AlertSeverity },
                    { label: "AI \u00d6neri", count: infoCount, severity: "info" as AlertSeverity },
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
                                { key: "all", label: "T\u00fcm\u00fc", count: alerts.length },
                                { key: "stock", label: "Stok", count: alerts.filter((a) => a.category === "stock").length },
                                { key: "order", label: "Sipari\u015F", count: alerts.filter((a) => a.category === "order").length },
                                { key: "ai", label: "AI \u00d6nerileri", count: alerts.filter((a) => a.category === "ai").length },
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
                                    background: filter === key ? "var(--accent-bg)" : "transparent",
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
                                Bu kategoride uyar\u0131 yok.
                            </div>
                        )}
                        {filtered.map((alert) => {
                            const colors = severityColors[alert.severity];
                            return (
                                <div
                                    key={alert.id}
                                    style={{
                                        background: "var(--bg-secondary)",
                                        border: "0.5px solid var(--border-tertiary)",
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
                                                    {alert.source === "ai" && alert.aiConfidence
                                                        ? `AI \u00d6NER\u0130 (%${Math.round(alert.aiConfidence * 100)})`
                                                        : colors.badge}
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
                                                            fontWeight: 600,
                                                            padding: "5px 14px",
                                                            borderRadius: "6px",
                                                            background: colors.bg,
                                                            border: `0.5px solid ${colors.border}`,
                                                            color: colors.text,
                                                            textDecoration: "none",
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        {alert.actionLabel} {"\u2192"}
                                                    </Link>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            if (alert.actionToastMsg) toast({ type: "success", message: alert.actionToastMsg });
                                                            if (alert.actionRouteTo) router.push(alert.actionRouteTo);
                                                        }}
                                                        style={{
                                                            fontSize: "12px",
                                                            fontWeight: 600,
                                                            padding: "5px 14px",
                                                            borderRadius: "6px",
                                                            background: colors.bg,
                                                            border: `0.5px solid ${colors.border}`,
                                                            color: colors.text,
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        {alert.actionLabel} {"\u2192"}
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
                        {products.map((product) => {
                            const pct = product.on_hand > 0 ? Math.round((product.available_now / product.on_hand) * 100) : 0;
                            const isCritical = product.available_now < product.minStockLevel;
                            const isWarning = !isCritical && product.available_now < product.minStockLevel * 1.5;
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
                                            {product.available_now.toLocaleString()}
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
                                    {(() => {
                                        const covDays = computeCoverageDays(product.available_now, product.dailyUsage);
                                        return (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
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
                                                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                    {product.dailyUsage ? (
                                                        <span style={{ fontSize: "10px", fontWeight: 500, color: daysColor(covDays) }}>
                                                            ~{covDays} gün
                                                        </span>
                                                    ) : null}
                                                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                                        min {product.minStockLevel.toLocaleString()}
                                                    </span>
                                                </span>
                                            </div>
                                        );
                                    })()}
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
                                {lowStockProducts.length} \u00fcr\u00fcn kritik seviyenin alt\u0131nda
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
                                    \u00b7 {p.sku}: {p.available_now}/{p.minStockLevel} adet
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
