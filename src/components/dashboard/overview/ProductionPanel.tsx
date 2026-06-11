"use client";

import OverviewPanel from "./OverviewPanel";
import BarChart from "./charts/BarChart";

interface ProductionPanelProps {
    days: string[];
    values: number[];
}

/** Üretim (Son 14 gün) — günlük toplam üretim adedi. */
export default function ProductionPanel({ days, values }: ProductionPanelProps) {
    const hasData = values.some((value) => value > 0);
    return (
        <OverviewPanel
            title="Üretim (Son 14 gün)"
            sub="Günlük üretim — adet"
        >
            {hasData ? (
                <BarChart days={days} values={values} />
            ) : (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "24px 0" }}>
                    Son 14 günde üretim kaydı yok.
                </div>
            )}
        </OverviewPanel>
    );
}
