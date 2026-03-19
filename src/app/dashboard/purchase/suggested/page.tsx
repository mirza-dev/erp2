"use client";

import { useState } from "react";
import { useData } from "@/lib/data-context";

type FilterType = "all" | "raw_material" | "finished";

export default function PurchaseSuggestedPage() {
    const { reorderSuggestions } = useData();
    const [filter, setFilter] = useState<FilterType>("all");

    const filtered = filter === "all"
        ? reorderSuggestions
        : reorderSuggestions.filter(p => p.productType === filter);

    const rawCount = reorderSuggestions.filter(p => p.productType === "raw_material").length;
    const finishedCount = reorderSuggestions.filter(p => p.productType === "finished").length;

    const tabs: { key: FilterType; label: string; count: number }[] = [
        { key: "all", label: "Tümü", count: reorderSuggestions.length },
        { key: "raw_material", label: "Hammadde", count: rawCount },
        { key: "finished", label: "Bitmiş Ürün", count: finishedCount },
    ];

    return (
        <div style={{ padding: "24px 32px" }}>
            {/* Header */}
            <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                Satın Alma Önerileri
            </h1>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                Minimum stok seviyesinin altına düşen ürünler
            </p>

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
            {filtered.length === 0 ? (
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
                    <table style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "13px",
                    }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                {["Tür", "Ürün Adı", "SKU", "Depo", "Mevcut", "Min. Seviye", "Açık", "Önerilen Miktar", "Durum"].map(h => (
                                    <th key={h} style={{
                                        padding: "10px 12px",
                                        textAlign: "left",
                                        fontWeight: 500,
                                        color: "var(--text-tertiary)",
                                        fontSize: "11px",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        borderBottom: "1px solid var(--border-secondary)",
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => {
                                const deficit = p.minStockLevel - p.availableStock;
                                const isRaw = p.productType === "raw_material";
                                return (
                                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                                        {/* Tür chip */}
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
                                        {/* Ürün adı */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500 }}>
                                            {p.name}
                                        </td>
                                        {/* SKU */}
                                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "var(--text-secondary)", fontSize: "12px" }}>
                                            {p.sku}
                                        </td>
                                        {/* Depo */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                                            {p.warehouse}
                                        </td>
                                        {/* Mevcut */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-primary)" }}>
                                            {p.availableStock.toLocaleString("tr-TR")}
                                        </td>
                                        {/* Min. Seviye */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                                            {p.minStockLevel.toLocaleString("tr-TR")}
                                        </td>
                                        {/* Açık */}
                                        <td style={{ padding: "10px 12px", color: "var(--danger-text)", fontWeight: 700 }}>
                                            -{deficit.toLocaleString("tr-TR")}
                                        </td>
                                        {/* Önerilen */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500 }}>
                                            {p.reorderQty?.toLocaleString("tr-TR") ?? "-"}
                                        </td>
                                        {/* Durum / Uyarı */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <span style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "6px",
                                                padding: "4px 10px",
                                                borderRadius: "4px",
                                                fontSize: "12px",
                                                fontWeight: 500,
                                                background: isRaw ? "var(--warning-bg)" : "var(--success-bg)",
                                                color: isRaw ? "var(--warning-text)" : "var(--success-text)",
                                                border: `1px solid ${isRaw ? "var(--warning-border)" : "var(--success-border)"}`,
                                            }}>
                                                {isRaw ? "Tedarikçiden sipariş verilmeli" : "Üretim emri verilmeli"}
                                            </span>
                                            {isRaw && p.preferredVendor && (
                                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                                                    Tedarikçi: {p.preferredVendor}
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
