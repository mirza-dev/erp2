"use client";

import { useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import { formatNumber } from "@/lib/utils";

const subtitleColors = {
    ok: "var(--success-text)",
    warn: "var(--warning-text)",
    danger: "var(--danger-text)",
};

export default function StatsCards() {
    const router = useRouter();
    const { products, uretimKayitlari } = useData();

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayRecords = uretimKayitlari.filter(k => k.tarih === todayStr);
    const todayTotal = todayRecords.reduce((sum, k) => sum + k.adet, 0);
    const todayProductTypes = new Set(todayRecords.map(k => k.productId)).size;

    const totalStock = products.reduce((sum, p) => sum + p.on_hand, 0);
    const allocatedStock = products.reduce((sum, p) => sum + p.reserved, 0);
    const availableStock = products.reduce((sum, p) => sum + p.available_now, 0);
    const criticalCount = products.filter(p => {
        const ratio = p.minStockLevel > 0 ? p.available_now / p.minStockLevel : 999;
        return p.available_now === 0 || ratio <= 1;
    }).length;

    const metrics = [
        {
            label: "Toplam Stok (Ürün)",
            value: formatNumber(totalStock),
            subtitle: `${products.length} aktif ürün`,
            subtitleColor: "ok" as const,
            href: "/dashboard/products",
        },
        {
            label: "Rezerve Stok",
            value: formatNumber(allocatedStock),
            subtitle: "Aktif siparişlerde kilitli",
            subtitleColor: "warn" as const,
            href: "/dashboard/orders",
        },
        {
            label: "Satılabilir Stok",
            value: formatNumber(availableStock),
            subtitle: "Anlık hesaplanıyor",
            subtitleColor: "ok" as const,
            href: "/dashboard/products",
        },
        {
            label: "Kritik Seviye",
            value: `${criticalCount} Ürün`,
            subtitle: criticalCount > 0 ? "Üretim uyarısı aktif" : "Stok durumu iyi",
            subtitleColor: criticalCount > 0 ? ("warn" as const) : ("ok" as const),
            valueDanger: criticalCount > 0,
            href: "/dashboard/alerts",
        },
        {
            label: "Bugünkü Üretim",
            value: todayTotal > 0 ? formatNumber(todayTotal) + " adet" : "—",
            subtitle: todayProductTypes > 0 ? `${todayProductTypes} ürün türü üretildi` : "Henüz giriş yok",
            subtitleColor: todayTotal > 0 ? ("ok" as const) : ("warn" as const),
            href: "/dashboard/production",
        },
    ];

    return (
        <div className="stats-cards-grid">
            {metrics.map((m) => (
                <div
                    key={m.label}
                    onClick={() => router.push(m.href)}
                    style={{
                        background: "var(--bg-primary)",
                        border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px",
                        padding: "14px 16px",
                        cursor: "pointer",
                        position: "relative",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent-border)";
                        e.currentTarget.style.background = "var(--bg-secondary)";
                        const arrow = e.currentTarget.querySelector("[data-arrow]") as HTMLElement;
                        if (arrow) arrow.style.color = "var(--accent-text)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border-tertiary)";
                        e.currentTarget.style.background = "var(--bg-primary)";
                        const arrow = e.currentTarget.querySelector("[data-arrow]") as HTMLElement;
                        if (arrow) arrow.style.color = "var(--text-tertiary)";
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                            {m.label}
                        </div>
                        <span data-arrow style={{ fontSize: "14px", color: "var(--text-tertiary)" }}>→</span>
                    </div>
                    <div
                        style={{
                            fontSize: "20px",
                            fontWeight: 600,
                            color: m.valueDanger ? "var(--danger-text)" : "var(--text-primary)",
                            letterSpacing: "-0.01em",
                        }}
                    >
                        {m.value}
                    </div>
                    <div
                        style={{
                            fontSize: "12px",
                            marginTop: "4px",
                            color: subtitleColors[m.subtitleColor],
                        }}
                    >
                        {m.subtitle}
                    </div>
                </div>
            ))}
        </div>
    );
}
