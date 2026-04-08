"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import type { AgingCategory, AgingRow } from "@/lib/supabase/aging";

// ── Badge config ──────────────────────────────────────────────

const CATEGORY_LABELS: Record<AgingCategory, string> = {
    active:      "Aktif",
    slow:        "Yavaş",
    stagnant:    "Durgun",
    dead:        "Ölü",
    no_movement: "Hareket Yok",
};

const CATEGORY_COLORS: Record<AgingCategory, { text: string; bg: string; border: string }> = {
    active:      { text: "var(--success-text)",  bg: "var(--success-bg)",  border: "var(--success-border)" },
    slow:        { text: "var(--warning-text)",  bg: "var(--warning-bg)",  border: "var(--warning-border)" },
    stagnant:    { text: "var(--danger-text)",   bg: "var(--danger-bg)",   border: "var(--danger-border)" },
    dead:        { text: "var(--danger-text)",   bg: "var(--danger-bg)",   border: "var(--danger-border)" },
    no_movement: { text: "var(--text-tertiary)", bg: "var(--bg-tertiary)", border: "var(--border-tertiary)" },
};

const FILTER_TABS: { key: AgingCategory | "all"; label: string }[] = [
    { key: "all",        label: "Tümü" },
    { key: "active",     label: "Aktif" },
    { key: "slow",       label: "Yavaş" },
    { key: "stagnant",   label: "Durgun" },
    { key: "dead",       label: "Ölü" },
    { key: "no_movement", label: "Hareket Yok" },
];

// ── Page ──────────────────────────────────────────────────────

export default function AgingPage() {
    const [rows, setRows] = useState<AgingRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<AgingCategory | "all">("all");

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch("/api/products/aging");
                if (!res.ok) return;
                const data: AgingRow[] = await res.json();
                // Varsayılan sort: daysWaiting DESC (null en sona)
                data.sort((a, b) => {
                    if (a.daysWaiting === null && b.daysWaiting === null) return 0;
                    if (a.daysWaiting === null) return 1;
                    if (b.daysWaiting === null) return -1;
                    return b.daysWaiting - a.daysWaiting;
                });
                if (!cancelled) setRows(data);
            } catch { /* graceful */ }
            finally { if (!cancelled) setLoading(false); }
        }
        load();
        return () => { cancelled = true; };
    }, []);

    const filtered = filter === "all" ? rows : rows.filter(r => r.agingCategory === filter);

    // Özet kartlar
    const capitalByCurrency = new Map<string, number>();
    for (const r of rows) {
        capitalByCurrency.set(r.currency, (capitalByCurrency.get(r.currency) ?? 0) + r.boundCapital);
    }
    const counts: Record<AgingCategory, number> = {
        active: 0, slow: 0, stagnant: 0, dead: 0, no_movement: 0,
    };
    for (const r of rows) counts[r.agingCategory]++;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Stok Eskime Raporu
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        Stokta bekleyen ürünler · bağlanan sermaye
                    </div>
                </div>
                <a
                    href="/dashboard/products"
                    style={{
                        fontSize: "12px", fontWeight: 500, padding: "6px 12px",
                        border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                        background: "transparent", color: "var(--text-secondary)",
                        textDecoration: "none",
                    }}
                >← Ürünler</a>
            </div>

            {/* Özet Kartları */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
                {/* Toplam bağlanan sermaye */}
                <div style={{
                    padding: "12px 14px",
                    background: "var(--bg-secondary)",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "8px",
                }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {capitalByCurrency.size === 0
                            ? "—"
                            : [...capitalByCurrency.entries()]
                                .map(([cur, total]) => formatCurrency(total, cur))
                                .join(" · ")}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                        Bağlanan Sermaye
                    </div>
                </div>

                {/* Kategori counts */}
                {(["active", "slow", "stagnant", "dead"] as AgingCategory[]).map(cat => {
                    const c = CATEGORY_COLORS[cat];
                    return (
                        <div
                            key={cat}
                            onClick={() => setFilter(filter === cat ? "all" : cat)}
                            style={{
                                padding: "12px 14px",
                                background: filter === cat ? c.bg : "var(--bg-secondary)",
                                border: `0.5px solid ${filter === cat ? c.border : "var(--border-secondary)"}`,
                                borderRadius: "8px",
                                cursor: "pointer",
                            }}
                        >
                            <div style={{ fontSize: "18px", fontWeight: 700, color: c.text }}>
                                {counts[cat]}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                                {CATEGORY_LABELS[cat]}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Filtre Sekmeleri */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {FILTER_TABS.map(tab => {
                    const active = filter === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            style={{
                                fontSize: "12px", padding: "5px 12px",
                                border: `0.5px solid ${active ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                borderRadius: "6px",
                                background: active ? "var(--accent-bg)" : "transparent",
                                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                                cursor: "pointer", fontWeight: active ? 600 : 400,
                            }}
                        >
                            {tab.label}
                            {tab.key !== "all" && (
                                <span style={{ marginLeft: "4px", color: "var(--text-tertiary)", fontWeight: 400 }}>
                                    {tab.key === "no_movement" ? counts.no_movement : counts[tab.key as AgingCategory]}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tablo */}
            <div style={{
                background: "var(--bg-secondary)",
                border: "0.5px solid var(--border-secondary)",
                borderRadius: "8px",
                overflow: "hidden",
                overflowX: "auto",
            }}>
                {loading ? (
                    <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
                        Yükleniyor…
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
                        {filter === "all" ? "Stokta bekleyen ürün yok." : "Bu kategoride ürün yok."}
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-tertiary)" }}>
                                {["Ürün Adı", "SKU", "Kategori", "Stokta", "Birim Fiyat", "Bağlanan Sermaye", "Son Hareket", "Bekleme", "Eskime"].map(h => (
                                    <th key={h} style={{
                                        padding: "8px 12px", textAlign: h === "Ürün Adı" || h === "Eskime" ? "left" : "right",
                                        fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)",
                                        textTransform: "uppercase", letterSpacing: "0.04em",
                                        borderBottom: "0.5px solid var(--border-secondary)",
                                        whiteSpace: "nowrap",
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(row => {
                                const c = CATEGORY_COLORS[row.agingCategory];
                                return (
                                    <tr
                                        key={row.productId}
                                        style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}
                                    >
                                        <td style={{ padding: "8px 12px", color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>
                                            {row.productName}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-tertiary)", fontFamily: "monospace", fontSize: "12px" }}>
                                            {row.sku}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)" }}>
                                            {row.category ?? "—"}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)" }}>
                                            {row.onHand} {row.unit}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)" }}>
                                            {formatCurrency(row.price, row.currency)}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: row.boundCapital > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                                            {formatCurrency(row.boundCapital, row.currency)}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                            {row.lastMovementDate
                                                ? new Date(row.lastMovementDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })
                                                : <span style={{ color: "var(--text-tertiary)" }}>—</span>
                                            }
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>
                                            {row.daysWaiting !== null ? `${row.daysWaiting} gün` : "—"}
                                        </td>
                                        <td style={{ padding: "8px 12px" }}>
                                            <span style={{
                                                fontSize: "11px", fontWeight: 700, padding: "2px 7px",
                                                borderRadius: "4px", background: c.bg,
                                                color: c.text, border: `0.5px solid ${c.border}`,
                                                whiteSpace: "nowrap",
                                            }}>
                                                {CATEGORY_LABELS[row.agingCategory]}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
