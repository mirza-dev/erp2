"use client";

import { memo, useState, useMemo } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";
import { useData } from "@/lib/data-context";
import type { Product } from "@/lib/mock-data";

interface StockDataGridProps {
    filterCategory?: string;
    filterStatus?: string;
    /** Maksimum gösterilecek satır sayısı (yok → tümü). Dashboard widget için 15 önerilir. */
    limit?: number;
    /** `limit` aktif + filtered > limit ise tablo altına "Tümünü gör (N) →" linki render. */
    showViewAllLink?: boolean;
}

function getStatusInfo(available: number, min: number): { label: string; cls: string; key: string } {
    if (min === 0) return { label: "Hazır", cls: "badge-success", key: "hazir" };
    const ratio = available / min;
    if (available === 0) return { label: "Tükendi", cls: "badge-danger", key: "tukendi" };
    if (ratio <= 1) return { label: "Kritik", cls: "badge-warning", key: "kritik" };
    if (ratio <= 2) return { label: "Düşük", cls: "badge-warning", key: "dusuk" };
    return { label: "Hazır", cls: "badge-success", key: "hazir" };
}

// Öncelik sıralama: tükendi → kritik → düşük → hazır. Aynı kategori içinde
// available/min oranına göre ascending (en aza ilk). Dashboard widget'ında ilk
// 15 ürün anlamlı kalsın diye — alfabetik 15 yerine en kritik 15.
const STATUS_PRIORITY: Record<string, number> = {
    tukendi: 0,
    kritik:  1,
    dusuk:   2,
    hazir:   3,
};

export function sortByStockPriority(products: Product[]): Product[] {
    return [...products].sort((a, b) => {
        const sa = getStatusInfo(a.available_now, a.minStockLevel);
        const sb = getStatusInfo(b.available_now, b.minStockLevel);
        const pa = STATUS_PRIORITY[sa.key] ?? 99;
        const pb = STATUS_PRIORITY[sb.key] ?? 99;
        if (pa !== pb) return pa - pb;
        // Aynı status → oran küçük olan (daha kritik) önce.
        const ra = a.minStockLevel > 0 ? a.available_now / a.minStockLevel : Infinity;
        const rb = b.minStockLevel > 0 ? b.available_now / b.minStockLevel : Infinity;
        return ra - rb;
    });
}

function getAvailClass(available: number, min: number) {
    if (available === 0) return "var(--danger-text)";
    if (available <= min) return "var(--warning-text)";
    return "var(--success-text)";
}

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "13px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
    lineHeight: 1.4,
};

const StockDataGrid = memo(function StockDataGrid({
    filterCategory = "",
    filterStatus = "",
    limit,
    showViewAllLink = false,
}: StockDataGridProps) {
    const { products, loading } = useData();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const matched = products.filter(p => {
            if (filterCategory && p.category !== filterCategory) return false;
            if (filterStatus) {
                const { key } = getStatusInfo(p.available_now, p.minStockLevel);
                if (key !== filterStatus) return false;
            }
            return true;
        });
        // Sıralama yalnız `limit` kullanıldığında (dashboard widget) tetiklenir.
        // Full sayfada (/dashboard/products) mevcut sort'a dokunulmaz.
        return limit ? sortByStockPriority(matched) : matched;
    }, [products, filterCategory, filterStatus, limit]);

    const visible = limit ? filtered.slice(0, limit) : filtered;
    const hasMore = showViewAllLink && limit ? filtered.length > limit : false;

    const applyHover = (tr: HTMLElement) => {
        const tds = tr.querySelectorAll("td");
        tds.forEach((td, i) => {
            td.style.background = "var(--bg-secondary)";
            if (i === 0) td.style.borderLeft = "2px solid var(--accent)";
        });
    };

    const removeHover = (tr: HTMLElement, productId: string) => {
        if (selectedId === productId) return;
        const tds = tr.querySelectorAll("td");
        tds.forEach((td, i) => {
            td.style.background = "transparent";
            if (i === 0) td.style.borderLeft = "2px solid transparent";
        });
    };

    const applySelected = (tr: HTMLElement) => {
        const tds = tr.querySelectorAll("td");
        tds.forEach((td, i) => {
            td.style.background = "var(--accent-bg)";
            if (i === 0) td.style.borderLeft = "2px solid var(--accent)";
        });
    };

    return (
        <div
            style={{
                background: "var(--bg-primary)",
                border: "0.5px solid var(--border-tertiary)",
                borderRadius: "6px",
                overflow: "hidden",
            }}
        >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                    <tr style={{ background: "var(--bg-secondary)" }}>
                        <th style={thStyle}>SKU</th>
                        <th style={thStyle}>Ürün Adı</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Gerçek Stok</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Rezerve</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Satılabilir</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Min. Seviye</th>
                        <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i}>
                                {Array.from({ length: 7 }).map((_, j) => (
                                    <td key={j} style={tdStyle}>
                                        <div style={{
                                            height: "13px",
                                            width: j === 1 ? "120px" : "50px",
                                            background: "var(--bg-tertiary)",
                                            borderRadius: "4px",
                                            animation: "pulse 1.5s ease-in-out infinite",
                                            animationDelay: `${j * 0.05}s`,
                                        }} />
                                    </td>
                                ))}
                            </tr>
                        ))
                    ) : visible.length === 0 ? (
                        <tr>
                            <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--text-tertiary)", padding: "20px" }}>
                                Eşleşen ürün bulunamadı
                            </td>
                        </tr>
                    ) : visible.map((product) => {
                        const status = getStatusInfo(product.available_now, product.minStockLevel);
                        const isSelected = selectedId === product.id;
                        return (
                            <tr
                                key={product.id}
                                style={{ cursor: "pointer" }}
                                onClick={(e) => {
                                    const newId = isSelected ? null : product.id;
                                    setSelectedId(newId);
                                    // Apply or remove selected styling
                                    if (newId) {
                                        applySelected(e.currentTarget);
                                    } else {
                                        removeHover(e.currentTarget, "__force__");
                                    }
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) applyHover(e.currentTarget);
                                }}
                                onMouseLeave={(e) => {
                                    if (isSelected) {
                                        applySelected(e.currentTarget);
                                    } else {
                                        removeHover(e.currentTarget, "__force__");
                                    }
                                }}
                            >
                                <td style={{
                                    ...tdStyle,
                                    color: "var(--text-secondary)",
                                    borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                                    background: isSelected ? "var(--accent-bg)" : "transparent",
                                }}>
                                    {product.sku}
                                </td>
                                <td style={{ ...tdStyle, background: isSelected ? "var(--accent-bg)" : "transparent" }}>
                                    {product.name}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500, background: isSelected ? "var(--accent-bg)" : "transparent" }}>
                                    {formatNumber(product.on_hand)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "var(--warning-text)", background: isSelected ? "var(--accent-bg)" : "transparent" }}>
                                    {formatNumber(product.reserved)}
                                </td>
                                <td
                                    style={{
                                        ...tdStyle,
                                        textAlign: "right",
                                        fontWeight: 500,
                                        color: getAvailClass(product.available_now, product.minStockLevel),
                                        background: isSelected ? "var(--accent-bg)" : "transparent",
                                    }}
                                >
                                    {formatNumber(product.available_now)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-tertiary)", background: isSelected ? "var(--accent-bg)" : "transparent" }}>
                                    {formatNumber(product.minStockLevel)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "center", background: isSelected ? "var(--accent-bg)" : "transparent" }}>
                                    <span className={`badge ${status.cls}`}>{status.label}</span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {hasMore && (
                <div
                    style={{
                        padding: "10px 14px",
                        borderTop: "0.5px solid var(--border-tertiary)",
                        background: "var(--bg-secondary)",
                        textAlign: "right",
                    }}
                >
                    <Link
                        href="/dashboard/products"
                        style={{
                            fontSize: "12px",
                            color: "var(--accent-text)",
                            textDecoration: "none",
                            fontWeight: 500,
                        }}
                    >
                        Tümünü gör ({filtered.length}) →
                    </Link>
                </div>
            )}
        </div>
    );
});

export default StockDataGrid;
