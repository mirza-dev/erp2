"use client";

import { useState, useEffect, useCallback } from "react";

interface OpsSummaryResult {
    summary: string;
    insights: string[];
    anomalies: string[];
    confidence: number;
    generatedAt: string;
}

type CardState = "loading" | "loaded" | "error";

export default function AISummaryCard() {
    const [state, setState] = useState<CardState>("loading");
    const [data, setData] = useState<OpsSummaryResult | null>(null);

    const fetchSummary = useCallback(async () => {
        setState("loading");
        try {
            const res = await fetch("/api/ai/ops-summary", { method: "POST" });
            if (!res.ok) throw new Error("API error");
            const result: OpsSummaryResult = await res.json();
            if (!result.summary) {
                setState("error");
                return;
            }
            setData(result);
            setState("loaded");
        } catch {
            setState("error");
        }
    }, []);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    if (state === "error") {
        return (
            <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-secondary)",
                borderRadius: "8px",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
            }}>
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                    AI operasyon ozeti su an kullanilamiyor.
                </span>
            </div>
        );
    }

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
                        AI ozet yukleniyor...
                    </span>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
                        AI Operasyon Ozeti
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
                        {Math.round(data.confidence * 100)}%
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
                    onClick={fetchSummary}
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
                Son guncelleme: {timeStr}
            </div>
        </div>
    );
}
