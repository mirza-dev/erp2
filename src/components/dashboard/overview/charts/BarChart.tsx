"use client";

import { useState } from "react";
import { useMeasure } from "./chart-utils";

interface BarChartProps {
    days: string[];
    values: number[];
    rounded?: boolean;
}

/** Günlük toplam üretimi gösteren tek serili dikey çubuk grafik. */
export default function BarChart({ days, values, rounded = true }: BarChartProps) {
    const [ref, W] = useMeasure();
    const H = 200, padL = 34, padR = 8, padT = 12, padB = 22;
    const iw = Math.max(W - padL - padR, 10), ih = H - padT - padB;
    const maxV = Math.max(...values, 1) * 1.1;
    const n = Math.max(days.length, 1);
    const gap = 6;
    const bw = (iw - gap * (n - 1)) / n;
    const y = (v: number) => padT + ih - (v / maxV) * ih;
    const [hover, setHover] = useState<number | null>(null);
    const rad = rounded ? Math.min(bw / 2, 4) : 0;
    return (
        <div ref={ref} style={{ position: "relative", width: "100%" }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }} role="img" aria-label="Üretim">
                {[0, 0.5, 1].map((f, i) => {
                    const yy = padT + ih - f * ih;
                    return (
                        <g key={i}>
                            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--chart-grid)" strokeWidth="1" />
                            <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9.5" fill="var(--text-tertiary)" className="mono">
                                {Math.round(maxV * f)}
                            </text>
                        </g>
                    );
                })}
                {days.map((d, i) => {
                    const gx = padL + i * (bw + gap);
                    const value = values[i] ?? 0;
                    const top = y(value);
                    const barH = padT + ih - top;
                    const isOff = value === 0;
                    return (
                        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                            <rect x={gx} y={padT} width={bw} height={ih} fill="transparent" />
                            {isOff ? (
                                <line x1={gx} y1={padT + ih} x2={gx + bw} y2={padT + ih} stroke="var(--border-secondary)" strokeWidth="2" />
                            ) : (
                                <rect x={gx} y={top} width={bw} height={Math.max(barH, 1)} rx={rad}
                                    fill="var(--accent)" opacity={hover == null || hover === i ? 1 : 0.45}
                                    style={{ transition: "opacity .12s" }} />
                            )}
                            <text x={gx + bw / 2} y={H - 7} textAnchor="middle" fontSize="9.5" fill="var(--text-tertiary)">{d}</text>
                        </g>
                    );
                })}
            </svg>
            {hover != null && (values[hover] ?? 0) > 0 && (
                <div style={{
                    position: "absolute", left: Math.min(Math.max(padL + hover * (bw + gap) - 50, 4), W - 124), top: 4,
                    width: 120, pointerEvents: "none",
                    background: "var(--surface-raised)", border: "1px solid var(--surface-border)",
                    borderRadius: 7, boxShadow: "var(--surface-shadow)", padding: "7px 9px",
                }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 4 }}>{days[hover]}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, lineHeight: 1.7 }}>
                        <span style={{ color: "var(--text-tertiary)" }}>Üretim</span>
                        <span className="mono" style={{ color: "var(--accent-text)", fontWeight: 600 }}>{values[hover]}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
