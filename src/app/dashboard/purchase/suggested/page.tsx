"use client";

import { useState, useEffect } from "react";
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

function WhyBadge({ daysLeft, urgency }: { daysLeft: number | null; urgency: number }) {
    const lines: { text: string; color: string; bg: string }[] = [];

    if (daysLeft !== null && daysLeft <= 7) {
        lines.push({ text: "⚡ 7 günde tükeniyor", color: "var(--danger-text)", bg: "var(--danger-bg)" });
    } else if (daysLeft !== null && daysLeft <= 14) {
        lines.push({ text: "⚠ 14 günde tükeniyor", color: "var(--warning-text)", bg: "var(--warning-bg)" });
    } else if (daysLeft === null) {
        lines.push({ text: "Günlük kullanım verisi yok — stok min altında", color: "var(--warning-text)", bg: "var(--warning-bg)" });
    }

    if (urgency >= 80) {
        lines.push({ text: `Kritik: min'in %${urgency - 100 < 0 ? Math.abs(urgency - 100) : urgency} altında`, color: "var(--danger-text)", bg: "var(--danger-bg)" });
    }

    if (lines.length === 0) return null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "4px" }}>
            {lines.map((l, i) => (
                <span key={i} style={{
                    display: "inline-block",
                    fontSize: "10px",
                    fontWeight: 500,
                    background: l.bg,
                    color: l.color,
                    padding: "1px 6px",
                    borderRadius: "3px",
                    width: "fit-content",
                }}>
                    {l.text}
                </span>
            ))}
        </div>
    );
}

function SegmentBanner({ filter, rawCount, finishedCount, rawItems, finishedItems }: {
    filter: FilterType;
    rawCount: number;
    finishedCount: number;
    rawItems: { reorderQty?: number; price?: number }[];
    finishedItems: { reorderQty?: number }[];
}) {
    if (filter === "all") return null;

    if (filter === "raw_material") {
        const totalOrderValue = rawItems.reduce((sum, p) => {
            const qty = p.reorderQty ?? 0;
            const price = p.price ?? 0;
            return sum + qty * price;
        }, 0);
        return (
            <div style={{
                marginTop: "12px",
                padding: "12px 16px",
                background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
            }}>
                <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--warning-text)" }}>
                        Tedarikçi ile sipariş verilmesi gereken {rawCount} hammadde
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        Minimum stok seviyesinin altında — tedarik süreci başlatılmalı
                    </div>
                </div>
                {totalOrderValue > 0 && (
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--warning-text)", whiteSpace: "nowrap" }}>
                        Toplam sipariş: {totalOrderValue.toLocaleString("tr-TR", { minimumFractionDigits: 0 })} ₺
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{
            marginTop: "12px",
            padding: "12px 16px",
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
        }}>
            <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-text)" }}>
                    Üretim emri bekleyen {finishedCount} ürün
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                    Üretim kapasitesine göre önceliklendirin — kritik olanlar önce planlanmalı
                </div>
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-text)", whiteSpace: "nowrap" }}>
                {finishedCount} üretim planı bekliyor
            </div>
        </div>
    );
}

export default function PurchaseSuggestedPage() {
    const { reorderSuggestions } = useData();
    const [filter, setFilter] = useState<FilterType>("all");
    const [windowWidth, setWindowWidth] = useState(
        typeof window !== "undefined" ? window.innerWidth : 1200
    );

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const isMobile = windowWidth < 768;

    const rawItems = reorderSuggestions.filter(p => p.productType === "raw_material");
    const finishedItems = reorderSuggestions.filter(p => p.productType === "finished");

    const filtered = filter === "all"
        ? reorderSuggestions
        : reorderSuggestions.filter(p => p.productType === filter);

    const sorted = [...filtered].sort((a, b) => {
        const urgA = (1 - a.available_now / a.minStockLevel);
        const urgB = (1 - b.available_now / b.minStockLevel);
        return urgB - urgA;
    });

    const avgRisk = reorderSuggestions.length > 0
        ? Math.round(reorderSuggestions.reduce((sum, p) => sum + (1 - p.available_now / p.minStockLevel) * 100, 0) / reorderSuggestions.length)
        : 0;

    const mostUrgent = [...reorderSuggestions]
        .filter(p => p.dailyUsage)
        .sort((a, b) => (a.available_now / (a.dailyUsage ?? 1)) - (b.available_now / (b.dailyUsage ?? 1)))[0];

    const mostUrgentDays = mostUrgent?.dailyUsage
        ? Math.round(mostUrgent.available_now / mostUrgent.dailyUsage)
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

            {/* Segment banner */}
            <SegmentBanner
                filter={filter}
                rawCount={rawItems.length}
                finishedCount={finishedItems.length}
                rawItems={rawItems}
                finishedItems={finishedItems}
            />

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
            ) : isMobile ? (
                /* Mobile card layout */
                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    {sorted.map(p => {
                        const urgency = Math.round((1 - p.available_now / p.minStockLevel) * 100);
                        const stockPct = Math.min(100, Math.round((p.available_now / p.minStockLevel) * 100));
                        const deficit = p.minStockLevel - p.available_now;
                        const daysLeft = p.dailyUsage ? Math.round(p.available_now / p.dailyUsage) : null;
                        const isRaw = p.productType === "raw_material";
                        return (
                            <div key={p.id} style={{
                                border: "1px solid var(--border-secondary)",
                                borderRadius: "8px",
                                padding: "14px 16px",
                                background: urgency >= 80 ? "rgba(248,81,73,0.04)" : "var(--bg-secondary)",
                            }}>
                                {/* Type + Name row */}
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            display: "inline-block",
                                            padding: "1px 7px",
                                            borderRadius: "4px",
                                            fontSize: "10px",
                                            fontWeight: 600,
                                            background: isRaw ? "var(--danger-bg)" : "var(--accent-bg)",
                                            color: isRaw ? "var(--danger-text)" : "var(--accent-text)",
                                            marginBottom: "4px",
                                        }}>
                                            {isRaw ? "Hammadde" : "Bitmiş Ürün"}
                                        </span>
                                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                                            {p.name}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "monospace", marginTop: "2px" }}>
                                            {p.sku}
                                        </div>
                                        <WhyBadge daysLeft={daysLeft} urgency={urgency} />
                                    </div>
                                    <div style={{ fontSize: "18px", fontWeight: 700, color: urgency >= 80 ? "var(--danger-text)" : "var(--warning-text)", whiteSpace: "nowrap" }}>
                                        {urgency}%
                                    </div>
                                </div>

                                {/* Risk bar */}
                                <div style={{
                                    marginTop: "10px",
                                    height: "4px",
                                    background: "var(--bg-tertiary)",
                                    borderRadius: "2px",
                                    overflow: "hidden",
                                }}>
                                    <div style={{
                                        width: `${urgency}%`,
                                        height: "100%",
                                        background: urgency >= 80 ? "var(--danger)" : urgency >= 50 ? "var(--warning)" : "var(--accent)",
                                        borderRadius: "2px",
                                    }} />
                                </div>

                                {/* Stock details */}
                                <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap" }}>
                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                        <span style={{ color: "var(--text-tertiary)" }}>Mevcut:</span>{" "}
                                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{p.available_now.toLocaleString("tr-TR")}</span>
                                    </div>
                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                        <span style={{ color: "var(--text-tertiary)" }}>Min:</span>{" "}
                                        <span style={{ fontWeight: 600 }}>{p.minStockLevel.toLocaleString("tr-TR")}</span>
                                    </div>
                                    <div style={{ fontSize: "12px" }}>
                                        <span style={{ color: "var(--text-tertiary)" }}>Açık:</span>{" "}
                                        <span style={{ fontWeight: 700, color: "var(--danger-text)" }}>-{deficit.toLocaleString("tr-TR")}</span>
                                    </div>
                                </div>

                                {/* Recommended qty */}
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px" }}>
                                    <span style={{ color: "var(--text-tertiary)" }}>Önerilen:</span>{" "}
                                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                        {p.reorderQty?.toLocaleString("tr-TR") ?? "—"} {p.unit}
                                    </span>
                                </div>

                                {/* Durum badge */}
                                <div style={{ marginTop: "12px" }}>
                                    <span style={{
                                        fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px",
                                        background: "var(--warning-bg)", color: "var(--warning-text)",
                                        border: "0.5px solid var(--warning-border)",
                                    }}>
                                        {isRaw ? "📦 Tedarik Gerekli" : "🔧 Üretim Emri Açılmalı"}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Desktop table */
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
                                const urgency = Math.round((1 - p.available_now / p.minStockLevel) * 100);
                                const stockPct = Math.min(100, Math.round((p.available_now / p.minStockLevel) * 100));
                                const deficit = p.minStockLevel - p.available_now;
                                const daysLeft = p.dailyUsage ? Math.round(p.available_now / p.dailyUsage) : null;
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
                                        {/* Ürün Adı + Why */}
                                        <td style={{ padding: "10px 12px", maxWidth: "200px" }}>
                                            <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{p.name}</div>
                                            <WhyBadge daysLeft={daysLeft} urgency={urgency} />
                                        </td>
                                        {/* SKU */}
                                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "var(--text-secondary)", fontSize: "12px" }}>
                                            {p.sku}
                                        </td>
                                        {/* Depo */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                            {p.warehouse}
                                        </td>
                                        {/* Stok */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                                                {p.available_now.toLocaleString("tr-TR")}
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
                                        {/* Aksiyon */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <span style={{
                                                fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px",
                                                background: "var(--warning-bg)", color: "var(--warning-text)",
                                                border: "0.5px solid var(--warning-border)",
                                            }}>
                                                {isRaw ? "📦 Tedarik Gerekli" : "🔧 Üretim Emri Açılmalı"}
                                            </span>
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
