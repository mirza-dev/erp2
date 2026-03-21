"use client";

import { useState, useMemo } from "react";
import { useData } from "@/lib/data-context";
import { formatCurrency } from "@/lib/utils";
import DemoBanner from "@/components/ui/DemoBanner";
import { useToast } from "@/components/ui/Toast";

type SyncStatus = "idle" | "syncing" | "done";
type ConnectionStatus = "connected" | "disconnected";

interface SyncLog {
    id: string;
    date: string;
    success: boolean;
    customers: number;
    invoices: number;
    payments: number;
    durationSec: number;
    error?: string;
}

const mockLogs: SyncLog[] = [
    { id: "l1", date: "2026-03-17T14:30:00", success: true,  customers: 2,  invoices: 5,  payments: 3,  durationSec: 4 },
    { id: "l2", date: "2026-03-17T12:00:00", success: true,  customers: 0,  invoices: 12, payments: 8,  durationSec: 3 },
    { id: "l3", date: "2026-03-16T22:00:00", success: false, customers: 0,  invoices: 0,  payments: 0,  durationSec: 2, error: "API rate limit aşıldı (429). 1 saat sonra tekrar deneyin." },
    { id: "l4", date: "2026-03-16T18:00:00", success: true,  customers: 1,  invoices: 7,  payments: 4,  durationSec: 4 },
    { id: "l5", date: "2026-03-16T12:00:00", success: true,  customers: 3,  invoices: 9,  payments: 6,  durationSec: 5 },
    { id: "l6", date: "2026-03-15T22:00:00", success: true,  customers: 0,  invoices: 4,  payments: 11, durationSec: 3 },
    { id: "l7", date: "2026-03-15T14:00:00", success: true,  customers: 5,  invoices: 18, payments: 9,  durationSec: 6 },
    { id: "l8", date: "2026-03-15T08:00:00", success: true,  customers: 1,  invoices: 3,  payments: 2,  durationSec: 3 },
];

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
    const { orderDetails } = useData();
    const { toast } = useToast();

    const syncedOrders = useMemo(() =>
        orderDetails
            .filter(o => o.parasutInvoiceId && o.parasutSentAt)
            .sort((a, b) => new Date(b.parasutSentAt!).getTime() - new Date(a.parasutSentAt!).getTime()),
        [orderDetails]
    );

    const [connection, setConnection] = useState<ConnectionStatus>("connected");
    const [showCredentials, setShowCredentials] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const [syncStep, setSyncStep] = useState(0); // 0=idle, 1=cariler, 2=faturalar, 3=ödemeler
    const [syncProgress, setSyncProgress] = useState(0);
    const [lastSyncTime, setLastSyncTime] = useState("17 Mar 2026 · 14:30");
    const [logs, setLogs] = useState<SyncLog[]>(mockLogs);

    const runSync = () => {
        if (syncStatus === "syncing") return;
        setSyncStatus("syncing");
        setSyncStep(1);
        setSyncProgress(15);

        setTimeout(() => { setSyncProgress(33); }, 300);
        setTimeout(() => { setSyncStep(2); setSyncProgress(50); }, 700);
        setTimeout(() => { setSyncProgress(66); }, 1000);
        setTimeout(() => { setSyncStep(3); setSyncProgress(83); }, 1400);
        setTimeout(() => { setSyncProgress(100); }, 1800);
        setTimeout(() => {
            setSyncStatus("done");
            setSyncStep(0);

            const now = new Date();
            const timeLabel = now.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
                + " · " + now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
            setLastSyncTime(timeLabel);

            const newLog: SyncLog = {
                id: `l-${Date.now()}`,
                date: now.toISOString(),
                success: true,
                customers: 2,
                invoices: 5,
                payments: 3,
                durationSec: 3,
            };
            setLogs(prev => [newLog, ...prev]);

            toast({ type: "success", message: "Sync tamamlandı — 5 fatura · 3 ödeme · 2 cari" });
        }, 2100);
        setTimeout(() => { setSyncStatus("idle"); }, 4100);
    };

    const syncStepLabel = ["", "Cariler sync ediliyor...", "Faturalar sync ediliyor...", "Ödemeler sync ediliyor..."][syncStep] || "";

    const scopeCards = useMemo(() => [
        { label: "Cariler", count: 47, unit: "cari" },
        { label: "Faturalar", count: 128, unit: "fatura" },
        { label: "Ödemeler", count: 94, unit: "ödeme" },
    ], []);

    return (
        <div style={{ padding: "0" }}>
            <DemoBanner storageKey="parasut-demo">
                Paraşüt entegrasyonu demo modunda çalışmaktadır. Gerçek API bağlantısı yakında aktif olacak.
            </DemoBanner>
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
                        {syncStatus === "syncing" ? "Sync ediliyor..." : "▶ Manuel Sync"}
                    </button>
                    <button
                        onClick={() => {
                            const next = connection === "connected" ? "disconnected" : "connected";
                            setConnection(next);
                            toast({
                                type: next === "connected" ? "success" : "warning",
                                message: next === "connected" ? "Paraşüt bağlantısı kuruldu" : "Paraşüt bağlantısı kesildi",
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
                        {connection === "connected" ? "Bağlantıyı Kes" : "Bağlan"}
                    </button>
                </div>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

                {/* A — Connection Status Card */}
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
                        <button
                            onClick={() => {
                                const next = !showCredentials;
                                setShowCredentials(next);
                                toast({ type: "info", message: next ? "API kimlik bilgileri gösterildi" : "API kimlik bilgileri gizlendi" });
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
                            {showCredentials ? "Gizle" : "Göster"}
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
                        {syncStatus === "done" && (
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                                47 cari güncellendi · 12 yeni fatura · 8 ödeme · 0 hata
                            </div>
                        )}
                    </div>
                )}

                {/* B — Scope Cards */}
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

                {/* C — Son Faturalar (otomatik gönderilen) */}
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
                                            {order.parasutInvoiceId}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: "12px", color: "var(--text-secondary)" }}>
                                            {order.orderNumber}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: "12px" }}>
                                            {order.customerName}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", fontWeight: 500 }}>
                                            {formatCurrency(order.grandTotal, order.currency)}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "var(--text-tertiary)" }}>
                                            {order.currency}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right" }}>
                                            <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                                                {formatDateTime(order.parasutSentAt!)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* D — Sync Log Table */}
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
                        Sync Geçmişi
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Tarih</th>
                                <th style={thStyle}>Sonuç</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Cariler</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Faturalar</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Ödemeler</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Süre</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr
                                    key={log.id}
                                    style={{
                                        background: log.success ? "transparent" : "var(--danger-bg)",
                                    }}
                                >
                                    <td style={tdStyle}>
                                        <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                                            {formatDateTime(log.date)}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>
                                        {log.success ? (
                                            <span style={{ color: "var(--success-text)", fontSize: "12px" }}>✓ Başarılı</span>
                                        ) : (
                                            <div>
                                                <span style={{ color: "var(--danger-text)", fontSize: "12px" }}>✕ Hata</span>
                                                <div style={{ fontSize: "11px", color: "var(--danger-text)", opacity: 0.8, marginTop: "1px" }}>
                                                    {log.error}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: log.customers > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                                        {log.success ? `+${log.customers}` : "—"}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: log.invoices > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                                        {log.success ? `+${log.invoices}` : "—"}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: log.payments > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                                        {log.success ? `+${log.payments}` : "—"}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "var(--text-tertiary)" }}>
                                        {log.success ? `${log.durationSec}s` : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
