"use client";

import { useState, useEffect, useCallback } from "react";

interface OpsMetrics {
    criticalStockCount: number;
    warningStockCount: number;
    atRiskCount: number;
    pendingOrderCount: number;
    approvedOrderCount: number;
    highRiskOrderCount: number;
    openAlertCount: number;
    topCriticalItems: { name: string; available: number; min: number; coverageDays: number | null }[];
}

interface OpsSummaryResponse {
    ai_available: boolean;
    metrics?: OpsMetrics;
    summary: string;
    insights: string[];
    anomalies: string[];
    confidence: number;
    generatedAt: string;
}

type CardState = "loading" | "loaded" | "error" | "disabled";

const CACHE_KEY = "kokpit_ops_summary";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 dakika

interface CacheEntry {
    data: OpsSummaryResponse;
    state: CardState;
    cachedAt: number;
}

function readCache(): CacheEntry | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
        return entry;
    } catch { return null; }
}

function writeCache(data: OpsSummaryResponse, state: CardState) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, state, cachedAt: Date.now() }));
    } catch { /* storage full — non-fatal */ }
}

function MetricsContextBar({ metrics }: { metrics: OpsMetrics }) {
    const items: { label: string; value: number; danger?: boolean }[] = [
        { label: "kritik stok", value: metrics.criticalStockCount, danger: true },
        { label: "uyarı stok", value: metrics.warningStockCount },
        { label: "AI risk", value: metrics.atRiskCount, danger: metrics.atRiskCount > 0 },
        { label: "bekleyen sipariş", value: metrics.pendingOrderCount },
        { label: "onaylı sipariş", value: metrics.approvedOrderCount },
        { label: "yüksek riskli", value: metrics.highRiskOrderCount, danger: true },
        { label: "açık uyarı", value: metrics.openAlertCount },
    ];

    return (
        <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            alignItems: "center",
            borderBottom: "1px solid var(--border-tertiary)",
            paddingBottom: "10px",
            marginBottom: "12px",
        }}>
            {items.map((item, i) => (
                <span key={item.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{
                        fontSize: "11px",
                        color: item.danger && item.value > 0 ? "var(--danger-text)" : "var(--text-tertiary)",
                    }}>
                        {item.value} {item.label}
                    </span>
                    {i < items.length - 1 && (
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>·</span>
                    )}
                </span>
            ))}
        </div>
    );
}

function DeterministicSummary({ metrics }: { metrics: OpsMetrics }) {
    const lines: string[] = [];
    if (metrics.criticalStockCount > 0)
        lines.push(`${metrics.criticalStockCount} ürün kritik stok seviyesinde.`);
    if (metrics.highRiskOrderCount > 0)
        lines.push(`${metrics.highRiskOrderCount} yüksek riskli sipariş inceleme bekliyor.`);
    if (metrics.pendingOrderCount > 0)
        lines.push(`${metrics.pendingOrderCount} sipariş onay bekliyor.`);
    if (metrics.openAlertCount > 0)
        lines.push(`${metrics.openAlertCount} açık uyarı bulunuyor.`);
    if (lines.length === 0)
        lines.push("Tüm operasyonel metrikler normal seviyelerde.");

    return (
        <div>
            {lines.map((line, i) => (
                <p key={i} style={{
                    fontSize: "13px",
                    lineHeight: 1.6,
                    color: "var(--text-primary)",
                    margin: "0 0 6px 0",
                }}>
                    {line}
                </p>
            ))}
            {metrics.topCriticalItems.length > 0 && (
                <ul style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "8px 0 0 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                }}>
                    {metrics.topCriticalItems.map((item, i) => (
                        <li key={i} style={{
                            fontSize: "12px",
                            color: "var(--danger-text)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "6px",
                        }}>
                            <span style={{ flexShrink: 0 }}>▸</span>
                            <span>
                                {item.name}: {item.available}/{item.min} adet
                                {" "}(kalan: {item.coverageDays ?? "?"} gün)
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function AISummaryCard() {
    const [state, setState] = useState<CardState>("loading");
    const [data, setData] = useState<OpsSummaryResponse | null>(null);
    const [fromCache, setFromCache] = useState(false);

    const fetchSummary = useCallback(async (bypassCache = false) => {
        if (!bypassCache) {
            const cached = readCache();
            if (cached) {
                setData(cached.data);
                setState(cached.state);
                setFromCache(true);
                return;
            }
        }
        setState("loading");
        setFromCache(false);
        try {
            const res = await fetch("/api/ai/ops-summary", { method: "POST" });
            if (!res.ok) throw new Error("API error");
            const result: OpsSummaryResponse = await res.json();
            setData(result);
            if (result.ai_available === false) {
                setState("disabled");
                writeCache(result, "disabled");
                return;
            }
            if (!result.summary) {
                setState("error");
                return;
            }
            setState("loaded");
            writeCache(result, "loaded");
        } catch {
            setState("error");
        }
    }, []);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    if (state === "loading") {
        return (
            <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--accent-border)",
                borderLeft: "3px solid var(--accent)",
                borderRadius: "8px",
                padding: "20px 24px",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                        width: "14px",
                        height: "14px",
                        border: "2px solid var(--accent)",
                        borderTop: "2px solid transparent",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                    }} />
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        AI analizi yükleniyor...
                    </span>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (state === "disabled") {
        return (
            <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--accent-border)",
                borderLeft: "3px solid var(--accent)",
                borderRadius: "8px",
                padding: "20px 24px",
            }}>
                {/* Header */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "14px",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--accent-text)",
                        }}>
                            Operasyon Özeti
                        </span>
                        <span style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background: "var(--accent-bg)",
                            color: "var(--accent-text)",
                            border: "1px solid var(--accent-border)",
                        }}>
                            Otomatik
                        </span>
                    </div>
                </div>
                {data?.metrics && <MetricsContextBar metrics={data.metrics} />}
                {data?.metrics && <DeterministicSummary metrics={data.metrics} />}
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "12px" }}>
                    AI servisi yapılandırılmamış — veriye dayalı özet gösteriliyor.
                </div>
            </div>
        );
    }

    if (state === "error") {
        return (
            <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-secondary)",
                borderLeft: "3px solid var(--border-primary)",
                borderRadius: "8px",
                padding: "20px 24px",
            }}>
                {/* Header */}
                <div style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-tertiary)",
                    marginBottom: "14px",
                }}>
                    AI Operasyon Özeti
                </div>
                {data?.metrics && <MetricsContextBar metrics={data.metrics} />}
                {data?.metrics && <DeterministicSummary metrics={data.metrics} />}
                <div style={{
                    background: "var(--warning-bg)",
                    border: "1px solid var(--warning-border)",
                    borderRadius: "6px",
                    padding: "10px 14px",
                    marginTop: data?.metrics ? "12px" : "0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                }}>
                    <span style={{ fontSize: "12px", color: "var(--warning-text)" }}>
                        AI servisi yanıt vermedi.
                    </span>
                    <button
                        onClick={() => fetchSummary(true)}
                        style={{
                            fontSize: "11px",
                            padding: "4px 10px",
                            border: "1px solid var(--warning-border)",
                            borderRadius: "5px",
                            background: "transparent",
                            color: "var(--warning-text)",
                            cursor: "pointer",
                            flexShrink: 0,
                        }}
                    >
                        Tekrar Dene
                    </button>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const timeStr = new Date(data.generatedAt).toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--accent-border)",
            borderLeft: "3px solid var(--accent)",
            borderRadius: "8px",
            padding: "20px 24px",
        }}>
            {/* Header */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "14px",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--accent-text)",
                    }}>
                        AI Operasyon Özeti
                    </span>
                    <span style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: "var(--accent-bg)",
                        color: "var(--accent-text)",
                        border: "1px solid var(--accent-border)",
                    }}>
                        Güven: %{Math.round(data.confidence * 100)}
                    </span>
                    <span style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: "var(--accent-bg)",
                        color: "var(--accent-text)",
                        border: "1px solid var(--accent-border)",
                    }}>
                        AI
                    </span>
                </div>
                <button
                    onClick={() => fetchSummary(true)}
                    style={{
                        fontSize: "11px",
                        padding: "4px 10px",
                        border: "1px solid var(--border-secondary)",
                        borderRadius: "5px",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                    }}
                >
                    Yenile
                </button>
            </div>

            {/* Metrics context bar */}
            {data.metrics && <MetricsContextBar metrics={data.metrics} />}

            {/* Summary */}
            <p style={{
                fontSize: "13px",
                lineHeight: 1.6,
                color: "var(--text-primary)",
                margin: "0 0 14px 0",
            }}>
                {data.summary}
            </p>

            {/* Insights */}
            {data.insights.length > 0 && (
                <>
                    <ul style={{
                        listStyle: "none",
                        padding: 0,
                        margin: "0 0 14px 0",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                    }}>
                        {data.insights.map((item, i) => (
                            <li key={i} style={{
                                fontSize: "12px",
                                color: "var(--text-primary)",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "8px",
                            }}>
                                <span style={{
                                    color: "var(--accent-text)",
                                    fontWeight: 700,
                                    fontSize: "10px",
                                    marginTop: "2px",
                                    flexShrink: 0,
                                }}>
                                    ●
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>
                    <div style={{
                        display: "flex", gap: "12px", flexWrap: "wrap",
                        marginTop: "-4px", paddingTop: "10px",
                        borderTop: "0.5px solid var(--border-tertiary)",
                        marginBottom: "14px",
                    }}>
                        {[
                            { label: "Uyarılar", href: "/dashboard/alerts" },
                            { label: "Ürünler", href: "/dashboard/products" },
                            { label: "Siparişler", href: "/dashboard/orders" },
                            { label: "Satın Alma", href: "/dashboard/purchase/suggested" },
                        ].map(link => (
                            <a key={link.href} href={link.href} style={{
                                fontSize: "11px", color: "var(--accent-text)",
                                textDecoration: "none", fontWeight: 500,
                            }}>
                                {link.label} →
                            </a>
                        ))}
                    </div>
                </>
            )}

            {/* Anomalies */}
            {data.anomalies.length > 0 && (
                <div style={{
                    background: "var(--danger-bg)",
                    border: "1px solid var(--danger-border)",
                    borderRadius: "6px",
                    padding: "10px 14px",
                    marginBottom: "10px",
                }}>
                    <div style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--danger-text)",
                        marginBottom: "6px",
                    }}>
                        Anomali Tespiti
                    </div>
                    {data.anomalies.map((a, i) => (
                        <div key={i} style={{
                            fontSize: "12px",
                            color: "var(--danger-text)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "6px",
                            marginTop: i > 0 ? "4px" : 0,
                        }}>
                            <span style={{ flexShrink: 0 }}>⚠</span>
                            {a}
                        </div>
                    ))}
                </div>
            )}

            {/* Timestamp */}
            <div style={{
                fontSize: "10px",
                color: "var(--text-tertiary)",
                textAlign: "right",
            }}>
                Son güncelleme: {timeStr}{fromCache ? " (önbellekten)" : ""}
            </div>
        </div>
    );
}
