"use client";

import { formatNumber } from "@/lib/utils";
import { useData } from "@/lib/data-context";

interface StockDataGridProps {
    filterCategory?: string;
    filterStatus?: string;
}

function getStatusInfo(available: number, min: number): { label: string; cls: string; key: string } {
    const ratio = min > 0 ? available / min : 999;
    if (available === 0) return { label: "Tükendi", cls: "badge-danger", key: "tukendi" };
    if (ratio <= 1) return { label: "Kritik", cls: "badge-warning", key: "kritik" };
    if (ratio <= 2) return { label: "Rezerve", cls: "badge-warning", key: "rezerve" };
    return { label: "Hazır", cls: "badge-success", key: "hazir" };
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

export default function StockDataGrid({ filterCategory = "", filterStatus = "" }: StockDataGridProps) {
    const { products } = useData();

    const filtered = products.filter(p => {
        if (filterCategory && p.category !== filterCategory) return false;
        if (filterStatus) {
            const { key } = getStatusInfo(p.availableStock, p.minStockLevel);
            if (key !== filterStatus) return false;
        }
        return true;
    });

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
                    {filtered.length === 0 ? (
                        <tr>
                            <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--text-tertiary)", padding: "20px" }}>
                                Eşleşen ürün bulunamadı
                            </td>
                        </tr>
                    ) : filtered.map((product) => {
                        const status = getStatusInfo(product.availableStock, product.minStockLevel);
                        return (
                            <tr
                                key={product.id}
                                style={{ cursor: "pointer" }}
                                onMouseEnter={(e) => {
                                    const tds = e.currentTarget.querySelectorAll("td");
                                    tds.forEach(td => (td.style.background = "var(--bg-secondary)"));
                                }}
                                onMouseLeave={(e) => {
                                    const tds = e.currentTarget.querySelectorAll("td");
                                    tds.forEach(td => (td.style.background = "transparent"));
                                }}
                            >
                                <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                    {product.sku}
                                </td>
                                <td style={tdStyle}>
                                    {product.name}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>
                                    {formatNumber(product.totalStock)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "var(--warning-text)" }}>
                                    {formatNumber(product.allocatedStock)}
                                </td>
                                <td
                                    style={{
                                        ...tdStyle,
                                        textAlign: "right",
                                        fontWeight: 500,
                                        color: getAvailClass(product.availableStock, product.minStockLevel),
                                    }}
                                >
                                    {formatNumber(product.availableStock)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-tertiary)" }}>
                                    {formatNumber(product.minStockLevel)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "center" }}>
                                    <span className={`badge ${status.cls}`}>{status.label}</span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
