"use client";

import { useState } from "react";

interface HeatmapProps {
    rows: string[];
    data: number[][];
    cols?: number;
}

/** İstasyon × hafta yoğunluk ızgarası (color-mix tint). */
export default function Heatmap({ rows, data, cols = 8 }: HeatmapProps) {
    const color = (v: number) =>
        v === 0 ? "var(--chart-track)" : `color-mix(in srgb, var(--accent) ${20 + v * 20}%, transparent)`;
    const [hover, setHover] = useState<string | null>(null);
    return (
        <div style={{ display: "grid", gridTemplateColumns: `66px repeat(${cols}, 1fr)`, gap: 4, alignItems: "center" }} role="img" aria-label="Üretim yoğunluğu">
            {rows.map((rname, r) => (
                <div key={r} style={{ display: "contents" }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-secondary)", textAlign: "right", paddingRight: 4, whiteSpace: "nowrap" }}>{rname}</div>
                    {(data[r] ?? []).map((v, c) => (
                        <div key={c} title={`${rname} · ${v}/4`}
                            onMouseEnter={() => setHover(`${r}-${c}`)} onMouseLeave={() => setHover(null)}
                            style={{
                                aspectRatio: "1.4 / 1", borderRadius: 3, background: color(v),
                                border: hover === `${r}-${c}` ? "1px solid var(--accent-border)" : "1px solid transparent",
                                transition: "border-color .1s",
                            }} />
                    ))}
                </div>
            ))}
        </div>
    );
}
