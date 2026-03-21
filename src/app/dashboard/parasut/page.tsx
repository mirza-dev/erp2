"use client";

import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/ui/Toast";
import type { IntegrationSyncLogRow } from "@/lib/database.types";

type SyncStatus = "idle" | "syncing" | "done";
type ConnectionStatus = "connected" | "disconnected";

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

    const [connection, setConnection] = useState<ConnectionStatus>("connected");
    const [showCredentials, setShowCredentials] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const [syncStep, setSyncStep] = useState(0);
    const [syncProgress, setSyncProgress] = useState(0);
    const [lastSyncTime, setLastSyncTime] = useState("17 Mar 2026 \u00b7 14:30");
    const [logs, setLogs] = useState<IntegrationSyncLogRow[]>([]);

    // Fetch sync logs from API on mount
    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch("/api/parasut/logs?limit=50");
                if (res.ok) {
                    const data = await res.json();
                    setLogs(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error("Failed to fetch parasut logs:", err);
            }
        };
        fetchLogs();
    }, []);

    const runSync = async () => {
        if (syncStatus === "syncing") return;
        setSyncStatus("syncing");
        setSyncStep(1);
        setSyncProgress(20);
        try {
            setSyncStep(2);
            setSyncProgress(50);
            const res = await fetch("/api/parasut/sync", { method: "POST" });
            setSyncStep(3);
            setSyncProgress(80);
            if (res.ok) {
                const data = await res.json();
                setSyncProgress(100);
                setSyncStatus("done");
                setSyncStep(0);

                const now = new Date();
                const timeLabel = now.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
                    + " \u00b7 " + now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
                setLastSyncTime(timeLabel);

                // Refetch logs
                const logsRes = await fetch("/api/parasut/logs?limit=50");
                if (logsRes.ok) {
                    const logsData = await logsRes.json();
                    setLogs(Array.isArray(logsData) ? logsData : []);
                }
                toast({ type: "success", message: data.message ?? "Sync tamamland\u0131" });
                // Auto-reset done status after 3 seconds
                setTimeout(() => setSyncStatus("idle"), 3000);
            } else {
                setSyncStatus("idle");
                toast({ type: "error", message: "Sync ba\u015Far\u0131s\u0131z" });
            }
        } catch (err) {
            console.error("Sync failed:", err);
            setSyncStatus("idle");
            toast({ type: "error", message: "Sync ba\u015Far\u0131s\u0131z" });
        }
    };

    const syncStepLabel = ["", "Cariler sync ediliyor...", "Faturalar sync ediliyor...", "\u00d6demeler sync ediliyor..."][syncStep] || "";

    // No synced orders yet — will be populated when orders reach "shipped" status
    const syncedOrders: { id: string; parasutInvoiceId: string; orderNumber: string; customerName: string; grandTotal: number; currency: string; parasutSentAt: string }[] = [];

    const scopeCards = useMemo(() => [
        { label: "Cariler", count: 47, unit: "cari" },
        { label: "Faturalar", count: 128, unit: "fatura" },
        { label: "\u00d6demeler", count: 94, unit: "\u00f6deme" },
    ], []);

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
                        Para\u015F\u00FCt Muhasebe Entegrasyonu
                    </h1>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        api.parasut.com \u00b7 Otomatik sync: her 6 saatte bir
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button
                        onClick={runSync}
                        disabled={syncStatus === "syncing" || connection === "disconnected"}
                        style={{
                            fontSize: "12px",
                            padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)",
                            borderRadius: "6px",
                            background: syncStatus === "syncing" ? "var(--bg-tertiary)" : "var(--accent-bg)",
                            color: syncStatus === "syncing" ? "var(--text-tertiary)" : "var(--accent-text)",
                            cursor: syncStatus === "syncing" || connection === "disconnected" ? "not-allowed" : "pointer",
                            opacity: connection === "disconnected" ? 0.5 : 1,
                        }}
                    >
                        {syncStatus === "syncing" ? "Sync ediliyor..." : "\u25b6 Manuel Sync"}
                    </button>
                    <button
                        onClick={() => {
                            const next = connection === "connected" ? "disconnected" : "connected";
                            setConnection(next);
                            toast({
                                type: next === "connected" ? "success" : "warning",
                                message: next === "connected" ? "Para\u015F\u00FCt ba\u011Flant\u0131s\u0131 kuruldu" : "Para\u015F\u00FCt ba\u011Flant\u0131s\u0131 kesildi",
                            });
                        }}
                        style={{
                            fontSize: "12px",
                            padding: "6px 14px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                        }}
                    >
                        {connection === "connected" ? "Ba\u011Flant\u0131y\u0131 Kes" : "Ba\u011Flan"}
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
                                {connection === "connected" ? "Ba\u011Fl\u0131" : "Ba\u011Flant\u0131 Yok"}
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                api.parasut.com \u00b7 Son sync: {lastSyncTime}
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                const next = !showCredentials;
                                setShowCredentials(next);
                                toast({ type: "info", message: next ? "API kimlik bilgileri g\u00f6sterildi" : "API kimlik bilgileri gizlendi" });
                            }}
                            style={{
                                fontSize: "11px",
                                padding: "4px 10px",
                                border: "0.5px solid var(--border-secondary)",
                                borderRadius: "6px",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                            }}
                        >
                            {showCredentials ? "Gizle" : "G\u00f6ster"}
                        </button>
                    </div>

                    {/* Credentials */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                        {[
                            { label: "Company ID", value: "pmt-endustriyel-9471" },
                            { label: "Client ID", value: "cl_k9x2m4nw8qabcdef" },
                            { label: "Client Secret", value: "cs_xK9mW2pQrTv3nLhBfZeYuD" },
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
                                        filter: showCredentials ? "none" : "blur(5px)",
                                        userSelect: showCredentials ? "text" : "none",
                                        transition: "filter 0.2s",
                                    }}
                                >
                                    {value}
                                </div>
                            </div>
                        ))}
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
                                    ? "\u2713 Sync tamamland\u0131"
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
                                    disabled={syncStatus === "syncing" || connection === "disconnected"}
                                    style={{
                                        fontSize: "10px",
                                        padding: "2px 7px",
                                        border: "0.5px solid var(--border-secondary)",
                                        borderRadius: "4px",
                                        background: "transparent",
                                        color: "var(--text-tertiary)",
                                        cursor: syncStatus === "syncing" || connection === "disconnected" ? "not-allowed" : "pointer",
                                        opacity: syncStatus === "syncing" || connection === "disconnected" ? 0.4 : 1,
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
                            Otomatik g\u00f6nderilen \u00b7 {syncedOrders.length} fatura
                        </div>
                    </div>

                    {syncedOrders.length === 0 ? (
                        <div style={{ padding: "20px 16px", fontSize: "12px", color: "var(--text-tertiary)", textAlign: "center" }}>
                            Hen\u00fcz otomatik g\u00f6nderilen fatura yok. Bir sipari\u015F &quot;Sevk Edildi&quot; durumuna ge\u00e7ince buraya eklenir.
                        </div>
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Fatura No</th>
                                    <th style={thStyle}>Sipari\u015F No</th>
                                    <th style={thStyle}>M\u00fc\u015Fteri</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>D\u00f6viz</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>G\u00f6nderim</th>
                                </tr>
                            </thead>
                            <tbody>
                                {syncedOrders.map(order => (
                                    <tr key={order.id}>
                                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: "var(--accent-text)" }}>
                                            {order.parasutInvoiceId}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: "12px", color: "var(--text-secondary)" }}>
                                            {order.orderNumber}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: "12px" }}>
                                            {order.customerName}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", fontWeight: 500 }}>
                                            {order.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "var(--text-tertiary)" }}>
                                            {order.currency}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right" }}>
                                            <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                                                {formatDateTime(order.parasutSentAt)}
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
                            fontSize: "12px",
                            fontWeight: 500,
                            color: "var(--text-secondary)",
                        }}
                    >
                        Sync Ge\u00e7mi\u015Fi
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Tarih</th>
                                <th style={thStyle}>Sonu\u00e7</th>
                                <th style={thStyle}>Entity</th>
                                <th style={thStyle}>D\u0131\u015F ID</th>
                                <th style={thStyle}>Hata</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--text-tertiary)" }}>
                                        Hen\u00fcz sync ge\u00e7mi\u015Fi yok
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const isSuccess = log.status === "success";
                                    return (
                                        <tr
                                            key={log.id}
                                            style={{
                                                background: isSuccess ? "transparent" : "var(--danger-bg)",
                                            }}
                                        >
                                            <td style={tdStyle}>
                                                <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                                                    {formatDateTime(log.requested_at)}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                {isSuccess ? (
                                                    <span style={{ color: "var(--success-text)", fontSize: "12px" }}>{"\u2713"} Ba\u015Far\u0131l\u0131</span>
                                                ) : (
                                                    <span style={{ color: "var(--danger-text)", fontSize: "12px" }}>{"\u2715"} Hata</span>
                                                )}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "12px", color: "var(--text-secondary)" }}>
                                                {log.entity_type}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "12px", color: "var(--text-secondary)" }}>
                                                {log.external_id || "\u2014"}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "11px", color: "var(--danger-text)" }}>
                                                {log.error_message ? log.error_message.substring(0, 40) : "\u2014"}
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
