"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-context";
import { useToast } from "@/components/ui/Toast";
import { computeCoverageDays, daysColor } from "@/lib/stock-utils";
import { EmptyState, LoadingState } from "@/components/ui/StateViews";
import type { AlertRow } from "@/lib/database.types";

// ── Types ──────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "info";
type SeverityFilter = "all" | "critical" | "warning";

interface ProductAlertGroup {
    entityId: string;
    productName: string;
    sku: string;
    available: number;
    minStock: number;
    reserved: number;
    unit: string;
    coverageDays: number | null;
    topSeverity: "critical" | "warning";
    alerts: AlertRow[];
    reason: string;
    impact: string;
    actionLabel: string;
    actionHref: string;
}

// ── Helpers ────────────────────────────────────────────────────

function shortReason(alerts: AlertRow[]): string {
    const types = alerts.map((a) => a.type);
    if (types.includes("order_shortage"))  return "Rezerve stok, mevcudu aşıyor";
    if (types.includes("stock_critical"))  return "Stok kritik seviyenin altında";
    if (types.includes("stock_risk"))      return "Stok uyarı eşiğine yaklaşıyor";
    return "Stok riski tespit edildi";
}

function shortImpact(
    alerts: AlertRow[],
    available: number,
    reserved: number,
    unit: string,
    covDays: number | null
): string {
    const hasShortage = alerts.some((a) => a.type === "order_shortage");
    if (hasShortage) {
        const shortfall = reserved - available;
        return `${shortfall} ${unit} eksik`;
    }
    if (available === 0) return "Stok tükendi";
    if (covDays !== null && covDays <= 14) return `~${covDays} günlük stok`;
    return `${available} ${unit} mevcut`;
}

function actionFor(alerts: AlertRow[]): { label: string; href: string } {
    const types = alerts.map((a) => a.type);
    if (types.includes("order_shortage")) return { label: "Siparişleri incele", href: "/dashboard/orders" };
    if (types.includes("stock_critical")) return { label: "Satın alma planla",  href: "/dashboard/purchase/suggested" };
    return { label: "Stoku izle", href: "/dashboard/products" };
}

function formatRelTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor(diff / 60_000);
    if (h >= 24) return `${Math.floor(h / 24)}g önce`;
    if (h >= 1)  return `${h}s önce`;
    if (m >= 1)  return `${m}dk önce`;
    return "az önce";
}

const SEV: Record<"critical" | "warning" | "info", {
    dot: string; text: string; bg: string; border: string; label: string;
}> = {
    critical: { dot: "var(--danger)",  text: "var(--danger-text)",  bg: "var(--danger-bg)",  border: "var(--danger-border)",  label: "KRİTİK" },
    warning:  { dot: "var(--warning)", text: "var(--warning-text)", bg: "var(--warning-bg)", border: "var(--warning-border)", label: "UYARI"  },
    info:     { dot: "var(--accent)",  text: "var(--accent-text)",  bg: "var(--accent-bg)",  border: "var(--accent-border)",  label: "AI"     },
};

const ALERT_TYPE_LABEL: Record<string, string> = {
    stock_critical:       "Kritik Stok",
    stock_risk:           "Stok Uyarısı",
    order_shortage:       "Sipariş Eksik",
    purchase_recommended: "Satın Alma Önerisi",
};

// ── Page ──────────────────────────────────────────────────────

export default function AlertsPage() {
    const { toast } = useToast();
    const { products } = useData();

    const [rawAlerts, setRawAlerts]         = useState<AlertRow[]>([]);
    const [loading, setLoading]             = useState(true);
    const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
    const [refreshing, setRefreshing]       = useState(false);
    const [aiGenerating, setAiGenerating]   = useState(false);
    const [drawerGroup, setDrawerGroup]     = useState<ProductAlertGroup | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState("az önce");

    // ── Fetch ──
    const refetch = useCallback(async () => {
        const res = await fetch("/api/alerts");
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) setRawAlerts(data as AlertRow[]);
        }
    }, []);

    useEffect(() => {
        refetch().catch(console.error).finally(() => setLoading(false));
    }, [refetch]);

    // ── Group by product ──
    const productMap = new Map(products.map((p) => [p.id, p]));

    const productGroups: ProductAlertGroup[] = (() => {
        const sysAlerts = rawAlerts.filter((a) => a.source !== "ai" && a.entity_id);
        const byProduct = new Map<string, AlertRow[]>();
        for (const alert of sysAlerts) {
            const id = alert.entity_id!;
            if (!byProduct.has(id)) byProduct.set(id, []);
            byProduct.get(id)!.push(alert);
        }

        const groups: ProductAlertGroup[] = [];
        for (const [entityId, alerts] of byProduct) {
            const product   = productMap.get(entityId);
            const topSev    = alerts.some((a) => a.severity === "critical") ? "critical" : "warning";
            const available = product?.available_now ?? 0;
            const minStock  = product?.minStockLevel  ?? 0;
            const reserved  = product?.reserved       ?? 0;
            const unit      = product?.unit           ?? "adet";
            const dailyUsage= product?.dailyUsage     ?? null;
            const covDays   = computeCoverageDays(available, dailyUsage);
            const action    = actionFor(alerts);

            groups.push({
                entityId,
                productName: product?.name ?? "Bilinmeyen Ürün",
                sku:         product?.sku  ?? "—",
                available,
                minStock,
                reserved,
                unit,
                coverageDays: covDays,
                topSeverity:  topSev as "critical" | "warning",
                alerts,
                reason:       shortReason(alerts),
                impact:       shortImpact(alerts, available, reserved, unit, covDays),
                actionLabel:  action.label,
                actionHref:   action.href,
            });
        }

        return groups.sort((a, b) => {
            if (a.topSeverity !== b.topSeverity) return a.topSeverity === "critical" ? -1 : 1;
            return (a.coverageDays ?? 999) - (b.coverageDays ?? 999);
        });
    })();

    const aiAlerts    = rawAlerts.filter((a) => a.source === "ai");
    const criticalCount = productGroups.filter((g) => g.topSeverity === "critical").length;
    const warningCount  = productGroups.filter((g) => g.topSeverity === "warning").length;
    const filtered      = severityFilter === "all"
        ? productGroups
        : productGroups.filter((g) => g.topSeverity === severityFilter);

    // ── Actions ──
    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await fetch("/api/alerts/scan", { method: "POST" });
            await refetch();
            setLastRefreshed(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
            toast({ type: "success", message: "Uyarılar güncellendi" });
        } catch {
            toast({ type: "error", message: "Yenileme başarısız" });
        } finally {
            setRefreshing(false);
        }
    };

    const handleAiSuggest = async () => {
        if (aiGenerating) return;
        setAiGenerating(true);
        try {
            const res  = await fetch("/api/alerts/ai-suggest", { method: "POST" });
            const data = await res.json();
            if (!data.ai_available) {
                toast({ type: "warning", message: "AI servisi yapılandırılmamış (ANTHROPIC_API_KEY gerekli)" });
                return;
            }
            await refetch();
            toast({ type: "success", message: `${data.created} AI önerisi oluşturuldu` });
        } catch {
            toast({ type: "error", message: "AI önerisi oluşturulamadı" });
        } finally {
            setAiGenerating(false);
        }
    };

    const dismissAlert = async (alertId: string) => {
        try {
            await fetch(`/api/alerts/${alertId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "dismissed" }),
            });
            setRawAlerts((prev) => prev.filter((a) => a.id !== alertId));
            if (drawerGroup) {
                const remaining = drawerGroup.alerts.filter((a) => a.id !== alertId);
                if (remaining.length === 0) setDrawerGroup(null);
                else setDrawerGroup({ ...drawerGroup, alerts: remaining });
            }
            toast({ type: "info", message: "Uyarı kapatıldı" });
        } catch {
            toast({ type: "error", message: "İşlem başarısız" });
        }
    };

    const acknowledgeAlert = async (alertId: string) => {
        try {
            await fetch(`/api/alerts/${alertId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "acknowledged" }),
            });
            const patch = (a: AlertRow) =>
                a.id === alertId ? { ...a, status: "acknowledged" as const } : a;
            setRawAlerts((prev) => prev.map(patch));
            if (drawerGroup) setDrawerGroup({ ...drawerGroup, alerts: drawerGroup.alerts.map(patch) });
            toast({ type: "success", message: "Uyarı kabul edildi" });
        } catch {
            toast({ type: "error", message: "İşlem başarısız" });
        }
    };

    // ── Render ────────────────────────────────────────────────

    return (
        <div style={{ padding: 0 }}>

            {/* ── Header ── */}
            <div style={{
                padding: "18px 24px 14px",
                borderBottom: "0.5px solid var(--border-tertiary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
            }}>
                <div>
                    <h1 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Üretim Uyarıları
                    </h1>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        Son tarama: {lastRefreshed}
                    </div>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                    <button
                        onClick={handleAiSuggest}
                        disabled={aiGenerating}
                        style={{
                            fontSize: "12px", padding: "6px 12px",
                            border: "0.5px solid var(--accent-border)",
                            borderRadius: "5px", background: "var(--accent-bg)",
                            color: "var(--accent-text)", cursor: aiGenerating ? "not-allowed" : "pointer",
                            opacity: aiGenerating ? 0.6 : 1, fontWeight: 500,
                        }}
                    >
                        {aiGenerating ? "Analiz..." : "✦ AI Analiz"}
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        style={{
                            fontSize: "12px", padding: "6px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "5px", background: "transparent",
                            color: "var(--text-secondary)", cursor: refreshing ? "not-allowed" : "pointer",
                            opacity: refreshing ? 0.6 : 1,
                        }}
                    >
                        {refreshing ? "Yükleniyor..." : "↻ Tara"}
                    </button>
                </div>
            </div>

            {/* ── Severity Filter Tabs ── */}
            <div style={{
                display: "flex",
                alignItems: "center",
                padding: "0 24px",
                borderBottom: "0.5px solid var(--border-tertiary)",
            }}>
                {(
                    [
                        { key: "all"      as SeverityFilter, label: "Tümü",   count: productGroups.length, dot: null },
                        { key: "critical" as SeverityFilter, label: "Kritik", count: criticalCount, dot: "var(--danger)" },
                        { key: "warning"  as SeverityFilter, label: "Uyarı",  count: warningCount,  dot: "var(--warning)" },
                    ]
                ).map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setSeverityFilter(tab.key)}
                        style={{
                            fontSize: "12px",
                            padding: "10px 14px",
                            border: "none",
                            borderBottom: severityFilter === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                            background: "transparent",
                            color: severityFilter === tab.key ? "var(--accent-text)" : "var(--text-secondary)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontWeight: severityFilter === tab.key ? 500 : 400,
                        }}
                    >
                        {tab.dot && (
                            <span style={{
                                width: "6px", height: "6px", borderRadius: "50%",
                                background: tab.dot, flexShrink: 0,
                            }} />
                        )}
                        {tab.label}
                        {tab.count > 0 && (
                            <span style={{
                                fontSize: "10px", padding: "1px 5px", borderRadius: "10px",
                                background: severityFilter === tab.key ? "var(--accent-bg)" : "var(--bg-tertiary)",
                                color: severityFilter === tab.key ? "var(--accent-text)" : "var(--text-tertiary)",
                                fontWeight: 500,
                            }}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Product Alert Table ── */}
            {loading ? (
                <LoadingState message="Uyarılar yükleniyor..." />
            ) : productGroups.length === 0 ? (
                <EmptyState
                    title="Tüm ürünler sağlıklı"
                    description="Stok veya sipariş kaynaklı uyarı bulunmuyor."
                    action={{ label: "↻ Şimdi Tara", onClick: handleRefresh }}
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    title="Bu filtrede uyarı yok"
                    description="Farklı bir filtre seçin veya tümünü görün."
                />
            ) : (
                <div>
                    {/* Column headers */}
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "3px 1fr 170px 120px 148px 88px",
                        alignItems: "center",
                        borderBottom: "0.5px solid var(--border-tertiary)",
                    }}>
                        <div />
                        {[
                            { label: "ÜRÜN",            pad: "8px 16px" },
                            { label: "NEDEN",           pad: "8px 12px" },
                            { label: "ETKİ",            pad: "8px 12px" },
                            { label: "ÖNERİLEN ADIM",   pad: "8px 12px" },
                            { label: "DETAY",           pad: "8px 12px" },
                        ].map(({ label, pad }) => (
                            <div key={label} style={{
                                padding: pad,
                                fontSize: "10px",
                                color: "var(--text-tertiary)",
                                fontWeight: 600,
                                letterSpacing: "0.06em",
                            }}>
                                {label}
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    {filtered.map((group) => (
                        <ProductRow
                            key={group.entityId}
                            group={group}
                            onOpenDrawer={() => setDrawerGroup(group)}
                        />
                    ))}
                </div>
            )}

            {/* ── AI Alerts Section ── */}
            <div style={{ borderTop: "0.5px solid var(--border-tertiary)" }}>
                <div style={{
                    padding: "12px 24px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                }}>
                    <span style={{
                        fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)",
                        letterSpacing: "0.06em", textTransform: "uppercase",
                    }}>
                        ✦ AI Önerileri
                    </span>
                    {aiAlerts.length === 0 && (
                        <button
                            onClick={handleAiSuggest}
                            disabled={aiGenerating}
                            style={{
                                fontSize: "11px", padding: "4px 10px",
                                border: "0.5px solid var(--accent-border)",
                                borderRadius: "4px", background: "var(--accent-bg)",
                                color: "var(--accent-text)", cursor: aiGenerating ? "not-allowed" : "pointer",
                                opacity: aiGenerating ? 0.6 : 1, fontWeight: 500,
                            }}
                        >
                            {aiGenerating ? "Analiz..." : "Analizi Başlat"}
                        </button>
                    )}
                </div>

                {aiAlerts.length === 0 ? (
                    <div style={{ padding: "0 24px 16px" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                            Henüz çalıştırılmadı. AI; stok riski, sipariş anomalileri ve tedarik boşluklarını analiz eder.
                        </span>
                    </div>
                ) : (
                    <div style={{ padding: "0 24px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {aiAlerts.map((alert) => (
                            <div key={alert.id} style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "9px 12px",
                                background: "var(--bg-secondary)",
                                border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "5px",
                            }}>
                                <span style={{
                                    fontSize: "9px", fontWeight: 700, letterSpacing: "0.05em",
                                    padding: "1px 5px", borderRadius: "3px", flexShrink: 0,
                                    background: "var(--accent-bg)", color: "var(--accent-text)",
                                    border: "0.5px solid var(--accent-border)",
                                }}>
                                    {alert.ai_confidence
                                        ? `%${Math.round(alert.ai_confidence * 100)}`
                                        : "AI"}
                                </span>
                                <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: 1, lineHeight: 1.45 }}>
                                    {alert.title}
                                </span>
                                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", flexShrink: 0 }}>
                                    {formatRelTime(alert.created_at)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Detail Drawer ── */}
            {drawerGroup && (
                <AlertDetailDrawer
                    group={drawerGroup}
                    onClose={() => setDrawerGroup(null)}
                    onDismiss={dismissAlert}
                    onAcknowledge={acknowledgeAlert}
                />
            )}
        </div>
    );
}

// ── ProductRow ────────────────────────────────────────────────

interface ProductRowProps {
    group: ProductAlertGroup;
    onOpenDrawer: () => void;
}

function ProductRow({ group, onOpenDrawer }: ProductRowProps) {
    const sev      = SEV[group.topSeverity];
    const isAllAck = group.alerts.every((a) => a.status === "acknowledged" || a.status === "resolved");
    const covDays  = group.coverageDays;

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "3px 1fr 170px 120px 148px 88px",
                alignItems: "center",
                borderBottom: "0.5px solid var(--border-tertiary)",
                opacity: isAllAck ? 0.6 : 1,
                transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
            {/* Severity stripe */}
            <div style={{ alignSelf: "stretch", background: sev.dot, minHeight: "52px" }} />

            {/* Product */}
            <div style={{ padding: "12px 16px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px" }}>
                    <span style={{
                        fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
                        padding: "1px 5px", borderRadius: "3px",
                        background: sev.bg, color: sev.text, border: `0.5px solid ${sev.border}`,
                        flexShrink: 0,
                    }}>
                        {sev.label}
                    </span>
                    <span style={{
                        fontSize: "13px", fontWeight: 500, color: "var(--text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {group.productName}
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                        {group.sku}
                    </span>
                    {covDays !== null && (
                        <span style={{ fontSize: "10px", fontWeight: 600, color: daysColor(covDays) }}>
                            ~{covDays}g
                        </span>
                    )}
                </div>
            </div>

            {/* Reason */}
            <div style={{ padding: "12px 12px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                    {group.reason}
                </span>
            </div>

            {/* Impact */}
            <div style={{ padding: "12px 12px" }}>
                <span style={{
                    fontSize: "12px", fontWeight: 600,
                    color: group.topSeverity === "critical" ? "var(--danger-text)" : "var(--warning-text)",
                }}>
                    {group.impact}
                </span>
            </div>

            {/* Recommended action */}
            <div style={{ padding: "12px 12px" }}>
                <Link
                    href={group.actionHref}
                    style={{
                        fontSize: "12px", fontWeight: 500,
                        padding: "4px 10px", borderRadius: "4px",
                        background: sev.bg, color: sev.text,
                        border: `0.5px solid ${sev.border}`,
                        textDecoration: "none", display: "inline-block",
                        whiteSpace: "nowrap",
                    }}
                >
                    {group.actionLabel} →
                </Link>
            </div>

            {/* Detail */}
            <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <button
                    onClick={onOpenDrawer}
                    aria-label={`${group.productName} detayını aç`}
                    style={{
                        fontSize: "11px", padding: "4px 10px",
                        border: "0.5px solid var(--border-secondary)",
                        borderRadius: "4px", background: "transparent",
                        color: "var(--text-secondary)", cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    Detay
                </button>
                {isAllAck && (
                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                        Kabul edildi
                    </span>
                )}
            </div>
        </div>
    );
}

// ── AlertDetailDrawer ─────────────────────────────────────────

interface DrawerProps {
    group: ProductAlertGroup;
    onClose: () => void;
    onDismiss: (alertId: string) => void;
    onAcknowledge: (alertId: string) => void;
}

function AlertDetailDrawer({ group, onClose, onDismiss, onAcknowledge }: DrawerProps) {
    const panelRef   = useRef<HTMLDivElement>(null);
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const sev        = SEV[group.topSeverity];

    // ESC + Tab focus trap
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") { onClose(); return; }
            if (e.key === "Tab") {
                const panel = panelRef.current;
                if (!panel) return;
                const focusable = panel.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (!focusable.length) return;
                const first = focusable[0];
                const last  = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
                }
            }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Restore focus on close
    useEffect(() => {
        const prev = document.activeElement;
        closeBtnRef.current?.focus();
        return () => { if (prev instanceof HTMLElement) prev.focus(); };
    }, []);

    const covDays = group.coverageDays;

    return (
        <>
            {/* Backdrop */}
            <div
                aria-hidden="true"
                onClick={onClose}
                style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)" }}
            />

            {/* Panel */}
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="alert-drawer-title"
                style={{
                    position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
                    width: "min(420px, 100vw)",
                    background: "var(--bg-primary)",
                    borderLeft: "0.5px solid var(--border-secondary)",
                    boxShadow: "-8px 0 32px rgba(0,0,0,0.25)",
                    display: "flex", flexDirection: "column",
                    animation: "slide-in-right 0.2s ease-out",
                }}
            >
                {/* Header */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    flexShrink: 0,
                    gap: "10px",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <span style={{
                            fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
                            padding: "2px 6px", borderRadius: "3px",
                            background: sev.bg, color: sev.text, border: `0.5px solid ${sev.border}`,
                            flexShrink: 0,
                        }}>
                            {sev.label}
                        </span>
                        <span
                            id="alert-drawer-title"
                            style={{
                                fontSize: "14px", fontWeight: 600, color: "var(--text-primary)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                        >
                            {group.productName}
                        </span>
                        <span style={{
                            fontSize: "11px", color: "var(--text-tertiary)",
                            fontFamily: "monospace", flexShrink: 0,
                        }}>
                            {group.sku}
                        </span>
                    </div>
                    <button
                        ref={closeBtnRef}
                        onClick={onClose}
                        aria-label="Kapat"
                        style={{
                            background: "transparent", border: "none", cursor: "pointer",
                            color: "var(--text-tertiary)", fontSize: "20px", lineHeight: 1,
                            padding: "4px 8px", borderRadius: "4px", flexShrink: 0,
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

                    {/* Stock metrics */}
                    <div style={{
                        padding: "12px 14px",
                        background: "var(--bg-secondary)",
                        border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px",
                        marginBottom: "20px",
                    }}>
                        <div style={{
                            fontSize: "10px", color: "var(--text-tertiary)", fontWeight: 600,
                            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px",
                        }}>
                            Stok Durumu
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                            {[
                                { label: "Mevcut",  value: `${group.available} ${group.unit}`, color: sev.text },
                                { label: "Minimum", value: `${group.minStock} ${group.unit}`,  color: "var(--text-primary)" },
                                { label: "Rezerve", value: `${group.reserved} ${group.unit}`,  color: "var(--text-primary)" },
                            ].map(({ label, value, color }) => (
                                <div key={label}>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "3px" }}>{label}</div>
                                    <div style={{ fontSize: "13px", fontWeight: 600, color }}>{value}</div>
                                </div>
                            ))}
                        </div>
                        {covDays !== null && (
                            <div style={{
                                marginTop: "10px", paddingTop: "10px",
                                borderTop: "0.5px solid var(--border-tertiary)",
                                display: "flex", alignItems: "center", gap: "6px",
                            }}>
                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Tahmini ömür:</span>
                                <span style={{ fontSize: "12px", fontWeight: 600, color: daysColor(covDays) }}>
                                    ~{covDays} gün
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Alert list */}
                    <div style={{ marginBottom: "20px" }}>
                        <div style={{
                            fontSize: "10px", color: "var(--text-tertiary)", fontWeight: 600,
                            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px",
                        }}>
                            Aktif Uyarılar
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {group.alerts.map((alert) => {
                                const alertSev = SEV[alert.severity as Severity] ?? SEV.info;
                                const isAck    = alert.status === "acknowledged" || alert.status === "resolved";
                                return (
                                    <div
                                        key={alert.id}
                                        style={{
                                            padding: "10px 12px",
                                            background: "var(--bg-secondary)",
                                            border: "0.5px solid var(--border-tertiary)",
                                            borderLeft: `3px solid ${alertSev.dot}`,
                                            borderRadius: "5px",
                                            opacity: isAck ? 0.6 : 1,
                                        }}
                                    >
                                        <div style={{
                                            display: "flex", alignItems: "center",
                                            justifyContent: "space-between", marginBottom: "5px",
                                        }}>
                                            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)" }}>
                                                {ALERT_TYPE_LABEL[alert.type] ?? alert.type}
                                            </span>
                                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                                {formatRelTime(alert.created_at)}
                                            </span>
                                        </div>
                                        {alert.description && (
                                            <p style={{
                                                margin: "0 0 8px", fontSize: "12px",
                                                color: "var(--text-secondary)", lineHeight: 1.5,
                                            }}>
                                                {alert.description}
                                            </p>
                                        )}
                                        {isAck ? (
                                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                                Kabul edildi
                                            </span>
                                        ) : (
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <button
                                                    onClick={() => onAcknowledge(alert.id)}
                                                    style={{
                                                        fontSize: "11px", padding: "3px 8px",
                                                        border: "0.5px solid var(--border-secondary)",
                                                        borderRadius: "4px", background: "transparent",
                                                        color: "var(--text-secondary)", cursor: "pointer",
                                                    }}
                                                >
                                                    Kabul Et
                                                </button>
                                                <button
                                                    onClick={() => onDismiss(alert.id)}
                                                    style={{
                                                        fontSize: "11px", padding: "3px 8px",
                                                        border: "0.5px solid var(--border-secondary)",
                                                        borderRadius: "4px", background: "transparent",
                                                        color: "var(--text-tertiary)", cursor: "pointer",
                                                    }}
                                                >
                                                    Kapat
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* CTA */}
                    <Link
                        href={group.actionHref}
                        style={{
                            display: "block", textAlign: "center",
                            padding: "10px 16px",
                            background: sev.bg, border: `0.5px solid ${sev.border}`,
                            borderRadius: "6px", fontSize: "13px", fontWeight: 500,
                            color: sev.text, textDecoration: "none",
                        }}
                    >
                        {group.actionLabel} →
                    </Link>
                </div>
            </div>
        </>
    );
}
