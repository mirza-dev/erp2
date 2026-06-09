"use client";

import OverviewPanel, { Dot } from "./OverviewPanel";
import BarChart from "./charts/BarChart";

interface ProductionPanelProps {
    days: string[];
    good: number[];
    scrap: number[];
}

/** Üretim (Son 14 gün) — sağlam/fire dikey çubuklar (gerçek scrap_qty). */
export default function ProductionPanel({ days, good, scrap }: ProductionPanelProps) {
    const hasData = good.some((g) => g > 0) || scrap.some((s) => s > 0);
    return (
        <OverviewPanel
            title="Üretim (Son 14 gün)"
            sub="Sağlam / fire — adet"
            actions={
                <div style={{ display: "flex", gap: 12, fontSize: 10.5, alignItems: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-tertiary)" }}><Dot tone="var(--accent)" /> Sağlam</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-tertiary)" }}><Dot tone="var(--danger)" /> Fire</span>
                </div>
            }
        >
            {hasData ? (
                <BarChart days={days} good={good} scrap={scrap} />
            ) : (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "24px 0" }}>
                    Son 14 günde üretim kaydı yok.
                </div>
            )}
        </OverviewPanel>
    );
}
