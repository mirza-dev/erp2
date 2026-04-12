"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-context";
import { useToast } from "@/components/ui/Toast";
import { computeCoverageDays, daysColor } from "@/lib/stock-utils";
import { EmptyState, LoadingState } from "@/components/ui/StateViews";
import type { AlertRow } from "@/lib/database.types";
import { extractShortageQty, shortReason, shortImpact } from "@/lib/alert-ui-helpers";
import { useIsDemo, DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";

// ── Types ──────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "info";
type AlertFilter = "all" | "critical" | "warning" | "order_shortage" | "quote_expired" | "overdue_shipment";

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
    isOrphaned: boolean;
}

// ── Helpers ────────────────────────────────────────────────────

function actionFor(alerts: AlertRow[]): { label: string; href: string } {
    const types = alerts.map((a) => a.type);
    if (types.includes("order_shortage")) return { label: "Siparişleri incele", href: "/dashboard/orders" };
    if (types.includes("stock_critical")) return { label: "Satın alma planla",  href: "/dashboard/purchase/suggested" };
    if (types.includes("order_deadline")) return { label: "Satın alma planla",  href: "/dashboard/purchase/suggested" };
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

// ── useIsMobile ────────────────────────────────────────────────

function useIsMobile(breakpoint = 768): boolean {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== "undefined"
            ? window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches
            : false
    );
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [breakpoint]);
    return isMobile;
}

// ── Page ──────────────────────────────────────────────────────

export default function AlertsPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { products } = useData();
    const isMobile = useIsMobile();

    const [rawAlerts, setRawAlerts]         = useState<AlertRow[]>([]);
    const [loading, setLoading]             = useState(true);
    const [activeFilter, setActiveFilter]   = useState<AlertFilter>("all");
    const [showResolved, setShowResolved]   = useState(false);
    const [search, setSearch]               = useState("");
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

    const activeAlerts = showResolved
        ? rawAlerts
        : rawAlerts.filter((a) => a.status === "open" || a.status === "acknowledged");

    const productGroups: ProductAlertGroup[] = (() => {
        const sysAlerts = activeAlerts.filter((a) => a.source !== "ai" && a.entity_id);
        // Sipariş bazlı alertları (quote_expired, overdue_shipment) ürün gruplarından ayır
        const productSysAlerts = sysAlerts.filter((a) => a.entity_type !== "sales_order");
        const byProduct = new Map<string, AlertRow[]>();
        for (const alert of productSysAlerts) {
            const id = alert.entity_id!;
            if (!byProduct.has(id)) byProduct.set(id, []);
            byProduct.get(id)!.push(alert);
        }

        const groups: ProductAlertGroup[] = [];
        for (const [entityId, alerts] of byProduct) {
            const product   = productMap.get(entityId);
            const isOrphaned = !product;
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
                productName: product?.name ?? "Silinmiş Ürün",
                sku:         product?.sku  ?? "—",
                available,
                minStock,
                reserved,
                unit,
                coverageDays: covDays,
                topSeverity:  topSev as "critical" | "warning",
                alerts,
                reason:       isOrphaned ? "Ürün silindi, uyarı geçersiz" : shortReason(alerts),
                impact:       isOrphaned ? "Bu uyarı kapatılabilir" : shortImpact(alerts, available, reserved, unit, covDays),
                actionLabel:  action.label,
                actionHref:   action.href,
                isOrphaned,
            });
        }

        return groups.sort((a, b) => {
            if (a.topSeverity !== b.topSeverity) return a.topSeverity === "critical" ? -1 : 1;
            return (a.coverageDays ?? 999) - (b.coverageDays ?? 999);
        });
    })();

    const aiAlerts           = activeAlerts.filter((a) => a.source === "ai");
    const orderAlerts        = activeAlerts.filter((a) => a.source !== "ai" && a.entity_type === "sales_order");
    const criticalCount      = productGroups.filter((g) => g.topSeverity === "critical").length;
    const warningCount       = productGroups.filter((g) => g.topSeverity === "warning").length;
    const shortageCount      = productGroups.filter((g) => g.alerts.some((a) => a.type === "order_shortage")).length;
    const quoteExpiredCount  = orderAlerts.filter((a) => a.type === "quote_expired").length;
    const overdueCount       = orderAlerts.filter((a) => a.type === "overdue_shipment").length;
    const searched = search.trim().toLowerCase();
    const searchedGroups = searched
        ? productGroups.filter(
            (g) =>
                g.productName.toLowerCase().includes(searched) ||
                g.sku.toLowerCase().includes(searched)
          )
        : productGroups;
    const isOrderAlertTab = activeFilter === "quote_expired" || activeFilter === "overdue_shipment";
    const filtered      = isOrderAlertTab                  ? []  // order alert tabs → ayrı section'da gösterilir
        : activeFilter === "all"            ? searchedGroups
        : activeFilter === "critical"       ? searchedGroups.filter((g) => g.topSeverity === "critical")
        : activeFilter === "warning"        ? searchedGroups.filter((g) => g.topSeverity === "warning")
        : searchedGroups.filter((g) => g.alerts.some((a) => a.type === "order_shortage"));

    // ── Actions ──
    const handleRefresh = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (refreshing) return;
        setRefreshing(true);
        try {
            const res = await fetch("/api/alerts/scan", { method: "POST" });
            if (!res.ok) throw new Error(String(res.status));
            await refetch();
            setLastRefreshed(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
            toast({ type: "success", message: "Uyarılar güncellendi" });
        } catch (err) {
            const msg = err instanceof Error && err.message === "409"
                ? "Tarama zaten devam ediyor"
                : "Yenileme başarısız";
            toast({ type: "error", message: msg });
        } finally {
            setRefreshing(false);
        }
    };

    const handleAiSuggest = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (aiGenerating) return;
        setAiGenerating(true);
        try {
            const res = await fetch("/api/alerts/ai-suggest", { method: "POST" });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            if (!data.ai_available) {
                toast({ type: "warning", message: "AI servisi yapılandırılmamış (ANTHROPIC_API_KEY gerekli)" });
                return;
            }
            await refetch();
            toast({ type: "success", message: `${data.created} AI önerisi oluşturuldu` });
        } catch (err) {
            const msg = err instanceof Error && err.message === "409"
                ? "AI analiz zaten devam ediyor"
                : "AI önerisi oluşturulamadı";
            toast({ type: "error", message: msg });
        } finally {
            setAiGenerating(false);
        }
    };

    const resolveAlert = async (alertId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        try {
            const res = await fetch(`/api/alerts/${alertId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "resolved" }),
            });
            if (!res.ok) throw new Error(String(res.status));
            const patch = (a: AlertRow) =>
                a.id === alertId ? { ...a, status: "resolved" as const } : a;
            setRawAlerts((prev) => prev.map(patch));
            if (drawerGroup) setDrawerGroup({ ...drawerGroup, alerts: drawerGroup.alerts.map(patch) });
            toast({ type: "success", message: "Uyarı çözüldü" });
        } catch {
            toast({ type: "error", message: "İşlem başarısız" });
        }
    };

    const dismissGroup = async (group: ProductAlertGroup) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const open = group.alerts.filter((a) => a.status === "open" || a.status === "acknowledged");
        if (open.length === 0) return;

        const results = await Promise.allSettled(
            open.map(async (a) => {
                const res = await fetch(`/api/alerts/${a.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "dismissed" }),
                });
                if (!res.ok) throw new Error(String(res.status));
                return a.id;
            })
        );

        const succeeded = results
            .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
            .map((r) => r.value);
        const failedCount = results.filter((r) => r.status === "rejected").length;

        if (succeeded.length > 0) {
            const successIds = new Set(succeeded);
            setRawAlerts((prev) => prev.filter((a) => !successIds.has(a.id)));
            if (drawerGroup?.entityId === group.entityId) {
                const remaining = drawerGroup.alerts.filter((a) => !successIds.has(a.id));
                if (remaining.length === 0) setDrawerGroup(null);
                else setDrawerGroup({ ...drawerGroup, alerts: remaining });
            }
        }

        if (failedCount > 0 && succeeded.length > 0) {
            toast({ type: "warning", message: `${succeeded.length} yoksayıldı, ${failedCount} işlem başarısız` });
        } else if (failedCount > 0) {
            toast({ type: "error", message: "Yoksayma işlemi başarısız" });
        } else {
            toast({ type: "info", message: `${succeeded.length} uyarı yoksayıldı` });
        }
    };

    const dismissAlert = async (alertId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        try {
            const res = await fetch(`/api/alerts/${alertId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "dismissed" }),
            });
            if (!res.ok) throw new Error(String(res.status));
            setRawAlerts((prev) => prev.filter((a) => a.id !== alertId));
            if (drawerGroup) {
                const remaining = drawerGroup.alerts.filter((a) => a.id !== alertId);
                if (remaining.length === 0) setDrawerGroup(null);
                else setDrawerGroup({ ...drawerGroup, alerts: remaining });
            }
            toast({ type: "info", message: "Uyarı yoksayıldı" });
        } catch {
            toast({ type: "error", message: "İşlem başarısız" });
        }
    };

    const acknowledgeAlert = async (alertId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        try {
            const res = await fetch(`/api/alerts/${alertId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "acknowledged" }),
            });
            if (!res.ok) throw new Error(String(res.status));
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
                        disabled={isDemo || aiGenerating}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        style={{
                            fontSize: "12px", padding: "6px 12px",
                            border: "0.5px solid var(--accent-border)",
                            borderRadius: "5px", background: "var(--accent-bg)",
                            color: "var(--accent-text)", cursor: isDemo || aiGenerating ? "not-allowed" : "pointer",
                            opacity: isDemo || aiGenerating ? 0.6 : 1, fontWeight: 500,
                        }}
                    >
                        {aiGenerating ? "Analiz..." : "✦ AI Analiz"}
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={isDemo || refreshing}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        style={{
                            fontSize: "12px", padding: "6px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "5px", background: "transparent",
                            color: "var(--text-secondary)", cursor: isDemo || refreshing ? "not-allowed" : "pointer",
                            opacity: isDemo || refreshing ? 0.6 : 1,
                        }}
                    >
                        {refreshing ? "Yükleniyor..." : "↻ Tara"}
                    </button>
                </div>
            </div>

            {/* ── Filter Tabs ── */}
            <div style={{
                borderBottom: isMobile ? "none" : "0.5px solid var(--border-tertiary)",
            }}>
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: isMobile ? undefined : "space-between",
                    padding: "0 24px",
                    borderBottom: isMobile ? "0.5px solid var(--border-tertiary)" : "none",
                    overflowX: isMobile ? "auto" : undefined,
                    scrollbarWidth: "none" as React.CSSProperties["scrollbarWidth"],
                    WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
                }}>
                    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                        {(
                            [
                                { key: "all"              as AlertFilter, label: "Tümü",             count: productGroups.length, dot: null                },
                                { key: "critical"         as AlertFilter, label: "Kritik",            count: criticalCount,        dot: "var(--danger)"     },
                                { key: "warning"          as AlertFilter, label: "Uyarı",             count: warningCount,         dot: "var(--warning)"    },
                                { key: "order_shortage"   as AlertFilter, label: "Sipariş Eksik",     count: shortageCount,        dot: "var(--danger)"     },
                                { key: "quote_expired"    as AlertFilter, label: "Teklif Süresi",     count: quoteExpiredCount,    dot: "var(--warning)"    },
                                { key: "overdue_shipment" as AlertFilter, label: "Geciken Sevkiyat",  count: overdueCount,         dot: "var(--danger)"     },
                            ]
                        ).map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveFilter(tab.key)}
                                style={{
                                    fontSize: "12px",
                                    padding: "10px 14px",
                                    border: "none",
                                    borderBottom: activeFilter === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                                    background: "transparent",
                                    color: activeFilter === tab.key ? "var(--accent-text)" : "var(--text-secondary)",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    fontWeight: activeFilter === tab.key ? 500 : 400,
                                    whiteSpace: "nowrap",
                                    flexShrink: 0,
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
                                        background: activeFilter === tab.key ? "var(--accent-bg)" : "var(--bg-tertiary)",
                                        color: activeFilter === tab.key ? "var(--accent-text)" : "var(--text-tertiary)",
                                        fontWeight: 500,
                                    }}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    {!isMobile && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Ürün adı veya SKU..."
                                style={{
                                    fontSize: "12px",
                                    padding: "5px 10px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "6px",
                                    background: "var(--bg-primary)",
                                    color: "var(--text-primary)",
                                    width: "180px",
                                    outline: "none",
                                }}
                            />
                            <button
                                onClick={() => setShowResolved((v) => !v)}
                                style={{
                                    fontSize: "11px",
                                    padding: "4px 10px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "4px",
                                    background: showResolved ? "var(--bg-tertiary)" : "transparent",
                                    color: showResolved ? "var(--text-secondary)" : "var(--text-tertiary)",
                                    cursor: "pointer",
                                    flexShrink: 0,
                                }}
                            >
                                {showResolved ? "✓ Çözülenleri göster" : "Çözülenleri göster"}
                            </button>
                        </div>
                    )}
                </div>
                {isMobile && (
                    <div style={{
                        padding: "6px 24px 6px",
                        borderBottom: "0.5px solid var(--border-tertiary)",
                    }}>
                        <button
                            onClick={() => setShowResolved((v) => !v)}
                            style={{
                                fontSize: "11px",
                                padding: "4px 10px",
                                border: "0.5px solid var(--border-secondary)",
                                borderRadius: "4px",
                                background: showResolved ? "var(--bg-tertiary)" : "transparent",
                                color: showResolved ? "var(--text-secondary)" : "var(--text-tertiary)",
                                cursor: "pointer",
                            }}
                        >
                            {showResolved ? "✓ Çözülenleri göster" : "Çözülenleri göster"}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Product Alert Table ── */}
            {loading ? (
                <LoadingState message="Uyarılar yükleniyor..." />
            ) : isOrderAlertTab ? (
                /* ── Sipariş Uyarıları Section ── */
                (() => {
                    const visibleOrderAlerts = orderAlerts.filter((a) => a.type === activeFilter);
                    return visibleOrderAlerts.length === 0 ? (
                        <EmptyState
                            title={activeFilter === "quote_expired" ? "Süresi dolmuş teklif yok" : "Geciken sevkiyat yok"}
                            description={activeFilter === "quote_expired" ? "Tüm tekliflerin geçerlilik tarihi uygun." : "Tüm onaylı siparişler zamanında sevk edilmiş."}
                        />
                    ) : (
                        <div>
                            {visibleOrderAlerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "flex-start",
                                        padding: "14px 20px",
                                        borderBottom: "0.5px solid var(--border-tertiary)",
                                        gap: "16px",
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                                            {alert.title}
                                        </div>
                                        {alert.description && (
                                            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                                                {alert.description}
                                            </div>
                                        )}
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                                            {new Date(alert.created_at).toLocaleDateString("tr-TR")}
                                        </div>
                                    </div>
                                    {alert.entity_id && (
                                        <Link
                                            href={`/dashboard/orders/${alert.entity_id}`}
                                            style={{
                                                fontSize: "12px",
                                                color: "var(--accent)",
                                                whiteSpace: "nowrap",
                                                flexShrink: 0,
                                                textDecoration: "none",
                                            }}
                                        >
                                            Siparişe Git →
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>
                    );
                })()
            ) : productGroups.length === 0 ? (
                <EmptyState
                    title="Tüm ürünler sağlıklı"
                    description="Stok veya sipariş kaynaklı uyarı bulunmuyor."
                    action={{ label: "↻ Şimdi Tara", onClick: handleRefresh }}
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    title={
                        activeFilter === "critical"       ? "Kritik uyarı yok" :
                        activeFilter === "warning"        ? "Uyarı seviyesinde ürün yok" :
                        activeFilter === "order_shortage" ? "Sipariş eksik yok" :
                        "Bu filtrede uyarı yok"
                    }
                    description={
                        activeFilter === "critical"       ? "Tüm ürünler güvenli stok seviyesinde." :
                        activeFilter === "warning"        ? "Şu an uyarı eşiğini geçen ürün yok." :
                        activeFilter === "order_shortage" ? "Tüm siparişler mevcut stokla karşılanabiliyor." :
                        "Farklı bir filtre seçin veya tümünü görün."
                    }
                />
            ) : (
                <div>
                    {/* Column headers — desktop only */}
                    {!isMobile && (
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "3px 1fr 170px 120px 148px 110px",
                            alignItems: "center",
                            borderBottom: "0.5px solid var(--border-tertiary)",
                        }}>
                            <div />
                            {[
                                { label: "ÜRÜN",            pad: "8px 16px" },
                                { label: "NEDEN",           pad: "8px 12px" },
                                { label: "ETKİ",            pad: "8px 12px" },
                                { label: "ÖNERİLEN ADIM",   pad: "8px 12px" },
                                { label: "",                pad: "8px 12px" },
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
                    )}

                    {/* Rows */}
                    {filtered.map((group) => (
                        <ProductRow
                            key={group.entityId}
                            group={group}
                            onOpenDrawer={() => setDrawerGroup(group)}
                            onDismissGroup={() => dismissGroup(group)}
                            isMobile={isMobile}
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
                            disabled={isDemo || aiGenerating}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            style={{
                                fontSize: "11px", padding: "4px 10px",
                                border: "0.5px solid var(--accent-border)",
                                borderRadius: "4px", background: "var(--accent-bg)",
                                color: "var(--accent-text)", cursor: isDemo || aiGenerating ? "not-allowed" : "pointer",
                                opacity: isDemo || aiGenerating ? 0.6 : 1, fontWeight: 500,
                            }}
                        >
                            {aiGenerating ? "Analiz..." : "Analizi Başlat"}
                        </button>
                    )}
                </div>

                {aiAlerts.length === 0 ? (
                    <div style={{ padding: "0 24px 16px" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                            Henüz çalıştırılmadı — stok riski, sipariş anomalileri ve tedarik boşluklarını analiz eder.
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
                                    AI
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
                    onResolve={resolveAlert}
                />
            )}
        </div>
    );
}

// ── ProductRow ────────────────────────────────────────────────

interface ProductRowProps {
    group: ProductAlertGroup;
    onOpenDrawer: () => void;
    onDismissGroup: () => void;
    isMobile: boolean;
}

function ProductRow({ group, onOpenDrawer, onDismissGroup, isMobile }: ProductRowProps) {
    const sev      = SEV[group.topSeverity];
    const isAllAck = group.alerts.every((a) => a.status === "acknowledged" || a.status === "resolved" || a.status === "dismissed");
    const covDays  = group.coverageDays;

    // ── Mobile card layout ──
    if (isMobile) {
        return (
            <div
                style={{
                    display: "flex",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    opacity: isAllAck ? 0.6 : 1,
                }}
            >
                {/* Severity stripe */}
                <div style={{ width: "3px", background: sev.dot, flexShrink: 0 }} />

                {/* Card content */}
                <div style={{
                    flex: 1,
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                    minWidth: 0,
                }}>
                    {/* Row 1: severity badge + product name */}
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
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

                    {/* Row 2: SKU + coverage */}
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

                    {/* Row 3: reason */}
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        {group.reason}
                    </span>

                    {/* Row 4: impact */}
                    <span style={{
                        fontSize: "12px", fontWeight: 600,
                        color: group.topSeverity === "critical" ? "var(--danger-text)" : "var(--warning-text)",
                    }}>
                        {group.impact}
                    </span>

                    {/* Row 5: actions */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        flexWrap: "wrap", marginTop: "4px",
                    }}>
                        <Link
                            href={group.actionHref}
                            style={{
                                fontSize: "12px", fontWeight: 500,
                                padding: "5px 12px", borderRadius: "4px",
                                background: sev.bg, color: sev.text,
                                border: `0.5px solid ${sev.border}`,
                                textDecoration: "none", whiteSpace: "nowrap",
                            }}
                        >
                            {group.actionLabel} →
                        </Link>
                        <button
                            onClick={onOpenDrawer}
                            aria-label={`${group.productName} detayını aç`}
                            style={{
                                fontSize: "11px", padding: "5px 12px",
                                border: "0.5px solid var(--border-secondary)",
                                borderRadius: "4px", background: "transparent",
                                color: "var(--text-secondary)", cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            Detay
                        </button>
                        {!isAllAck ? (
                            <button
                                onClick={onDismissGroup}
                                aria-label={`${group.productName} uyarılarını yoksay`}
                                title="Tüm uyarıları yoksay"
                                style={{
                                    fontSize: "13px", padding: "3px 9px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "4px", background: "transparent",
                                    color: "var(--text-tertiary)", cursor: "pointer",
                                    lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        ) : (
                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Görüldü</span>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Desktop grid layout ──
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "3px 1fr 170px 120px 148px 110px",
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

            {/* Quick actions */}
            <div style={{ padding: "12px 12px", display: "flex", alignItems: "center", gap: "6px" }}>
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
                {!isAllAck ? (
                    <button
                        onClick={onDismissGroup}
                        aria-label={`${group.productName} uyarılarını yoksay`}
                        title="Tüm uyarıları yoksay"
                        style={{
                            fontSize: "13px", padding: "2px 7px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "4px", background: "transparent",
                            color: "var(--text-tertiary)", cursor: "pointer",
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                ) : (
                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        Görüldü
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Drawer helpers ────────────────────────────────────────────

function drawerDetailedReason(group: ProductAlertGroup): string {
    const types = group.alerts.map((a) => a.type);
    if (types.includes("order_shortage")) {
        const qty = extractShortageQty(group.alerts);
        return qty !== null
            ? `Onaylı sipariş için ${qty} ${group.unit} eksik — mevcut stok yetersiz.`
            : "Onaylı sipariş stokla karşılanamıyor.";
    }
    if (types.includes("stock_critical")) {
        return `Mevcut stok (${group.available} ${group.unit}), minimum güvenlik seviyesi olan ${group.minStock} ${group.unit} altına indi.`;
    }
    if (types.includes("stock_risk")) {
        return `Mevcut stok (${group.available} ${group.unit}), uyarı eşiğine yaklaştı (min: ${group.minStock} ${group.unit}). Kısa vadede kritik seviyeye düşme riski var.`;
    }
    return `Bu ürün için stok riski tespit edildi. Mevcut: ${group.available} ${group.unit}, minimum: ${group.minStock} ${group.unit}.`;
}

function drawerDetailedImpact(group: ProductAlertGroup): string {
    const types = group.alerts.map((a) => a.type);
    if (types.includes("order_shortage")) {
        const qty = extractShortageQty(group.alerts);
        return qty !== null
            ? `${qty} ${group.unit} eksik. Onaylı siparişler tam karşılanamıyor. Teslimatta gecikme veya kısmi sevkiyat riski var.`
            : "Onaylı siparişler tam karşılanamıyor. Teslimatta gecikme riski var.";
    }
    const { coverageDays } = group;
    if (coverageDays === 0) return "Stok tükendi. Mevcut siparişler karşılanamıyor.";
    if (coverageDays !== null && coverageDays <= 7) return `~${coverageDays} gün içinde stok tükeniyor. Acil satın alma yapılmalı.`;
    if (coverageDays !== null) {
        if (group.topSeverity === "critical") return `Stok minimum seviyenin altında. ~${coverageDays} günlük kullanım kapasitesi var.`;
        return `~${coverageDays} günlük stok var — yakında minimum seviyeye düşebilir.`;
    }
    return "Stok minimum seviyenin altında. Yeni siparişler tam karşılanamayabilir.";
}

function drawerActionLinks(group: ProductAlertGroup): Array<{ label: string; href: string; primary: boolean }> {
    const types = group.alerts.map((a) => a.type);
    if (types.includes("order_shortage")) return [
        { label: "Siparişleri incele",     href: "/dashboard/orders",              primary: true  },
        { label: "Satın alma planla",      href: "/dashboard/purchase/suggested",  primary: false },
    ];
    if (types.includes("stock_critical")) return [
        { label: "Satın alma planla",      href: "/dashboard/purchase/suggested",  primary: true  },
        { label: "Siparişleri incele",      href: "/dashboard/orders",              primary: false },
    ];
    return [
        { label: "Satın alma planla",      href: "/dashboard/purchase/suggested",  primary: true  },
    ];
}

function drawerRelatedLinks(group: ProductAlertGroup): Array<{ label: string; href: string }> {
    const types = group.alerts.map((a) => a.type);
    const productHref = `/dashboard/products?highlight=${group.entityId}`;
    // order_shortage: Önerilen Aksiyon'da zaten /orders (primary) ve /purchase/suggested (secondary) var.
    // Tekrar eden linkleri İlgili Kayıtlar'dan çıkar; sadece ürün kartı göster.
    if (types.includes("order_shortage")) {
        return [
            { label: "Ürün kartına git", href: productHref },
        ];
    }
    return [
        { label: "Ürün kartına git",           href: productHref },
        { label: "Satın alma önerisine git",   href: "/dashboard/purchase/suggested" },
    ];
}

// ── DrawerSection ─────────────────────────────────────────────

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{
                fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)",
                letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "8px",
            }}>
                {title}
            </div>
            {children}
        </div>
    );
}

// ── AlertDetailDrawer ─────────────────────────────────────────

interface DrawerProps {
    group: ProductAlertGroup;
    onClose: () => void;
    onDismiss: (alertId: string) => void;
    onAcknowledge: (alertId: string) => void;
    onResolve: (alertId: string) => void;
}

function AlertDetailDrawer({ group, onClose, onDismiss, onAcknowledge, onResolve }: DrawerProps) {
    const panelRef    = useRef<HTMLDivElement>(null);
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const sev         = SEV[group.topSeverity];
    const covDays     = group.coverageDays;

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

    const actionLinks  = drawerActionLinks(group);
    const relatedLinks = drawerRelatedLinks(group);

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
                    width: "min(440px, 100vw)",
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
                <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>

                    {/* ── 1. Uyarı Özeti ── */}
                    <div style={{
                        padding: "14px",
                        background: sev.bg,
                        border: `0.5px solid ${sev.border}`,
                        borderRadius: "6px",
                    }}>
                        <div style={{
                            fontSize: "10px", fontWeight: 700, color: sev.text,
                            letterSpacing: "0.06em", marginBottom: "6px",
                        }}>
                            UYARI ÖZETİ
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "8px", lineHeight: 1.45 }}>
                            {group.reason}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "12px", color: sev.text, fontWeight: 600 }}>
                                {group.available} / min {group.minStock} {group.unit}
                            </span>
                            {covDays !== null && (
                                <span style={{
                                    fontSize: "11px", fontWeight: 600, color: daysColor(covDays),
                                    padding: "1px 6px", borderRadius: "3px",
                                    background: "rgba(0,0,0,0.15)",
                                }}>
                                    ~{covDays} gün
                                </span>
                            )}
                            <span style={{ fontSize: "11px", color: sev.text, opacity: 0.7 }}>
                                {group.alerts.length} aktif uyarı
                            </span>
                        </div>
                    </div>

                    {/* ── 2. Neden ── */}
                    <DrawerSection title="NEDEN">
                        {group.isOrphaned ? (
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                Bu uyarının bağlı olduğu ürün sistemden silinmiş.
                                Uyarı artık geçersiz — aşağıdan &quot;Yoksay&quot; ile kapatabilirsiniz.
                            </p>
                        ) : (
                            <>
                                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.6 }}>
                                    {drawerDetailedReason(group)}
                                </p>
                                <div style={{
                                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                                    gap: "10px",
                                    padding: "10px 12px",
                                    background: "var(--bg-secondary)",
                                    border: "0.5px solid var(--border-tertiary)",
                                    borderRadius: "5px",
                                }}>
                                    {[
                                        { label: "Mevcut",  value: group.available, color: sev.text },
                                        { label: "Minimum", value: group.minStock,  color: "var(--text-secondary)" },
                                        { label: "Rezerve", value: group.reserved,  color: "var(--text-secondary)" },
                                    ].map(({ label, value, color }) => (
                                        <div key={label}>
                                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "2px" }}>{label}</div>
                                            <div style={{ fontSize: "15px", fontWeight: 700, color, lineHeight: 1.2 }}>
                                                {value}
                                                <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--text-tertiary)", marginLeft: "3px" }}>
                                                    {group.unit}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </DrawerSection>

                    {/* ── 3. Etki ── */}
                    {!group.isOrphaned && (
                        <DrawerSection title="ETKİ">
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.6 }}>
                                {drawerDetailedImpact(group)}
                            </p>
                        </DrawerSection>
                    )}

                    {/* ── 4. Önerilen Aksiyon ── */}
                    <DrawerSection title="ÖNERİLEN AKSİYON">
                        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                            {actionLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "10px 14px",
                                        background: link.primary ? sev.bg : "transparent",
                                        border: `0.5px solid ${link.primary ? sev.border : "var(--border-secondary)"}`,
                                        borderRadius: "5px",
                                        fontSize: "13px",
                                        fontWeight: link.primary ? 600 : 400,
                                        color: link.primary ? sev.text : "var(--text-secondary)",
                                        textDecoration: "none",
                                    }}
                                >
                                    <span>{link.label}</span>
                                    <span>→</span>
                                </Link>
                            ))}
                        </div>
                    </DrawerSection>

                    {/* ── 5. İlgili Kayıtlar ── */}
                    {!group.isOrphaned && (
                        <DrawerSection title="İLGİLİ KAYITLAR">
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {relatedLinks.map((link) => (
                                    <Link
                                        key={link.href + link.label}
                                        href={link.href}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            padding: "8px 12px",
                                            background: "var(--bg-secondary)",
                                            border: "0.5px solid var(--border-tertiary)",
                                            borderRadius: "5px",
                                            fontSize: "12px",
                                            color: "var(--text-secondary)",
                                            textDecoration: "none",
                                        }}
                                    >
                                        <span>{link.label}</span>
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>→</span>
                                    </Link>
                                ))}
                            </div>
                        </DrawerSection>
                    )}

                    {/* ── 6. Uyarı Durumu (ack / dismiss) ── */}
                    <DrawerSection title="UYARI DURUMU">
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {group.alerts.map((alert) => {
                                const alertSev  = SEV[alert.severity as Severity] ?? SEV.info;
                                const isSettled = alert.status === "resolved" || alert.status === "dismissed";
                                return (
                                    <div
                                        key={alert.id}
                                        style={{
                                            padding: "10px 12px",
                                            background: "var(--bg-secondary)",
                                            border: "0.5px solid var(--border-tertiary)",
                                            borderLeft: `3px solid ${alertSev.dot}`,
                                            borderRadius: "5px",
                                            opacity: isSettled ? 0.55 : 1,
                                        }}
                                    >
                                                        <div style={{
                                            display: "flex", alignItems: "center",
                                            justifyContent: "space-between",
                                            marginBottom: "8px",
                                        }}>
                                            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)" }}>
                                                {ALERT_TYPE_LABEL[alert.type] ?? alert.type}
                                            </span>
                                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                                {formatRelTime(alert.created_at)}
                                            </span>
                                        </div>
                                        {alert.status === "open" && (
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <button
                                                    onClick={() => onAcknowledge(alert.id)}
                                                    style={{
                                                        fontSize: "11px", padding: "4px 10px",
                                                        border: "0.5px solid var(--border-secondary)",
                                                        borderRadius: "4px", background: "transparent",
                                                        color: "var(--text-secondary)", cursor: "pointer",
                                                    }}
                                                >
                                                    Görüldü
                                                </button>
                                                <button
                                                    onClick={() => onDismiss(alert.id)}
                                                    style={{
                                                        fontSize: "11px", padding: "4px 10px",
                                                        border: "0.5px solid var(--border-secondary)",
                                                        borderRadius: "4px", background: "transparent",
                                                        color: "var(--text-tertiary)", cursor: "pointer",
                                                    }}
                                                >
                                                    Yoksay
                                                </button>
                                            </div>
                                        )}
                                        {alert.status === "acknowledged" && (
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <button
                                                    onClick={() => onResolve(alert.id)}
                                                    style={{
                                                        fontSize: "11px", padding: "4px 10px",
                                                        border: "0.5px solid var(--success-border)",
                                                        borderRadius: "4px", background: "var(--success-bg)",
                                                        color: "var(--success-text)", cursor: "pointer",
                                                    }}
                                                >
                                                    Çözüldü
                                                </button>
                                                <button
                                                    onClick={() => onDismiss(alert.id)}
                                                    style={{
                                                        fontSize: "11px", padding: "4px 10px",
                                                        border: "0.5px solid var(--border-secondary)",
                                                        borderRadius: "4px", background: "transparent",
                                                        color: "var(--text-tertiary)", cursor: "pointer",
                                                    }}
                                                >
                                                    Yoksay
                                                </button>
                                            </div>
                                        )}
                                        {alert.status === "resolved" && (
                                            <span style={{ fontSize: "10px", color: "var(--success-text)" }}>Çözüldü ✓</span>
                                        )}
                                        {alert.status === "dismissed" && (
                                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Yoksayıldı</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </DrawerSection>

                </div>
            </div>
        </>
    );
}
