"use client";

import { memo, useState, useMemo } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";
import { useData } from "@/lib/data-context";
import { getStockStatusInfo, sortByStockPriority } from "@/lib/stock-utils";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import type { Product } from "@/lib/mock-data";

interface StockDataGridProps {
    filterCategory?: string;
    filterStatus?: string;
    /** Maksimum gösterilecek satır sayısı (yok → tümü). Dashboard widget için 15 önerilir. */
    limit?: number;
    /** `limit` aktif + filtered > limit ise tablo altına "Tümünü gör (N) →" linki render. */
    showViewAllLink?: boolean;
}

function getAvailClass(available: number, min: number) {
    if (available === 0) return "var(--danger-text)";
    if (available <= min) return "var(--warning-text)";
    return "var(--success-text)";
}

/** Yükleme iskeleti — DataTable'ın loading modu yok, dışarıda kalır. */
const skeletonCellStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderBottom: "var(--line-width) solid var(--border-tertiary)",
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
                const { key } = getStockStatusInfo(p.available_now, p.minStockLevel);
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

    const columns: DataTableColumn<Product>[] = [
        {
            key: "sku",
            header: "SKU",
            cellStyle: { color: "var(--text-secondary)" },
            cell: p => p.sku,
        },
        { key: "name", header: "Ürün Adı", cell: p => p.name },
        {
            key: "onHand",
            header: "Gerçek Stok",
            align: "right",
            cellStyle: { fontWeight: 500 },
            cell: p => formatNumber(p.on_hand),
        },
        {
            key: "reserved",
            header: "Rezerve",
            align: "right",
            cellStyle: { color: "var(--warning-text)" },
            cell: p => formatNumber(p.reserved),
        },
        {
            key: "available",
            header: "Satılabilir",
            align: "right",
            cellStyle: { fontWeight: 500 },
            // Renk satır bazlı (eşiğe göre) → `cellStyle` kolona statik olduğu
            // için hücre içeriğinde verilir (products/orders precedent'i).
            cell: p => (
                <span style={{ color: getAvailClass(p.available_now, p.minStockLevel) }}>
                    {formatNumber(p.available_now)}
                </span>
            ),
        },
        {
            key: "min",
            header: "Min. Seviye",
            align: "right",
            cellStyle: { color: "var(--text-tertiary)" },
            cell: p => formatNumber(p.minStockLevel),
        },
        {
            key: "status",
            header: "Durum",
            align: "center",
            cell: p => {
                const status = getStockStatusInfo(p.available_now, p.minStockLevel);
                return <span className={`badge ${status.cls}`}>{status.label}</span>;
            },
        },
    ];

    const viewAllFooter = hasMore ? (
        <div
            style={{
                padding: "10px 14px",
                borderTop: "var(--line-width) solid var(--border-tertiary)",
                background: "var(--table-header-bg)",
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
    ) : null;

    return (
        <div
            style={{
                background: "var(--surface-raised)",
                border: "var(--line-width) solid var(--surface-border)",
                borderRadius: "6px",
                overflow: "hidden",
                boxShadow: "var(--surface-shadow-sm)",
            }}
        >
            {loading ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i}>
                                {Array.from({ length: 7 }).map((_, j) => (
                                    <td key={j} style={skeletonCellStyle}>
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
                        ))}
                    </tbody>
                </table>
            ) : (
                <DataTable
                    columns={columns}
                    rows={visible}
                    rowKey={p => p.id}
                    onRowClick={p => setSelectedId(prev => (prev === p.id ? null : p.id))}
                    rowAriaLabel={p => `${p.name} satırını seç`}
                    // Seçili satır vurgusu: eskiden hover/seçim `e.currentTarget`
                    // üzerinde her <td>'nin style'ı ELLE değiştirilerek yapılıyordu
                    // (applyHover/removeHover/applySelected). Artık hover CSS'te
                    // (`.erp-data-table tbody tr:hover`), seçim `rowStyle`'da.
                    // Sol accent `inset box-shadow` ile — <tr> border'ı
                    // `border-collapse: collapse` altında güvenilir değil.
                    rowStyle={p => (p.id === selectedId
                        ? { background: "var(--accent-bg)", boxShadow: "inset 2px 0 0 var(--accent)" }
                        : {})}
                    emptyMessage="Eşleşen ürün bulunamadı"
                    footer={viewAllFooter}
                />
            )}
        </div>
    );
});

export default StockDataGrid;
