"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import StatsCards from "@/components/dashboard/StatsCards";
import StockDataGrid from "@/components/dashboard/StockDataGrid";
import RecentOrders from "@/components/dashboard/RecentOrders";
import AIAlerts from "@/components/dashboard/AIAlerts";
import AISummaryCard from "@/components/dashboard/AISummaryCard";
import { useData } from "@/lib/data-context";
import { usePermissions } from "@/lib/auth/use-permissions";
import { ButtonLink } from "@/components/ui/Button";
import { Plus } from "lucide-react";

const STATUS_OPTIONS = [
    { key: "", label: "Tümü" },
    { key: "kritik", label: "Kritik" },
    { key: "dusuk", label: "Düşük" },
    { key: "hazir", label: "Hazır" },
    { key: "tukendi", label: "Tükendi" },
];

function CollapsibleSection({
    title,
    open,
    onToggle,
    badge,
    children,
}: {
    title: string;
    open: boolean;
    onToggle: () => void;
    badge?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "10px 14px",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "8px",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    textAlign: "left",
                }}
            >
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                        aria-hidden="true"
                        style={{
                            display: "inline-flex",
                            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                            transition: "transform 0.2s",
                            color: "var(--text-tertiary)",
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{title}</span>
                </span>
                {badge}
            </button>
            {open && <div style={{ marginTop: "8px" }}>{children}</div>}
        </div>
    );
}

export default function DashboardPage() {
    const { products, refetchAll, openAlerts, loading } = useData();
    const { has } = usePermissions();
    const canCreateOrder = has("manage_sales_orders");
    const [filterOpen, setFilterOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    // AI Operasyon Özeti + Aktif Uyarılar: varsayılan kapalı, tıklanınca açılır.
    // AISummaryCard kapalıyken mount olmaz → AI ops-summary çağrısı yalnız ilk açılışta yapılır.
    const [showAiSummary, setShowAiSummary] = useState(false);
    const [showAlerts, setShowAlerts] = useState(false);

    const handleRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        try { await refetchAll(); } finally { setRefreshing(false); }
    }, [refetchAll, refreshing]);
    const [filterCategory, setFilterCategory] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const filterRef = useRef<HTMLDivElement>(null);

    const categories = useMemo(
        () => Array.from(new Set(products.map(p => p.category))).sort(),
        [products]
    );
    const hasFilter = filterCategory !== "" || filterStatus !== "";

    const statusLabel = STATUS_OPTIONS.find(s => s.key === filterStatus)?.label ?? filterStatus;

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

            {/* AI Ops Summary — tıklanınca açılır (kapalıyken mount olmaz → AI çağrısı ertelenir) */}
            <CollapsibleSection
                title="AI Operasyon Özeti"
                open={showAiSummary}
                onToggle={() => setShowAiSummary(o => !o)}
                badge={
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
                }
            >
                <AISummaryCard />
            </CollapsibleSection>

            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                    Stok Envanteri
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {/* Yenile */}
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        style={{
                            fontSize: "12px",
                            padding: "6px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: refreshing ? "not-allowed" : "pointer",
                            opacity: refreshing ? 0.5 : 1,
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: refreshing ? "rotate(180deg)" : "none", transition: "transform 0.4s" }}>
                            <path d="M10 6A4 4 0 1 1 6 2a4 4 0 0 1 3.5 2M10 2v2.5H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {refreshing ? "Yenileniyor…" : "Yenile"}
                    </button>
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
                                    background: "var(--accent-bg-strong)",
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

                    {canCreateOrder && (
                        <ButtonLink
                            href="/dashboard/orders/new"
                            size="md"
                            leftIcon={<Plus size={15} />}
                        >
                            Yeni Sipariş
                        </ButtonLink>
                    )}
                </div>
            </div>

            {/* Active filter chips */}
            {hasFilter && (
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Aktif filtreler:</span>
                    {filterCategory !== "" && (
                        <span style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            background: "var(--accent-bg)",
                            color: "var(--accent-text)",
                            borderRadius: "4px",
                            border: "0.5px solid var(--accent-border)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                        }}>
                            {filterCategory}
                            <span
                                onClick={() => setFilterCategory("")}
                                style={{ cursor: "pointer", opacity: 0.7, fontSize: "12px" }}
                            >
                                ✕
                            </span>
                        </span>
                    )}
                    {filterStatus !== "" && (
                        <span style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            background: "var(--accent-bg)",
                            color: "var(--accent-text)",
                            borderRadius: "4px",
                            border: "0.5px solid var(--accent-border)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                        }}>
                            {statusLabel}
                            <span
                                onClick={() => setFilterStatus("")}
                                style={{ cursor: "pointer", opacity: 0.7, fontSize: "12px" }}
                            >
                                ✕
                            </span>
                        </span>
                    )}
                    <span
                        onClick={() => { setFilterCategory(""); setFilterStatus(""); }}
                        style={{ fontSize: "11px", color: "var(--accent-text)", cursor: "pointer", marginLeft: "4px" }}
                    >
                        Tümünü temizle
                    </span>
                </div>
            )}

            {/* Stock table — dashboard widget: ilk 15 ürün (en kritik öncelik) + "Tümünü gör" linki */}
            <StockDataGrid
                filterCategory={filterCategory}
                filterStatus={filterStatus}
                limit={15}
                showViewAllLink
            />

            {/* Bottom grid: AI alerts + (recent orders + import zone) */}
            <div className="dashboard-bottom-grid">
                <CollapsibleSection
                    title="Aktif Uyarılar"
                    open={showAlerts}
                    onToggle={() => setShowAlerts(o => !o)}
                    badge={
                        !loading && openAlerts.length > 0 ? (
                            <span style={{
                                fontSize: "11px",
                                background: "var(--danger-bg)",
                                color: "var(--danger-text)",
                                padding: "2px 7px",
                                borderRadius: "8px",
                                fontWeight: 600,
                            }}>
                                {openAlerts.length} açık
                            </span>
                        ) : null
                    }
                >
                    <AIAlerts />
                </CollapsibleSection>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <RecentOrders />
                    <Link href="/dashboard/import" style={{ textDecoration: "none" }}>
                        <div
                            style={{
                                border: "1.5px dashed var(--border-secondary)",
                                borderRadius: "6px",
                                padding: "20px 16px",
                                textAlign: "center",
                                cursor: "pointer",
                                background: "var(--bg-secondary)",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "6px",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = "var(--accent-border)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = "var(--border-secondary)";
                            }}
                        >
                            {/* Upload icon */}
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-tertiary)" }}>
                                <path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                                Sipariş dosyalarını buraya sürükleyin
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                veya <span style={{ color: "var(--accent-text)", fontWeight: 500 }}>Dosya Seç</span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                .xlsx, .csv, .pdf
                            </div>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}
