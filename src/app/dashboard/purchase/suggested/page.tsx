"use client";

import { useState } from "react";
import { useData } from "@/lib/data-context";

type FilterType = "all" | "raw_material" | "finished";

function daysColor(days: number | null) {
    if (days === null) return "var(--warning-text)";
    if (days <= 7) return "var(--danger-text)";
    if (days <= 14) return "var(--warning-text)";
    return "var(--text-secondary)";
}

function daysBg(days: number | null) {
    if (days === null) return "var(--warning-bg)";
    if (days <= 7) return "var(--danger-bg)";
    if (days <= 14) return "var(--warning-bg)";
    return "var(--bg-tertiary)";
}

export default function PurchaseSuggestedPage() {
    const { reorderSuggestions } = useData();
    const [filter, setFilter] = useState<FilterType>("all");

    const rawItems = reorderSuggestions.filter(p => p.productType === "raw_material");
    const finishedItems = reorderSuggestions.filter(p => p.productType === "finished");

    const filtered = filter === "all"
        ? reorderSuggestions
        : reorderSuggestions.filter(p => p.productType === filter);

    // Sort by urgency DESC
    const sorted = [...filtered].sort((a, b) => {
        const urgA = (1 - a.availableStock / a.minStockLevel);
        const urgB = (1 - b.availableStock / b.minStockLevel);
        return urgB - urgA;
    });

    // Summary stats
    const avgRisk = reorderSuggestions.length > 0
        ? Math.round(reorderSuggestions.reduce((sum, p) => sum + (1 - p.availableStock / p.minStockLevel) * 100, 0) / reorderSuggestions.length)
        : 0;

    const mostUrgent = [...reorderSuggestions]
        .filter(p => p.dailyUsage)
        .sort((a, b) => (a.availableStock / (a.dailyUsage ?? 1)) - (b.availableStock / (b.dailyUsage ?? 1)))[0];

    const mostUrgentDays = mostUrgent?.dailyUsage
        ? Math.round(mostUrgent.availableStock / mostUrgent.dailyUsage)
        : null;

    const tabs: { key: FilterType; label: string; count: number }[] = [
        { key: "all", label: "Tümü", count: reorderSuggestions.length },
        { key: "raw_material", label: "Hammadde", count: rawItems.length },
        { key: "finished", label: "Bitmiş Ürün", count: finishedItems.length },
    ];

    return (
        <div style={{ padding: "24px 32px" }}>
            {/* Header */}
            <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                Satın Alma Önerileri
            </h1>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                Minimum stok seviyesinin altına düşen ürünler · Öncelik sırasına göre
            </p>

            {/* Summary cards */}
            {reorderSuggestions.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "20px" }}>
                    {/* Toplam Kritik */}
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--danger-border)",
                        borderRadius: "8px",
                        padding: "14px 16px",
                    }}>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Toplam Kritik
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--danger-text)", marginTop: "4px", lineHeight: 1 }}>
                            {reorderSuggestions.length}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                            {rawItems.length} hammadde · {finishedItems.length} bitmiş ürün
                        </div>
                    </div>

                    {/* En Acil */}
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--warning-border)",
                        borderRadius: "8px",
                        padding: "14px 16px",
                    }}>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            En Acil
                        </div>
                        {mostUrgent ? (
                            <>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {mostUrgent.name}
                                </div>
                                <div style={{ marginTop: "4px" }}>
                                    <span style={{
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        background: daysBg(mostUrgentDays),
                                        color: daysColor(mostUrgentDays),
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                    }}>
                                        {mostUrgentDays !== null ? `${mostUrgentDays} gün kaldı` : "—"}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>—</div>
                        )}
                    </div>

                    {/* Ortalama Risk */}
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-secondary)",
                        borderRadius: "8px",
                        padding: "14px 16px",
                    }}>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Ortalama Risk Skoru
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: 700, color: avgRisk >= 70 ? "var(--danger-text)" : "var(--warning-text)", marginTop: "4px", lineHeight: 1 }}>
                            {avgRisk}%
                        </div>
                        <div style={{
                            marginTop: "6px",
                            height: "4px",
                            background: "var(--bg-tertiary)",
                            borderRadius: "2px",
                            overflow: "hidden",
                        }}>
                            <div style={{
                                width: `${avgRisk}%`,
                                height: "100%",
                                background: avgRisk >= 70 ? "var(--danger)" : "var(--warning)",
                                borderRadius: "2px",
                            }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
                {tabs.map(tab => {
                    const active = filter === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            style={{
                                padding: "6px 14px",
                                fontSize: "13px",
                                fontWeight: 500,
                                border: "1px solid",
                                borderColor: active ? "var(--accent-border)" : "var(--border-secondary)",
                                borderRadius: "6px",
                                background: active ? "var(--accent-bg)" : "transparent",
                                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            {tab.label}
                            <span style={{
                                fontSize: "11px",
                                background: active ? "var(--accent)" : "var(--bg-tertiary)",
                                color: active ? "#fff" : "var(--text-tertiary)",
                                padding: "1px 6px",
                                borderRadius: "8px",
                            }}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Table or empty state */}
            {sorted.length === 0 ? (
                <div style={{
                    marginTop: "48px",
                    textAlign: "center",
                    color: "var(--success-text)",
                    fontSize: "14px",
                }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>&#10003;</div>
                    Tüm stoklar minimum seviyenin üstünde.
                </div>
            ) : (
                <div style={{
                    marginTop: "16px",
                    border: "1px solid var(--border-secondary)",
                    borderRadius: "8px",
                    overflow: "hidden",
                }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                {["Tür", "Ürün Adı", "SKU", "Depo", "Stok", "Açık", "Risk Skoru", "Önerilen · Tükenme", "Durum"].map(h => (
                                    <th key={h} style={{
                                        padding: "10px 12px",
                                        textAlign: "left",
                                        fontWeight: 500,
                                        color: "var(--text-tertiary)",
                                        fontSize: "11px",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        borderBottom: "1px solid var(--border-secondary)",
                                        whiteSpace: "nowrap",
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((p, idx) => {
                                const urgency = Math.round((1 - p.availableStock / p.minStockLevel) * 100);
                                const stockPct = Math.min(100, Math.round((p.availableStock / p.minStockLevel) * 100));
                                const deficit = p.minStockLevel - p.availableStock;
                                const daysLeft = p.dailyUsage ? Math.round(p.availableStock / p.dailyUsage) : null;
                                const isRaw = p.productType === "raw_material";

                                return (
                                    <tr key={p.id} style={{
                                        borderBottom: idx < sorted.length - 1 ? "1px solid var(--border-tertiary)" : "none",
                                        background: urgency >= 80 ? "rgba(248,81,73,0.04)" : "transparent",
                                    }}>
                                        {/* Tür */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <span style={{
                                                display: "inline-block",
                                                padding: "2px 8px",
                                                borderRadius: "4px",
                                                fontSize: "11px",
                                                fontWeight: 600,
                                                background: isRaw ? "var(--danger-bg)" : "var(--accent-bg)",
                                                color: isRaw ? "var(--danger-text)" : "var(--accent-text)",
                                            }}>
                                                {isRaw ? "Hammadde" : "Bitmiş Ürün"}
                                            </span>
                                        </td>
                                        {/* Ürün Adı */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, maxWidth: "180px" }}>
                                            {p.name}
                                        </td>
                                        {/* SKU */}
                                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "var(--text-secondary)", fontSize: "12px" }}>
                                            {p.sku}
                                        </td>
                                        {/* Depo */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                            {p.warehouse}
                                        </td>
                                        {/* Stok — mini bar */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                                                {p.availableStock.toLocaleString("tr-TR")}
                                            </div>
                                            <div style={{
                                                width: "72px",
                                                height: "4px",
                                                background: "var(--bg-tertiary)",
                                                borderRadius: "2px",
                                                marginTop: "4px",
                                                overflow: "hidden",
                                            }}>
                                                <div style={{
                                                    width: `${stockPct}%`,
                                                    height: "100%",
                                                    background: isRaw ? "var(--danger)" : "var(--warning)",
                                                    borderRadius: "2px",
                                                }} />
                                            </div>
                                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                min {p.minStockLevel.toLocaleString("tr-TR")}
                                            </div>
                                        </td>
                                        {/* Açık */}
                                        <td style={{ padding: "10px 12px", color: "var(--danger-text)", fontWeight: 700, fontSize: "14px" }}>
                                            -{deficit.toLocaleString("tr-TR")}
                                        </td>
                                        {/* Risk Skoru */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <div style={{
                                                fontSize: "13px",
                                                fontWeight: 700,
                                                color: urgency >= 80 ? "var(--danger-text)" : urgency >= 50 ? "var(--warning-text)" : "var(--text-primary)",
                                            }}>
                                                {urgency}%
                                            </div>
                                            <div style={{
                                                width: "72px",
                                                height: "4px",
                                                background: "var(--bg-tertiary)",
                                                borderRadius: "2px",
                                                marginTop: "4px",
                                                overflow: "hidden",
                                            }}>
                                                <div style={{
                                                    width: `${urgency}%`,
                                                    height: "100%",
                                                    background: urgency >= 80 ? "var(--danger)" : urgency >= 50 ? "var(--warning)" : "var(--accent)",
                                                    borderRadius: "2px",
                                                }} />
                                            </div>
                                        </td>
                                        {/* Önerilen + Tükenme */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                                                {p.reorderQty?.toLocaleString("tr-TR") ?? "—"} {p.unit}
                                            </div>
                                            {daysLeft !== null && (
                                                <span style={{
                                                    display: "inline-block",
                                                    marginTop: "4px",
                                                    fontSize: "11px",
                                                    fontWeight: 700,
                                                    background: daysBg(daysLeft),
                                                    color: daysColor(daysLeft),
                                                    padding: "1px 7px",
                                                    borderRadius: "4px",
                                                }}>
                                                    {daysLeft} gün
                                                </span>
                                            )}
                                        </td>
                                        {/* Durum */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <div style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "5px",
                                                padding: "4px 10px",
                                                borderRadius: "4px",
                                                fontSize: "12px",
                                                fontWeight: 500,
                                                background: isRaw ? "var(--warning-bg)" : "var(--success-bg)",
                                                color: isRaw ? "var(--warning-text)" : "var(--success-text)",
                                                border: `1px solid ${isRaw ? "var(--warning-border)" : "var(--success-border)"}`,
                                                whiteSpace: "nowrap",
                                            }}>
                                                {isRaw ? "▲ Sipariş verilmeli" : "▶ Üretim emri verilmeli"}
                                            </div>
                                            {isRaw && p.preferredVendor && (
                                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                                                    {p.preferredVendor}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
