"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import StatsCards from "@/components/dashboard/StatsCards";
import StockDataGrid from "@/components/dashboard/StockDataGrid";
import RecentOrders from "@/components/dashboard/RecentOrders";
import AIAlerts from "@/components/dashboard/AIAlerts";
import { useData } from "@/lib/data-context";

const STATUS_OPTIONS = [
    { key: "", label: "Tümü" },
    { key: "kritik", label: "Kritik" },
    { key: "rezerve", label: "Rezerve" },
    { key: "hazir", label: "Hazır" },
    { key: "tukendi", label: "Tükendi" },
];

export default function DashboardPage() {
    const { products } = useData();
    const [filterOpen, setFilterOpen] = useState(false);
    const [filterCategory, setFilterCategory] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const filterRef = useRef<HTMLDivElement>(null);

    const categories = Array.from(new Set(products.map(p => p.category))).sort();
    const hasFilter = filterCategory !== "" || filterStatus !== "";

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Metrics */}
            <StatsCards />

            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                    Stok Envanteri — Canlı
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {/* Filter button + dropdown */}
                    <div ref={filterRef} style={{ position: "relative" }}>
                        <button
                            onClick={() => setFilterOpen(o => !o)}
                            style={{
                                fontSize: "12px",
                                padding: "6px 14px",
                                border: `0.5px solid ${hasFilter ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                borderRadius: "6px",
                                background: hasFilter ? "var(--accent-bg)" : "transparent",
                                color: hasFilter ? "var(--accent-text)" : "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            Filtrele
                            {hasFilter && (
                                <span style={{
                                    fontSize: "10px",
                                    background: "rgba(255,255,255,0.2)",
                                    borderRadius: "8px",
                                    padding: "1px 5px",
                                }}>
                                    {[filterCategory, filterStatus].filter(Boolean).length}
                                </span>
                            )}
                        </button>

                        {filterOpen && (
                            <div style={{
                                position: "absolute",
                                top: "calc(100% + 6px)",
                                right: 0,
                                zIndex: 200,
                                background: "var(--bg-primary)",
                                border: "0.5px solid var(--border-primary)",
                                borderRadius: "8px",
                                boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
                                padding: "14px 16px",
                                minWidth: "220px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "12px",
                            }}>
                                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                    Filtrele
                                </div>

                                {/* Category */}
                                <div>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "5px" }}>Kategori</div>
                                    <select
                                        value={filterCategory}
                                        onChange={e => setFilterCategory(e.target.value)}
                                        style={{
                                            width: "100%",
                                            fontSize: "12px",
                                            padding: "5px 8px",
                                            border: "0.5px solid var(--border-secondary)",
                                            borderRadius: "6px",
                                            background: "var(--bg-tertiary)",
                                            color: "var(--text-primary)",
                                            outline: "none",
                                        }}
                                    >
                                        <option value="">Tüm Kategoriler</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Status */}
                                <div>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "5px" }}>Stok Durumu</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                        {STATUS_OPTIONS.map(opt => (
                                            <button
                                                key={opt.key}
                                                onClick={() => setFilterStatus(opt.key)}
                                                style={{
                                                    fontSize: "12px",
                                                    padding: "5px 10px",
                                                    borderRadius: "5px",
                                                    border: "0.5px solid",
                                                    borderColor: filterStatus === opt.key ? "var(--accent-border)" : "transparent",
                                                    background: filterStatus === opt.key ? "var(--accent-bg)" : "transparent",
                                                    color: filterStatus === opt.key ? "var(--accent-text)" : "var(--text-secondary)",
                                                    cursor: "pointer",
                                                    textAlign: "left",
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Reset */}
                                {hasFilter && (
                                    <button
                                        onClick={() => { setFilterCategory(""); setFilterStatus(""); }}
                                        style={{
                                            fontSize: "11px",
                                            padding: "5px",
                                            border: "none",
                                            background: "transparent",
                                            color: "var(--danger-text)",
                                            cursor: "pointer",
                                            textAlign: "left",
                                        }}
                                    >
                                        × Filtreleri Temizle
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <Link href="/dashboard/orders/new">
                        <button
                            style={{
                                fontSize: "12px",
                                padding: "6px 14px",
                                border: "0.5px solid var(--accent-border)",
                                borderRadius: "6px",
                                background: "var(--accent-bg)",
                                color: "var(--accent-text)",
                                cursor: "pointer",
                            }}
                        >
                            + Yeni Sipariş
                        </button>
                    </Link>
                </div>
            </div>

            {/* Stock table */}
            <StockDataGrid filterCategory={filterCategory} filterStatus={filterStatus} />

            {/* Bottom grid: AI alerts + (recent orders + import zone) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <AIAlerts />
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <RecentOrders />
                    <div
                        style={{
                            border: "1.5px dashed var(--border-secondary)",
                            borderRadius: "6px",
                            padding: "14px 16px",
                            textAlign: "center",
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                            background: "var(--bg-secondary)",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--accent-border)";
                            e.currentTarget.style.color = "var(--accent-text)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--border-secondary)";
                            e.currentTarget.style.color = "var(--text-secondary)";
                        }}
                    >
                        PDF / Excel dosyasını buraya sürükle — AI otomatik okur
                    </div>
                </div>
            </div>
        </div>
    );
}
