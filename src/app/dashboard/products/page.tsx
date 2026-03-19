"use client";

import { useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useData } from "@/lib/data-context";

const categories = [
    "Tümü",
    "Küresel Vanalar",
    "Sürgülü Vanalar",
    "Kelebek Vanalar",
    "Çek Valfler",
    "Contalar",
    "Filtreler",
    "Flanş Aksesuarları",
];

function getStatusBadge(available: number, min: number) {
    if (available === 0) return { label: "Tükendi", cls: "badge-danger" };
    if (available <= min) return { label: "Kritik", cls: "badge-danger" };
    if (available <= min * 2) return { label: "Düşük", cls: "badge-warning" };
    return { label: "Hazır", cls: "badge-success" };
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

export default function ProductsPage() {
    const { products: mockProducts } = useData();
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState("Tümü");

    const filtered = mockProducts.filter((p) => {
        const matchSearch =
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase());
        const matchCategory = activeCategory === "Tümü" || p.category === activeCategory;
        return matchSearch && matchCategory;
    });

    const criticalCount = mockProducts.filter(p => p.availableStock <= p.minStockLevel).length;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Stok & Ürünler
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        {mockProducts.length} ürün · {categories.length - 1} kategori
                        {criticalCount > 0 && (
                            <span style={{ color: "var(--danger-text)", fontWeight: 600 }}> · {criticalCount} kritik</span>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
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
                        + Yeni Ürün
                    </button>
                </div>
            </div>

            {/* Category filter */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {categories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: activeCategory === cat ? "var(--accent-bg)" : "transparent",
                            color: activeCategory === cat ? "var(--accent-text)" : "var(--text-secondary)",
                            cursor: "pointer",
                        }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Table */}
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
                            <th style={thStyle}>Kategori</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Fiyat</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Stok</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Rezerve</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Satılabilir</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((product) => {
                            const status = getStatusBadge(product.availableStock, product.minStockLevel);
                            return (
                                <tr
                                    key={product.id}
                                    style={{ cursor: "pointer" }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "var(--bg-secondary)"));
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "transparent"));
                                    }}
                                >
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                                        {product.sku}
                                    </td>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                                        {product.name}
                                    </td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                        {product.category}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>
                                        {formatCurrency(product.price, product.currency)}
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
                                            color: product.availableStock <= product.minStockLevel ? "var(--danger-text)" : "var(--success-text)",
                                        }}
                                    >
                                        {formatNumber(product.availableStock)}
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
        </div>
    );
}
