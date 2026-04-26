"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { IntegrationSyncLogRow, SalesOrderRow } from "@/lib/database.types";

type SyncStatus = "idle" | "syncing" | "done";
type ConnectionStatus = "connected" | "disconnected";

interface ParasutConfig {
    enabled: boolean;
    companyId: string | null;
    clientId: string | null;
    clientSecretConfigured: boolean;
}

interface ParasutStats {
    customers: number;
    synced_invoices: number;
    pending_syncs: number;
    in_progress_syncs?: number;
    failed_syncs: number;
    blocked_syncs?: number;
    byStep?: Record<string, number>;
    byErrorKind?: Record<string, number>;
    token?: {
        connected: boolean;
        expiresAt: string | null;
        secondsRemaining: number | null;
        tokenVersion: number | null;
        updatedAt: string | null;
    };
}

const STEP_LABELS_TR: Record<string, string> = {
    contact:  "Müşteri",
    product:  "Ürün",
    shipment: "İrsaliye",
    invoice:  "Fatura",
    edoc:     "E-Belge",
    done:     "Tamamlandı",
    unknown:  "Bilinmeyen",
};

const ERROR_KIND_LABELS_TR: Record<string, string> = {
    auth:       "Yetkilendirme",
    validation: "Doğrulama",
    rate_limit: "Hız limiti",
    server:     "Sunucu",
    network:    "Ağ",
    not_found:  "Bulunamadı",
};

function formatDuration(seconds: number): string {
    if (seconds <= 0) return "Süresi doldu";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h >= 24) {
        const d = Math.floor(h / 24);
        return `${d}g ${h % 24}s`;
    }
    if (h > 0) return `${h}s ${m}dk`;
    return `${m}dk`;
}

function formatDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
        + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: "11px",
    fontWeight: 500,
    color: "var(--text-tertiary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
    padding: "9px 12px",
    fontSize: "13px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
};

export default function ParasutPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [config, setConfig] = useState<ParasutConfig | null>(null);
    // connection is derived from server-side config — never set locally
    const connection: ConnectionStatus = config?.enabled ? "connected" : "disconnected";
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const [syncStep, setSyncStep] = useState(0);
    const [syncProgress, setSyncProgress] = useState(0);
    const [lastSyncTime, setLastSyncTime] = useState("17 Mar 2026 · 14:30");
    const [logs, setLogs] = useState<IntegrationSyncLogRow[]>([]);
    const [stats, setStats] = useState<ParasutStats>({ customers: 0, synced_invoices: 0, pending_syncs: 0, failed_syncs: 0 });
    const [syncedOrders, setSyncedOrders] = useState<SalesOrderRow[]>([]);
    const [expandedError, setExpandedError] = useState<string | null>(null);
    const [retryingId, setRetryingId] = useState<string | null>(null);

    // Faz 11.4 — Sync log filtreleri
    const [logFilterStep,      setLogFilterStep]      = useState<string>("");
    const [logFilterErrorKind, setLogFilterErrorKind] = useState<string>("");
    const [logFilterStatus,    setLogFilterStatus]    = useState<string>("");

    // Faz 11.5 — OAuth refresh
    const [oauthRefreshing, setOauthRefreshing] = useState(false);

    const fetchAll = useCallback(async () => {
        try {
            const logsParams = new URLSearchParams({ limit: "50" });
            if (logFilterStep)      logsParams.set("step",       logFilterStep);
            if (logFilterErrorKind) logsParams.set("error_kind", logFilterErrorKind);
            if (logFilterStatus)    logsParams.set("status",     logFilterStatus);

            const [logsRes, statsRes, invoicesRes, configRes] = await Promise.all([
                fetch(`/api/parasut/logs?${logsParams.toString()}`),
                fetch("/api/parasut/stats"),
                fetch("/api/parasut/invoices"),
                fetch("/api/parasut/config"),
            ]);
            if (logsRes.ok) {
                const data = await logsRes.json();
                setLogs(Array.isArray(data) ? data : []);
            }
            if (statsRes.ok) {
                setStats(await statsRes.json());
            }
            if (invoicesRes.ok) {
                const data = await invoicesRes.json();
                setSyncedOrders(Array.isArray(data) ? data : []);
            }
            if (configRes.ok) {
                setConfig(await configRes.json());
            }
        } catch (err) {
            console.error("Failed to fetch parasut data:", err);
        }
    }, [logFilterStep, logFilterErrorKind, logFilterStatus]);

    // Fetch all data on mount
    useEffect(() => { fetchAll(); }, [fetchAll]);

    const runSync = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (syncStatus === "syncing") return;
        setSyncStatus("syncing");
        setSyncStep(1);
        setSyncProgress(20);
        try {
            setSyncStep(2);
            setSyncProgress(50);
            const res = await fetch("/api/parasut/sync-all", { method: "POST" });
            setSyncStep(3);
            setSyncProgress(80);
            if (res.ok) {
                const data = await res.json();
                setSyncProgress(100);
                setSyncStatus("done");
                setSyncStep(0);

                const now = new Date();
                const timeLabel = now.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
                    + " · " + now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
                setLastSyncTime(timeLabel);

                // Refetch all data
                await fetchAll();

                const msg = `${data.synced} fatura gönderildi${data.failed > 0 ? `, ${data.failed} hata` : ""}`;
                toast({ type: data.failed > 0 ? "warning" : "success", message: msg });
                setTimeout(() => setSyncStatus("idle"), 3000);
            } else {
                setSyncStatus("idle");
                toast({ type: "error", message: "Sync başarısız" });
            }
        } catch (err) {
            console.error("Sync failed:", err);
            setSyncStatus("idle");
            toast({ type: "error", message: "Sync başarısız" });
        }
    };

    const refreshOAuthToken = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (oauthRefreshing) return;
        setOauthRefreshing(true);
        try {
            const res = await fetch("/api/parasut/oauth/refresh", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast({ type: "success", message: "Token yenilendi" });
                await fetchAll();
            } else {
                toast({ type: "error", message: data.error ?? "Token yenilenemedi" });
            }
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Token yenilenemedi" });
        } finally {
            setOauthRefreshing(false);
        }
    };

    const retrySync = async (logId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (retryingId) return;
        setRetryingId(logId);
        try {
            const res = await fetch("/api/parasut/retry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sync_log_id: logId }),
            });
            if (res.ok) {
                toast({ type: "success", message: "Yeniden deneme başarılı" });
                await fetchAll();
            } else {
                const data = await res.json().catch(() => ({}));
                toast({ type: "error", message: data.error ?? "Yeniden deneme başarısız" });
            }
        } catch {
            toast({ type: "error", message: "Yeniden deneme başarısız" });
        } finally {
            setRetryingId(null);
        }
    };

    const syncStepLabel = ["", "Cariler sync ediliyor...", "Faturalar sync ediliyor...", "Ödemeler sync ediliyor..."][syncStep] || "";

    const scopeCards = useMemo(() => [
        { label: "Cariler", count: stats.customers, unit: "cari" },
        { label: "Faturalar", count: stats.synced_invoices, unit: "fatura" },
        { label: "Bekleyen", count: stats.pending_syncs, unit: "sipariş" },
    ], [stats]);

    return (
        <div style={{ padding: "0" }}>
            {/* Header */}
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
                    <h1 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Paraşüt Muhasebe Entegrasyonu
                    </h1>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        api.parasut.com · Otomatik sync: her 6 saatte bir
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button
                        onClick={runSync}
                        disabled={isDemo || syncStatus === "syncing" || connection === "disconnected"}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        style={{
                            fontSize: "12px",
                            padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)",
                            borderRadius: "6px",
                            background: syncStatus === "syncing" ? "var(--bg-tertiary)" : "var(--accent-bg)",
                            color: syncStatus === "syncing" ? "var(--text-tertiary)" : "var(--accent-text)",
                            cursor: isDemo || syncStatus === "syncing" || connection === "disconnected" ? "not-allowed" : "pointer",
                            opacity: isDemo || connection === "disconnected" ? 0.5 : 1,
                        }}
                    >
                        {syncStatus === "syncing" ? "Sync ediliyor..." : "▶ Manuel Sync"}
                    </button>
                </div>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

                {/* A -- Connection Status Card */}
                <div
                    style={{
                        background: "var(--bg-secondary)",
                        border: `0.5px solid ${connection === "connected" ? "var(--success-border)" : "var(--danger-border)"}`,
                        borderRadius: "8px",
                        padding: "16px 20px",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div
                                style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: connection === "connected" ? "var(--success)" : "var(--danger)",
                                    boxShadow: connection === "connected"
                                        ? "0 0 0 3px rgba(63, 185, 80, 0.2)"
                                        : "0 0 0 3px rgba(248, 81, 73, 0.2)",
                                }}
                            />
                            <span
                                style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: connection === "connected" ? "var(--success-text)" : "var(--danger-text)",
                                }}
                            >
                                {connection === "connected" ? "Bağlı" : "Bağlantı Yok"}
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                api.parasut.com · Son sync: {lastSyncTime}
                            </span>
                        </div>
                    </div>

                    {/* Credentials — masked values fetched server-side */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                        {[
                            { label: "Company ID", value: config?.companyId ?? "—" },
                            { label: "Client ID", value: config?.clientId ?? "—" },
                        ].map(({ label, value }) => (
                            <div key={label}>
                                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    {label}
                                </div>
                                <div
                                    style={{
                                        fontSize: "12px",
                                        color: "var(--text-primary)",
                                        fontFamily: "monospace",
                                        background: "var(--bg-tertiary)",
                                        padding: "5px 8px",
                                        borderRadius: "4px",
                                        border: "0.5px solid var(--border-tertiary)",
                                    }}
                                >
                                    {value}
                                </div>
                            </div>
                        ))}
                        <div>
                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Client Secret
                            </div>
                            <div
                                style={{
                                    fontSize: "12px",
                                    background: "var(--bg-tertiary)",
                                    padding: "5px 8px",
                                    borderRadius: "4px",
                                    border: "0.5px solid var(--border-tertiary)",
                                    color: config?.clientSecretConfigured ? "var(--success-text)" : "var(--warning-text)",
                                }}
                            >
                                {config === null ? "—" : config.clientSecretConfigured ? "Yapılandırıldı ✓" : "Eksik"}
                            </div>
                        </div>
                    </div>

                    {/* Faz 11.4/11.5 — OAuth Token Durumu */}
                    <div
                        style={{
                            marginTop: "12px",
                            paddingTop: "12px",
                            borderTop: "0.5px solid var(--border-tertiary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "10px",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                            <div>
                                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    OAuth Token
                                </div>
                                <div style={{ fontSize: "12px", color: stats.token?.connected ? "var(--success-text)" : "var(--danger-text)", fontWeight: 500 }}>
                                    {stats.token?.connected ? "Geçerli ✓" : "Yok / Süresi dolmuş"}
                                </div>
                            </div>
                            {stats.token?.expiresAt && (
                                <div>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                        Süre
                                    </div>
                                    <div style={{ fontSize: "12px", color: "var(--text-primary)", fontFamily: "monospace" }}>
                                        {stats.token.secondsRemaining !== null ? formatDuration(stats.token.secondsRemaining) : "—"}
                                    </div>
                                </div>
                            )}
                            {stats.token?.tokenVersion !== null && stats.token?.tokenVersion !== undefined && (
                                <div>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                        Versiyon
                                    </div>
                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                        v{stats.token.tokenVersion}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <a
                                href="/api/parasut/oauth/start"
                                style={{
                                    fontSize: "11px",
                                    padding: "5px 12px",
                                    border: "0.5px solid var(--accent-border)",
                                    borderRadius: "4px",
                                    background: "var(--accent-bg)",
                                    color: "var(--accent-text)",
                                    textDecoration: "none",
                                    pointerEvents: isDemo ? "none" : "auto",
                                    opacity: isDemo ? 0.5 : 1,
                                }}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : "OAuth akışını başlat"}
                            >
                                Paraşüt&apos;e bağlan
                            </a>
                            <button
                                type="button"
                                onClick={refreshOAuthToken}
                                disabled={isDemo || oauthRefreshing}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : "Refresh token ile access token yenile"}
                                style={{
                                    fontSize: "11px",
                                    padding: "5px 12px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "4px",
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-secondary)",
                                    cursor: isDemo || oauthRefreshing ? "not-allowed" : "pointer",
                                    opacity: isDemo || oauthRefreshing ? 0.5 : 1,
                                }}
                            >
                                {oauthRefreshing ? "Yenileniyor…" : "↻ Yenile"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sync Progress (when syncing or done) */}
                {syncStatus !== "idle" && (
                    <div
                        style={{
                            background: "var(--bg-secondary)",
                            border: `0.5px solid ${syncStatus === "done" ? "var(--success-border)" : "var(--warning-border)"}`,
                            borderRadius: "8px",
                            padding: "14px 20px",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                            <span style={{ fontSize: "13px", color: syncStatus === "done" ? "var(--success-text)" : "var(--warning-text)", fontWeight: 500 }}>
                                {syncStatus === "done"
                                    ? "✓ Sync tamamlandı"
                                    : syncStepLabel}
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                {syncStatus === "done" ? "100%" : `${syncProgress}%`}
                            </span>
                        </div>
                        <div style={{ height: "4px", background: "var(--bg-tertiary)", borderRadius: "2px", overflow: "hidden" }}>
                            <div
                                style={{
                                    height: "100%",
                                    width: `${syncStatus === "done" ? 100 : syncProgress}%`,
                                    background: syncStatus === "done" ? "var(--success)" : "var(--warning)",
                                    borderRadius: "2px",
                                    transition: "width 0.3s ease",
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* B -- Scope Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                    {scopeCards.map((card) => (
                        <div
                            key={card.label}
                            style={{
                                background: "var(--bg-secondary)",
                                border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "8px",
                                padding: "14px 16px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    {card.label}
                                </div>
                                <button
                                    onClick={runSync}
                                    disabled={isDemo || syncStatus === "syncing" || connection === "disconnected"}
                                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                    style={{
                                        fontSize: "10px",
                                        padding: "2px 7px",
                                        border: "0.5px solid var(--border-secondary)",
                                        borderRadius: "4px",
                                        background: "transparent",
                                        color: "var(--text-tertiary)",
                                        cursor: isDemo || syncStatus === "syncing" || connection === "disconnected" ? "not-allowed" : "pointer",
                                        opacity: isDemo || syncStatus === "syncing" || connection === "disconnected" ? 0.4 : 1,
                                    }}
                                >
                                    Sync Et
                                </button>
                            </div>
                            <div style={{ fontSize: "22px", fontWeight: 600, color: "var(--text-primary)" }}>
                                {card.count}
                                <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-tertiary)", marginLeft: "4px" }}>
                                    {card.unit}
                                </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                Son sync: {lastSyncTime}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Faz 11.4 — Step + Error Kind Dağılımı */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    {/* Step dağılımı */}
                    <div
                        style={{
                            background: "var(--bg-secondary)",
                            border: "0.5px solid var(--border-tertiary)",
                            borderRadius: "8px",
                            padding: "14px 16px",
                        }}
                    >
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                            Step Dağılımı
                        </div>
                        {(!stats.byStep || Object.keys(stats.byStep).length === 0) ? (
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Veri yok</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                {Object.entries(stats.byStep)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([step, count]) => (
                                        <button
                                            key={step}
                                            type="button"
                                            onClick={() => setLogFilterStep(logFilterStep === step ? "" : step)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                fontSize: "12px",
                                                padding: "5px 8px",
                                                borderRadius: "4px",
                                                border: logFilterStep === step
                                                    ? "0.5px solid var(--accent-border)"
                                                    : "0.5px solid transparent",
                                                background: logFilterStep === step ? "var(--accent-bg)" : "var(--bg-tertiary)",
                                                color: logFilterStep === step ? "var(--accent-text)" : "var(--text-secondary)",
                                                cursor: "pointer",
                                                textAlign: "left",
                                            }}
                                            title="Filtre olarak uygula"
                                        >
                                            <span>{STEP_LABELS_TR[step] ?? step}</span>
                                            <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{count}</span>
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>

                    {/* Error kind dağılımı */}
                    <div
                        style={{
                            background: "var(--bg-secondary)",
                            border: "0.5px solid var(--border-tertiary)",
                            borderRadius: "8px",
                            padding: "14px 16px",
                        }}
                    >
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                            Hata Tipi Dağılımı
                        </div>
                        {(!stats.byErrorKind || Object.keys(stats.byErrorKind).length === 0) ? (
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Hata yok</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                {Object.entries(stats.byErrorKind)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([kind, count]) => (
                                        <button
                                            key={kind}
                                            type="button"
                                            onClick={() => setLogFilterErrorKind(logFilterErrorKind === kind ? "" : kind)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                fontSize: "12px",
                                                padding: "5px 8px",
                                                borderRadius: "4px",
                                                border: logFilterErrorKind === kind
                                                    ? "0.5px solid var(--danger-border)"
                                                    : "0.5px solid transparent",
                                                background: logFilterErrorKind === kind ? "var(--danger-bg)" : "var(--bg-tertiary)",
                                                color: logFilterErrorKind === kind ? "var(--danger-text)" : "var(--text-secondary)",
                                                cursor: "pointer",
                                                textAlign: "left",
                                            }}
                                            title="Filtre olarak uygula"
                                        >
                                            <span>{ERROR_KIND_LABELS_TR[kind] ?? kind}</span>
                                            <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{count}</span>
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* C -- Son Faturalar (otomatik gonderilen) */}
                <div
                    style={{
                        background: "var(--bg-secondary)",
                        border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "8px",
                        overflowX: "auto",
                    }}
                >
                    <div
                        style={{
                            padding: "12px 16px",
                            borderBottom: "0.5px solid var(--border-tertiary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>
                            Son Faturalar
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                            Otomatik gönderilen · {syncedOrders.length} fatura
                        </div>
                    </div>

                    {syncedOrders.length === 0 ? (
                        <div style={{ padding: "20px 16px", fontSize: "12px", color: "var(--text-tertiary)", textAlign: "center" }}>
                            Henüz otomatik gönderilen fatura yok. Bir sipariş &quot;Sevk Edildi&quot; durumuna geçince buraya eklenir.
                        </div>
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Fatura No</th>
                                    <th style={thStyle}>Sipariş No</th>
                                    <th style={thStyle}>Müşteri</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Döviz</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Gönderim</th>
                                </tr>
                            </thead>
                            <tbody>
                                {syncedOrders.map(order => (
                                    <tr key={order.id}>
                                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: "var(--accent-text)" }}>
                                            {order.parasut_invoice_id}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: "12px", color: "var(--text-secondary)" }}>
                                            {order.order_number}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: "12px" }}>
                                            {order.customer_name}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", fontWeight: 500 }}>
                                            {(order.grand_total ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "var(--text-tertiary)" }}>
                                            {order.currency}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right" }}>
                                            <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                                                {order.parasut_sent_at ? formatDateTime(order.parasut_sent_at) : "—"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* D -- Sync Log Table */}
                <div
                    style={{
                        background: "var(--bg-secondary)",
                        border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "8px",
                        overflowX: "auto",
                    }}
                >
                    <div
                        style={{
                            padding: "12px 16px",
                            borderBottom: "0.5px solid var(--border-tertiary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px",
                        }}
                    >
                        <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>
                            Sync Geçmişi
                        </div>
                        {/* Faz 11.4 — Filtreler */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                            <select
                                value={logFilterStep}
                                onChange={(e) => setLogFilterStep(e.target.value)}
                                style={{
                                    fontSize: "11px",
                                    padding: "4px 6px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "4px",
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                <option value="">Tüm step&apos;ler</option>
                                {["contact", "product", "shipment", "invoice", "edoc", "done"].map(s => (
                                    <option key={s} value={s}>{STEP_LABELS_TR[s] ?? s}</option>
                                ))}
                            </select>
                            <select
                                value={logFilterErrorKind}
                                onChange={(e) => setLogFilterErrorKind(e.target.value)}
                                style={{
                                    fontSize: "11px",
                                    padding: "4px 6px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "4px",
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                <option value="">Tüm hata tipleri</option>
                                {Object.keys(ERROR_KIND_LABELS_TR).map(k => (
                                    <option key={k} value={k}>{ERROR_KIND_LABELS_TR[k]}</option>
                                ))}
                            </select>
                            <select
                                value={logFilterStatus}
                                onChange={(e) => setLogFilterStatus(e.target.value)}
                                style={{
                                    fontSize: "11px",
                                    padding: "4px 6px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "4px",
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                <option value="">Tüm durumlar</option>
                                <option value="success">Başarılı</option>
                                <option value="error">Hata</option>
                                <option value="retrying">Yeniden deneniyor</option>
                                <option value="pending">Bekliyor</option>
                            </select>
                            {(logFilterStep || logFilterErrorKind || logFilterStatus) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLogFilterStep("");
                                        setLogFilterErrorKind("");
                                        setLogFilterStatus("");
                                    }}
                                    style={{
                                        fontSize: "11px",
                                        padding: "4px 8px",
                                        border: "0.5px solid var(--border-secondary)",
                                        borderRadius: "4px",
                                        background: "transparent",
                                        color: "var(--text-tertiary)",
                                        cursor: "pointer",
                                    }}
                                >
                                    Temizle
                                </button>
                            )}
                        </div>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Tarih</th>
                                <th style={thStyle}>Sonuç</th>
                                <th style={thStyle}>Entity</th>
                                <th style={thStyle}>Step</th>
                                <th style={thStyle}>Hata Tipi</th>
                                <th style={thStyle}>Dış ID</th>
                                <th style={thStyle}>Hata</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Aksiyon</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--text-tertiary)" }}>
                                        Henüz sync geçmişi yok
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const isSuccess = log.status === "success";
                                    const isError = log.status === "error";
                                    const isExpanded = expandedError === log.id;
                                    const maxRetries = (log.retry_count ?? 0) >= 3;
                                    return (
                                        <tr
                                            key={log.id}
                                            style={{
                                                background: isSuccess ? "transparent" : isError ? "var(--danger-bg)" : "transparent",
                                            }}
                                        >
                                            <td style={tdStyle}>
                                                <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                                                    {formatDateTime(log.requested_at)}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                {isSuccess ? (
                                                    <span style={{ color: "var(--success-text)", fontSize: "12px" }}>{"✓"} Başarılı</span>
                                                ) : (
                                                    <span style={{ color: "var(--danger-text)", fontSize: "12px" }}>{"✕"} Hata</span>
                                                )}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "12px", color: "var(--text-secondary)" }}>
                                                {log.entity_type}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "12px", color: "var(--text-secondary)" }}>
                                                {log.step ? (STEP_LABELS_TR[log.step] ?? log.step) : "—"}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "12px", color: log.error_kind ? "var(--danger-text)" : "var(--text-tertiary)" }}>
                                                {log.error_kind ? (ERROR_KIND_LABELS_TR[log.error_kind] ?? log.error_kind) : "—"}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "12px", color: "var(--text-secondary)" }}>
                                                {log.external_id || "—"}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "11px", color: "var(--danger-text)", maxWidth: "200px" }}>
                                                {log.error_message ? (
                                                    <span
                                                        onClick={() => setExpandedError(isExpanded ? null : log.id)}
                                                        style={{ cursor: "pointer" }}
                                                        title={isExpanded ? "Küçült" : "Genişlet"}
                                                    >
                                                        {isExpanded ? log.error_message : log.error_message.substring(0, 80)}
                                                        {!isExpanded && log.error_message.length > 80 && "…"}
                                                    </span>
                                                ) : "—"}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: "center" }}>
                                                {isError && (
                                                    maxRetries ? (
                                                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                                            Maks. deneme ({log.retry_count}/3)
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => retrySync(log.id)}
                                                            disabled={isDemo || retryingId === log.id}
                                                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                                            style={{
                                                                fontSize: "11px",
                                                                padding: "3px 8px",
                                                                border: "0.5px solid var(--warning-border)",
                                                                borderRadius: "4px",
                                                                background: "var(--warning-bg)",
                                                                color: "var(--warning-text)",
                                                                cursor: isDemo || retryingId === log.id ? "not-allowed" : "pointer",
                                                                opacity: isDemo || retryingId === log.id ? 0.5 : 1,
                                                            }}
                                                        >
                                                            {retryingId === log.id ? "..." : `↻ Dene (${log.retry_count ?? 0}/3)`}
                                                        </button>
                                                    )
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
