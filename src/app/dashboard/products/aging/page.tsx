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
    { key: "all",         label: "Tümü" },
    { key: "active",      label: "Aktif" },
    { key: "slow",        label: "Yavaş" },
    { key: "stagnant",    label: "Durgun" },
    { key: "dead",        label: "Ölü" },
    { key: "no_movement", label: "Hareket Yok" },
];

type ReportType = "raw_material" | "manufactured" | "commercial";

const REPORT_TABS: { key: ReportType; label: string; subtitle: string }[] = [
    {
        key: "raw_material",
        label: "Hammadde Eskimesi",
        subtitle: "Depoda kullanılmayan hammaddeler",
    },
    {
        key: "manufactured",
        label: "Mamul Eskimesi",
        subtitle: "Üretilen ama satılamayan ürünler",
    },
    {
        key: "commercial",
        label: "Ticari Mal Eskimesi",
        subtitle: "Alınan ama satılamayan ürünler",
    },
];

const THRESHOLDS: Record<ReportType, string> = {
    raw_material:  "Aktif: < 60 gün · Yavaş: 60–120 gün · Durgun: 120–240 gün · Ölü: > 240 gün",
    manufactured:  "Aktif: < 45 gün · Yavaş: 45–90 gün · Durgun: 90–180 gün · Ölü: > 180 gün",
    commercial:    "Aktif: < 45 gün · Yavaş: 45–90 gün · Durgun: 90–180 gün · Ölü: > 180 gün",
};

function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────

export default function AgingPage() {
    const [reportType, setReportType] = useState<ReportType>("raw_material");
    const [rowsRaw, setRowsRaw]       = useState<AgingRow[]>([]);
    const [rowsMfg, setRowsMfg]       = useState<AgingRow[]>([]);
    const [rowsCom, setRowsCom]       = useState<AgingRow[]>([]);
    const [loadingRaw, setLoadingRaw] = useState(true);
    const [loadingMfg, setLoadingMfg] = useState(true);
    const [loadingCom, setLoadingCom] = useState(true);
    const [filter, setFilter]         = useState<AgingCategory | "all">("all");
    const [search, setSearch]         = useState("");

    // Fetch all tabs in parallel on mount
    useEffect(() => {
        let cancelled = false;

        async function fetchType(type: ReportType) {
            const res = await fetch(`/api/products/aging?type=${type}`);
            if (!res.ok) return [];
            return (await res.json()) as AgingRow[];
        }

        fetchType("raw_material").then(d => { if (!cancelled) { setRowsRaw(d); setLoadingRaw(false); } }).catch(() => { if (!cancelled) setLoadingRaw(false); });
        fetchType("manufactured").then(d => { if (!cancelled) { setRowsMfg(d); setLoadingMfg(false); } }).catch(() => { if (!cancelled) setLoadingMfg(false); });
        fetchType("commercial").then(d => { if (!cancelled) { setRowsCom(d); setLoadingCom(false); } }).catch(() => { if (!cancelled) setLoadingCom(false); });

        return () => { cancelled = true; };
    }, []);

    // Reset category filter when switching tabs
    function switchTab(t: ReportType) {
        setReportType(t);
        setFilter("all");
        setSearch("");
    }

    const rows    = reportType === "raw_material" ? rowsRaw : reportType === "manufactured" ? rowsMfg : rowsCom;
    const loading = reportType === "raw_material" ? loadingRaw : reportType === "manufactured" ? loadingMfg : loadingCom;

    const searched = search.trim().toLowerCase();
    const filtered = (filter === "all" ? rows : rows.filter(r => r.agingCategory === filter))
        .filter(r =>
            !searched ||
            r.productName.toLowerCase().includes(searched) ||
            r.sku.toLowerCase().includes(searched)
        );

    // ── Özet hesapları ────────────────────────────────────────
    const CURRENCY_ORDER = ["EUR", "TRY", "USD"];
    const capitalByCurrency = new Map<string, number>();
    for (const r of rows) {
        capitalByCurrency.set(r.currency, (capitalByCurrency.get(r.currency) ?? 0) + r.boundCapital);
    }
    const capitalEntries = [...capitalByCurrency.entries()].sort(([a], [b]) => {
        const ai = CURRENCY_ORDER.indexOf(a), bi = CURRENCY_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const counts: Record<AgingCategory, number> = { active: 0, slow: 0, stagnant: 0, dead: 0, no_movement: 0 };
    for (const r of rows) counts[r.agingCategory]++;
    const atRisk = counts.stagnant + counts.dead;

    const waitingRows = rows.filter(r => r.daysWaiting !== null);
    const avgWaiting = waitingRows.length > 0
        ? Math.round(waitingRows.reduce((s, r) => s + r.daysWaiting!, 0) / waitingRows.length)
        : null;

    // ── Tablo kolonları (tip-bazlı) ───────────────────────────
    const col5Label = reportType === "raw_material" ? "Son Tedarik"
        : reportType === "manufactured" ? "Son Üretim" : "Son Tedarik";
    const col6Label = reportType === "raw_material" ? "Son Kullanım"
        : "Son Satış";

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
                        textDecoration: "none", cursor: "pointer",
                    }}
                >← Ürünler</a>
            </div>

            {/* Report Type Tabs */}
            <div style={{
                display: "flex", gap: "4px",
                background: "var(--bg-secondary)",
                border: "0.5px solid var(--border-secondary)",
                borderRadius: "8px",
                padding: "4px",
            }}>
                {REPORT_TABS.map(tab => {
                    const active = reportType === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => switchTab(tab.key)}
                            style={{
                                flex: 1,
                                padding: "8px 16px",
                                border: "none",
                                borderRadius: "6px",
                                background: active ? "var(--bg-primary)" : "transparent",
                                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "background 150ms, box-shadow 150ms",
                            }}
                        >
                            <div style={{ fontSize: "13px", fontWeight: active ? 600 : 400, color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                {tab.label}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                {tab.subtitle}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Özet Kartları */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>

                {/* Bağlanan Sermaye */}
                <div style={{
                    padding: "12px 14px",
                    background: "var(--bg-secondary)",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "8px",
                }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
                        {loading ? "—" : capitalEntries.length === 0
                            ? "—"
                            : capitalEntries.map(([cur, total]) => formatCurrency(total, cur)).join(" · ")}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                        Bağlanan Sermaye
                    </div>
                </div>

                {/* Durgun + Ölü */}
                <div style={{
                    padding: "12px 14px",
                    background: atRisk > 0 ? "var(--danger-bg)" : "var(--bg-secondary)",
                    border: `0.5px solid ${atRisk > 0 ? "var(--danger-border)" : "var(--border-secondary)"}`,
                    borderRadius: "8px",
                }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: atRisk > 0 ? "var(--danger-text)" : "var(--text-primary)" }}>
                        {loading ? "—" : atRisk}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                        Durgun + Ölü SKU
                    </div>
                </div>

                {/* Ortalama Bekleme */}
                <div style={{
                    padding: "12px 14px",
                    background: "var(--bg-secondary)",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "8px",
                }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {loading ? "—" : avgWaiting !== null ? `${avgWaiting} gün` : "—"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                        Ort. Bekleme Süresi
                    </div>
                </div>

                {/* Toplam SKU */}
                <div style={{
                    padding: "12px 14px",
                    background: "var(--bg-secondary)",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "8px",
                }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {loading ? "—" : rows.length}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                        Toplam SKU
                    </div>
                </div>
            </div>

            {/* Filtre Satırı */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Ürün adı veya SKU..."
                    style={{
                        fontSize: "12px",
                        padding: "6px 12px",
                        border: "0.5px solid var(--border-secondary)",
                        borderRadius: "6px",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        width: "200px",
                        outline: "none",
                    }}
                />
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {FILTER_TABS.map(tab => {
                        const active = filter === tab.key;
                        const count = tab.key === "all" ? rows.length
                            : tab.key === "no_movement" ? counts.no_movement
                            : counts[tab.key as AgingCategory];
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
                                    transition: "background 150ms",
                                }}
                            >
                                {tab.label}
                                <span style={{ marginLeft: "4px", color: "var(--text-tertiary)", fontWeight: 400 }}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
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
                    <div style={{ padding: "40px", textAlign: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
                        Yükleniyor…
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "40px", textAlign: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
                        {searched
                            ? "Arama sonucu bulunamadı."
                            : filter === "all"
                                ? (reportType === "raw_material" ? "Stokta bekleyen hammadde yok."
                                    : reportType === "manufactured" ? "Stokta bekleyen mamul yok."
                                    : "Stokta bekleyen ticari mal yok.")
                                : "Bu kategoride ürün yok."}
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-tertiary)" }}>
                                {["Ürün Adı", "SKU", "Stokta", "Bağlanan Sermaye", col5Label, col6Label, "Bekleme", "Eskime"].map(h => (
                                    <th key={h} style={{
                                        padding: "8px 12px",
                                        textAlign: h === "Ürün Adı" || h === "Eskime" ? "left" : "right",
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
                                // Tip-bazlı tarih sütunları
                                const date5 = reportType === "raw_material" ? row.lastIncomingDate
                                    : reportType === "manufactured" ? row.lastProductionDate
                                    : row.lastIncomingDate;
                                const date6 = reportType === "raw_material" ? row.lastComponentUsageDate
                                    : row.lastSaleDate;
                                return (
                                    <tr
                                        key={row.productId}
                                        style={{
                                            borderBottom: "0.5px solid var(--border-tertiary)",
                                            transition: "background 150ms",
                                            cursor: "default",
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-tertiary)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <td style={{ padding: "8px 12px", color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>
                                            {row.productName}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-tertiary)", fontFamily: "monospace", fontSize: "12px" }}>
                                            {row.sku}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)" }}>
                                            {row.onHand} {row.unit}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: row.boundCapital > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                                            {formatCurrency(row.boundCapital, row.currency)}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                            {fmtDate(date5)}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                            {fmtDate(date6)}
                                        </td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>
                                            {row.daysWaiting !== null ? `${row.daysWaiting} gün` : "—"}
                                        </td>
                                        <td style={{ padding: "8px 12px" }}>
                                            <span style={{
                                                fontSize: "11px", fontWeight: 700, padding: "2px 7px",
                                                borderRadius: "4px",
                                                background: c.bg, color: c.text, border: `0.5px solid ${c.border}`,
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

            {/* Eşik Referansı */}
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textAlign: "center" }}>
                {THRESHOLDS[reportType]}
            </div>
        </div>
    );
}
