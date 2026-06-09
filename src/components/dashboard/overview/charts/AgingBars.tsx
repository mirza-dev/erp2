"use client";

import type { Tone } from "@/lib/dashboard-view-model";
import { toneVar, toneText } from "./chart-utils";

export interface AgingDatum {
    label: string;
    value: number;
    tone: Tone;
}

interface AgingBarsProps {
    data: AgingDatum[];
    currency?: string | null;
    /** Tutar ön-eki (para sembolü, örn. "$"). currency suffix'ten önce gelir. */
    symbol?: string;
}

function compact(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${Math.round(v / 1e3)}K`;
    return String(Math.round(v));
}

/** Yatay yaşlandırma çubukları (progress). */
export default function AgingBars({ data, currency = null, symbol = "" }: AgingBarsProps) {
    const max = Math.max(...data.map((d) => d.value), 1);
    const cur = currency ? ` ${currency}` : "";
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {data.map((d, i) => (
                <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                        <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{d.label}</span>
                        <span className="mono" style={{ color: toneText(d.tone), fontWeight: 600, whiteSpace: "nowrap" }}>
                            {symbol}{compact(d.value)}{cur}
                        </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: "var(--chart-track)", overflow: "hidden" }}>
                        <div style={{
                            width: `${(d.value / max) * 100}%`, height: "100%", borderRadius: 99,
                            background: toneVar(d.tone), transition: "width .5s ease",
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
}
