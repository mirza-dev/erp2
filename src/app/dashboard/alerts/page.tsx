"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { mapProduct } from "@/lib/api-mappers";
import type { Product } from "@/lib/mock-data";
import { useToast } from "@/components/ui/Toast";
import { computeCoverageDays } from "@/lib/stock-utils";
import { LoadingState } from "@/components/ui/StateViews";
import type { AlertWithDueMeta } from "@/lib/services/alert-due-dates";
import { shortReason, shortImpact } from "@/lib/alert-ui-helpers";
import { useIsDemo, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { AiUnavailableBanner } from "@/components/ai/AiUnavailableBanner";
import { ALERT_TYPE_LABEL } from "@/lib/alert-labels";
import {
    ALERT_CLASSES, matchesAlertClass, expandAlertOccurrences, getOccurrencesForDate, getCalendarStats,
    timeFromISO, type CalendarAlert, type Occurrence,
} from "@/lib/alert-calendar";
import { CalendarHeader } from "@/components/alerts/CalendarHeader";
import { ClassificationTabs } from "@/components/alerts/ClassificationTabs";
import { CalendarGrid } from "@/components/alerts/CalendarGrid";
import { DayDetailPanel } from "@/components/alerts/DayDetailPanel";
import { AlertCalendarDrawer } from "@/components/alerts/AlertCalendarDrawer";

// ── AlertRow (+ due meta) → takvim görünüm modeli ─────────────────────────────
/**
 * Her uyarıyı CalendarAlert'e dönüştürür. Ürün-entity alertleri productMap'ten
 * stok bilgisi + (order_deadline için) stok-tükenme hedef tarihini alır;
 * order-entity alertlerinin hedef tarihi/kodu server enrichment'tan gelir.
 */
export function toCalendarAlert(row: AlertWithDueMeta, productMap: Map<string, Product>): CalendarAlert {
    const isProductEntity = row.entity_type === "product" && !!row.entity_id;
    const product = isProductEntity ? productMap.get(row.entity_id as string) : undefined;
    const orphaned = isProductEntity && !product;

    let cp: CalendarAlert["product"] = null;
    let covDays: number | null = null;
    if (product) {
        const available = product.available_now ?? 0;
        const reserved = product.reserved ?? 0;
        const unit = product.unit ?? "adet";
        covDays = computeCoverageDays(available, product.dailyUsage ?? null);
        cp = {
            name: product.name,
            sku: product.sku,
            available,
            minStock: product.minStockLevel ?? 0,
            reserved,
            unit,
            coverageDays: covDays,
        };
    }

    // Neden / Etki
    let reason: string;
    let impact: string;
    if (orphaned) {
        reason = "Ürün silindi, uyarı geçersiz";
        impact = "Bu uyarı kapatılabilir";
    } else if (product && cp) {
        reason = shortReason([row]);
        impact = shortImpact([row], cp.available, cp.reserved, cp.unit, covDays);
    } else {
        reason = row.description || (ALERT_TYPE_LABEL[row.type] ?? row.type);
        impact = row.description || (ALERT_TYPE_LABEL[row.type] ?? "");
    }

    // Hedef tarih: server (order alertleri) → yoksa order_deadline için ürün stok-tükenme
    let dueDate = row.due_date;
    let dueLabel = row.due_label;
    if (!dueDate && row.type === "order_deadline" && product) {
        dueDate = product.orderDeadline ?? product.stockoutDate ?? null;
        dueLabel = dueDate ? "Stok Tükenme" : null;
    }

    return {
        id: row.id,
        type: row.type,
        severity: row.severity,
        status: row.status,
        title: row.title,
        reason,
        impact,
        date: row.created_at,
        time: timeFromISO(row.created_at),
        resolution: row.resolution_reason ?? null,
        dueDate,
        dueLabel,
        orderCode: row.order_code ?? null,
        entityId: row.entity_id ?? null,
        entityType: row.entity_type ?? null,
        product: cp,
        source: row.source ?? null,
        aiConfidence: row.ai_confidence ?? null,
        aiReason: row.ai_reason ?? null,
        aiModelVersion: row.ai_model_version ?? null,
    };
}

/** Sınıflandırma sekmesine göre filtre (sekme sayaçlarıyla aynı matcher). */
export function applyClassFilter(alerts: CalendarAlert[], classId: string): CalendarAlert[] {
    const cat = ALERT_CLASSES.find((c) => c.id === classId);
    if (!cat) return alerts;
    return alerts.filter((a) => matchesAlertClass(a, cat));
}

export default function AlertsPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [rawAlerts, setRawAlerts] = useState<AlertWithDueMeta[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiUnavailable, setAiUnavailable] = useState<{ reason: "not_configured" | "error" } | null>(null);
    const [syncRetrying, setSyncRetrying] = useState<string | null>(null);

    // Takvim durumu
    const now = useMemo(() => new Date(), []);
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [viewMonth, setViewMonth] = useState(now.getMonth());
    const [selectedDate, setSelectedDate] = useState<Date | null>(now);
    const [activeClass, setActiveClass] = useState("all");
    // Varsayılan: çözülenler de görünür (tasarım vaadi "hangi gün ne olmuş" — geçmişi gez).
    const [showResolved, setShowResolved] = useState(true);
    const [search, setSearch] = useState("");
    const [drawerAlertId, setDrawerAlertId] = useState<string | null>(null);

    // ── Responsive (OrderForm precedent) — <768 tek kolon + doküman scroll ──
    const [windowWidth, setWindowWidth] = useState<number>(
        typeof window !== "undefined" ? window.innerWidth : 1200,
    );
    useEffect(() => {
        function handleResize() { setWindowWidth(window.innerWidth); }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);
    const isMobile = windowWidth < 768;

    // ── Fetch ──
    const refetch = useCallback(async () => {
        const [alertsRes, productsRes] = await Promise.all([
            fetch("/api/alerts/calendar"),
            fetch("/api/products"),
        ]);
        if (alertsRes.ok) {
            const data = await alertsRes.json();
            if (Array.isArray(data)) setRawAlerts(data as AlertWithDueMeta[]);
        }
        if (productsRes.ok) {
            const data = await productsRes.json();
            if (Array.isArray(data)) setProducts(data.map(mapProduct));
        }
    }, []);

    useEffect(() => {
        refetch().catch(console.error).finally(() => setLoading(false));
    }, [refetch]);

    // ── Türetilen veriler ──
    const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

    const calendarAlerts = useMemo(
        () => rawAlerts.map((r) => toCalendarAlert(r, productMap)),
        [rawAlerts, productMap],
    );

    const visibleAlerts = useMemo(
        () => showResolved
            ? calendarAlerts
            : calendarAlerts.filter((a) => a.status === "open" || a.status === "acknowledged"),
        [calendarAlerts, showResolved],
    );

    const filteredAlerts = useMemo(() => {
        let list = applyClassFilter(visibleAlerts, activeClass);
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter((a) =>
                (a.product?.name.toLowerCase().includes(q)) ||
                (a.product?.sku.toLowerCase().includes(q)) ||
                a.title.toLowerCase().includes(q) ||
                (a.orderCode?.toLowerCase().includes(q)),
            );
        }
        return list;
    }, [visibleAlerts, activeClass, search]);

    const occurrences = useMemo(() => expandAlertOccurrences(filteredAlerts), [filteredAlerts]);
    const stats = useMemo(() => getCalendarStats(calendarAlerts), [calendarAlerts]);
    const dayOccurrences = useMemo(
        () => (selectedDate ? getOccurrencesForDate(occurrences, selectedDate) : []),
        [occurrences, selectedDate],
    );

    // Drawer canlı: rawAlerts mutasyonu otomatik yansır; silinince undefined → kapanır
    const drawerAlert = useMemo(
        () => (drawerAlertId ? calendarAlerts.find((a) => a.id === drawerAlertId) ?? null : null),
        [drawerAlertId, calendarAlerts],
    );
    useEffect(() => {
        if (drawerAlertId && !drawerAlert) setDrawerAlertId(null);
    }, [drawerAlertId, drawerAlert]);

    // ── Navigasyon ──
    const goPrev = useCallback(() => {
        setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; });
    }, []);
    const goNext = useCallback(() => {
        setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; });
    }, []);
    const goToday = useCallback(() => {
        const t = new Date();
        setViewYear(t.getFullYear());
        setViewMonth(t.getMonth());
        setSelectedDate(t);
    }, []);
    const handleSelectDate = useCallback((date: Date) => {
        setSelectedDate(date);
        if (date.getMonth() !== viewMonth || date.getFullYear() !== viewYear) {
            setViewMonth(date.getMonth());
            setViewYear(date.getFullYear());
        }
    }, [viewMonth, viewYear]);

    // ── Aksiyonlar (mevcut davranışlar korunur) ──
    const handleRefresh = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (refreshing) return;
        setRefreshing(true);
        try {
            const res = await fetch("/api/alerts/scan?force=true", { method: "POST" });
            if (!res.ok) throw new Error(String(res.status));
            await refetch();
            toast({ type: "success", message: "Uyarılar güncellendi" });
        } catch (err) {
            const msg = err instanceof Error && err.message === "409" ? "Tarama zaten devam ediyor" : "Yenileme başarısız";
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
            if (!data.aiAvailable) { setAiUnavailable({ reason: "not_configured" }); return; }
            setAiUnavailable(null);
            await refetch();
            toast({ type: "success", message: `${data.created} AI önerisi oluşturuldu` });
        } catch (err) {
            if (err instanceof Error && err.message === "409") {
                toast({ type: "warning", message: "AI analiz zaten devam ediyor" });
            } else {
                setAiUnavailable({ reason: "error" });
            }
        } finally {
            setAiGenerating(false);
        }
    };

    const patchStatus = (alertId: string, status: AlertWithDueMeta["status"]) =>
        setRawAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, status } : a)));

    const acknowledgeAlert = async (alertId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        try {
            const res = await fetch(`/api/alerts/${alertId}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "acknowledged" }),
            });
            if (!res.ok) throw new Error(String(res.status));
            patchStatus(alertId, "acknowledged");
            toast({ type: "success", message: "Uyarı kabul edildi" });
        } catch { toast({ type: "error", message: "İşlem başarısız" }); }
    };

    const resolveAlert = async (alertId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        try {
            const res = await fetch(`/api/alerts/${alertId}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "resolved" }),
            });
            if (!res.ok) throw new Error(String(res.status));
            patchStatus(alertId, "resolved");
            toast({ type: "success", message: "Uyarı çözüldü" });
        } catch { toast({ type: "error", message: "İşlem başarısız" }); }
    };

    const dismissAlert = async (alertId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        try {
            const res = await fetch(`/api/alerts/${alertId}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "dismissed" }),
            });
            if (!res.ok) throw new Error(String(res.status));
            // Satırı silme — dismissed olarak işaretle. Silinirse bir sonraki
            // refetch'te "Çözülenler" açıkken geri görünüp tutarsızlık yaratıyordu.
            patchStatus(alertId, "dismissed");
            toast({ type: "info", message: "Uyarı yoksayıldı. 24 saat içinde durum kötüleşmezse yeniden açılmaz." });
        } catch { toast({ type: "error", message: "İşlem başarısız" }); }
    };

    // Toplu yoksay çekirdeği (24h bypass server-side; demo guard). Gün + ürün toplu
    // yoksaymanın ortak motoru (eski grup-yoksay davranışı korunur).
    const bulkDismiss = async (rawIds: string[]) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const ids = Array.from(new Set(rawIds));
        if (ids.length === 0) return;
        const results = await Promise.allSettled(ids.map(async (id) => {
            const res = await fetch(`/api/alerts/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "dismissed" }),
            });
            if (!res.ok) throw new Error(String(res.status));
            return id;
        }));
        const succeeded = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
        const failedCount = results.filter((r) => r.status === "rejected").length;
        if (succeeded.length > 0) {
            const ok = new Set(succeeded);
            setRawAlerts((prev) => prev.map((a) => (ok.has(a.id) ? { ...a, status: "dismissed" as const } : a)));
        }
        if (failedCount > 0 && succeeded.length > 0) {
            toast({ type: "warning", message: `${succeeded.length} uyarı yoksayıldı. ${failedCount} işlem başarısız.` });
        } else if (failedCount > 0) {
            toast({ type: "error", message: "Yoksayma işlemi başarısız" });
        } else {
            toast({ type: "info", message: `${succeeded.length} uyarı yoksayıldı. 24 saat içinde durum kötüleşmezse yeniden açılmaz.` });
        }
    };

    // Gün toplu yoksay (seçili günün tüm açık uyarıları)
    const dismissDay = () =>
        bulkDismiss(
            dayOccurrences
                .filter((o) => o.occKind === "event" && (o.status === "open" || o.status === "acknowledged"))
                .map((o) => o.id),
        );

    // Ürün-bazlı toplu yoksay (bir ürünün TÜM açık uyarıları — eski grup-yoksay paritesi)
    const dismissProduct = (entityId: string) =>
        bulkDismiss(
            rawAlerts
                .filter((a) => a.entity_id === entityId && (a.status === "open" || a.status === "acknowledged"))
                .map((a) => a.id),
        );

    const retrySyncAlert = async (alertId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (syncRetrying) return;
        setSyncRetrying(alertId);
        try {
            const res = await fetch(`/api/alerts/${alertId}/sync-retry`, { method: "POST" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
            }
            patchStatus(alertId, "resolved");
            toast({ type: "success", message: "Paraşüt yeniden senkronize edildi, uyarı kapatıldı." });
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Yeniden deneme başarısız." });
        } finally {
            setSyncRetrying(null);
        }
    };

    const openDrawer = (occ: Occurrence) => setDrawerAlertId(occ.id);

    const dayHasOpen = dayOccurrences.some(
        (o) => o.occKind === "event" && (o.status === "open" || o.status === "acknowledged"),
    );

    if (loading) return <LoadingState message="Uyarılar yükleniyor..." />;

    return (
        <div style={pageRootStyle}>
            {aiUnavailable && (
                <AiUnavailableBanner
                    message={
                        aiUnavailable.reason === "not_configured"
                            ? "AI servisi yapılandırılmamış (ANTHROPIC_API_KEY gerekli). Stok ve sipariş uyarıları gösterilmeye devam ediyor."
                            : "AI analizi şu an oluşturulamadı. Stok ve sipariş uyarıları gösterilmeye devam ediyor."
                    }
                    onRetry={aiUnavailable.reason === "error" ? handleAiSuggest : undefined}
                    retryDisabled={aiGenerating}
                    onClose={() => setAiUnavailable(null)}
                    style={{ marginBottom: "12px" }}
                />
            )}

            <div
                style={isMobile
                    ? { ...layoutStyle, gridTemplateColumns: "1fr", height: "auto", overflow: "visible" }
                    : layoutStyle}
                className="alerts-calendar-layout"
            >
                {/* Takvim ana kolon */}
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: isMobile ? "visible" : "hidden" }}>
                    <CalendarHeader
                        year={viewYear}
                        month={viewMonth}
                        onPrev={goPrev}
                        onNext={goNext}
                        onToday={goToday}
                        stats={stats}
                        onRefresh={handleRefresh}
                        refreshing={refreshing}
                        onAiSuggest={handleAiSuggest}
                        aiGenerating={aiGenerating}
                    />

                    <div style={controlsRowStyle}>
                        <ClassificationTabs activeClass={activeClass} onSelect={setActiveClass} visibleAlerts={visibleAlerts} />
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, paddingBottom: "14px" }}>
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Ara…"
                                aria-label="Uyarılarda ara"
                                style={searchStyle}
                            />
                            <label style={toggleLabelStyle}>
                                <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} aria-label="Çözülenleri göster" />
                                Çözülenler
                            </label>
                        </div>
                    </div>

                    <div style={isMobile
                        ? { flex: "none" }
                        : { flex: 1, overflowY: "auto", minHeight: 0 }}>
                        <CalendarGrid
                            year={viewYear}
                            month={viewMonth}
                            occurrences={occurrences}
                            selectedDate={selectedDate}
                            onSelectDate={handleSelectDate}
                        />
                    </div>
                </div>

                {/* Gün detay paneli */}
                <div
                    style={isMobile
                        ? { ...dayPanelStyle, borderLeft: "none", borderTop: "0.5px solid var(--border-tertiary)", maxHeight: "50vh" }
                        : dayPanelStyle}
                    className="alerts-day-panel"
                >
                    {dayHasOpen && (
                        <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 20px 0" }}>
                            <button type="button" onClick={dismissDay} disabled={isDemo} style={dismissDayBtnStyle}>
                                Günü Yoksay
                            </button>
                        </div>
                    )}
                    <DayDetailPanel
                        selectedDate={selectedDate}
                        occurrences={dayOccurrences}
                        onDetail={openDrawer}
                        onDismiss={dismissAlert}
                    />
                </div>
            </div>

            {drawerAlert && (
                <AlertCalendarDrawer
                    alert={drawerAlert}
                    onClose={() => setDrawerAlertId(null)}
                    onAcknowledge={acknowledgeAlert}
                    onResolve={resolveAlert}
                    onDismiss={dismissAlert}
                    onSyncRetry={retrySyncAlert}
                    onDismissProduct={dismissProduct}
                    onExtended={() => {
                        setDrawerAlertId(null);
                        void refetch();
                        toast({ type: "success", message: "Teklif süresi güncellendi ve uyarı kapatıldı." });
                    }}
                    onShipped={() => {
                        setDrawerAlertId(null);
                        void refetch();
                        toast({ type: "success", message: "Sevkiyat kaydedildi ve uyarı kapatıldı." });
                    }}
                    isDemo={isDemo}
                    syncRetrying={syncRetrying === drawerAlert.id}
                />
            )}
        </div>
    );
}

// ── Stiller (inline + CSS değişkenleri) ──────────────────────────────────────
const pageRootStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", minWidth: 0,
};
const layoutStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 380px",
    // Topbar (52px) + main padding (18px*2) çıkarılır → içerik-alanı yüksekliği
    height: "calc(100vh - 52px - 36px)",
    minHeight: "480px",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "10px",
    overflow: "hidden",
    background: "var(--surface-subtle)",
};
const controlsRowStyle: React.CSSProperties = {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: "12px", padding: "0 4px", flexWrap: "wrap",
};
const dayPanelStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column",
    borderLeft: "0.5px solid var(--border-tertiary)",
    background: "var(--surface-subtle)", minWidth: 0, overflow: "hidden",
};
const searchStyle: React.CSSProperties = {
    height: "32px", padding: "0 10px", borderRadius: "8px",
    border: "1px solid var(--border-tertiary)", background: "var(--bg-primary)",
    color: "var(--text-primary)", fontSize: "12px", width: "140px",
};
const toggleLabelStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: "6px",
    fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap",
};
const dismissDayBtnStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 500, padding: "4px 10px",
    border: "1px solid var(--border-tertiary)", borderRadius: "8px",
    background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
};
