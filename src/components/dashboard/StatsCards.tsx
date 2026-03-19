"use client";

import { useData } from "@/lib/data-context";
import { formatNumber } from "@/lib/utils";

const subtitleColors = {
    ok: "var(--success-text)",
    warn: "var(--warning-text)",
    danger: "var(--danger-text)",
};

export default function StatsCards() {
    const { products, uretimKayitlari } = useData();

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayRecords = uretimKayitlari.filter(k => k.tarih === todayStr);
    const todayTotal = todayRecords.reduce((sum, k) => sum + k.adet, 0);
    const todayProductTypes = new Set(todayRecords.map(k => k.productId)).size;

    const totalStock = products.reduce((sum, p) => sum + p.totalStock, 0);
    const allocatedStock = products.reduce((sum, p) => sum + p.allocatedStock, 0);
    const availableStock = products.reduce((sum, p) => sum + p.availableStock, 0);
    const criticalCount = products.filter(p => {
        const ratio = p.minStockLevel > 0 ? p.availableStock / p.minStockLevel : 999;
        return p.availableStock === 0 || ratio <= 1;
    }).length;

    const metrics = [
        {
            label: "Toplam Stok (Ürün)",
            value: formatNumber(totalStock),
            subtitle: `${products.length} aktif ürün`,
            subtitleColor: "ok" as const,
        },
        {
            label: "Rezerve Stok",
            value: formatNumber(allocatedStock),
            subtitle: "Aktif siparişlerde kilitli",
            subtitleColor: "warn" as const,
        },
        {
            label: "Satılabilir Stok",
            value: formatNumber(availableStock),
            subtitle: "Anlık hesaplanıyor",
            subtitleColor: "ok" as const,
        },
        {
            label: "Kritik Seviye",
            value: `${criticalCount} Ürün`,
            subtitle: criticalCount > 0 ? "Üretim uyarısı aktif" : "Stok durumu iyi",
            subtitleColor: criticalCount > 0 ? ("warn" as const) : ("ok" as const),
            valueDanger: criticalCount > 0,
        },
        {
            label: "Bugünkü Üretim",
            value: todayTotal > 0 ? formatNumber(todayTotal) + " adet" : "—",
            subtitle: todayProductTypes > 0 ? `${todayProductTypes} ürün türü üretildi` : "Henüz giriş yok",
            subtitleColor: todayTotal > 0 ? ("ok" as const) : ("warn" as const),
        },
    ];

    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
            {metrics.map((m) => (
                <div
                    key={m.label}
                    style={{
                        background: "var(--bg-primary)",
                        border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px",
                        padding: "14px 16px",
                    }}
                >
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                        {m.label}
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
